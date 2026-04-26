/**
 * Step 2 — Trigger Engine
 *
 * A fully independent, real-time market detection layer. Its only job is to
 * identify *actual price–volume movement* as it happens. It has no knowledge
 * of Step 1 (brain picks) and emits no scores or opinions.
 *
 * Architecture:
 *   - Stateless per evaluation cycle
 *   - Lightweight in-memory state for volume baselines, opening ranges, cooldowns
 *     (all survive warm Lambda invocations; cold start re-initialises cleanly)
 *   - Called by api/research.js ?action=triggers every 3–5 minutes
 *   - Input: pre-fetched OHLCV quote map from NSE + VIX state string
 *   - Output: array of TriggerEvent objects, sorted by volume_ratio desc
 *
 * Trigger types:
 *   momentum     — intraday price move ≥ threshold from open
 *   volume       — current volume pace ≥ 1.5× 5-day baseline
 *   breakout_high — price breached opening range high (ORH)
 *   breakout_low  — price breached opening range low (ORL)
 *   vwap_reclaim  — price crossed above VWAP from below
 *   vwap_loss     — price crossed below VWAP from above
 *
 * Noise controls:
 *   - Adaptive thresholds scaled by VIX bucket (low/normal/high)
 *   - Opening-period dampening: first 15 min after open, thresholds × 1.6
 *   - Expiry-day sensitivity: Thursday, volume threshold × 0.85
 *   - Cooldown: 15-min window per symbol × trigger type — no duplicate fires
 *   - Minimum liquidity gate: volume > MIN_VOLUME before any trigger emits
 */

// ── NIFTY 50 Universe ─────────────────────────────────────────────────────────
// All 50 NIFTY constituents as of 2025. Update when index rebalances.
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

// Minimum traded volume (shares) before any trigger is considered.
// Below this, spread risk is too high and data may be stale.
const MIN_VOLUME = 50_000;

// Cooldown: 15 minutes between re-fires of the same trigger type on the same symbol.
const COOLDOWN_MS = 15 * 60 * 1000;

// Days of NSE history used to compute volume baseline.
const BASELINE_DAYS = 5;

// ── Adaptive thresholds — indexed by VIX bucket ───────────────────────────────
// In high-VIX regimes, ordinary 1% moves are noise — raise the bar.
// In low-VIX regimes, 0.7% is already meaningful institutional activity.
const THRESHOLDS = {
  //                       low    normal   high   (VIX bucket)
  price_pct:    { low: 0.7, normal: 1.0, high: 1.6 },
  volume_ratio: { low: 1.3, normal: 1.5, high: 2.2 },
  breakout_pct: { low: 0.2, normal: 0.4, high: 0.7 }, // distance beyond OR to count as breakout
};

// Opening-period multipliers applied during 09:15–09:30 to suppress auction noise.
const OPENING_DAMP = { price: 1.6, volume: 1.8 };

// Expiry-day (Thursday) volume threshold reduction — institutional expiry activity is real.
const EXPIRY_VOLUME_FACTOR = 0.85;

// ── In-memory state ───────────────────────────────────────────────────────────
// These persist across warm Lambda invocations. Cold start = clean state (acceptable).

// symbol → { avg5d: number, fetchedAt: number }
const _volumeBaselines = new Map();

// symbol → { high: number, low: number, setAt: number, date: string }
// "date" is YYYY-MM-DD IST — resets opening range each trading day.
const _openingRanges = new Map();

// `${symbol}::${triggerType}` → lastFiredAt (ms timestamp)
const _cooldowns = new Map();

// Previous VWAP side per symbol — used to detect reclaim/loss crossings.
// symbol → 'above' | 'below'
const _prevVwapSide = new Map();

// Baseline load state — ensures single load per Lambda session.
const _baselineState = { loading: false, done: false };

// ── IST time helpers ──────────────────────────────────────────────────────────
// IST = UTC + 05:30 = UTC + 330 minutes.

function istMinutes() {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % (24 * 60);
}

function istDateStr() {
  // Returns YYYY-MM-DD in IST
  const now = new Date(Date.now() + 330 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

// Market open: 09:15–15:30 IST, weekdays only (Mon=1 … Fri=5).
export function isMarketOpen() {
  const now = new Date();
  const day = new Date(Date.now() + 330 * 60 * 1000).getUTCDay(); // IST day
  if (day === 0 || day === 6) return false;
  const min = istMinutes();
  return min >= 555 && min < 930; // 555=09:15, 930=15:30
}

// Opening period: 09:15–09:30 — first 15 minutes, auction-influenced.
function isOpeningPeriod() {
  const min = istMinutes();
  return min >= 555 && min < 570;
}

// Expiry day: Thursday (F&O weekly expiry). IST UTC day = 4.
function isExpiryDay() {
  return new Date(Date.now() + 330 * 60 * 1000).getUTCDay() === 4;
}

// Elapsed market minutes since 09:15 (capped at 375 = full session).
function elapsedMarketMinutes() {
  const min = istMinutes();
  return Math.min(375, Math.max(0, min - 555));
}

// ── VIX bucket ────────────────────────────────────────────────────────────────
function vixToBucket(vixState) {
  const s = (vixState || '').toLowerCase();
  if (s.includes('low') || s.includes('calm'))                     return 'low';
  if (s.includes('high') || s.includes('spike') || s.includes('fear')) return 'high';
  return 'normal';
}

function thresholds(vixBkt, opening, expiry) {
  let price  = THRESHOLDS.price_pct[vixBkt]    ?? THRESHOLDS.price_pct.normal;
  let volume = THRESHOLDS.volume_ratio[vixBkt]  ?? THRESHOLDS.volume_ratio.normal;
  let brk    = THRESHOLDS.breakout_pct[vixBkt]  ?? THRESHOLDS.breakout_pct.normal;
  if (opening) { price *= OPENING_DAMP.price; volume *= OPENING_DAMP.volume; }
  if (expiry)  { volume *= EXPIRY_VOLUME_FACTOR; }
  return { price_pct: price, volume_ratio: volume, breakout_pct: brk };
}

// ── Cooldown management ───────────────────────────────────────────────────────
function inCooldown(symbol, type) {
  const key = `${symbol}::${type}`;
  const last = _cooldowns.get(key);
  return last && (Date.now() - last) < COOLDOWN_MS;
}

function setCooldown(symbol, type) {
  _cooldowns.set(`${symbol}::${type}`, Date.now());
}

// ── Opening range management ──────────────────────────────────────────────────
// The opening range is set from the first observation after 09:15 each day.
// It resets at the start of each trading day.
function updateOpeningRange(symbol, high, low) {
  const today = istDateStr();
  const existing = _openingRanges.get(symbol);
  // Set once per day, during the opening period only
  if (!existing || existing.date !== today) {
    if (isOpeningPeriod()) {
      _openingRanges.set(symbol, { high, low, date: today, setAt: Date.now() });
    }
  }
}

function getOpeningRange(symbol) {
  const r = _openingRanges.get(symbol);
  if (!r || r.date !== istDateStr()) return null;
  return r;
}

// ── VWAP proxy ────────────────────────────────────────────────────────────────
// True intraday VWAP requires tick data. The (open + high + low + close) / 4
// formula is the standard single-bar proxy used widely in intraday analysis.
function computeVWAP(open, high, low, last) {
  return (open + high + low + last) / 4;
}

// ── Volume baseline — lazy-loaded once per Lambda session ─────────────────────
const NSE_HDR = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

async function loadVolumeBaselines(cookie) {
  if (_baselineState.done || _baselineState.loading) return;
  _baselineState.loading = true;

  const hdrs   = { ...NSE_HDR, Cookie: cookie };
  const today  = new Date(Date.now() + 330 * 60 * 1000);
  const from   = new Date(today - 14 * 24 * 60 * 60 * 1000); // 14 days back for enough trading days
  const toStr  = today.toISOString().slice(0, 10).split('-').reverse().join('-');   // DD-MM-YYYY
  const fromStr = from.toISOString().slice(0, 10).split('-').reverse().join('-');

  await Promise.allSettled(UNIVERSE.map(async symbol => {
    try {
      const sym = encodeURIComponent(symbol);
      const url = `https://www.nseindia.com/api/historical/cm/equity?symbol=${sym}&series=[%22EQ%22]&from=${fromStr}&to=${toStr}`;
      const r   = await fetch(url, { headers: hdrs });
      if (!r.ok) return;
      const json = await r.json();
      const rows = (json.data || [])
        .filter(d => d.CH_TOT_TRADED_QTY > 0)
        .slice(-BASELINE_DAYS); // last N trading days
      if (!rows.length) return;
      const avg5d = rows.reduce((s, d) => s + Number(d.CH_TOT_TRADED_QTY), 0) / rows.length;
      _volumeBaselines.set(symbol, { avg5d, fetchedAt: Date.now() });
    } catch { /* silent — baselines are best-effort */ }
  }));

  _baselineState.done    = true;
  _baselineState.loading = false;
}

// Compute volume ratio for current observation.
// Uses pace-adjusted comparison: current volume vs expected volume at this point in day.
function volumeRatio(symbol, currentVolume, elapsedMin) {
  const baseline = _volumeBaselines.get(symbol);
  if (!baseline || !baseline.avg5d || elapsedMin <= 0) return null;

  // Volume is not distributed uniformly — opening and closing are heavier.
  // Use a simple linear approximation: expected volume so far = avg5d × elapsed/375.
  // This slightly underweights opening period (conservative = fewer false triggers).
  const totalMin    = 375;
  const expectedNow = baseline.avg5d * (elapsedMin / totalMin);
  if (expectedNow <= 0) return null;

  return +(currentVolume / expectedNow).toFixed(2);
}

// ── Per-symbol trigger evaluation ─────────────────────────────────────────────
function evaluateSymbol(symbol, quote, thr, elapsedMin) {
  const { last_price: ltp, ohlc, volume, change_pct } = quote;
  if (!ltp || !ohlc?.open) return null;

  const { open, high, low, close: prevClose } = ohlc;

  // Liquidity gate — no triggers on thinly traded symbols
  if ((volume || 0) < MIN_VOLUME && elapsedMin > 30) return null;

  // Derived values
  const vwap            = computeVWAP(open, high, low, ltp);
  const changePctOpen   = open > 0 ? ((ltp - open) / open * 100) : 0;
  const aboveVwap       = ltp >= vwap;
  const distFromHighPct = high > 0 ? ((high - ltp) / high * 100) : 0;
  const distFromLowPct  = low > 0  ? ((ltp - low)  / low  * 100) : 0;
  const volRatio        = volumeRatio(symbol, volume || 0, elapsedMin);

  // Update opening range (sets once per day during opening period)
  updateOpeningRange(symbol, high, low);
  const or = getOpeningRange(symbol);

  // ── Trigger evaluation ─────────────────────────────────────────────────────
  const firedTriggers    = [];
  const suppressedByCD   = [];

  // 1. Momentum — price moved ≥ threshold from open
  if (Math.abs(changePctOpen) >= thr.price_pct) {
    if (!inCooldown(symbol, 'momentum')) {
      firedTriggers.push('momentum');
      setCooldown(symbol, 'momentum');
    } else {
      suppressedByCD.push('momentum');
    }
  }

  // 2. Volume spike — current pace is ≥ threshold × 5-day baseline
  if (volRatio !== null && volRatio >= thr.volume_ratio) {
    if (!inCooldown(symbol, 'volume')) {
      firedTriggers.push('volume');
      setCooldown(symbol, 'volume');
    } else {
      suppressedByCD.push('volume');
    }
  }

  // 3. Breakout — price beyond opening range (only after opening period ends)
  if (or && !isOpeningPeriod()) {
    const aboveOrh = ltp > or.high * (1 + thr.breakout_pct / 100);
    const belowOrl = ltp < or.low  * (1 - thr.breakout_pct / 100);

    if (aboveOrh) {
      if (!inCooldown(symbol, 'breakout_high')) {
        firedTriggers.push('breakout_high');
        setCooldown(symbol, 'breakout_high');
      } else suppressedByCD.push('breakout_high');
    }

    if (belowOrl) {
      if (!inCooldown(symbol, 'breakout_low')) {
        firedTriggers.push('breakout_low');
        setCooldown(symbol, 'breakout_low');
      } else suppressedByCD.push('breakout_low');
    }
  }

  // 4. VWAP crossing — reclaim (was below, now above) or loss (was above, now below)
  const prevSide = _prevVwapSide.get(symbol);
  const curSide  = aboveVwap ? 'above' : 'below';
  _prevVwapSide.set(symbol, curSide);

  if (prevSide && prevSide !== curSide) {
    const type = curSide === 'above' ? 'vwap_reclaim' : 'vwap_loss';
    if (!inCooldown(symbol, type)) {
      firedTriggers.push(type);
      setCooldown(symbol, type);
    } else suppressedByCD.push(type);
  }

  // Only emit if at least one trigger fired (not suppressed by cooldown)
  if (!firedTriggers.length) return null;

  // ── Build breakout state descriptor ────────────────────────────────────────
  let breakoutState = null;
  if (firedTriggers.includes('vwap_reclaim')) breakoutState = 'vwap_reclaim';
  else if (firedTriggers.includes('vwap_loss')) breakoutState = 'vwap_loss';
  else if (firedTriggers.includes('breakout_high')) breakoutState = 'above_orh';
  else if (firedTriggers.includes('breakout_low'))  breakoutState = 'below_orl';

  return {
    symbol,
    exchange:    'NSE',
    triggers:    firedTriggers,
    price: {
      ltp:                    +ltp.toFixed(2),
      open:                   +open.toFixed(2),
      high:                   +high.toFixed(2),
      low:                    +low.toFixed(2),
      prev_close:             +prevClose.toFixed(2),
      change_pct:             +(change_pct ?? 0).toFixed(2),
      change_from_open_pct:   +changePctOpen.toFixed(2),
      vwap:                   +vwap.toFixed(2),
      above_vwap:             aboveVwap,
      distance_from_high_pct: +distFromHighPct.toFixed(2),
      distance_from_low_pct:  +distFromLowPct.toFixed(2),
    },
    volume: {
      current:          volume || 0,
      volume_ratio:     volRatio,
      avg_5d_baseline:  _volumeBaselines.get(symbol)?.avg5d ?? null,
    },
    breakout: {
      state:              breakoutState,
      or_high:            or?.high ?? null,
      or_low:             or?.low  ?? null,
      dist_from_orh_pct:  or ? +((ltp - or.high) / or.high * 100).toFixed(2) : null,
      dist_from_orl_pct:  or ? +((ltp - or.low)  / or.low  * 100).toFixed(2) : null,
    },
    meta: {
      opening_period:    isOpeningPeriod(),
      expiry_day:        isExpiryDay(),
      cooldown_suppressed: suppressedByCD,
      thresholds_used:   thr,
    },
    triggered_at: new Date().toISOString(),
  };
}

// ── Main cycle ────────────────────────────────────────────────────────────────
/**
 * Run one trigger evaluation cycle.
 *
 * @param quotesMap  - { SYMBOL: { last_price, change_pct, volume, ohlc } }
 *                     Pre-fetched by caller (api/research.js) to avoid NSE rate limits.
 *                     Symbols should be plain ticker names (no "NSE:" prefix).
 * @param vixState   - string from brain context ('low' | 'normal' | 'high' | 'unknown')
 * @param cookie     - NSE session cookie for baseline loading (passed from caller)
 *
 * @returns {Object}
 *   triggers:         TriggerEvent[]   — sorted by volume_ratio desc, then abs(change_from_open) desc
 *   market_open:      boolean
 *   symbols_scanned:  number
 *   universe_size:    number
 *   vix_bucket:       string
 *   thresholds_used:  { price_pct, volume_ratio, breakout_pct }
 *   baselines_loaded: boolean
 *   cycle_at:         ISO timestamp
 */
export async function runTriggerCycle(quotesMap, vixState = 'unknown', cookie = '') {
  const marketOpen = isMarketOpen();
  const vixBkt     = vixToBucket(vixState);
  const opening    = isOpeningPeriod();
  const expiry     = isExpiryDay();
  const elapsedMin = elapsedMarketMinutes();
  const thr        = thresholds(vixBkt, opening, expiry);

  // Lazily load volume baselines (first call only per Lambda session)
  if (!_baselineState.done && !_baselineState.loading && cookie) {
    loadVolumeBaselines(cookie).catch(() => {}); // non-blocking
  }

  if (!marketOpen) {
    return {
      triggers:        [],
      market_open:     false,
      symbols_scanned: 0,
      universe_size:   UNIVERSE.length,
      vix_bucket:      vixBkt,
      thresholds_used: thr,
      baselines_loaded: _baselineState.done,
      cycle_at:        new Date().toISOString(),
      note:            'Market closed — no triggers emitted',
    };
  }

  const triggers = [];
  let scanned = 0;

  for (const symbol of UNIVERSE) {
    const quote = quotesMap[symbol];
    if (!quote) continue; // data gap — skip, don't emit stale signals
    scanned++;

    const event = evaluateSymbol(symbol, quote, thr, elapsedMin);
    if (event) triggers.push(event);
  }

  // Sort: volume_ratio desc (most abnormal volume first), then abs(price change) desc
  triggers.sort((a, b) => {
    const vrA = a.volume.volume_ratio ?? 0;
    const vrB = b.volume.volume_ratio ?? 0;
    if (vrB !== vrA) return vrB - vrA;
    return Math.abs(b.price.change_from_open_pct) - Math.abs(a.price.change_from_open_pct);
  });

  return {
    triggers,
    market_open:     true,
    symbols_scanned: scanned,
    universe_size:   UNIVERSE.length,
    vix_bucket:      vixBkt,
    thresholds_used: thr,
    baselines_loaded: _baselineState.done,
    elapsed_market_min: elapsedMin,
    opening_period:  opening,
    expiry_day:      expiry,
    cycle_at:        new Date().toISOString(),
  };
}
