/**
 * Outcomes store — self-evaluation and adaptive calibration layer for brain.js
 *
 * Flow:
 *   1. persistPicks()       — writes emitted picks to brain_picks (with vix_bucket + time_bucket)
 *   2. recordOutcomes()     — checks elapsed windows, records realized metrics to brain_outcomes
 *   3. refreshSourceStats() — aggregates → brain_source_stats across 7 segment dimensions
 *                             + prunes stale low-sample segments
 *   4. fetchCalibration()   — loads brain_source_stats into a Map for brain.js
 *   5. resolveCalibration() — hierarchical lookup: full context → partial → prior fallback
 *   6. buildMonitor()       — lightweight monitoring snapshot on every brain response
 *
 * Segment dimensions (7 types):
 *   source::{src}                              — source-only (base)
 *   source::{src}::vix::{vix}                 — source × volatility regime
 *   source::{src}::time::{time}               — source × intraday slot
 *   source::{src}::vix::{vix}::time::{time}  — source × full context (most specific)
 *   type::{st}::{et}::{regime}                — signal dimension (base)
 *   type::{st}::{et}::{regime}::vix::{vix}   — signal × volatility
 *   type::{st}::{et}::{regime}::time::{time} — signal × intraday slot
 *
 * Evaluation windows: 30min | 1hr | eod (375 min from market open)
 * Stale pruning: segments older than 30 days with sample_size < 15 are deleted.
 */

import { supabaseInsert, supabaseSelect, supabaseUpdate, supabaseDelete } from './supabase.js';

// ── Evaluation windows ────────────────────────────────────────────────────────
export const EVAL_WINDOWS = [
  { label: '30min', minutes: 30  },
  { label: '1hr',   minutes: 60  },
  { label: 'eod',   minutes: 375 },
];

// ── Context bucketing ─────────────────────────────────────────────────────────

/**
 * Map VIX state string → low | normal | high bucket.
 * Exported so brain.js can call it without re-deriving.
 */
export function vixBucket(vixState) {
  const s = (vixState || '').toLowerCase();
  if (s.includes('low') || s.includes('calm'))            return 'low';
  if (s.includes('high') || s.includes('spike') || s.includes('fear')) return 'high';
  return 'normal';
}

/**
 * Map current IST time → opening | midday | closing bucket.
 * Market hours: 09:15–15:30 IST (UTC+5:30).
 * opening:  09:15–10:30 (first 75 min — most volatile, news-driven)
 * closing:  14:00–15:30 (last 90 min — expiry/position squaring)
 * midday:   10:30–14:00
 */
export function timeBucket() {
  const now     = new Date();
  const istMin  = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330; // +5:30
  const istMod  = istMin % (24 * 60); // normalise to 0–1439
  if (istMod >= 555 && istMod < 630)  return 'opening';  // 09:15–10:30
  if (istMod >= 840 && istMod < 930)  return 'closing';  // 14:00–15:30
  return 'midday';
}

// ── Persist emitted picks ─────────────────────────────────────────────────────
/**
 * Write each pick from a brain cycle to brain_picks.
 * ltpMap: { SYMBOL: ltp } — current prices at emit time.
 * Silent: never throws, never blocks the response.
 */
export async function persistPicks(picks, ltpMap = {}) {
  if (!picks?.length) return;
  const vixBkt  = vixBucket(picks[0]?.score_factors?.regime ?? '');
  const timeBkt = timeBucket();
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
    vix_bucket:       vixBkt,
    time_bucket:      timeBkt,
    emitted_at:       new Date().toISOString(),
    windows_pending:  EVAL_WINDOWS.map(w => w.label),
  }));
  try {
    await supabaseInsert('brain_picks', rows);
  } catch { /* silent — outcome tracking never blocks */ }
}

// ── Record outcomes for matured windows ──────────────────────────────────────
/**
 * Checks which picks have elapsed windows, fetches LTP via caller-supplied fn,
 * writes brain_outcomes, updates windows_pending on the pick.
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

  const now     = Date.now();
  const symbols = [...new Set(pending.map(p => p.symbol))];
  let ltpMap = {};
  try { ltpMap = await ltpFetcher(symbols); } catch {}

  for (const pick of pending) {
    const emittedAt    = new Date(pick.emitted_at).getTime();
    const elapsedMin   = (now - emittedAt) / 60000;
    const ltpNow       = ltpMap[pick.symbol] ?? null;
    const stillPending = [];
    const outcomeRows  = [];

    for (const win of EVAL_WINDOWS) {
      if (!(pick.windows_pending || []).includes(win.label)) continue;
      if (elapsedMin < win.minutes)                          { stillPending.push(win.label); continue; }
      if (ltpNow === null || pick.ltp_at_emit === null)      { stillPending.push(win.label); continue; }

      const returnPct      = +((ltpNow - pick.ltp_at_emit) / pick.ltp_at_emit * 100).toFixed(3);
      const directionCorrect = pick.directional_bias === 'long'  ? returnPct > 0
                             : pick.directional_bias === 'short' ? returnPct < 0
                             : null; // neutral excluded from win-rate
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
        mae,
        vix_bucket:        pick.vix_bucket  || 'normal',
        time_bucket:       pick.time_bucket || 'midday',
        recorded_at:       new Date().toISOString(),
        source_ids:        (pick.score_factors?.article_contributions || []).map(a => a.source),
      });
    }

    if (outcomeRows.length) {
      try { await supabaseInsert('brain_outcomes', outcomeRows); } catch {}
    }
    try {
      await supabaseUpdate('brain_picks', pick.id, { windows_pending: stillPending });
    } catch {}
  }
}

// ── Aggregate rolling source stats ────────────────────────────────────────────
/**
 * Reads brain_outcomes (last 90 days, EOD window) and upserts brain_source_stats
 * across 7 segment dimensions. Prunes stale low-sample segments after writing.
 */
export async function refreshSourceStats() {
  let outcomes;
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    outcomes = await supabaseSelect('brain_outcomes', {
      filter: `recorded_at=gte.${cutoff}&window=eq.eod`,
      limit:  10000,
    });
  } catch { return; }

  if (!outcomes?.length) return;

  const buckets = new Map();

  function addToBucket(key, attrs, o) {
    if (!buckets.has(key)) buckets.set(key, { ...attrs, returns: [], correctness: [] });
    const b = buckets.get(key);
    b.returns.push(o.return_pct);
    if (o.direction_correct !== null) b.correctness.push(o.direction_correct ? 1 : 0);
  }

  for (const o of outcomes) {
    const st      = o.signal_types?.[0] ?? 'unknown';
    const et      = o.event_type ?? 'general_mention';
    const reg     = o.regime ?? 'neutral';
    const vix     = o.vix_bucket  || 'normal';
    const time    = o.time_bucket || 'midday';

    // ── Signal-dimension segments (source-agnostic) ───────────────────────────
    const base = { segment_type: 'signal', source_id: null, signal_type: st, event_type: et, regime: reg };
    addToBucket(`type::${st}::${et}::${reg}`,              { ...base, vix_bucket: null, time_bucket: null }, o);
    addToBucket(`type::${st}::${et}::${reg}::vix::${vix}`, { ...base, vix_bucket: vix, time_bucket: null }, o);
    addToBucket(`type::${st}::${et}::${reg}::time::${time}`,{ ...base, vix_bucket: null, time_bucket: time }, o);

    // ── Source-dimension segments ─────────────────────────────────────────────
    for (const src of (o.source_ids || [])) {
      const sb = { segment_type: 'source', source_id: src, signal_type: null, event_type: null, regime: null };
      addToBucket(`source::${src}`,                               { ...sb, vix_bucket: null, time_bucket: null }, o);
      addToBucket(`source::${src}::vix::${vix}`,                 { ...sb, vix_bucket: vix, time_bucket: null }, o);
      addToBucket(`source::${src}::time::${time}`,               { ...sb, vix_bucket: null, time_bucket: time }, o);
      addToBucket(`source::${src}::vix::${vix}::time::${time}`,  { ...sb, vix_bucket: vix, time_bucket: time }, o);
    }
  }

  const MIN_SAMPLE = 5;
  const rows = [];
  for (const [key, b] of buckets) {
    if (b.returns.length < MIN_SAMPLE) continue;
    const n       = b.returns.length;
    const avgRet  = b.returns.reduce((s, v) => s + v, 0) / n;
    const winRate = b.correctness.length
      ? b.correctness.reduce((s, v) => s + v, 0) / b.correctness.length
      : null;
    const drawdowns = b.returns.filter(r => r < 0);
    const avgMae  = drawdowns.length ? Math.abs(drawdowns.reduce((s,v) => s+v,0) / drawdowns.length) : 0;
    rows.push({
      segment_key:  key,
      segment_type: b.segment_type,
      source_id:    b.source_id,
      signal_type:  b.signal_type,
      event_type:   b.event_type,
      regime:       b.regime,
      vix_bucket:   b.vix_bucket,
      time_bucket:  b.time_bucket,
      win_rate:     winRate !== null ? +winRate.toFixed(4) : null,
      avg_return:   +avgRet.toFixed(4),
      avg_drawdown: +avgMae.toFixed(4),
      sample_size:  n,
      updated_at:   new Date().toISOString(),
    });
  }

  if (rows.length) {
    try {
      await supabaseInsert('brain_source_stats', rows, { upsert: true, conflictKey: 'segment_key' });
    } catch {}
  }

  // ── Stale segment pruning ─────────────────────────────────────────────────
  // Remove segments not updated in 30 days with low sample counts —
  // they reflect market conditions that no longer apply.
  try {
    const staleCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseDelete('brain_source_stats', `updated_at=lt.${staleCutoff}&sample_size=lt.15`);
  } catch {}
}

// ── Fetch calibration data ────────────────────────────────────────────────────
/**
 * Returns Map<segmentKey, { win_rate, avg_return, sample_size }>
 * brain.js loads this once per cycle and passes it into scoreAndRank.
 * Returns empty Map on any error — scoring falls back to prior reliability_score.
 */
export async function fetchCalibration() {
  try {
    const rows = await supabaseSelect('brain_source_stats', {
      order: 'updated_at.desc',
      limit: 1000,
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

// ── Hierarchical calibration resolution ──────────────────────────────────────
/**
 * Resolves the most specific available calibration segment for a given article.
 * Priority: source×vix×time → source×vix → source×time → source-only
 *        → type×vix → type×time → type-only → null (prior fallback)
 *
 * A segment is only used if it has at least MIN_SAMPLES outcomes, ensuring
 * confidence decay for thin segments naturally falls through to broader ones.
 */
const RESOLVE_MIN_SAMPLES = 5;

export function resolveCalibration(calibrationMap, source, signalType, eventType, regime, vixBkt, timeBkt) {
  const st  = signalType  ?? 'unknown';
  const et  = eventType   ?? 'general_mention';
  const reg = regime      ?? 'neutral';

  const candidates = [
    // Source dimension — most specific first
    `source::${source}::vix::${vixBkt}::time::${timeBkt}`,
    `source::${source}::vix::${vixBkt}`,
    `source::${source}::time::${timeBkt}`,
    `source::${source}`,
    // Signal dimension
    `type::${st}::${et}::${reg}::vix::${vixBkt}`,
    `type::${st}::${et}::${reg}::time::${timeBkt}`,
    `type::${st}::${et}::${reg}`,
  ];

  for (const key of candidates) {
    const seg = calibrationMap.get(key);
    if (seg?.win_rate !== null && (seg?.sample_size ?? 0) >= RESOLVE_MIN_SAMPLES) return seg;
  }
  return null; // caller uses pure prior
}

// ── Monitoring snapshot ───────────────────────────────────────────────────────
/**
 * Lightweight monitoring block attached to every brain API response.
 * Detects coverage gaps, discard reasons, signal distribution, calibration status.
 */
export function buildMonitor({
  totalExtractions, dropped, evidenceGateDropped, scoreFloorDropped,
  emittedPicks, articles, calibrationMap, vixBkt, timeBkt,
}) {
  const total       = totalExtractions || 1;
  const coveragePct = +((emittedPicks / total) * 100).toFixed(1);

  const signalDist  = {};
  for (const a of (articles || [])) {
    signalDist[a.signal_type] = (signalDist[a.signal_type] || 0) + 1;
  }

  const calSegments = calibrationMap?.size ?? 0;

  return {
    coverage_pct:    coveragePct,
    total_extractions: totalExtractions,
    discard_reasons: {
      low_confidence:  dropped,
      evidence_gate:   evidenceGateDropped,
      score_floor:     scoreFloorDropped,
    },
    signal_distribution:  signalDist,
    article_count:        articles?.length ?? 0,
    calibration_segments: calSegments,
    calibration_active:   calSegments > 0,
    context_bucket: {
      vix:  vixBkt  ?? 'unknown',
      time: timeBkt ?? 'unknown',
    },
  };
}
