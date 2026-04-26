/**
 * Outcomes store — self-evaluation and adaptive calibration layer for brain.js
 *
 * Flow:
 *   1. persistPicks()       — called after scoreAndRank emits picks; writes to brain_picks
 *   2. recordOutcomes()     — called on brain refresh; checks pending windows, fetches LTP, writes brain_outcomes
 *   3. refreshSourceStats() — aggregates brain_outcomes → brain_source_stats (rolling, by segment)
 *   4. fetchCalibration()   — returns Map<segmentKey, {win_rate, avg_return, sample_size}>
 *                             consumed by brain.js to hydrate blendedReliability()
 *
 * Evaluation windows (minutes after emit):
 *   30min, 60min, EOD (375 min = market close at 15:30 IST from typical 9:15 open)
 */

import { supabaseInsert, supabaseSelect, supabaseUpdate } from './supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────
export const EVAL_WINDOWS = [
  { label: '30min', minutes: 30  },
  { label: '1hr',   minutes: 60  },
  { label: 'eod',   minutes: 375 },
];

// ── Persist emitted picks ─────────────────────────────────────────────────────
/**
 * Write each pick from a brain cycle to brain_picks.
 * ltpMap: { SYMBOL: ltp } — current prices at emit time (from Kite or NSE quotes)
 * Silent: never throws, never blocks the response.
 */
export async function persistPicks(picks, ltpMap = {}) {
  if (!picks?.length) return;
  const rows = picks.map(p => ({
    symbol:           p.symbol,
    exchange:         p.exchange || 'NSE',
    regime:           p.regime,
    directional_bias: p.directional_bias,
    score:            p.score,
    event_type:       p.event_type,
    signal_types:     p.signal_types,
    score_factors:    p.score_factors,
    mention_count:    p.mention_count,
    distinct_sources: p.distinct_sources,
    ltp_at_emit:      ltpMap[p.symbol] ?? null,
    emitted_at:       new Date().toISOString(),
    // windows_pending tracks which eval windows haven't been recorded yet
    windows_pending:  EVAL_WINDOWS.map(w => w.label),
  }));
  try {
    await supabaseInsert('brain_picks', rows);
  } catch { /* silent — outcome tracking is non-blocking */ }
}

// ── Record outcomes for matured windows ──────────────────────────────────────
/**
 * Called on each brain refresh cycle.
 * Fetches picks with pending windows that have elapsed, records realized metrics.
 * ltpFetcher: async (symbols) => { SYMBOL: currentLtp } — caller provides price lookup
 */
export async function recordOutcomes(ltpFetcher) {
  let pending;
  try {
    pending = await supabaseSelect('brain_picks', {
      filter: 'windows_pending=not.eq.{}',
      order:  'emitted_at.asc',
      limit:  100,
    });
  } catch { return; }

  if (!pending?.length) return;

  const now       = Date.now();
  const symbols   = [...new Set(pending.map(p => p.symbol))];
  let ltpMap = {};
  try { ltpMap = await ltpFetcher(symbols); } catch {}

  for (const pick of pending) {
    const emittedAt      = new Date(pick.emitted_at).getTime();
    const elapsedMin     = (now - emittedAt) / 60000;
    const ltpNow         = ltpMap[pick.symbol] ?? null;
    const stillPending   = [];
    const outcomeRows    = [];

    for (const win of EVAL_WINDOWS) {
      if (!(pick.windows_pending || []).includes(win.label)) continue;
      if (elapsedMin < win.minutes) { stillPending.push(win.label); continue; }
      if (ltpNow === null || pick.ltp_at_emit === null) { stillPending.push(win.label); continue; }

      const returnPct = +((ltpNow - pick.ltp_at_emit) / pick.ltp_at_emit * 100).toFixed(3);
      // Direction correct: long bias → positive return wins; short bias → negative return wins
      const directionCorrect = pick.directional_bias === 'long'  ? returnPct > 0
                             : pick.directional_bias === 'short' ? returnPct < 0
                             : null; // neutral picks excluded from win-rate calc

      // Max adverse excursion: approximated as worst-case move against bias
      // (full intrabar MAE would need tick data; we use return sign as proxy)
      const mae = directionCorrect === false ? Math.abs(returnPct) : 0;

      outcomeRows.push({
        pick_id:           pick.id,
        symbol:            pick.symbol,
        regime:            pick.regime,
        directional_bias:  pick.directional_bias,
        event_type:        pick.event_type,
        signal_types:      pick.signal_types,
        score_at_emit:     pick.score,
        window:            win.label,
        ltp_at_emit:       pick.ltp_at_emit,
        ltp_at_window:     ltpNow,
        return_pct:        returnPct,
        direction_correct: directionCorrect,
        mae:               mae,
        recorded_at:       new Date().toISOString(),
        // source-level segments for rollup joins
        source_ids:        (pick.score_factors?.article_contributions || []).map(a => a.source),
      });
    }

    // Write outcomes
    if (outcomeRows.length) {
      try { await supabaseInsert('brain_outcomes', outcomeRows); } catch {}
    }

    // Update pick's pending window list
    try {
      await supabaseUpdate('brain_picks', pick.id, { windows_pending: stillPending });
    } catch {}
  }
}

// ── Aggregate rolling source stats ────────────────────────────────────────────
/**
 * Reads brain_outcomes (last 90 days) and writes/upserts brain_source_stats.
 * Segment dimensions: source_id, signal_type, event_type, regime.
 * Only called after recordOutcomes — piggybacks on brain refresh cycle.
 * Minimum 5 outcomes required before a segment row is written.
 */
export async function refreshSourceStats() {
  let outcomes;
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    outcomes = await supabaseSelect('brain_outcomes', {
      filter: `recorded_at=gte.${cutoff}&window=eq.eod`,  // use EOD window as canonical
      limit:  5000,
    });
  } catch { return; }

  if (!outcomes?.length) return;

  // Explode source_ids into per-source rows, then group by segment key
  const buckets = new Map();

  function bucket(key, attrs, o) {
    if (!buckets.has(key)) buckets.set(key, { ...attrs, returns: [], correctness: [] });
    const b = buckets.get(key);
    b.returns.push(o.return_pct);
    if (o.direction_correct !== null) b.correctness.push(o.direction_correct ? 1 : 0);
  }

  for (const o of outcomes) {
    // Per signal_type × event_type × regime (source-agnostic)
    const typeKey = `type::${o.signal_types?.[0] ?? 'unknown'}::${o.event_type}::${o.regime}`;
    bucket(typeKey, { segment_type: 'signal', source_id: null, signal_type: o.signal_types?.[0], event_type: o.event_type, regime: o.regime }, o);

    // Per source_id (collapsed across regime/event for reliability adjustment)
    for (const src of (o.source_ids || [])) {
      const srcKey = `source::${src}`;
      bucket(srcKey, { segment_type: 'source', source_id: src, signal_type: null, event_type: null, regime: null }, o);
    }
  }

  const MIN_SAMPLE = 5;
  const rows = [];
  for (const [key, b] of buckets) {
    if (b.returns.length < MIN_SAMPLE) continue;
    const n        = b.returns.length;
    const avgRet   = b.returns.reduce((s, v) => s + v, 0) / n;
    const winRate  = b.correctness.length
      ? b.correctness.reduce((s, v) => s + v, 0) / b.correctness.length
      : null;
    const drawdowns = b.returns.filter(r => r < 0);
    const avgMae   = drawdowns.length ? Math.abs(drawdowns.reduce((s,v) => s+v,0) / drawdowns.length) : 0;
    rows.push({
      segment_key:  key,
      segment_type: b.segment_type,
      source_id:    b.source_id,
      signal_type:  b.signal_type,
      event_type:   b.event_type,
      regime:       b.regime,
      win_rate:     winRate !== null ? +winRate.toFixed(4) : null,
      avg_return:   +avgRet.toFixed(4),
      avg_drawdown: +avgMae.toFixed(4),
      sample_size:  n,
      updated_at:   new Date().toISOString(),
    });
  }

  if (!rows.length) return;
  try {
    await supabaseInsert('brain_source_stats', rows, { upsert: true, conflictKey: 'segment_key' });
  } catch {}
}

// ── Fetch calibration data for blendedReliability ─────────────────────────────
/**
 * Returns Map<segmentKey, { win_rate, avg_return, sample_size }>
 * brain.js calls this once per cycle and passes it into the scoring loop.
 * Returns empty Map on error — scoring falls back to prior reliability_score.
 */
export async function fetchCalibration() {
  try {
    const rows = await supabaseSelect('brain_source_stats', {
      order: 'updated_at.desc',
      limit: 500,
    });
    const map = new Map();
    for (const r of (rows || [])) {
      map.set(r.segment_key, {
        win_rate:    r.win_rate,
        avg_return:  r.avg_return,
        sample_size: r.sample_size,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Monitoring snapshot ───────────────────────────────────────────────────────
/**
 * Produces a lightweight monitoring object included in every brain result.
 * Detects coverage gaps, discard reasons, signal distribution, factor drift.
 */
export function buildMonitor({
  totalExtractions, dropped, evidenceGateDropped, scoreFloorDropped,
  emittedPicks, articles, calibrationMap,
}) {
  const total        = totalExtractions || 1;
  const coveragePct  = +((emittedPicks / total) * 100).toFixed(1);

  const signalDist   = {};
  for (const a of (articles || [])) {
    signalDist[a.signal_type] = (signalDist[a.signal_type] || 0) + 1;
  }

  const calSegments  = calibrationMap?.size ?? 0;
  const calibrated   = calSegments > 0;

  return {
    coverage_pct:        coveragePct,
    total_extractions:   totalExtractions,
    discard_reasons: {
      low_confidence:   dropped,
      evidence_gate:    evidenceGateDropped,
      score_floor:      scoreFloorDropped,
    },
    signal_distribution: signalDist,
    article_count:       articles?.length ?? 0,
    calibration_segments: calSegments,
    calibration_active:  calibrated,
  };
}
