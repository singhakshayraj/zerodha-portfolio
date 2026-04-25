/**
 * Technical indicator library
 * Input: array of { high, low, close, open? } sorted oldest → newest
 */

export function atr14(candles) {
  if (candles.length < 2) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose     = candles[i - 1].close;
    trs.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low  - prevClose),
    ));
  }
  if (!trs.length) return null;
  // Wilder smoothing: seed with simple avg of first 14, then smooth
  const period = Math.min(14, trs.length);
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

export function rsi14(candles) {
  if (candles.length < 15) return null;
  const closes = candles.map(c => c.close);
  const period = 14;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }
  let avgGain = gains  / period;
  let avgLoss = losses / period;
  // Wilder smoothing for remaining candles
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

export function rsiSignal(rsi) {
  if (rsi === null) return { label: 'unknown', ok: true };
  if (rsi > 75)     return { label: `RSI ${rsi} — overbought, skip`, ok: false };
  if (rsi > 65)     return { label: `RSI ${rsi} — extended, caution`, ok: true };
  if (rsi < 25)     return { label: `RSI ${rsi} — oversold, bounce risk`, ok: true };
  if (rsi < 35)     return { label: `RSI ${rsi} — weak, may fall more`, ok: true };
  return              { label: `RSI ${rsi} — neutral zone`, ok: true };
}

// ── EMA (generic) ─────────────────────────────────────────────────────────────
export function ema(candles, period) {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let val = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    val = candles[i].close * k + val * (1 - k);
  }
  return +val.toFixed(2);
}

// ── MACD (12, 26, 9) ──────────────────────────────────────────────────────────
export function macd(candles) {
  if (candles.length < 26) return null;

  // Compute EMA series (not just last value) for signal line
  function emaArr(arr, period) {
    const k = 2 / (period + 1);
    const out = [];
    let val = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
    out.push(val);
    for (let i = period; i < arr.length; i++) {
      val = arr[i] * k + val * (1 - k);
      out.push(val);
    }
    return out;
  }

  const closes  = candles.map(c => c.close);
  const ema12   = emaArr(closes, 12);
  const ema26   = emaArr(closes, 26);

  // Align: ema26 starts at index 25, ema12 starts at index 11
  // MACD line = ema12 - ema26 (use shorter ema26 series as anchor)
  const offset  = 26 - 12; // 14
  const macdLine = ema26.map((v, i) => ema12[i + offset] - v);

  const signalArr = emaArr(macdLine, 9);
  const lastMacd  = macdLine[macdLine.length - 1];
  const lastSig   = signalArr[signalArr.length - 1];
  const lastHist  = lastMacd - lastSig;

  // Crossover: histogram flipped positive in last bar
  const prevHist  = macdLine.length >= 2
    ? macdLine[macdLine.length - 2] - signalArr[signalArr.length - 2]
    : 0;

  const crossover = (prevHist <= 0 && lastHist > 0) ? 'bullish'
                  : (prevHist >= 0 && lastHist < 0) ? 'bearish'
                  : lastHist > 0 ? 'bullish' : 'bearish';

  return {
    value:     +lastMacd.toFixed(3),
    signal:    +lastSig.toFixed(3),
    histogram: +lastHist.toFixed(3),
    crossover,
  };
}

// ── Bollinger Bands (20, 2σ) ──────────────────────────────────────────────────
export function bollingerBands(candles) {
  if (candles.length < 20) return null;
  const period  = 20;
  const slice   = candles.slice(-period).map(c => c.close);
  const middle  = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const stdDev  = Math.sqrt(variance);
  const upper   = middle + 2 * stdDev;
  const lower   = middle - 2 * stdDev;
  const last    = candles[candles.length - 1].close;
  const pct_b   = stdDev > 0 ? +((last - lower) / (upper - lower) * 100).toFixed(1) : 50;
  const bandwidth = stdDev > 0 ? +((upper - lower) / middle * 100).toFixed(2) : 0;
  const squeeze = bandwidth < 5; // tight bands = breakout incoming

  return {
    upper:   +upper.toFixed(2),
    middle:  +middle.toFixed(2),
    lower:   +lower.toFixed(2),
    pct_b,
    bandwidth,
    squeeze,
  };
}

// ── Supertrend (period=10, multiplier=3) ──────────────────────────────────────
export function supertrend(candles) {
  if (candles.length < 14) return null;
  const period = 10, mult = 3;

  // Compute ATR array
  const trs = [0];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc)));
  }
  let atr = trs.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  const atrs = new Array(period + 1).fill(0);
  atrs[period] = atr;
  for (let i = period + 1; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs[i] = atr;
  }

  let direction = 1; // 1 = up (bullish), -1 = down
  let upperBand = 0, lowerBand = 0;

  for (let i = period; i < candles.length; i++) {
    const { high, low, close } = candles[i];
    const hl2 = (high + low) / 2;
    const newUpper = hl2 + mult * atrs[i];
    const newLower = hl2 - mult * atrs[i];

    upperBand = (newUpper < upperBand || candles[i - 1].close > upperBand) ? newUpper : upperBand;
    lowerBand = (newLower > lowerBand || candles[i - 1].close < lowerBand) ? newLower : lowerBand;

    if (direction === 1 && close < lowerBand) direction = -1;
    else if (direction === -1 && close > upperBand) direction = 1;
  }

  const value = direction === 1 ? lowerBand : upperBand;
  return {
    direction: direction === 1 ? 'up' : 'down',
    value:     +value.toFixed(2),
    signal:    direction === 1 ? 'buy' : 'sell',
  };
}

// ── EMA Cross (20 vs 50) ──────────────────────────────────────────────────────
export function emaCross(candles) {
  if (candles.length < 50) return null;
  const e20 = ema(candles, 20);
  const e50 = ema(candles, 50);
  if (e20 === null || e50 === null) return null;
  const signal = e20 > e50 ? 'bullish' : e20 < e50 ? 'bearish' : 'neutral';
  return { ema20: e20, ema50: e50, signal };
}

// ── Support & Resistance (last 10 candles) ────────────────────────────────────
export function supportResistance(candles) {
  if (candles.length < 5) return null;
  const slice = candles.slice(-10);
  const support    = +Math.min(...slice.map(c => c.low)).toFixed(2);
  const resistance = +Math.max(...slice.map(c => c.high)).toFixed(2);
  return { support, resistance };
}

// ── Volume Trigger (price > 1% AND volume > 1.5× 10-day avg) ─────────────────
export function volumeTrigger(candles, todayVolume, priceChangePct) {
  const PRICE_THRESH  = 1.0;  // % intraday move
  const VOLUME_THRESH = 1.5;  // × 10-day avg volume

  // Compute 10-day average volume from historical candles (exclude today)
  const vols = candles.slice(-11, -1).map(c => c.volume || 0).filter(v => v > 0);
  const avgVol = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  const volumeRatio = avgVol > 0 && todayVolume > 0 ? +(todayVolume / avgVol).toFixed(2) : null;

  const priceOk  = Math.abs(priceChangePct) >= PRICE_THRESH;
  const volumeOk = volumeRatio !== null && volumeRatio >= VOLUME_THRESH;
  const triggered = priceOk && volumeOk;

  const status = triggered           ? 'triggered'
               : priceOk            ? 'price-only'
               : volumeOk           ? 'volume-only'
               :                      'watching';

  return {
    triggered,
    status,
    priceChangePct: +priceChangePct.toFixed(2),
    volumeRatio,
    avgVol: Math.round(avgVol),
    reason: triggered
      ? `+${Math.abs(priceChangePct).toFixed(1)}% move · ${volumeRatio}× avg volume`
      : !priceOk && !volumeOk
      ? `Flat · ${volumeRatio !== null ? volumeRatio+'× vol' : 'no vol data'}`
      : !priceOk
      ? `${volumeRatio}× vol but only ${Math.abs(priceChangePct).toFixed(1)}% move`
      : `${Math.abs(priceChangePct).toFixed(1)}% move but only ${volumeRatio !== null ? volumeRatio+'×' : 'no'} vol`,
  };
}

// ── Pivot Points (classic, from yesterday's OHLC) ────────────────────────────
export function pivotPoints(candles) {
  if (candles.length < 2) return null;
  const { high, low, close } = candles[candles.length - 2]; // yesterday
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const r2 = pp + (high - low);
  const s1 = 2 * pp - high;
  const s2 = pp - (high - low);
  return {
    pp: +pp.toFixed(2),
    r1: +r1.toFixed(2),
    r2: +r2.toFixed(2),
    s1: +s1.toFixed(2),
    s2: +s2.toFixed(2),
  };
}

// ── Candlestick Patterns (last 3 candles, needs open) ────────────────────────
export function candlestickPatterns(candles) {
  if (candles.length < 3) return { bullish: [], bearish: [] };
  const bullish = [], bearish = [];
  const [c2, c1, c0] = candles.slice(-3); // c0 = latest

  const body  = c => Math.abs(c.close - (c.open ?? c.close));
  const range = c => c.high - c.low;
  const isGreen = c => (c.open != null ? c.close >= c.open : true);
  const isRed   = c => (c.open != null ? c.close < c.open  : false);

  // Doji: tiny body relative to range
  if (range(c0) > 0 && body(c0) / range(c0) < 0.1) bullish.push('Doji');

  if (c0.open != null) {
    const upperWick = c0.high - Math.max(c0.open, c0.close);
    const lowerWick = Math.min(c0.open, c0.close) - c0.low;

    // Hammer: small body, long lower wick, at bottom
    if (isGreen(c0) && lowerWick > body(c0) * 2 && upperWick < body(c0) * 0.5)
      bullish.push('Hammer');

    // Shooting Star: small body, long upper wick, at top
    if (isRed(c0) && upperWick > body(c0) * 2 && lowerWick < body(c0) * 0.5)
      bearish.push('Shooting Star');

    // Bullish Engulfing: red c1, green c0 wraps c1
    if (c1.open != null && isRed(c1) && isGreen(c0)
        && c0.open < c1.close && c0.close > c1.open)
      bullish.push('Bull Engulfing');

    // Bearish Engulfing
    if (c1.open != null && isGreen(c1) && isRed(c0)
        && c0.open > c1.close && c0.close < c1.open)
      bearish.push('Bear Engulfing');

    // Morning Star: red c2, small body c1, green c0
    if (c2.open != null && isRed(c2) && body(c1) < body(c2) * 0.3 && isGreen(c0)
        && c0.close > (c2.open + c2.close) / 2)
      bullish.push('Morning Star');

    // Evening Star
    if (c2.open != null && isGreen(c2) && body(c1) < body(c2) * 0.3 && isRed(c0)
        && c0.close < (c2.open + c2.close) / 2)
      bearish.push('Evening Star');
  }

  return { bullish, bearish };
}
