/**
 * Step 5 — Portfolio Allocator
 *
 * Transforms a set of enriched Step 3/4 opportunities into a sized, governed
 * trade slate that fits within user-defined capital and risk constraints.
 *
 * Pipeline per cycle:
 *   1. Load session state from Redis (or initialise for the day)
 *   2. Enrich all opportunities via ev.js (EV, effectiveEntry, slippage)
 *   3. Filter: EV gate, score gate, dedup, time window
 *   4. Apply gradient risk governance (divergence tightening, mode transitions)
 *   5. For each candidate: sector/cluster/per-trade risk guards
 *   6. Confidence-weighted sizing with capital throttle
 *   7. Accept / skip with reason
 *   8. Persist updated session state to Redis
 *
 * allocate(input)        — main entry per cycle
 * closeTrade(input)      — called when a trade closes (realizedPnl update + recycle)
 * getSession(date)       — read current session state
 * resetSession(date)     — clear session (start of day or manual reset)
 *
 * Session persisted in Redis: alloc:session:{YYYY-MM-DD}  TTL 28h
 */

import { enrichOpportunity, passesEVGate, loadCalibrationForEV, tradingWindow } from './ev.js';
import { recordOutcomes, refreshSourceStats } from './outcomes.js';
import { redisGet, redisSet }                 from './redis.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 28 * 60 * 60; // 28h — covers full IST trading day + buffer

// Risk governance
const MAX_TRADE_RISK_PCT    = 0.15;   // single trade max 15% of riskBudget
const CAPITAL_THROTTLE_AT   = 0.70;   // throttle sizing above 70% deployed
const THROTTLE_MULT         = 0.65;   // sizing multiplier when throttled
const HARD_STOP_PCT         = 0.50;   // realized loss ceiling = 50% of riskBudget
const DIVERGENCE_THRESHOLD  = 0.30;   // (expectedPnl - realizedPnl) > 30% of riskBudget → tighten
const TIGHTEN_SCORE_ADD     = 0.05;
const TIGHTEN_MULT_CAP      = 0.90;

// Gradient scaling: [fraction of rTarget, maxTradeRiskMult, minScoreAdd]
const GRADIENT = [
  { at: 0.50, riskMult: 1.00, scoreAdd: 0.00 },
  { at: 0.60, riskMult: 0.80, scoreAdd: 0.03 },
  { at: 0.80, riskMult: 0.60, scoreAdd: 0.05 },
];

// Sizing multiplier bounds
const SIZE_MULT_MIN = 0.50;
const SIZE_MULT_MAX = 1.50;

// Diversification
const MAX_SECTOR_RISK_PCT   = 0.35;   // max 35% of riskBudget in one sector
const MAX_SECTOR_TRADES     = 4;
const CLUSTER_REPEAT_EV_MULT = 1.40;  // 3rd trade in same cluster needs EV × 1.4

// Profit ring-fence: hold back 40% of accumulated realized gains
const RINGFENCE_PCT = 0.40;

// Locked mode overrides (soft lock — only exceptional trades pass)
const LOCKED_MIN_EV    = 0.40;
const LOCKED_MIN_SCORE = 0.85;

// ── Session key ───────────────────────────────────────────────────────────────
function sessionKey(date) {
  return `alloc:session:${date}`;
}

// ── IST date string ───────────────────────────────────────────────────────────
function istDate() {
  const now = new Date(Date.now() + 330 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

// ── Default session ───────────────────────────────────────────────────────────
function defaultSession(params, date) {
  const { capital, maxRiskPct, targetRMultiple, maxTrades } = params;
  const riskBudget = +(capital * maxRiskPct / 100).toFixed(2);
  const hardStop   = +(riskBudget * HARD_STOP_PCT).toFixed(2);
  const rTarget    = +(riskBudget * targetRMultiple).toFixed(2);

  return {
    date,
    capital:          +capital,
    riskBudget,
    hardStop,
    rTarget,
    maxTrades:        +maxTrades,

    // Live counters
    riskUsed:         0,
    realizedPnl:      0,
    expectedPnl:      0,
    capitalDeployed:  0,
    capitalFree:      +capital,
    tradeCount:       0,
    ringFenced:       0,    // accumulated profit locked out of redeployment

    // Runtime controls (may be tightened by divergence or gradient)
    currentMinScore:  params.minScore       ?? 0.75,
    currentMinEV:     params.minEV          ?? 0.15,
    currentSizeMultCap: SIZE_MULT_MAX,

    // Diversification tracking
    sectorRisk:       {},   // { sector: riskUsed }
    sectorTrades:     {},   // { sector: count }
    clusterCounts:    {},   // { clusterKey: count }

    // State
    mode:             'normal',   // normal | preservation | locked
    status:           'active',   // active | halted | slots_full | risk_exhausted | session_closed

    // Trade records
    trades:           [],
    closedTrades:     [],

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Load / initialise session ─────────────────────────────────────────────────
async function loadSession(params, date) {
  const existing = await redisGet(sessionKey(date));
  if (existing?.date === date) return existing;
  return defaultSession(params, date);
}

async function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  await redisSet(sessionKey(session.date), session, SESSION_TTL);
}

// ── Cluster key ───────────────────────────────────────────────────────────────
function clusterKey(opportunity) {
  const sector = opportunity.brain?.regime ?? 'unknown';
  const dir    = opportunity.direction ?? 'neutral';
  const et     = (opportunity.brain?.event_type ?? 'general').toLowerCase().split('_')[0];
  return `${sector}:${dir}:${et}`;
}

// ── Gradient risk governance ──────────────────────────────────────────────────
// Returns { maxTradeRisk, minScoreAdd } based on current realizedPnl vs rTarget.
function gradientParams(session) {
  const ratio = session.rTarget > 0 ? session.realizedPnl / session.rTarget : 0;
  let maxTradeRisk = session.riskBudget * MAX_TRADE_RISK_PCT;
  let scoreAdd     = 0;
  for (const step of GRADIENT) {
    if (ratio >= step.at) {
      maxTradeRisk = session.riskBudget * MAX_TRADE_RISK_PCT * step.riskMult;
      scoreAdd     = step.scoreAdd;
    }
  }
  return { maxTradeRisk: +maxTradeRisk.toFixed(2), scoreAdd };
}

// ── Divergence tightening ─────────────────────────────────────────────────────
// If expected >> realized, tighten filters for this cycle.
function divergenceAdjust(session) {
  const gap = session.expectedPnl - session.realizedPnl;
  if (gap > session.riskBudget * DIVERGENCE_THRESHOLD && session.realizedPnl < 0) {
    return {
      minScore:     +(session.currentMinScore + TIGHTEN_SCORE_ADD).toFixed(3),
      sizeMultCap:  TIGHTEN_MULT_CAP,
    };
  }
  return {
    minScore:    session.currentMinScore,
    sizeMultCap: session.currentSizeMultCap,
  };
}

// ── Mode transitions ──────────────────────────────────────────────────────────
function updateMode(session) {
  const ratio = session.rTarget > 0 ? session.realizedPnl / session.rTarget : 0;
  if (ratio >= 1.0 && session.mode !== 'locked') {
    session.mode = 'locked';
  } else if (ratio >= 0.6 && session.mode === 'normal') {
    session.mode = 'preservation';
  }
}

// ── Confidence-weighted sizing ────────────────────────────────────────────────
function computeSizeMult(enriched, session, sizeMultCap) {
  const score   = enriched.final_score ?? 0.75;
  const winRate = enriched.ev?.win_rate ?? 0.50;
  const ev      = enriched.ev?.value    ?? 0.15;

  const raw = (score / 0.75) * (winRate / 0.50) * (ev / 0.15);
  return Math.min(sizeMultCap, Math.max(SIZE_MULT_MIN, raw));
}

// ── Capital throttle ──────────────────────────────────────────────────────────
function capitalThrottleMult(session) {
  const deployed = session.capitalDeployed / session.capital;
  return deployed >= CAPITAL_THROTTLE_AT ? THROTTLE_MULT : 1.0;
}

// ── Available capital (net of ring-fence) ─────────────────────────────────────
function availableCapital(session) {
  return Math.max(0, session.capitalFree - session.ringFenced);
}

// ── Main allocate function ────────────────────────────────────────────────────
/**
 * Run one allocation cycle.
 *
 * @param input {
 *   opportunities: EnrichedOpportunity[],  — Step 3/4 output
 *   capital, maxRiskPct, targetRMultiple, maxTrades, minEV, minScore,
 *   regime,   — current market regime string (for EV conditioning)
 *   date,     — IST date string (optional, defaults to today)
 * }
 * @returns { session, newTrades[], skipped[], calibrationUsed }
 */
export async function allocate(input) {
  const {
    opportunities = [],
    regime,
    date = istDate(),
  } = input;

  // ── Load / init session ───────────────────────────────────────────────────
  const session = await loadSession(input, date);

  // ── Early exit: terminal states ───────────────────────────────────────────
  if (['halted', 'session_closed', 'slots_full', 'risk_exhausted'].includes(session.status)) {
    await saveSession(session);
    return { session, newTrades: [], skipped: [], calibrationUsed: false };
  }

  // ── Check market hours ────────────────────────────────────────────────────
  const window = tradingWindow();
  if (window === 'closed') {
    session.status = 'session_closed';
    await saveSession(session);
    return { session, newTrades: [], skipped: [], calibrationUsed: false };
  }

  // ── Load calibration (one Supabase call per cycle) ────────────────────────
  const calibrationMap = await loadCalibrationForEV();

  // ── Enrich all opportunities ──────────────────────────────────────────────
  const sessionContext = { regime: regime ?? 'neutral', window };
  const enriched = opportunities.map(opp =>
    enrichOpportunity(opp, calibrationMap, sessionContext)
  );

  // ── Compute cycle-level governance params ─────────────────────────────────
  const { maxTradeRisk, scoreAdd } = gradientParams(session);
  const divergence = divergenceAdjust(session);
  const cycleMinScore = +(divergence.minScore + scoreAdd).toFixed(3);
  const cycleMinEV    = session.currentMinEV;
  const cycleSizeCap  = divergence.sizeMultCap;

  // Sort by EV desc — priority-aware allocation
  enriched.sort((a, b) => (b.ev?.value ?? 0) - (a.ev?.value ?? 0));

  const newTrades = [];
  const skipped   = [];

  for (const opp of enriched) {
    const sym = opp.symbol;

    const skip = (reason) => skipped.push({ symbol: sym, reason, ev: opp.ev?.value, score: opp.final_score });

    // ── 1. Hard stop check ──────────────────────────────────────────────────
    if (session.realizedPnl <= -session.hardStop) {
      session.status = 'halted';
      skip('session_halted');
      continue;
    }

    // ── 2. Slot / risk exhaustion ───────────────────────────────────────────
    if (session.tradeCount >= session.maxTrades) { session.status = 'slots_full'; skip('slots_full'); continue; }
    if (session.riskUsed   >= session.riskBudget) { session.status = 'risk_exhausted'; skip('risk_exhausted'); continue; }

    // ── 3. Time window ──────────────────────────────────────────────────────
    if (window === 'closed') { skip('market_closed'); continue; }

    // ── 4. Dedup ────────────────────────────────────────────────────────────
    if (session.trades.some(t => t.symbol === sym)) { skip('already_in_session'); continue; }

    // ── 5. EV + score gate (with time-of-day raises) ───────────────────────
    if (!passesEVGate(opp, cycleMinEV, cycleMinScore)) {
      skip(`ev_score_gate: ev=${opp.ev?.value} score=${opp.final_score} minEV=${cycleMinEV} minScore=${cycleMinScore}`);
      continue;
    }

    // ── 6. Locked mode override ─────────────────────────────────────────────
    if (session.mode === 'locked') {
      if ((opp.ev?.value ?? 0) < LOCKED_MIN_EV || (opp.final_score ?? 0) < LOCKED_MIN_SCORE) {
        skip(`locked_mode: need ev>${LOCKED_MIN_EV} score>${LOCKED_MIN_SCORE}`);
        continue;
      }
    }

    // ── 7. Risk per unit ────────────────────────────────────────────────────
    const riskPerUnit = opp.execution?.risk_per_unit;
    if (!riskPerUnit || riskPerUnit <= 0) { skip('no_sl_defined'); continue; }

    // ── 8. Per-trade risk ceiling ───────────────────────────────────────────
    // ── 9. Sector diversification ───────────────────────────────────────────
    const sector = opp.brain?.regime ?? 'general';
    const sectorRiskNow = session.sectorRisk[sector] ?? 0;
    if (sectorRiskNow >= session.riskBudget * MAX_SECTOR_RISK_PCT) {
      skip(`sector_risk_cap: sector=${sector}`);
      continue;
    }
    if ((session.sectorTrades[sector] ?? 0) >= MAX_SECTOR_TRADES) {
      skip(`sector_trade_cap: sector=${sector}`);
      continue;
    }

    // ── 10. Signal cluster filter ───────────────────────────────────────────
    const ck = clusterKey(opp);
    const clusterCount = session.clusterCounts[ck] ?? 0;
    const clusterMinEV = clusterCount >= 2 ? cycleMinEV * CLUSTER_REPEAT_EV_MULT : cycleMinEV;
    if ((opp.ev?.value ?? 0) < clusterMinEV) {
      skip(`cluster_concentration: cluster=${ck} count=${clusterCount} needEV=${clusterMinEV.toFixed(3)}`);
      continue;
    }

    // ── 11. Compute position size ───────────────────────────────────────────
    const sizeMult    = computeSizeMult(opp, session, cycleSizeCap);
    const throttle    = capitalThrottleMult(session);
    const availCap    = availableCapital(session);
    const remainRisk  = session.riskBudget - session.riskUsed;
    const effectiveEnt = opp.execution.effective_entry;

    const baseQty    = Math.floor(remainRisk / riskPerUnit);
    const scaledQty  = Math.floor(baseQty * sizeMult * throttle);
    const capQty     = availCap > 0 && effectiveEnt > 0 ? Math.floor(availCap / effectiveEnt) : 0;
    const qty        = Math.max(0, Math.min(scaledQty, capQty));

    if (qty === 0) { skip('zero_qty: insufficient capital or risk budget'); continue; }

    // Enforce per-trade risk ceiling after sizing
    const tradeRisk = +(qty * riskPerUnit).toFixed(2);
    if (tradeRisk > maxTradeRisk) {
      // Scale qty down to fit ceiling
      const ceilingQty = Math.floor(maxTradeRisk / riskPerUnit);
      if (ceilingQty === 0) { skip('risk_ceiling_zero_qty'); continue; }
    }
    const finalQty      = Math.min(qty, Math.floor(maxTradeRisk / riskPerUnit));
    const finalRisk     = +(finalQty * riskPerUnit).toFixed(2);
    const capitalNeeded = +(finalQty * effectiveEnt).toFixed(2);

    // Final capital availability check
    if (capitalNeeded > availCap) { skip('insufficient_capital'); continue; }

    // ── 12. Build trade record ──────────────────────────────────────────────
    const expectedPnl = opp.execution.expected_pnl_per_unit != null
      ? +(finalQty * opp.execution.expected_pnl_per_unit).toFixed(2)
      : null;

    const trade = {
      id:              `${sym}-${Date.now()}`,
      symbol:          sym,
      direction:       opp.direction,
      qty:             finalQty,
      entry:           effectiveEnt,
      sl:              opp.plan?.sl ?? null,
      t1:              opp.plan?.t1 ?? null,
      t2:              opp.plan?.t2 ?? null,
      risk:            finalRisk,
      capitalAllocated: capitalNeeded,
      expectedPnl,
      ev:              opp.ev?.value,
      final_score:     opp.final_score,
      win_rate:        opp.ev?.win_rate,
      size_mult:       +sizeMult.toFixed(3),
      throttle_mult:   +throttle.toFixed(3),
      sector,
      cluster:         ck,
      window,
      setup_type:      opp.setup_type,
      confidence:      opp.confidence,
      opened_at:       new Date().toISOString(),
      status:          'open',
    };

    // ── 13. Update session state ────────────────────────────────────────────
    session.riskUsed         = +(session.riskUsed + finalRisk).toFixed(2);
    session.capitalDeployed  = +(session.capitalDeployed + capitalNeeded).toFixed(2);
    session.capitalFree      = +(session.capitalFree - capitalNeeded).toFixed(2);
    session.expectedPnl      = +(session.expectedPnl + (expectedPnl ?? 0)).toFixed(2);
    session.tradeCount      += 1;

    session.sectorRisk[sector]   = +((sectorRiskNow) + finalRisk).toFixed(2);
    session.sectorTrades[sector] = (session.sectorTrades[sector] ?? 0) + 1;
    session.clusterCounts[ck]    = clusterCount + 1;

    session.trades.push(trade);
    newTrades.push(trade);

    // Update mode after each acceptance
    updateMode(session);
  }

  // ── Status check ──────────────────────────────────────────────────────────
  if (session.status === 'active') {
    if (session.tradeCount >= session.maxTrades)    session.status = 'slots_full';
    else if (session.riskUsed >= session.riskBudget) session.status = 'risk_exhausted';
    // Check trailing lock-in target
    if (session.realizedPnl >= session.rTarget)     session.status = 'target_reached';
  }

  await saveSession(session);

  return {
    session: sessionSummary(session),
    newTrades,
    skipped,
    calibrationUsed: calibrationMap.size > 0,
    cycleParams: { window, cycleMinScore, cycleMinEV, maxTradeRisk, mode: session.mode },
  };
}

// ── Trade close handler ───────────────────────────────────────────────────────
/**
 * Called when a trade closes (SL hit, T1, T2, or manual).
 * Updates realizedPnl, recycles capital, updates ring-fence, triggers calibration refresh.
 *
 * @param input { tradeId, exitPrice, exitReason, date }
 */
export async function closeTradeAlloc(input) {
  const { tradeId, exitPrice, exitReason, date = istDate() } = input;
  const session = await redisGet(sessionKey(date));
  if (!session) return { error: 'no_session' };

  const idx = session.trades.findIndex(t => t.id === tradeId);
  if (idx === -1) return { error: 'trade_not_found' };

  const trade = session.trades[idx];
  const dir   = trade.direction === 'short' ? -1 : 1;
  const actualPnl = +((exitPrice - trade.entry) * dir * trade.qty).toFixed(2);

  // Close in session
  trade.status   = 'closed';
  trade.exitPrice = exitPrice;
  trade.exitReason = exitReason;
  trade.actualPnl  = actualPnl;
  trade.closedAt   = new Date().toISOString();
  session.trades.splice(idx, 1);
  session.closedTrades.push(trade);

  // Update counters
  session.realizedPnl     = +(session.realizedPnl + actualPnl).toFixed(2);
  session.capitalFree     = +(session.capitalFree + trade.capitalAllocated).toFixed(2);
  session.capitalDeployed = +(session.capitalDeployed - trade.capitalAllocated).toFixed(2);

  // Update ring-fence: lock 40% of any positive realized gain
  const positiveGain = Math.max(0, session.realizedPnl);
  session.ringFenced = +(positiveGain * RINGFENCE_PCT).toFixed(2);

  // Risk recycling: if SL not hit, free the allocated risk slot
  if (exitReason !== 'sl_hit') {
    session.riskUsed = Math.max(0, +(session.riskUsed - trade.risk).toFixed(2));
  }

  // Re-evaluate mode
  updateMode(session);

  // Hard stop check
  if (session.realizedPnl <= -session.hardStop) session.status = 'halted';

  await saveSession(session);

  // Trigger outcome calibration refresh (non-blocking)
  refreshSourceStats().catch(() => {});

  return { session: sessionSummary(session), closedTrade: trade };
}

// ── Session read / reset ──────────────────────────────────────────────────────
export async function getSession(date = istDate()) {
  const session = await redisGet(sessionKey(date));
  return session ? sessionSummary(session) : null;
}

export async function resetSession(date = istDate()) {
  await redisSet(sessionKey(date), null, 1);
  return { reset: true, date };
}

// ── Session summary (strip internal clutter for API response) ─────────────────
function sessionSummary(s) {
  return {
    date:             s.date,
    status:           s.status,
    mode:             s.mode,
    capital:          s.capital,
    riskBudget:       s.riskBudget,
    hardStop:         s.hardStop,
    rTarget:          s.rTarget,
    riskUsed:         s.riskUsed,
    realizedPnl:      s.realizedPnl,
    expectedPnl:      s.expectedPnl,
    capitalDeployed:  s.capitalDeployed,
    capitalFree:      s.capitalFree,
    ringFenced:       s.ringFenced,
    tradeCount:       s.tradeCount,
    maxTrades:        s.maxTrades,
    openTrades:       s.trades?.length ?? 0,
    closedTrades:     s.closedTrades?.length ?? 0,
    currentMinScore:  s.currentMinScore,
    currentMinEV:     s.currentMinEV,
    updatedAt:        s.updatedAt,
  };
}
