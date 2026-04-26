/**
 * Step 4 — Trade Plan Engine
 *
 * Converts each Step 3 opportunity into a fully defined, risk-controlled
 * Trade Plan object ready for execution and journal logging.
 *
 * Responsibilities (deterministic, no LLM):
 *   1. Data assembly      — fetch/cache 20-day OHLC, compute indicators
 *   2. Entry logic        — setup-type-specific confirmatory entry price
 *   3. Stop-loss          — wider of ATR-based vs structure-based SL
 *   4. Dual targets       — T1 @ 1.5R, T2 @ 2.5R (session-aware)
 *   5. Position sizing    — 2% portfolio risk ÷ open trades, ₹15k–₹50k bounds
 *   6. Execution filters  — RSI extremes, session time, R:R gate, entry validity
 *   7. Journal logging    — every plan (pass or reject) written to Supabase trades
 *
 * All logic is static. Learning and adaptation happen outside through data.
 *
 * API: POST /api/intel?action=trade_plan
 * Body: { opportunities: Opportunity[] }   ← Step 3 output
 */

import { atr14, rsi14 } from './indicators.js';
import { getHistory, getMarketSnapshot, getPortfolioContext, sectorBeta } from './plan.js';
import { insertTrade } from './supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// ATR multiplier range for SL — widens with VIX
const ATR_MULT_BASE  = 1.2;   // low VIX
const ATR_MULT_HIGH  = 1.8;   // high VIX (≥ 20)

// R:R minimums
const MIN_RR         = 1.5;   // hard floor — reject if below
const T1_R           = 1.5;   // first target at 1.5R
const T2_R           = 2.5;   // second target at 2.5R (suppressed late session)

// Session cutoffs (IST, 24h HHMM)
const CUTOFF_LATE    = 1445;  // 2:45 PM — reject new plans after this
const CUTOFF_T2      = 1415;  // 2:15 PM — suppress T2 after this (not enough time)

// Position sizing
const RISK_PCT       = 0.02;  // 2% of portfolio per cycle
const MIN_CAPITAL    = 15_000;
const MAX_CAPITAL    = 50_000;
const FALLBACK_CAP   = 25_000; // when portfolio value is unavailable

// RSI gates
const RSI_OB_LONG    = 78;   // overbought for long entry
const RSI_OS_SHORT   = 22;   // oversold for short entry

// Confirmatory buffer sizes (fraction of price) — keeps entry slightly beyond key level
const ENTRY_BUFFER   = { breakout: 0.0010, vwap: 0.0005, momentum: 0.0008, volume_surge: 0 };

// Structural SL buffer below breakout level (fraction)
const STRUCT_SL_BUF  = 0.0015;

// ── IST time helper ───────────────────────────────────────────────────────────
function istHHMM() {
  const now = new Date(Date.now() + 330 * 60_000);
  return now.getUTCHours() * 100 + now.getUTCMinutes();
}

function sessionLabel(hhmm) {
  if (hhmm < 1000) return 'opening';
  if (hhmm < 1200) return 'morning';
  if (hhmm < 1400) return 'midday';
  if (hhmm < 1445) return 'pre-close';
  return 'closing';
}

// ── ATR multiplier — scales with VIX ─────────────────────────────────────────
function atrMultiplier(vix) {
  if (vix <= 14) return ATR_MULT_BASE;
  if (vix >= 20) return ATR_MULT_HIGH;
  // Linear interpolation between 14 and 20
  return +(ATR_MULT_BASE + (vix - 14) / 6 * (ATR_MULT_HIGH - ATR_MULT_BASE)).toFixed(3);
}

// ── Setup-type-specific entry price ──────────────────────────────────────────
// Entry is always conditional and confirmatory — never blindly at LTP.
// For long setups: entry slightly above the key level.
// For short setups: entry slightly below the key level.
function computeEntry(opportunity, direction) {
  const { price, trigger }  = opportunity;
  const ltp      = price?.ltp ?? 0;
  const vwap     = price?.vwap ?? ltp;
  const orHigh   = price?.or_high ?? null;
  const orLow    = price?.or_low  ?? null;
  const primary  = trigger?.primary ?? '';

  if (primary === 'breakout_high' && orHigh) {
    // Entry: just above the opening range high — confirms continuation
    return +(orHigh * (1 + ENTRY_BUFFER.breakout)).toFixed(2);
  }
  if (primary === 'breakout_low' && orLow) {
    // Short entry: just below the opening range low
    return +(orLow * (1 - ENTRY_BUFFER.breakout)).toFixed(2);
  }
  if (primary === 'vwap_reclaim') {
    // Entry: just above VWAP to confirm reclaim is holding
    return +(vwap * (1 + ENTRY_BUFFER.vwap)).toFixed(2);
  }
  if (primary === 'vwap_loss') {
    // Short entry: just below VWAP to confirm loss is holding
    return +(vwap * (1 - ENTRY_BUFFER.vwap)).toFixed(2);
  }
  if (primary === 'volume') {
    // Volume surge: enter at LTP — move is already confirmed by Step 2
    return +ltp.toFixed(2);
  }
  // Momentum or fallback: small confirmation buffer above/below LTP
  const buf = ENTRY_BUFFER.momentum;
  return direction === 'short'
    ? +(ltp * (1 - buf)).toFixed(2)
    : +(ltp * (1 + buf)).toFixed(2);
}

// ── Stop-loss: wider of ATR-based or structure-based ─────────────────────────
// ATR-based: entry ± (ATR × multiplier)
// Structure-based: tied to the key level the setup depends on (VWAP, ORH, swing low)
// Always choose the more conservative (wider) stop.
function computeStopLoss(entry, direction, atrRs, atrMult, opportunity, candles) {
  const { price, trigger } = opportunity;
  const vwap   = price?.vwap  ?? entry;
  const orHigh = price?.or_high ?? null;
  const orLow  = price?.or_low  ?? null;
  const primary = trigger?.primary ?? '';
  const atrDist = atrRs * atrMult;

  // ATR-based SL distance
  const slAtr = direction === 'long'
    ? +(entry - atrDist).toFixed(2)
    : +(entry + atrDist).toFixed(2);

  // Structure-based SL
  let slStruct = null;

  if (primary === 'breakout_high' && orHigh) {
    // SL: just below ORH — if price falls back below the breakout level, the move is failed
    slStruct = direction === 'long'
      ? +(orHigh * (1 - STRUCT_SL_BUF)).toFixed(2)
      : null;
  } else if (primary === 'breakout_low' && orLow) {
    slStruct = direction === 'short'
      ? +(orLow * (1 + STRUCT_SL_BUF)).toFixed(2)
      : null;
  } else if (primary === 'vwap_reclaim') {
    // SL: below VWAP — if price loses VWAP again the reclaim has failed
    slStruct = direction === 'long'
      ? +(vwap * (1 - STRUCT_SL_BUF)).toFixed(2)
      : null;
  } else if (primary === 'vwap_loss') {
    slStruct = direction === 'short'
      ? +(vwap * (1 + STRUCT_SL_BUF)).toFixed(2)
      : null;
  } else if (candles && candles.length >= 3) {
    // Momentum / volume: use recent swing low (long) or swing high (short)
    const recent = candles.slice(-5);
    if (direction === 'long') {
      const swingLow = Math.min(...recent.map(c => c.low));
      slStruct = +(swingLow * (1 - STRUCT_SL_BUF)).toFixed(2);
    } else {
      const swingHigh = Math.max(...recent.map(c => c.high));
      slStruct = +(swingHigh * (1 + STRUCT_SL_BUF)).toFixed(2);
    }
  }

  // Take the more conservative (wider) SL — larger distance from entry
  if (slStruct !== null) {
    const distAtr    = Math.abs(entry - slAtr);
    const distStruct = Math.abs(entry - slStruct);
    return {
      sl:         distStruct >= distAtr ? slStruct : slAtr,
      sl_method:  distStruct >= distAtr ? 'structure' : 'atr',
      sl_atr:     slAtr,
      sl_struct:  slStruct,
    };
  }

  return { sl: slAtr, sl_method: 'atr', sl_atr: slAtr, sl_struct: null };
}

// ── Dual targets ──────────────────────────────────────────────────────────────
function computeTargets(entry, slDist, direction, hhmm) {
  const sign  = direction === 'long' ? 1 : -1;
  const t1    = +(entry + sign * T1_R * slDist).toFixed(2);
  const t2    = +(entry + sign * T2_R * slDist).toFixed(2);
  const lateSession = hhmm >= CUTOFF_T2;
  return {
    t1,
    t2:        lateSession ? null : t2,
    t2_suppressed: lateSession ? 'session too late for T2 to be realistic' : null,
  };
}

// ── Position sizing ───────────────────────────────────────────────────────────
function computePositionSize(entry, sl, portfolioValue, openTrades) {
  const slDist = Math.abs(entry - sl);
  if (slDist <= 0) return { qty: 1, capital: MIN_CAPITAL, risk_rs: 0, note: 'sl_dist_zero' };

  let capital;
  if (portfolioValue > 0) {
    const totalRisk   = portfolioValue * RISK_PCT;
    const slots       = Math.max(1, openTrades + 1);
    const riskPerSlot = totalRisk / slots;
    const qtyByRisk   = Math.floor(riskPerSlot / slDist);
    capital           = Math.min(Math.max(qtyByRisk * entry, MIN_CAPITAL), MAX_CAPITAL);
  } else {
    capital = FALLBACK_CAP;
  }

  const qty    = Math.max(1, Math.floor(capital / entry));
  const risk   = Math.round(qty * slDist);
  return {
    qty,
    capital:  Math.round(qty * entry),
    risk_rs:  risk,
    note: portfolioValue > 0
      ? `2% of ₹${(portfolioValue / 1000).toFixed(0)}k ÷ ${openTrades + 1} trades`
      : 'fixed capital (Kite disconnected)',
  };
}

// ── Execution filters ─────────────────────────────────────────────────────────
// Returns { ok: true } or { ok: false, reason: string }
function applyExecutionFilters({ entry, sl, t1, rr, rsi, direction, hhmm, price }) {
  const ltp = price?.ltp ?? entry;

  // Session time gate
  if (hhmm >= CUTOFF_LATE) {
    return { ok: false, reason: `late_session: ${hhmm} ≥ ${CUTOFF_LATE} — no new intraday plans after 2:45 PM` };
  }

  // R:R floor
  if (rr < MIN_RR) {
    return { ok: false, reason: `rr_insufficient: ${rr.toFixed(2)} < minimum ${MIN_RR}` };
  }

  // RSI extremes
  if (rsi !== null) {
    if (direction === 'long'  && rsi > RSI_OB_LONG)  return { ok: false, reason: `rsi_overbought: ${rsi.toFixed(1)} > ${RSI_OB_LONG} for long` };
    if (direction === 'short' && rsi < RSI_OS_SHORT) return { ok: false, reason: `rsi_oversold: ${rsi.toFixed(1)} < ${RSI_OS_SHORT} for short` };
  }

  // Entry validity: long entry must not be above day high (unreachable)
  if (direction === 'long' && price?.ltp > 0) {
    const dayHigh = price?.or_high ?? ltp; // use OR high as proxy if available
    if (entry > dayHigh * 1.03) {
      return { ok: false, reason: `entry_unreachable: entry ${entry} is > 3% above day reference high ${dayHigh}` };
    }
  }

  // SL must be below entry for long, above for short
  if (direction === 'long'  && sl >= entry) return { ok: false, reason: `sl_invalid: sl ${sl} ≥ entry ${entry}` };
  if (direction === 'short' && sl <= entry) return { ok: false, reason: `sl_invalid: sl ${sl} ≤ entry ${entry}` };

  return { ok: true };
}

// ── Trade ID generator ────────────────────────────────────────────────────────
function tradeId(symbol) {
  return `${symbol}-${Date.now().toString(36).toUpperCase()}`;
}

// ── Plan builder for one opportunity ─────────────────────────────────────────
async function buildTradePlan(opportunity, market, portfolio, historyCache) {
  const { symbol, direction, setup_type, final_score, brain, trigger, price } = opportunity;

  // ── Data assembly ─────────────────────────────────────────────────────────
  // Use cached history if this symbol was already fetched this cycle
  let candles = historyCache.get(symbol);
  if (!candles) {
    candles = await getHistory(symbol).catch(() => []);
    historyCache.set(symbol, candles);
  }

  const atrRs  = candles.length >= 2  ? atr14(candles)  : null;
  const rsiVal = candles.length >= 15 ? rsi14(candles)  : null;
  const hhmm   = istHHMM();
  const vix    = market.vix ?? 15;
  const atrMult = atrMultiplier(vix);

  // ── Entry ─────────────────────────────────────────────────────────────────
  const entry = computeEntry(opportunity, direction);

  // Reject immediately if we can't derive a valid entry
  if (!entry || entry <= 0) {
    return { symbol, ok: false, reason: 'entry_invalid: could not compute entry price', plan: null };
  }

  // ── Stop-loss ─────────────────────────────────────────────────────────────
  const fallbackAtr = (price?.ltp ?? entry) * 0.01; // 1% fallback if no history
  const effectiveAtr = atrRs ?? fallbackAtr;
  const { sl, sl_method, sl_atr, sl_struct } = computeStopLoss(
    entry, direction, effectiveAtr, atrMult, opportunity, candles,
  );
  const slDist = Math.abs(entry - sl);

  // ── Targets ───────────────────────────────────────────────────────────────
  const { t1, t2, t2_suppressed } = computeTargets(entry, slDist, direction, hhmm);

  // ── R:R ───────────────────────────────────────────────────────────────────
  const rewardDist = Math.abs(t1 - entry);
  const rr         = slDist > 0 ? +(rewardDist / slDist).toFixed(2) : 0;

  // ── Execution filters (pre-sizing to avoid wasted computation) ────────────
  const filter = applyExecutionFilters({ entry, sl, t1, rr, rsi: rsiVal, direction, hhmm, price });
  if (!filter.ok) {
    return { symbol, ok: false, reason: filter.reason, plan: null };
  }

  // ── Position sizing ───────────────────────────────────────────────────────
  const sizing = computePositionSize(entry, sl, portfolio.portfolioValue, portfolio.openTrades);
  const rewardRs = Math.round(sizing.qty * rewardDist);
  const sector   = brain?.signal_types?.join(', ') ?? '';

  // ── Build plan object ─────────────────────────────────────────────────────
  const id   = tradeId(symbol);
  const plan = {
    // Identity
    id,
    symbol,
    exchange:     'NSE',
    sector,
    side:         direction === 'long' ? 'BUY' : 'SELL',

    // Prices
    entry,
    target:       t1,    // primary target for journal schema compatibility
    sl,
    t1,
    t2:           t2 ?? null,

    // Sizing
    qty:          sizing.qty,
    capital:      sizing.capital,
    risk_rs:      sizing.risk_rs,
    reward_rs:    rewardRs,
    rr,

    // Classification (from Steps 1–3)
    setup_type,
    direction,
    confidence:   opportunity.confidence,
    score:        final_score,
    signal_score: Math.round(final_score * 100),

    // Step 1 brain context
    brain_score:      brain?.score ?? null,
    directional_bias: brain?.directional_bias ?? null,
    regime:           brain?.regime ?? null,
    event_type:       brain?.event_type ?? null,
    signal_types:     brain?.signal_types ?? [],

    // Step 2 trigger context
    trigger_primary:   trigger?.primary  ?? null,
    trigger_all:       trigger?.all_triggers ?? [],
    trigger_strength:  trigger?.strength ?? null,
    signal_intensity:  trigger?.signal_intensity ?? null,
    trend_context:     trigger?.trend_context ?? null,
    triggered_at:      trigger?.triggered_at ?? null,

    // Technical context
    atr:          atrRs ? +effectiveAtr.toFixed(2) : null,
    atr_mult:     atrMult,
    atr_source:   atrRs ? 'ATR-14' : 'fallback-1%',
    sl_method,
    sl_atr,
    sl_struct,
    rsi:          rsiVal ? +rsiVal.toFixed(1) : null,
    vix,
    session:      sessionLabel(hhmm),
    t2_suppressed,

    // Meta
    sizing_note:  sizing.note,
    source:       'market-brain-step4',
    status:       'open',
    opened_at:    new Date().toISOString(),
  };

  return { symbol, ok: true, reason: null, plan };
}

// ── Journal logger ────────────────────────────────────────────────────────────
// Writes every generated plan (pass or reject) to Supabase trades table.
// Reject entries use status='cancelled' and capture the rejection reason.
// Non-blocking — never delays the response.
function logToJournal(result) {
  if (result.ok && result.plan) {
    const { plan } = result;
    insertTrade({
      id:           plan.id,
      symbol:       plan.symbol,
      exchange:     plan.exchange,
      sector:       plan.sector,
      side:         plan.side,
      entry:        plan.entry,
      target:       plan.target,
      sl:           plan.sl,
      qty:          plan.qty,
      capital:      plan.capital,
      risk_rs:      plan.risk_rs,
      reward_rs:    plan.reward_rs,
      rr:           plan.rr,
      confidence:   plan.score,
      score:        plan.signal_score,
      setup_type:   plan.setup_type,
      source:       plan.source,
      status:       plan.status,
      factors: {
        brain_score:     plan.brain_score,
        directional_bias: plan.directional_bias,
        regime:          plan.regime,
        event_type:      plan.event_type,
        signal_types:    plan.signal_types,
        trigger_primary: plan.trigger_primary,
        trigger_strength: plan.trigger_strength,
        signal_intensity: plan.signal_intensity,
        trend_context:   plan.trend_context,
        atr:             plan.atr,
        atr_mult:        plan.atr_mult,
        sl_method:       plan.sl_method,
        rsi:             plan.rsi,
        vix:             plan.vix,
        session:         plan.session,
      },
      opened_at: plan.opened_at,
    }).catch(() => {}); // best-effort — never block
  }
  // Rejected plans are not written to journal — they never reached plan status
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate trade plans for all Step 3 opportunities.
 *
 * @param opportunities  Array of Step 3 opportunity objects
 * @returns {
 *   plans:    TradePlan[],          — executable plans, sorted by score desc
 *   rejected: { symbol, reason }[], — opportunities that failed Step 4 filters
 *   meta: { total, passed, rejected_count, session, vix, cycle_at }
 * }
 */
export async function generateTradePlans(opportunities) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return { plans: [], rejected: [], meta: { total: 0, passed: 0, rejected_count: 0 } };
  }

  // Shared data fetch — parallelise market + portfolio; history is per-symbol cached
  const [market, portfolio] = await Promise.all([
    getMarketSnapshot().catch(() => ({ vix: 15, niftyChgPct: 0 })),
    getPortfolioContext().catch(() => ({ portfolioValue: 0, openTrades: 0 })),
  ]);

  // Shared history cache across all opportunities this cycle
  const historyCache = new Map();

  // Build plans in parallel — each opportunity is independent
  const results = await Promise.all(
    opportunities.map(opp => buildTradePlan(opp, market, portfolio, historyCache)),
  );

  const plans   = [];
  const rejected = [];

  for (const result of results) {
    logToJournal(result);
    if (result.ok && result.plan) {
      plans.push(result.plan);
    } else {
      rejected.push({ symbol: result.symbol, reason: result.reason });
    }
  }

  // Sort by score desc (Step 3 final_score preserved in plan.score)
  plans.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const hhmm = istHHMM();
  return {
    plans,
    rejected,
    meta: {
      total:           opportunities.length,
      passed:          plans.length,
      rejected_count:  rejected.length,
      session:         sessionLabel(hhmm),
      vix:             market.vix,
      nifty_chg_pct:   market.niftyChgPct,
      portfolio_value: portfolio.portfolioValue,
      open_trades:     portfolio.openTrades,
      cycle_at:        new Date().toISOString(),
    },
  };
}
