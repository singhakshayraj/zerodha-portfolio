/**
 * Step 2 — Trigger Engine (v5 — fully self-stabilising)
 *
 * v1: Six trigger types, VIX-adaptive thresholds, dynamic cooldowns
 * v2: True incremental VWAP, non-linear volume curve, confirmation gate,
 *     Redis persistence, strength tagging + trend context
 * v3: Data integrity guards, adaptive volume curve, context-aware confirmation,
 *     primary trigger hierarchy, microstructure filter, cycle health check
 * v4: Symbol continuity check, decay-weighted curve, type-sensitive confirmation,
 *     relative volatility filter, confluence intensity, degradation logging
 * v5 (this file):
 *   19. Curve stability guard      — snapshots rejected/down-weighted when total
 *                                    market volume is abnormal vs recent averages,
 *                                    preventing rare events from distorting curve
 *   20. Directional consistency    — signals suppressed for symbols flipping
 *                                    price direction repeatedly within recent window
 *   21. Cross-trigger validation   — structural triggers (breakout, VWAP reclaim)
 *                                    require at least weak volume or momentum
 *                                    participation unless high-strength bypass
 *   22. State freshness check      — per-symbol fresh-observation counter; triggers
 *                                    suppressed until enough live reads rebuild
 *                                    reliability after Redis cold-start or downtime
 *   23. Per-symbol activity dampen — symbols triggering excessively vs their own
 *                                    recent rate get threshold multiplier applied
 *   24. Degradation alert          — repeated degraded cycles within short window
 *                                    set a proactive alert flag in Redis
 *
 * API: GET /api/research?action=triggers&vix=normal
 */

import { redisGet, redisSet } from './redis.js';

// ── NIFTY 50 Universe ─────────────────────────────────────────────────────────
export const UNIVERSE = [
  'ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK',
  'BAJAJ-AUTO','BAJFINANCE','BAJAJFINSV','BEL','BPCL',
  'BHARTIARTL','BRITANNIA','CIPLA','COALINDIA','DRREDDY',
  'EICHERMOT','GRASIM','HCLTECH','HDFCBANK','HDFCLIFE',
  'HEROMOTOCO','HINDALCO','HINDUNILVR','ICICIBANK','ITC',
  'INDUSINDBK','INFY','JSWSTEEL','KOTAKBANK','LT',
  'LTIM','M&M','MARUTI','NTPC','NESTLEIND',
  'ONGC','POWERGRID','RELIANCE','SBILIFE','SBIN',
  'SUNPHARMA','TCS','TATACONSUM','TATAMOTORS','TATASTEEL',
  'TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO',
];

// ── Core constants ────────────────────────────────────────────────────────────
const MIN_VOLUME           = 50_000;
const BASELINE_DAYS        = 5;

// ── Type-sensitive confirmation windows (ms) ──────────────────────────────────
const CONFIRM_BY_TYPE = {
  vwap_reclaim:  { normal: 6 * 60_000, choppy: 9 * 60_000, momentum: 3 * 60_000 },
  vwap_loss:     { normal: 6 * 60_000, choppy: 9 * 60_000, momentum: 3 * 60_000 },
  breakout_high: { normal: 3 * 60_000, choppy: 5 * 60_000, momentum: 1 * 60_000 },
  breakout_low:  { normal: 3 * 60_000, choppy: 5 * 60_000, momentum: 1 * 60_000 },
  momentum:      { normal: 4 * 60_000, choppy: 7 * 60_000, momentum: 2 * 60_000 },
  volume:        { normal: 5 * 60_000, choppy: 8 * 60_000, momentum: 3 * 60_000 },
};
const CONFIRM_DEFAULT      = { normal: 4 * 60_000, choppy: 7 * 60_000, momentum: 2 * 60_000 };
const MAX_PENDING_AGE_MS   = 10 * 60_000;

// ── High-strength bypass ──────────────────────────────────────────────────────
const HIGH_STRENGTH_VOL    = 3.0;
const HIGH_STRENGTH_PRICE  = 2.0;
const HS_MIN_VOLUME        = 200_000;
const HS_MAX_TICK_JUMP     = 4.0;      // % vs prev close

// ── Cooldowns ────────────────────────────────────────────────────────────────
const COOLDOWN_BY_STRENGTH = { strong: 6 * 60_000, medium: 12 * 60_000, weak: 20 * 60_000 };

// ── Microstructure filter ─────────────────────────────────────────────────────
const MAX_RANGE_PCT        = 5.0;
const MAX_JUMP_FROM_OPEN   = 9.0;
const REL_VOL_RANGE_MULT   = 2.5;     // current range > 2.5× symbol avg → abnormal

// ── Symbol continuity ────────────────────────────────────────────────────────
const CONTINUITY_PRICE_SIGMA  = 3.5;
const CONTINUITY_VOLUME_SIGMA = 4.0;
const HISTORY_WINDOW          = 8;

// ── Directional consistency ───────────────────────────────────────────────────
// A symbol is considered "choppy" if it has flipped price direction more than
// MAX_DIR_FLIPS times in the last HISTORY_WINDOW observations.
const MAX_DIR_FLIPS        = 4;

// ── Cross-trigger validation ──────────────────────────────────────────────────
// Structural triggers (breakout / VWAP) that fire without any participation from
// volume or momentum are removed unless the signal qualifies for high-strength bypass.
const STRUCTURAL_TRIGGERS  = new Set(['breakout_high', 'breakout_low', 'vwap_reclaim', 'vwap_loss']);
const PARTICIPATION_TRIGGERS = new Set(['volume', 'momentum']);

// ── State freshness ───────────────────────────────────────────────────────────
// Triggers suppressed until a symbol has MIN_FRESH_OBS fresh observations this
// session, preventing spurious signals on Redis-rehydrated but unverified state.
const MIN_FRESH_OBS        = 3;

// ── Per-symbol activity dampening ────────────────────────────────────────────
// Track recent trigger count per symbol. If a symbol fires more than
// ACTIVITY_RATE_MULT × its universe-average rate, apply threshold multiplier.
const ACTIVITY_WINDOW_MS   = 60 * 60_000;  // 1-hour rolling window
const ACTIVITY_RATE_MULT   = 3.0;          // 3× avg → dampen
const ACTIVITY_THR_MULT    = 1.35;         // threshold multiplier when dampened

// ── Cycle health + degradation alert ─────────────────────────────────────────
const HEALTH_MIN_COVERAGE  = 0.70;
const HEALTH_MAX_BL_MISS   = 0.40;
const DEGRADE_LOG_MAX      = 100;
// Alert fires when >= ALERT_COUNT degraded cycles occur within ALERT_WINDOW_MS
const ALERT_COUNT          = 3;
const ALERT_WINDOW_MS      = 30 * 60_000;  // 30 minutes

// ── Adaptive volume curve ────────────────────────────────────────────────────
const CURVE_SNAPSHOT_MAX   = 200;
const CURVE_MIN_ANCHORS    = 4;
const CURVE_DECAY_HALFLIFE = 50;
// Stability guard: reject snapshot if market cum-fraction deviates > this σ
// from recent snapshots at the same elapsed-minute bucket (±15 min).
const CURVE_STABILITY_SIGMA = 2.5;

// ── VIX-adaptive thresholds ───────────────────────────────────────────────────
const THRESHOLDS = {
  price_pct:    { low: 0.7,  normal: 1.0,  high: 1.6  },
  volume_ratio: { low: 1.3,  normal: 1.5,  high: 2.2  },
  breakout_pct: { low: 0.20, normal: 0.40, high: 0.70 },
};
const OPENING_DAMP         = { price: 1.6, volume: 1.8 };
const EXPIRY_VOLUME_FACTOR = 0.85;
const TTL                  = { state: 86_400, baseline: 43_200, curve: 216_000 };

// ── Primary trigger hierarchy ─────────────────────────────────────────────────
const TRIGGER_PRIORITY = [
  'breakout_high', 'breakout_low',
  'vwap_reclaim',  'vwap_loss',
  'momentum',      'volume',
];
function primaryTrigger(confirmed) {
  for (const t of TRIGGER_PRIORITY) if (confirmed.includes(t)) return t;
  return confirmed[0] ?? null;
}

// ── Static volume curve (fallback) ───────────────────────────────────────────
const STATIC_CURVE = [
  { min: 0,   pct: 0.00 },
  { min: 30,  pct: 0.18 },
  { min: 75,  pct: 0.33 },
  { min: 150, pct: 0.50 },
  { min: 240, pct: 0.66 },
  { min: 315, pct: 0.80 },
  { min: 375, pct: 1.00 },
];
let _activeCurve = STATIC_CURVE;

function interpolateCurve(curve, elapsedMin) {
  const e = Math.max(0, Math.min(375, elapsedMin));
  for (let i = 1; i < curve.length; i++) {
    const p = curve[i - 1], c = curve[i];
    if (e <= c.min) return p.pct + ((e - p.min) / (c.min - p.min)) * (c.pct - p.pct);
  }
  return 1.0;
}
function expectedVolumeFraction(elapsedMin) { return interpolateCurve(_activeCurve, elapsedMin); }

// Exponential-decay weighted curve rebuild from snapshots.
function buildAdaptiveCurve(snapshots) {
  if (!snapshots || snapshots.length < 3) return STATIC_CURVE;
  const anchors = [0, 30, 75, 150, 240, 315, 375];
  const n       = snapshots.length;
  const buckets = anchors.map(min => {
    let wSum = 0, wTot = 0;
    snapshots.forEach((s, idx) => {
      if (Math.abs(s.minute - min) > 15) return;
      const w = Math.pow(0.5, (n - 1 - idx) / CURVE_DECAY_HALFLIFE);
      wSum += s.cumFraction * w;
      wTot += w;
    });
    return wTot === 0 ? null : { min, pct: Math.min(1, Math.max(0, wSum / wTot)) };
  }).filter(Boolean);
  return buckets.length < CURVE_MIN_ANCHORS ? STATIC_CURVE : buckets;
}

async function loadAdaptiveCurve() {
  try {
    const s = await redisGet('trig:curve_snapshots');
    if (Array.isArray(s)) { const c = buildAdaptiveCurve(s); if (c !== STATIC_CURVE) _activeCurve = c; }
  } catch {}
}

// Curve stability guard: compute mean + σ of recent snapshots at same minute
// bucket, and reject the incoming snapshot if it deviates beyond CURVE_STABILITY_SIGMA.
function isCurveSnapshotStable(existing, elapsedMin, cumFraction) {
  const nearby = (existing || []).filter(s => Math.abs(s.minute - elapsedMin) <= 15);
  if (nearby.length < 5) return true; // insufficient history to judge — accept
  const mean = nearby.reduce((s, x) => s + x.cumFraction, 0) / nearby.length;
  const std  = Math.sqrt(nearby.reduce((s, x) => s + (x.cumFraction - mean) ** 2, 0) / nearby.length);
  if (std === 0) return true;
  return Math.abs(cumFraction - mean) / std <= CURVE_STABILITY_SIGMA;
}

function recordCurveSnapshot(elapsedMin, cumFraction) {
  if (elapsedMin <= 0 || cumFraction == null) return;
  redisGet('trig:curve_snapshots').then(existing => {
    // Stability guard: reject snapshot if market volume is abnormally deviant
    if (!isCurveSnapshotStable(existing, elapsedMin, cumFraction)) return;
    const arr = Array.isArray(existing) ? existing : [];
    arr.push({ minute: elapsedMin, cumFraction, at: Date.now() });
    redisSet('trig:curve_snapshots', arr.slice(-CURVE_SNAPSHOT_MAX), TTL.curve * 10).catch(() => {});
  }).catch(() => {});
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function istMinutes() {
  return (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 330) % 1440;
}
function istDateStr() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
export function isMarketOpen() {
  const day = new Date(Date.now() + 330 * 60_000).getUTCDay();
  if (day === 0 || day === 6) return false;
  const m = istMinutes(); return m >= 555 && m < 930;
}
function isOpeningPeriod() { const m = istMinutes(); return m >= 555 && m < 570; }
function isExpiryDay()     { return new Date(Date.now() + 330 * 60_000).getUTCDay() === 4; }
function elapsedMarketMinutes() { return Math.min(375, Math.max(0, istMinutes() - 555)); }

// ── VIX → bucket ──────────────────────────────────────────────────────────────
function vixToBucket(vixState) {
  const s = (vixState || '').toLowerCase();
  if (s.includes('low') || s.includes('calm'))                          return 'low';
  if (s.includes('high') || s.includes('spike') || s.includes('fear')) return 'high';
  return 'normal';
}

function buildThresholds(vixBkt, opening, expiry, activityDampened = false) {
  let price  = THRESHOLDS.price_pct[vixBkt]   ?? 1.0;
  let volume = THRESHOLDS.volume_ratio[vixBkt] ?? 1.5;
  let brk    = THRESHOLDS.breakout_pct[vixBkt] ?? 0.4;
  if (opening)          { price *= OPENING_DAMP.price; volume *= OPENING_DAMP.volume; }
  if (expiry)           { volume *= EXPIRY_VOLUME_FACTOR; }
  if (activityDampened) { price *= ACTIVITY_THR_MULT; volume *= ACTIVITY_THR_MULT; brk *= ACTIVITY_THR_MULT; }
  return { price_pct: price, volume_ratio: volume, breakout_pct: brk };
}

// ── Strength ──────────────────────────────────────────────────────────────────
function computeStrength(changePctOpen, volRatio, thr) {
  const max = Math.max(Math.abs(changePctOpen) / thr.price_pct, (volRatio ?? 0) / thr.volume_ratio);
  return max >= 2.5 ? 'strong' : max >= 1.5 ? 'medium' : 'weak';
}

function isHighStrength(changePctOpen, volRatio, thr, volume, prevClose, ltp) {
  const raw = (volRatio !== null && volRatio >= HIGH_STRENGTH_VOL) ||
              (Math.abs(changePctOpen) / thr.price_pct >= HIGH_STRENGTH_PRICE);
  if (!raw)                                                        return false;
  if ((volume ?? 0) < HS_MIN_VOLUME)                               return false;
  if (prevClose > 0 && Math.abs((ltp - prevClose) / prevClose * 100) > HS_MAX_TICK_JUMP) return false;
  return true;
}

// ── Trend context ─────────────────────────────────────────────────────────────
function trendContext(ltp, open, vwap) {
  if (ltp > open && ltp >= vwap) return 'uptrend';
  if (ltp < open && ltp <  vwap) return 'downtrend';
  return 'ranging';
}

// ── In-memory state ───────────────────────────────────────────────────────────
const _state = {
  vwap:     {},   // { SYM: { cumPV, cumVol, prevVolume, date, _side } }
  or:       {},   // { SYM: { high, low, date } }
  baseline: {},   // { SYM: avg5d }
  pending:  {},   // { "SYM::type": { firstSeenAt, firstPrice, firstVolRatio } }
  cooldown: {},   // { "SYM::type": { expiry } }

  // In-memory only (not persisted — must be fresh per session)
  history:  {},   // { SYM: { prices[], volumes[], dirs[] } }
  freshObs: {},   // { SYM: count } — observations recorded this session
  activity: {},   // { SYM: [triggeredAt, ...] } — recent trigger timestamps

  _loadedAt:        0,
  _baselineLoaded:  false,
  _baselineLoading: false,
};

async function loadStateFromRedis() {
  if (_state._loadedAt > 0) return;
  const [vwap, or, pending, cooldown] = await Promise.all([
    redisGet('trig:vwap_all'),
    redisGet('trig:or_all'),
    redisGet('trig:pending_all'),
    redisGet('trig:cooldown_all'),
  ]);
  if (vwap)     Object.assign(_state.vwap,     vwap);
  if (or)       Object.assign(_state.or,       or);
  if (pending)  Object.assign(_state.pending,  pending);
  if (cooldown) Object.assign(_state.cooldown, cooldown);
  _state._loadedAt = Date.now();
}

function flushStateToRedis() {
  redisSet('trig:vwap_all',     _state.vwap,     TTL.state).catch(() => {});
  redisSet('trig:or_all',       _state.or,       TTL.state).catch(() => {});
  redisSet('trig:pending_all',  _state.pending,  TTL.state).catch(() => {});
  redisSet('trig:cooldown_all', _state.cooldown, TTL.state).catch(() => {});
}

// ── Per-symbol history + freshness ────────────────────────────────────────────
function recordSymbolHistory(symbol, ltp, volume) {
  if (!_state.history[symbol]) _state.history[symbol] = { prices: [], volumes: [], dirs: [] };
  const h   = _state.history[symbol];
  const dir = h.prices.length > 0 ? (ltp >= h.prices[h.prices.length - 1] ? 1 : -1) : 0;

  h.prices.push(ltp);
  h.volumes.push(volume);
  if (dir !== 0) h.dirs.push(dir);

  if (h.prices.length  > HISTORY_WINDOW) h.prices.shift();
  if (h.volumes.length > HISTORY_WINDOW) h.volumes.shift();
  if (h.dirs.length    > HISTORY_WINDOW) h.dirs.shift();

  _state.freshObs[symbol] = (_state.freshObs[symbol] ?? 0) + 1;
}

function hasSufficientFreshObs(symbol) {
  return (_state.freshObs[symbol] ?? 0) >= MIN_FRESH_OBS;
}

function rollingStats(arr) {
  if (arr.length < 3) return null;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  return { mean, std };
}

// Continuity check: suppress if price or volume is a σ-outlier vs own history.
function isContinuityBreak(symbol, ltp, volume) {
  const h = _state.history[symbol];
  if (!h || h.prices.length < 3) return false;
  const ps = rollingStats(h.prices);
  if (ps && ps.std > 0 && Math.abs(ltp    - ps.mean) / ps.std > CONTINUITY_PRICE_SIGMA)  return true;
  const vs = rollingStats(h.volumes);
  if (vs && vs.std > 0 && Math.abs(volume - vs.mean) / vs.std > CONTINUITY_VOLUME_SIGMA) return true;
  return false;
}

// Directional consistency: count direction flips in the recent window.
// A flip is a sign change between consecutive direction observations.
function isDirectionallyChoppy(symbol) {
  const h = _state.history[symbol];
  if (!h || h.dirs.length < 4) return false;
  let flips = 0;
  for (let i = 1; i < h.dirs.length; i++) {
    if (h.dirs[i] !== h.dirs[i - 1]) flips++;
  }
  return flips >= MAX_DIR_FLIPS;
}

// ── Per-symbol activity dampening ────────────────────────────────────────────
function recordSymbolActivity(symbol) {
  if (!_state.activity[symbol]) _state.activity[symbol] = [];
  _state.activity[symbol].push(Date.now());
}

function pruneActivityWindow() {
  const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
  for (const sym of Object.keys(_state.activity)) {
    _state.activity[sym] = _state.activity[sym].filter(t => t > cutoff);
  }
}

// Returns true if symbol has triggered excessively relative to universe average.
function isActivityDampened(symbol) {
  const counts = Object.values(_state.activity).map(arr => arr.length);
  if (counts.length < 5) return false; // not enough universe data yet
  const avg    = counts.reduce((s, v) => s + v, 0) / counts.length;
  if (avg === 0) return false;
  return (_state.activity[symbol]?.length ?? 0) >= avg * ACTIVITY_RATE_MULT;
}

// ── True incremental VWAP with data integrity guards ─────────────────────────
const MAX_DELTA_VOL_MULT = 5;

function updateVWAP(symbol, high, low, ltp, currentVolume) {
  const today = istDateStr();
  const prev  = _state.vwap[symbol];
  if (!prev || prev.date !== today) {
    _state.vwap[symbol] = { cumPV: 0, cumVol: 0, prevVolume: currentVolume, date: today };
    return (high + low + ltp) / 3;
  }
  const deltaVol = currentVolume - prev.prevVolume;
  if (deltaVol <= 0) {
    prev.prevVolume = Math.max(prev.prevVolume, currentVolume);
    return prev.cumVol > 0 ? prev.cumPV / prev.cumVol : (high + low + ltp) / 3;
  }
  if (prev.prevVolume > 0 && deltaVol > prev.prevVolume * MAX_DELTA_VOL_MULT) {
    prev.prevVolume = currentVolume;
    return prev.cumVol > 0 ? prev.cumPV / prev.cumVol : (high + low + ltp) / 3;
  }
  const tp      = (high + low + ltp) / 3;
  prev.cumPV   += tp * deltaVol;
  prev.cumVol  += deltaVol;
  prev.prevVolume = currentVolume;
  return prev.cumPV / prev.cumVol;
}

// ── Opening range ─────────────────────────────────────────────────────────────
function updateOpeningRange(symbol, high, low) {
  const today = istDateStr();
  if (!_state.or[symbol] || _state.or[symbol].date !== today) {
    if (isOpeningPeriod()) _state.or[symbol] = { high, low, date: today };
  }
}
function getOpeningRange(symbol) {
  const r = _state.or[symbol];
  return (r && r.date === istDateStr()) ? r : null;
}

// ── Cooldowns ─────────────────────────────────────────────────────────────────
function inCooldown(symbol, type) {
  const cd = _state.cooldown[`${symbol}::${type}`];
  return cd && Date.now() < cd.expiry;
}
function setCooldown(symbol, type, strength) {
  _state.cooldown[`${symbol}::${type}`] = { expiry: Date.now() + (COOLDOWN_BY_STRENGTH[strength] ?? COOLDOWN_BY_STRENGTH.weak) };
}
function pruneExpiredCooldowns() {
  const now = Date.now();
  for (const k of Object.keys(_state.cooldown)) {
    if (_state.cooldown[k].expiry < now) delete _state.cooldown[k];
  }
}

// ── Microstructure filter (absolute + relative) ───────────────────────────────
function isMicrostructureAbnormal(symbol, ltp, open, high, low) {
  if (!ltp || !open || !high || !low) return false;
  const rangePct = (high - low) / ltp * 100;
  if (rangePct                            > MAX_RANGE_PCT)      return true;
  if (Math.abs((ltp - open) / open * 100) > MAX_JUMP_FROM_OPEN) return true;
  // Relative: compare vs symbol's own recent price σ
  const h = _state.history[symbol];
  if (h && h.prices.length >= 3) {
    const ps = rollingStats(h.prices);
    if (ps && ps.std > 0) {
      const symAvgRange = (ps.std / ps.mean) * 100 * 2;
      if (symAvgRange > 0 && rangePct > symAvgRange * REL_VOL_RANGE_MULT) return true;
    }
  }
  return false;
}

// ── Type-sensitive, context-aware confirmation ────────────────────────────────
function confirmAgeFor(type, volRatio, changePctOpen, thr, isLowVol) {
  const t       = CONFIRM_BY_TYPE[type] ?? CONFIRM_DEFAULT;
  const priceEx = Math.abs(changePctOpen) / thr.price_pct;
  if (priceEx >= 1.8 && (volRatio ?? 0) >= thr.volume_ratio) return t.momentum;
  if (isLowVol) return t.choppy;
  return t.normal;
}

function checkConfirmation(symbol, type, ltp, volRatio, highStr, changePctOpen, thr, isLowVol) {
  const key     = `${symbol}::${type}`;
  const now     = Date.now();
  const pending = _state.pending[key];
  if (!pending) {
    if (highStr) return 'confirmed';
    _state.pending[key] = { firstSeenAt: now, firstPrice: ltp, firstVolRatio: volRatio };
    return 'pending';
  }
  const age = now - pending.firstSeenAt;
  if (age > MAX_PENDING_AGE_MS) { delete _state.pending[key]; return 'cleared'; }
  if (age >= confirmAgeFor(type, volRatio, changePctOpen, thr, isLowVol)) {
    delete _state.pending[key]; return 'confirmed';
  }
  return 'pending';
}

function clearPending(symbol, type) { delete _state.pending[`${symbol}::${type}`]; }

// ── Volume ratio ──────────────────────────────────────────────────────────────
function volumeRatio(symbol, currentVolume, elapsedMin) {
  const avg5d = _state.baseline[symbol];
  if (!avg5d || elapsedMin <= 0) return null;
  const exp = avg5d * expectedVolumeFraction(elapsedMin);
  if (exp <= 0) return null;
  return +(currentVolume / exp).toFixed(2);
}

// ── Volume baseline loader ────────────────────────────────────────────────────
const NSE_HDR = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.nseindia.com/',
};

async function loadVolumeBaselines(cookie) {
  if (_state._baselineLoaded || _state._baselineLoading) return;
  _state._baselineLoading = true;
  const cached = await redisGet('trig:baseline_all').catch(() => null);
  if (cached && Object.keys(cached).length > 0) {
    Object.assign(_state.baseline, cached);
    _state._baselineLoaded  = true;
    _state._baselineLoading = false;
    return;
  }
  const hdrs    = { ...NSE_HDR, Cookie: cookie };
  const today   = new Date(Date.now() + 330 * 60_000);
  const from    = new Date(+today - 14 * 24 * 60 * 60_000);
  const toStr   = today.toISOString().slice(0, 10).split('-').reverse().join('-');
  const fromStr = from.toISOString().slice(0, 10).split('-').reverse().join('-');
  await Promise.allSettled(UNIVERSE.map(async symbol => {
    try {
      const url = `https://www.nseindia.com/api/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series=[%22EQ%22]&from=${fromStr}&to=${toStr}`;
      const r   = await fetch(url, { headers: hdrs });
      if (!r.ok) return;
      const json = await r.json();
      const rows = (json.data || []).filter(d => d.CH_TOT_TRADED_QTY > 0).slice(-BASELINE_DAYS);
      if (rows.length) _state.baseline[symbol] = rows.reduce((s, d) => s + Number(d.CH_TOT_TRADED_QTY), 0) / rows.length;
    } catch {}
  }));
  redisSet('trig:baseline_all', _state.baseline, TTL.baseline).catch(() => {});
  _state._baselineLoaded  = true;
  _state._baselineLoading = false;
}

// ── Degradation logging + alert ───────────────────────────────────────────────
function logDegradedCycle(health, elapsedMin, vixBkt, scanned) {
  const entry = {
    at: new Date().toISOString(), reason: health.reason,
    coverage: health.coverage, missing: health.missing,
    elapsed_min: elapsedMin, vix_bucket: vixBkt, scanned,
  };
  redisGet('trig:degrade_log').then(existing => {
    const arr = Array.isArray(existing) ? existing : [];
    arr.push(entry);
    const pruned = arr.slice(-DEGRADE_LOG_MAX);
    redisSet('trig:degrade_log', pruned, TTL.state * 7).catch(() => {});

    // Alert threshold: check if >= ALERT_COUNT degraded cycles within ALERT_WINDOW_MS
    const cutoff   = Date.now() - ALERT_WINDOW_MS;
    const recent   = pruned.filter(e => new Date(e.at).getTime() > cutoff);
    const alerting = recent.length >= ALERT_COUNT;
    redisSet('trig:degrade_alert', {
      alerting,
      recent_count:  recent.length,
      window_ms:     ALERT_WINDOW_MS,
      threshold:     ALERT_COUNT,
      last_reason:   health.reason,
      last_at:       entry.at,
      cleared_at:    alerting ? null : entry.at,
    }, TTL.state).catch(() => {});
  }).catch(() => {});
}

// ── Cycle health check ────────────────────────────────────────────────────────
function checkCycleHealth(quotesMap, scanned) {
  const coverage = scanned / UNIVERSE.length;
  if (coverage < HEALTH_MIN_COVERAGE) {
    return { healthy: false, coverage: +coverage.toFixed(2), missing: UNIVERSE.length - scanned,
      reason: `Coverage ${(coverage * 100).toFixed(0)}% below minimum ${(HEALTH_MIN_COVERAGE * 100).toFixed(0)}%` };
  }
  const blMissing = UNIVERSE.filter(s => quotesMap[s] && !_state.baseline[s]).length;
  if (blMissing > scanned * HEALTH_MAX_BL_MISS) {
    return { healthy: false, coverage: +coverage.toFixed(2), missing: UNIVERSE.length - scanned,
      reason: `Volume baselines missing for ${blMissing} symbols` };
  }
  return { healthy: true, coverage: +coverage.toFixed(2), missing: UNIVERSE.length - scanned, reason: null };
}

// ── Cross-trigger validation ──────────────────────────────────────────────────
// Structural triggers without any participation-backed co-confirmation are removed
// unless the overall signal qualifies for high-strength bypass.
function applyCrossTriggerValidation(confirmed, highStr) {
  if (highStr) return confirmed; // bypass: institutional move, no participation required
  const hasParticipation = confirmed.some(t => PARTICIPATION_TRIGGERS.has(t));
  if (hasParticipation) return confirmed;
  // Remove unparticipated structural triggers — keep participation-only triggers intact
  return confirmed.filter(t => !STRUCTURAL_TRIGGERS.has(t));
}

// ── Per-symbol evaluation ─────────────────────────────────────────────────────
function evaluateSymbol(symbol, quote, vixBkt, opening, expiry, elapsedMin, isLowVol) {
  const { last_price: ltp, ohlc, volume, change_pct } = quote;
  if (!ltp || !ohlc?.open) return null;
  const { open, high, low, close: prevClose } = ohlc;

  if ((volume || 0) < MIN_VOLUME && elapsedMin > 30) return null;

  // State freshness: suppress until MIN_FRESH_OBS live reads have been recorded
  // (guards against triggering on Redis-rehydrated state with no live validation)
  if (!hasSufficientFreshObs(symbol)) {
    recordSymbolHistory(symbol, ltp, volume || 0);
    return null;
  }

  // Continuity break: σ-outlier vs own history → bad tick or feed error
  const continuityBroken = isContinuityBreak(symbol, ltp, volume || 0);
  recordSymbolHistory(symbol, ltp, volume || 0);
  if (continuityBroken) return null;

  // Directional consistency: suppress signals for choppy, flip-heavy symbols
  if (isDirectionallyChoppy(symbol)) return null;

  // Microstructure filter (absolute + relative volatility)
  if (isMicrostructureAbnormal(symbol, ltp, open, high, low)) return null;

  // Activity dampening: over-triggering symbols get elevated thresholds
  const dampened = isActivityDampened(symbol);
  const thr      = buildThresholds(vixBkt, opening, expiry, dampened);

  const vwap          = updateVWAP(symbol, high, low, ltp, volume || 0);
  const aboveVwap     = ltp >= vwap;
  const changePctOpen = open > 0 ? ((ltp - open) / open * 100) : 0;
  const volRatio      = volumeRatio(symbol, volume || 0, elapsedMin);
  const highStr       = isHighStrength(changePctOpen, volRatio, thr, volume, prevClose, ltp);
  const strength      = computeStrength(changePctOpen, volRatio, thr);
  const trend         = trendContext(ltp, open, vwap);
  const distHigh      = high > 0 ? ((high - ltp) / high * 100) : 0;
  const distLow       = low  > 0 ? ((ltp  - low) / low  * 100) : 0;

  updateOpeningRange(symbol, high, low);
  const or = getOpeningRange(symbol);

  const confirmed  = [];
  const suppressed = [];
  const pending    = [];

  function tryTrigger(type, condition) {
    if (!condition) { clearPending(symbol, type); return; }
    if (inCooldown(symbol, type)) { suppressed.push(type); return; }
    const conf = checkConfirmation(symbol, type, ltp, volRatio, highStr, changePctOpen, thr, isLowVol);
    if (conf === 'confirmed') { confirmed.push(type); setCooldown(symbol, type, strength); }
    else if (conf === 'pending') pending.push(type);
  }

  tryTrigger('momentum',      Math.abs(changePctOpen) >= thr.price_pct);
  tryTrigger('volume',        volRatio !== null && volRatio >= thr.volume_ratio);

  if (or && !isOpeningPeriod()) {
    tryTrigger('breakout_high', ltp > or.high * (1 + thr.breakout_pct / 100));
    tryTrigger('breakout_low',  ltp < or.low  * (1 - thr.breakout_pct / 100));
  }

  const prevVwapSide = _state.vwap[symbol]?._side;
  const curVwapSide  = aboveVwap ? 'above' : 'below';
  if (_state.vwap[symbol]) _state.vwap[symbol]._side = curVwapSide;
  if (prevVwapSide && prevVwapSide !== curVwapSide) {
    tryTrigger(curVwapSide === 'above' ? 'vwap_reclaim' : 'vwap_loss', true);
  }

  // Cross-trigger validation: structural triggers without participation are dropped
  const validated = applyCrossTriggerValidation(confirmed, highStr);
  if (!validated.length) return null;

  // Record trigger activity for dampening tracking
  recordSymbolActivity(symbol);

  const primary = primaryTrigger(validated);
  let breakoutState = null;
  if (validated.includes('vwap_reclaim'))      breakoutState = 'vwap_reclaim';
  else if (validated.includes('vwap_loss'))    breakoutState = 'vwap_loss';
  else if (validated.includes('breakout_high')) breakoutState = 'above_orh';
  else if (validated.includes('breakout_low'))  breakoutState = 'below_orl';

  return {
    symbol,
    exchange:         'NSE',
    triggers:         validated,
    primary_trigger:  primary,
    strength,
    trend_context:    trend,
    signal_intensity: validated.length,   // isolated=1, confluence=2+
    activity_dampened: dampened,          // informational: thresholds were elevated
    price: {
      ltp:                    +ltp.toFixed(2),
      open:                   +open.toFixed(2),
      high:                   +high.toFixed(2),
      low:                    +low.toFixed(2),
      prev_close:             +(prevClose || 0).toFixed(2),
      change_pct:             +(change_pct ?? 0).toFixed(2),
      change_from_open_pct:   +changePctOpen.toFixed(2),
      vwap:                   +vwap.toFixed(2),
      above_vwap:             aboveVwap,
      distance_from_high_pct: +distHigh.toFixed(2),
      distance_from_low_pct:  +distLow.toFixed(2),
    },
    volume: {
      current:         volume || 0,
      volume_ratio:    volRatio,
      avg_5d_baseline: _state.baseline[symbol] ?? null,
    },
    breakout: {
      state:             breakoutState,
      or_high:           or?.high ?? null,
      or_low:            or?.low  ?? null,
      dist_from_orh_pct: or ? +((ltp - or.high) / or.high * 100).toFixed(2) : null,
      dist_from_orl_pct: or ? +((ltp - or.low)  / or.low  * 100).toFixed(2) : null,
    },
    meta: {
      opening_period:       isOpeningPeriod(),
      expiry_day:           isExpiryDay(),
      high_strength_bypass: highStr,
      cooldown_suppressed:  suppressed,
      pending_triggers:     pending,
      thresholds_used:      thr,
      fresh_obs:            _state.freshObs[symbol] ?? 0,
    },
    triggered_at: new Date().toISOString(),
  };
}

// ── Main cycle ────────────────────────────────────────────────────────────────
export async function runTriggerCycle(quotesMap, vixState = 'unknown', cookie = '') {
  await loadStateFromRedis();
  await loadAdaptiveCurve();

  const marketOpen = isMarketOpen();
  const vixBkt     = vixToBucket(vixState);
  const opening    = isOpeningPeriod();
  const expiry     = isExpiryDay();
  const elapsedMin = elapsedMarketMinutes();
  const isLowVol   = vixBkt === 'low' || (elapsedMin >= 90 && elapsedMin <= 210 && vixBkt === 'normal');

  if (!_state._baselineLoaded && !_state._baselineLoading && cookie) {
    loadVolumeBaselines(cookie).catch(() => {});
  }

  if (!marketOpen) {
    flushStateToRedis();
    return {
      triggers: [], market_open: false,
      symbols_scanned: 0, universe_size: UNIVERSE.length,
      vix_bucket: vixBkt, thresholds_used: buildThresholds(vixBkt, opening, expiry),
      baselines_loaded: _state._baselineLoaded,
      cycle_at: new Date().toISOString(),
      note: 'Market closed — no triggers emitted',
    };
  }

  pruneExpiredCooldowns();
  pruneActivityWindow();

  const triggers = [];
  let scanned = 0, totalCurrentVol = 0, totalBaselineVol = 0;

  for (const symbol of UNIVERSE) {
    const quote = quotesMap[symbol];
    if (!quote) continue;
    scanned++;

    if (_state.baseline[symbol] && quote.volume) {
      totalCurrentVol  += quote.volume;
      totalBaselineVol += _state.baseline[symbol];
    }

    const event = evaluateSymbol(symbol, quote, vixBkt, opening, expiry, elapsedMin, isLowVol);
    if (event) triggers.push(event);
  }

  const health = checkCycleHealth(quotesMap, scanned);
  if (!health.healthy) logDegradedCycle(health, elapsedMin, vixBkt, scanned);

  if (totalBaselineVol > 0) recordCurveSnapshot(elapsedMin, totalCurrentVol / totalBaselineVol);

  const strengthOrder = { strong: 0, medium: 1, weak: 2 };
  triggers.sort((a, b) => {
    const sd = (strengthOrder[a.strength] ?? 2) - (strengthOrder[b.strength] ?? 2);
    if (sd !== 0) return sd;
    if (b.signal_intensity !== a.signal_intensity) return b.signal_intensity - a.signal_intensity;
    const vrA = a.volume.volume_ratio ?? 0, vrB = b.volume.volume_ratio ?? 0;
    if (vrB !== vrA) return vrB - vrA;
    return Math.abs(b.price.change_from_open_pct) - Math.abs(a.price.change_from_open_pct);
  });

  flushStateToRedis();

  return {
    triggers:           health.healthy ? triggers : [],
    market_open:        true,
    symbols_scanned:    scanned,
    universe_size:      UNIVERSE.length,
    vix_bucket:         vixBkt,
    thresholds_used:    buildThresholds(vixBkt, opening, expiry),
    baselines_loaded:   _state._baselineLoaded,
    elapsed_market_min: elapsedMin,
    opening_period:     opening,
    expiry_day:         expiry,
    low_vol_mode:       isLowVol,
    adaptive_curve:     _activeCurve !== STATIC_CURVE,
    health,
    cycle_at:           new Date().toISOString(),
  };
}
