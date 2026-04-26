/**
 * EV Layer — Expected Value computation for Step 5 allocator.
 *
 * Takes a Step 3/4 opportunity and enriches it with:
 *   1. Calibrated win_rate + payoff_ratio from outcomes.js brain_source_stats
 *   2. EV = (winRate × payoffRatio) - (1 - winRate)
 *   3. Regime conditioning: VIX adjustment on EV
 *   4. Recency-weighted calibration (last-20-trades weighted 3×)
 *   5. Dynamic slippage: liquidity tier × time-of-day
 *   6. effectiveEntry for both risk and expectedPnl calculations
 *   7. Source down-weighting via recent performance decay
 *
 * All functions are pure / synchronous after calibration data is loaded.
 * Callers fetch calibration once per cycle via loadCalibrationForEV() and
 * pass the result through — no internal I/O after that.
 *
 * Contract:
 *   enrichOpportunity(opportunity, calibrationMap, sessionContext) → EnrichedOpportunity
 *   passesEVGate(enriched, minEV, minScore) → boolean
 *   loadCalibrationForEV() → Promise<CalibrationMap>  (one call per cycle)
 */

import { fetchCalibration, vixBucket, timeBucket } from './outcomes.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Minimum calibration sample size to trust a segment (below → use prior)
const MIN_SAMPLES = 5;

// Prior fallback win rate and payoff when no calibration is available
const PRIOR_WIN_RATE    = 0.50;
const PRIOR_PAYOFF      = 1.40;

// Regime EV adjustments (additive to raw EV)
const VIX_HIGH_DISCOUNT   = 0.15;   // subtract in high-VIX (noisy)
const VIX_STABLE_BOOST    = 0.10;   // add in stable trending regime

// Recency weighting — last N outcomes weighted RECENCY_WEIGHT× more
const RECENCY_N      = 20;
const RECENCY_WEIGHT = 3.0;

// Slippage by liquidity tier (% of entry price, one-way)
const SLIPPAGE = {
  large:  0.0003,  // 0.03%
  mid:    0.0005,  // 0.05%
  small:  0.0008,  // 0.08%
};

// Additional time-of-day slippage surcharge (additive)
const TIME_SLIPPAGE_SURCHARGE = {
  opening_auction: 0.0005,   // wide spreads at open
  closing:         0.0004,   // position squaring
  early_trend:     0.0000,
  mid_morning:     0.0000,
  lunch_chop:      0.0002,
  afternoon:       0.0000,
  late_session:    0.0003,
};

// Spread assumptions by liquidity tier (% of entry)
const SPREAD = {
  large:  0.0002,
  mid:    0.0004,
  small:  0.0008,
};

// Source down-weight applied when recent win_rate < threshold
const SOURCE_POOR_WIN_RATE   = 0.45;
const SOURCE_MIN_SAMPLES     = 10;
const SOURCE_EV_PENALTY      = 0.70;   // multiply EV by this
const SOURCE_SCORE_PENALTY   = 0.85;   // multiply score by this

// ── Time-of-day window helper ─────────────────────────────────────────────────
// Returns the current IST trading window label.
export function tradingWindow() {
  const now    = new Date();
  const istMin = ((now.getUTCHours() * 60 + now.getUTCMinutes()) + 330) % (24 * 60);
  if (istMin >= 555 && istMin < 585) return 'opening_auction'; // 09:15–09:45
  if (istMin >= 585 && istMin < 630) return 'early_trend';     // 09:45–10:30
  if (istMin >= 630 && istMin < 720) return 'mid_morning';     // 10:30–12:00
  if (istMin >= 720 && istMin < 810) return 'lunch_chop';      // 12:00–13:30
  if (istMin >= 810 && istMin < 855) return 'afternoon';       // 13:30–14:15
  if (istMin >= 855 && istMin < 900) return 'late_session';    // 14:15–15:00
  if (istMin >= 900 && istMin < 915) return 'closing';         // 15:00–15:15
  return 'closed';
}

// ── Liquidity tier inference ──────────────────────────────────────────────────
// Derives tier from signal_types and brain context.
// Future: replace with a curated large-cap symbol set.
function liquidityTier(opportunity) {
  const types = (opportunity.brain?.signal_types ?? []).map(s => s.toLowerCase());
  if (types.includes('institutional_flow') || types.includes('smart_money')) return 'large';
  if (types.includes('derivatives')) return 'mid';
  return 'small';
}

// ── Slippage + spread model ───────────────────────────────────────────────────
// Returns total execution cost as a fraction of entry price (one-way).
function executionCostFraction(tier, window) {
  const slip   = SLIPPAGE[tier]   ?? SLIPPAGE.mid;
  const spread = SPREAD[tier]     ?? SPREAD.mid;
  const surcharge = TIME_SLIPPAGE_SURCHARGE[window] ?? 0;
  return slip + spread + surcharge;
}

// Applies execution cost to compute effectiveEntry.
function effectiveEntryPrice(entry, direction, executionCost) {
  if (direction === 'short') return +(entry * (1 - executionCost)).toFixed(2);
  return +(entry * (1 + executionCost)).toFixed(2);
}

// ── Calibration lookup ────────────────────────────────────────────────────────
// Hierarchical resolution: most specific segment → least specific → prior.
// Mirrors resolveCalibration() in outcomes.js but inlined here for performance.
function resolveSegment(calibrationMap, opportunity, vixBkt, timeBkt) {
  const st  = (opportunity.brain?.signal_types?.[0] ?? 'unknown').toLowerCase();
  const et  = (opportunity.brain?.event_type ?? 'general_mention').toLowerCase();
  const reg = (opportunity.brain?.regime ?? 'neutral').toLowerCase();

  const candidates = [
    `type::${st}::${et}::${reg}::vix::${vixBkt}`,
    `type::${st}::${et}::${reg}::time::${timeBkt}`,
    `type::${st}::${et}::${reg}`,
  ];

  for (const key of candidates) {
    const seg = calibrationMap.get(key);
    if (seg?.win_rate !== null && (seg?.sample_size ?? 0) >= MIN_SAMPLES) return seg;
  }
  return null;
}

// ── Recency-decay payoff ratio ────────────────────────────────────────────────
// If calibration segment includes recent outcomes, apply 3× weighting to last N.
// Because brain_source_stats stores aggregated stats (not individual outcomes),
// we approximate recency decay via a weighted blend:
//   recentWinRate (if available in seg.recent_win_rate) × RECENCY_WEIGHT + base × 1
// Falls back cleanly if recent_win_rate is not present.
function recencyWeightedWinRate(seg) {
  const base = seg.win_rate ?? PRIOR_WIN_RATE;
  const recent = seg.recent_win_rate;
  if (recent == null || seg.sample_size < RECENCY_N) return base;
  // Weighted average: recent 20 trades × 3, rest × 1
  const restCount   = Math.max(0, seg.sample_size - RECENCY_N);
  const totalWeight = RECENCY_N * RECENCY_WEIGHT + restCount;
  return (recent * RECENCY_N * RECENCY_WEIGHT + base * restCount) / totalWeight;
}

// ── Payoff ratio ──────────────────────────────────────────────────────────────
// avg_return (positive outcomes) / |avg_drawdown| from calibration.
// Falls back to T1/T2 implied ratio if calibration is insufficient.
function payoffRatio(seg, opportunity) {
  if (seg?.avg_return > 0 && seg?.avg_drawdown > 0) {
    return +(seg.avg_return / seg.avg_drawdown).toFixed(3);
  }
  // Imply from T1/T2 step 4 plan
  const entry = opportunity.plan?.entry ?? opportunity.price?.ltp;
  const t1    = opportunity.plan?.t1;
  const sl    = opportunity.plan?.sl;
  if (entry && t1 && sl && Math.abs(entry - sl) > 0) {
    return +( Math.abs(t1 - entry) / Math.abs(entry - sl) ).toFixed(3);
  }
  return PRIOR_PAYOFF;
}

// ── Raw EV ────────────────────────────────────────────────────────────────────
// EV in R-units: 1R = risk per trade (entry - SL).
// EV > 0 means positive expectancy. EV = 0.20 means 0.20R per trade on average.
function computeRawEV(winRate, payoff) {
  return +((winRate * payoff) - (1 - winRate)).toFixed(4);
}

// ── Regime EV conditioning ────────────────────────────────────────────────────
function regimeAdjustEV(rawEV, vixBkt, regime) {
  let adjustment = 0;
  if (vixBkt === 'high') adjustment -= VIX_HIGH_DISCOUNT;
  if (vixBkt === 'low' && (regime || '').toLowerCase().includes('trending')) {
    adjustment += VIX_STABLE_BOOST;
  }
  return +(rawEV + adjustment).toFixed(4);
}

// ── Source quality check ──────────────────────────────────────────────────────
// Penalise score and EV when the dominant signal source has declining performance.
function applySourcePenalty(score, ev, calibrationMap, opportunity, vixBkt, timeBkt) {
  const signalTypes = opportunity.brain?.signal_types ?? [];
  let penalised = false;

  for (const st of signalTypes) {
    const et  = opportunity.brain?.event_type ?? 'general_mention';
    const reg = opportunity.brain?.regime ?? 'neutral';
    const key = `type::${st}::${et}::${reg}`;
    const seg = calibrationMap.get(key);
    if (!seg) continue;
    if ((seg.sample_size ?? 0) >= SOURCE_MIN_SAMPLES && (seg.win_rate ?? 1) < SOURCE_POOR_WIN_RATE) {
      penalised = true;
      break;
    }
  }

  if (!penalised) return { score, ev };
  return {
    score: +(score * SOURCE_SCORE_PENALTY).toFixed(4),
    ev:    +(ev    * SOURCE_EV_PENALTY).toFixed(4),
  };
}

// ── Expected PnL ──────────────────────────────────────────────────────────────
// Uses effectiveEntry (not idealized) and historical T1/T2 exit weighting.
// t1ExitRate from calibration if available, else 0.60 default.
function computeExpectedPnl(qty, effectiveEnt, opportunity, winRate, seg) {
  const t1         = opportunity.plan?.t1 ?? null;
  const t2         = opportunity.plan?.t2 ?? null;
  if (!t1 || !qty) return null;

  const t1ExitRate = seg?.t1_exit_rate ?? 0.60;
  const t2ExitRate = 1 - t1ExitRate;
  const direction  = opportunity.direction;

  const t1Gain = direction === 'short'
    ? (effectiveEnt - t1) * qty * t1ExitRate
    : (t1 - effectiveEnt) * qty * t1ExitRate;

  const t2Gain = t2
    ? (direction === 'short'
        ? (effectiveEnt - t2) * qty * t2ExitRate
        : (t2 - effectiveEnt) * qty * t2ExitRate)
    : 0;

  return +((t1Gain + t2Gain) * winRate).toFixed(2);
}

// ── Main enrichment function ──────────────────────────────────────────────────
/**
 * Enriches a Step 3/4 opportunity with EV data.
 *
 * @param opportunity   — Step 4 opportunity object (with plan, brain, trigger, price)
 * @param calibrationMap — Map<segmentKey, { win_rate, avg_return, avg_drawdown, sample_size }>
 * @param sessionContext — { regime, window } (current market context)
 * @returns EnrichedOpportunity with ev, effectiveEntry, expectedPnl, sizing guidance
 */
export function enrichOpportunity(opportunity, calibrationMap, sessionContext = {}) {
  const window  = sessionContext.window  ?? tradingWindow();
  const regime  = sessionContext.regime  ?? (opportunity.brain?.regime ?? 'neutral');
  const vixBkt  = vixBucket(regime);
  const timeBkt = timeBucket();

  // ── Step 1: Resolve calibration segment ──────────────────────────────────
  const seg = resolveSegment(calibrationMap, opportunity, vixBkt, timeBkt);

  // ── Step 2: Win rate (recency-weighted) and payoff ratio ─────────────────
  const rawWinRate = seg ? recencyWeightedWinRate(seg) : PRIOR_WIN_RATE;
  const payoff     = payoffRatio(seg, opportunity);
  const winRate    = Math.min(0.95, Math.max(0.05, rawWinRate)); // clamp to sensible range

  // ── Step 3: Raw EV and regime conditioning ────────────────────────────────
  const rawEV = computeRawEV(winRate, payoff);
  const ev    = regimeAdjustEV(rawEV, vixBkt, regime);

  // ── Step 4: Source quality penalty ───────────────────────────────────────
  const baseScore = opportunity.final_score ?? 0;
  const penalised = applySourcePenalty(baseScore, ev, calibrationMap, opportunity, vixBkt, timeBkt);
  const finalScore = penalised.score;
  const finalEV    = penalised.ev;

  // ── Step 5: Execution cost and effectiveEntry ─────────────────────────────
  const tier          = liquidityTier(opportunity);
  const execCost      = executionCostFraction(tier, window);
  const entry         = opportunity.plan?.entry ?? opportunity.price?.ltp ?? 0;
  const direction     = opportunity.direction ?? 'long';
  const effectiveEnt  = effectiveEntryPrice(entry, direction, execCost);

  // ── Step 6: Risk per unit (using effectiveEntry, not idealized) ───────────
  const sl          = opportunity.plan?.sl ?? null;
  const riskPerUnit = sl ? Math.abs(effectiveEnt - sl) : null;

  // ── Step 7: Expected PnL preview (qty=1 for scoring; allocator scales) ───
  const expectedPnlPerUnit = computeExpectedPnl(1, effectiveEnt, opportunity, winRate, seg);

  return {
    ...opportunity,

    // Scoring (may differ from original due to source penalty)
    final_score:  finalScore,

    // EV enrichment
    ev: {
      value:         finalEV,
      raw:           rawEV,
      regime_adj:    +(finalEV - rawEV).toFixed(4),
      win_rate:      +winRate.toFixed(4),
      payoff_ratio:  payoff,
      calibrated:    seg !== null,
      sample_size:   seg?.sample_size ?? 0,
      vix_bucket:    vixBkt,
      time_bucket:   timeBkt,
      source_penalised: penalised.score < baseScore,
    },

    // Execution
    execution: {
      tier,
      window,
      exec_cost_pct:   +(execCost * 100).toFixed(3),
      effective_entry: effectiveEnt,
      risk_per_unit:   riskPerUnit ? +riskPerUnit.toFixed(2) : null,
      expected_pnl_per_unit: expectedPnlPerUnit,
    },
  };
}

// ── Gate check ────────────────────────────────────────────────────────────────
/**
 * Returns true if the enriched opportunity passes both the EV and score gates.
 * Also applies time-of-day threshold raises for low-quality windows.
 */
export function passesEVGate(enriched, minEV = 0.15, minScore = 0.75) {
  const window = enriched.execution?.window ?? tradingWindow();

  // Raise thresholds in structurally weak windows
  let effectiveMinEV    = minEV;
  let effectiveMinScore = minScore;
  if (window === 'lunch_chop' || window === 'closing') {
    effectiveMinEV    += 0.05;
    effectiveMinScore += 0.05;
  }
  if (window === 'opening_auction') {
    effectiveMinScore += 0.05; // extra caution at open — wider spreads already in exec cost
  }
  if (window === 'closed') return false;

  return (enriched.ev?.value ?? -Infinity) >= effectiveMinEV
      && (enriched.final_score ?? 0)        >= effectiveMinScore;
}

// ── Calibration loader (one call per allocation cycle) ────────────────────────
/**
 * Loads the full calibration map from Supabase brain_source_stats.
 * Returns empty Map on failure — allocator operates with prior fallbacks.
 */
export async function loadCalibrationForEV() {
  try {
    return await fetchCalibration();
  } catch {
    return new Map();
  }
}
