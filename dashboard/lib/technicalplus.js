// technicalplus.js — advanced technical indicators (pure client-side ES module)
// Imports helpers from indicators.js but does NOT re-export those symbols.
import { atr14, ema } from './indicators.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function wilderSmooth(arr, period) {
  if (arr.length < period) return [];
  let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
  const result = [sum / period];
  for (let i = period; i < arr.length; i++) {
    result.push((result[result.length - 1] * (period - 1) + arr[i]) / period);
  }
  return result;
}

function sma(arr, period) {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function linearSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = arr.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (arr[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ─── ADX (14) ────────────────────────────────────────────────────────────────

export function adx14(candles) {
  try {
    if (!candles || candles.length < 15) return null;

    const trArr = [], dmPlusArr = [], dmMinusArr = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prev = candles[i - 1];
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
      const upMove = cur.high - prev.high;
      const downMove = prev.low - cur.low;
      trArr.push(tr);
      dmPlusArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
      dmMinusArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    const smoothTR = wilderSmooth(trArr, 14);
    const smoothPlus = wilderSmooth(dmPlusArr, 14);
    const smoothMinus = wilderSmooth(dmMinusArr, 14);

    if (!smoothTR.length) return null;

    const dxArr = [];
    for (let i = 0; i < smoothTR.length; i++) {
      const atrVal = smoothTR[i];
      const diP = atrVal === 0 ? 0 : 100 * smoothPlus[i] / atrVal;
      const diM = atrVal === 0 ? 0 : 100 * smoothMinus[i] / atrVal;
      const sum = diP + diM;
      dxArr.push(sum === 0 ? 0 : 100 * Math.abs(diP - diM) / sum);
    }

    const adxSmooth = wilderSmooth(dxArr, 14);
    if (!adxSmooth.length) return null;

    const adxVal = adxSmooth[adxSmooth.length - 1];
    const lastIdx = smoothTR.length - 1;
    const lastATR = smoothTR[lastIdx];
    const diPlus = lastATR === 0 ? 0 : 100 * smoothPlus[lastIdx] / lastATR;
    const diMinus = lastATR === 0 ? 0 : 100 * smoothMinus[lastIdx] / lastATR;

    let trend;
    if (adxVal < 20) trend = 'no trend';
    else if (adxVal < 25) trend = 'weak';
    else if (adxVal <= 40) trend = 'strong';
    else trend = 'very strong';

    return {
      adx: +adxVal.toFixed(1),
      diPlus: +diPlus.toFixed(1),
      diMinus: +diMinus.toFixed(1),
      trend
    };
  } catch { return null; }
}

// ─── Stochastic ──────────────────────────────────────────────────────────────

export function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  try {
    if (!candles || candles.length < kPeriod + dPeriod - 1) return null;

    const kValues = [];
    for (let i = kPeriod - 1; i < candles.length; i++) {
      const slice = candles.slice(i - kPeriod + 1, i + 1);
      const low = Math.min(...slice.map(c => c.low));
      const high = Math.max(...slice.map(c => c.high));
      const range = high - low;
      kValues.push(range === 0 ? 50 : (candles[i].close - low) / range * 100);
    }

    if (kValues.length < dPeriod) return null;

    const k = kValues[kValues.length - 1];
    const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;

    const signal = k < 20 ? 'oversold' : k > 80 ? 'overbought' : 'neutral';
    return { k: +k.toFixed(1), d: +d.toFixed(1), signal };
  } catch { return null; }
}

// ─── Williams %R ─────────────────────────────────────────────────────────────

export function williamsR(candles, period = 14) {
  try {
    if (!candles || candles.length < period) return null;
    const slice = candles.slice(-period);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = candles[candles.length - 1].close;
    const range = high - low;
    const value = range === 0 ? -50 : ((high - close) / range) * -100;
    const signal = value > -20 ? 'overbought' : value < -80 ? 'oversold' : 'neutral';
    return { value: +value.toFixed(1), signal };
  } catch { return null; }
}

// ─── ROC (14) ────────────────────────────────────────────────────────────────

export function roc14(candles) {
  try {
    if (!candles || candles.length < 15) return null;
    const cur = candles[candles.length - 1].close;
    const prev = candles[candles.length - 15].close;
    if (prev === 0) return null;
    const value = (cur - prev) / prev * 100;
    return { value: +value.toFixed(2), signal: value > 0 ? 'positive' : 'negative' };
  } catch { return null; }
}

// ─── OBV ─────────────────────────────────────────────────────────────────────

export function obv(candles) {
  try {
    if (!candles || candles.length < 11) return null;
    let obvVal = 0;
    const obvSeries = [0];
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) obvVal += candles[i].volume;
      else if (candles[i].close < candles[i - 1].close) obvVal -= candles[i].volume;
      obvSeries.push(obvVal);
    }
    const cur = obvSeries[obvSeries.length - 1];
    const prev10 = obvSeries[obvSeries.length - 11];
    const slope10d = cur - prev10;
    const trend = slope10d > 0 ? 'rising' : slope10d < 0 ? 'falling' : 'flat';
    return { value: cur, trend, slope10d };
  } catch { return null; }
}

// ─── MFI (14) ────────────────────────────────────────────────────────────────

export function mfi14(candles) {
  try {
    if (!candles || candles.length < 15) return null;
    const slice = candles.slice(-15);
    let posMF = 0, negMF = 0;
    for (let i = 1; i < slice.length; i++) {
      const tp = (slice[i].high + slice[i].low + slice[i].close) / 3;
      const prevTp = (slice[i - 1].high + slice[i - 1].low + slice[i - 1].close) / 3;
      const mf = tp * slice[i].volume;
      if (tp > prevTp) posMF += mf;
      else negMF += mf;
    }
    if (negMF === 0 && posMF === 0) return null;
    const value = negMF === 0 ? 100 : 100 - 100 / (1 + posMF / negMF);
    const signal = value > 80 ? 'overbought' : value < 20 ? 'oversold' : 'neutral';
    return { value: +value.toFixed(1), signal };
  } catch { return null; }
}

// ─── Keltner Channels ────────────────────────────────────────────────────────

export function keltnerChannels(candles) {
  try {
    if (!candles || candles.length < 20) return null;

    // EMA(20) of close
    const closes = candles.map(c => c.close);
    let emaVal = closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    for (let i = 20; i < closes.length; i++) {
      emaVal = (closes[i] - emaVal) * (2 / 21) + emaVal;
    }
    const middle = emaVal;

    // ATR(10)
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      trs.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
    if (trs.length < 10) return null;
    const atrSlice = trs.slice(-10);
    const atr10 = atrSlice.reduce((a, b) => a + b, 0) / 10;

    const upper = middle + 2 * atr10;
    const lower = middle - 2 * atr10;
    const close = candles[candles.length - 1].close;

    let position;
    if (close > upper) position = 'above_upper';
    else if (close > middle) position = 'upper_mid';
    else if (close > lower) position = 'mid_lower';
    else position = 'below_lower';

    return {
      upper: +upper.toFixed(2),
      middle: +middle.toFixed(2),
      lower: +lower.toFixed(2),
      position
    };
  } catch { return null; }
}

// ─── Fibonacci Levels ────────────────────────────────────────────────────────

export function fibonacciLevels(candles, lookback = 50) {
  try {
    if (!candles || candles.length < 2) return null;
    const slice = candles.slice(-Math.min(lookback, candles.length));
    const swingHigh = Math.max(...slice.map(c => c.high));
    const swingLow = Math.min(...slice.map(c => c.low));
    const range = swingHigh - swingLow;
    const close = candles[candles.length - 1].close;

    const levels = {
      '0': +swingLow.toFixed(2),
      '23.6': +(swingLow + 0.236 * range).toFixed(2),
      '38.2': +(swingLow + 0.382 * range).toFixed(2),
      '50': +(swingLow + 0.5 * range).toFixed(2),
      '61.8': +(swingLow + 0.618 * range).toFixed(2),
      '78.6': +(swingLow + 0.786 * range).toFixed(2),
      '100': +swingHigh.toFixed(2)
    };

    const fibValues = Object.entries(levels).map(([k, v]) => ({ label: k, price: v }));
    const below = fibValues.filter(f => f.price <= close).sort((a, b) => b.price - a.price);
    const above = fibValues.filter(f => f.price > close).sort((a, b) => a.price - b.price);

    return {
      swingHigh: +swingHigh.toFixed(2),
      swingLow: +swingLow.toFixed(2),
      levels,
      nearestSupport: below.length ? below[0] : null,
      nearestResistance: above.length ? above[0] : null
    };
  } catch { return null; }
}

// ─── Ichimoku ────────────────────────────────────────────────────────────────

export function ichimoku(candles) {
  try {
    if (!candles || candles.length < 52) return null;

    const midpoint = (arr, n) => {
      const slice = arr.slice(-n);
      return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
    };

    const tenkan = midpoint(candles, 9);
    const kijun = midpoint(candles, 26);
    const senkouA = (tenkan + kijun) / 2;
    const senkouB = midpoint(candles, 52);
    const close = candles[candles.length - 1].close;
    const chikou = close;

    const cloudColor = senkouA > senkouB ? 'green' : 'red';
    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBot = Math.min(senkouA, senkouB);
    const priceVsCloud = close > cloudTop ? 'above' : close < cloudBot ? 'below' : 'inside';

    return {
      tenkan: +tenkan.toFixed(2),
      kijun: +kijun.toFixed(2),
      senkouA: +senkouA.toFixed(2),
      senkouB: +senkouB.toFixed(2),
      chikou: +chikou.toFixed(2),
      cloudColor,
      priceVsCloud
    };
  } catch { return null; }
}

// ─── Volume Profile ───────────────────────────────────────────────────────────

export function volumeProfile(candles, buckets = 20) {
  try {
    if (!candles || candles.length < 10) return null;
    const slice = candles.slice(-Math.min(100, candles.length));
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    if (high === low) return null;

    const bucketSize = (high - low) / buckets;
    const bucketData = Array.from({ length: buckets }, (_, i) => ({
      price: +(low + bucketSize * (i + 0.5)).toFixed(2),
      volume: 0
    }));

    for (const c of slice) {
      const idx = Math.min(Math.floor((c.close - low) / bucketSize), buckets - 1);
      bucketData[idx].volume += c.volume;
    }

    const poc = bucketData.reduce((a, b) => b.volume > a.volume ? b : a).price;
    const totalVol = bucketData.reduce((a, b) => a + b.volume, 0);
    const sorted = [...bucketData].sort((a, b) => b.volume - a.volume);
    let acc = 0;
    const valueArea = [];
    for (const b of sorted) {
      acc += b.volume;
      valueArea.push(b.price);
      if (acc >= totalVol * 0.7) break;
    }
    const vah = +Math.max(...valueArea).toFixed(2);
    const val = +Math.min(...valueArea).toFixed(2);

    return { poc, vah, val, bucketData };
  } catch { return null; }
}

// ─── Relative Strength vs Nifty ──────────────────────────────────────────────

export function relativeStrength(candles, niftyCandles, period = 20) {
  try {
    if (!candles || !niftyCandles || candles.length < period + 5 || niftyCandles.length < period + 5) return null;

    const stockNow = candles[candles.length - 1].close;
    const stockPrev = candles[candles.length - 1 - period].close;
    const niftyNow = niftyCandles[niftyCandles.length - 1].close;
    const niftyPrev = niftyCandles[niftyCandles.length - 1 - period].close;

    if (niftyPrev === 0 || stockPrev === 0) return null;
    const niftyReturn = (niftyNow - niftyPrev) / niftyPrev;
    if (niftyReturn === 0) return null;

    const stockReturn = (stockNow - stockPrev) / stockPrev;
    const value = stockReturn / niftyReturn;

    let signal;
    if (value > 1.2) signal = 'strong outperform';
    else if (value >= 1) signal = 'outperform';
    else if (value >= 0.8) signal = 'underperform';
    else signal = 'strong underperform';

    // slope: last 5d RS vs previous 5d RS
    const rs5Now = (() => {
      const sN = candles[candles.length - 1].close;
      const sP = candles[candles.length - 6].close;
      const nN = niftyCandles[niftyCandles.length - 1].close;
      const nP = niftyCandles[niftyCandles.length - 6].close;
      if (nP === 0 || sP === 0) return null;
      const nr = (nN - nP) / nP;
      return nr === 0 ? null : ((sN - sP) / sP) / nr;
    })();
    const rs5Prev = (() => {
      if (candles.length < 11 || niftyCandles.length < 11) return null;
      const sN = candles[candles.length - 6].close;
      const sP = candles[candles.length - 11].close;
      const nN = niftyCandles[niftyCandles.length - 6].close;
      const nP = niftyCandles[niftyCandles.length - 11].close;
      if (nP === 0 || sP === 0) return null;
      const nr = (nN - nP) / nP;
      return nr === 0 ? null : ((sN - sP) / sP) / nr;
    })();

    const slope = rs5Now !== null && rs5Prev !== null
      ? (rs5Now > rs5Prev ? 'improving' : 'deteriorating')
      : 'improving';

    return { value: +value.toFixed(3), signal, slope };
  } catch { return null; }
}

// ─── Technical Score ─────────────────────────────────────────────────────────

export function computeTechnicalScore(ind = {}, timeframe = 'daily') {
  try {
    const { rsi, macd, bb, st, ema20, ema50, ema200, close, adx: adxObj, ichimoku: ich,
      stoch, roc, obvObj, mfi, fibLevels, rs } = ind;

    // ── Trend (30 pts) ──
    let trend = 0;

    if (close != null && ema20 != null) {
      const pct = (close - ema20) / ema20 * 100;
      if (pct >= 0) trend += Math.abs(pct) <= 1 ? 2 : 4;
    }
    if (close != null && ema50 != null) {
      const pct = (close - ema50) / ema50 * 100;
      if (pct >= 0) trend += Math.abs(pct) <= 2 ? 3 : 5;
    }
    if (timeframe !== 'monthly' && close != null && ema200 != null) {
      const pct = (close - ema200) / ema200 * 100;
      if (pct >= 0) trend += Math.abs(pct) <= 3 ? 4 : 8;
    }

    if (!adxObj) {
      trend += 3;
    } else {
      const a = adxObj.adx;
      if (a < 20) trend += 0;
      else if (a < 25) trend += 3;
      else if (a <= 40) trend += 5;
      else trend += 7;
    }

    if (!ich) {
      trend += 3;
    } else {
      if (ich.priceVsCloud === 'below') trend += 0;
      else if (ich.priceVsCloud === 'inside') trend += 2;
      else trend += 6;
    }

    // ── Momentum (25 pts) ──
    let momentum = 0;

    if (!rsi) {
      momentum += 4;
    } else {
      if (rsi < 30) momentum += 2;
      else if (rsi < 40) momentum += 4;
      else if (rsi <= 60) momentum += 6;
      else if (rsi <= 70) momentum += 8;
      else momentum += 3;
    }

    if (!macd) {
      momentum += 4;
    } else {
      const hist = macd.histogram ?? 0;
      const cross = macd.crossover;
      if (cross === 'bullish') momentum += 8;
      else if (cross === 'bearish' && hist < 0) momentum += 0;
      else if (hist < 0) momentum += 2;
      else if (Math.abs(hist) < 0.0001) momentum += 4;
      else if (hist > 0) momentum += 6;
      else momentum += 4;
    }

    if (!stoch) {
      momentum += 3;
    } else {
      const k = stoch.k;
      if (k > 80) momentum += 2;
      else if (k > 60) momentum += 4;
      else if (k >= 40) momentum += 3;
      else if (k < 20) momentum += 6;
      else momentum += 5;
    }

    if (!roc) {
      momentum += 1;
    } else {
      const v = roc.value;
      if (v < 0) momentum += 0;
      else if (v <= 2) momentum += 1;
      else if (v <= 5) momentum += 2;
      else momentum += 3;
    }

    // ── Volume (20 pts) ──
    let volume = 0;

    if (!obvObj) {
      volume += 5;
    } else {
      if (obvObj.trend === 'falling') volume += 2;
      else if (obvObj.trend === 'flat') volume += 4;
      else if (obvObj.slope10d > 0) volume += 10;
      else volume += 8;
    }

    if (!mfi) {
      volume += 4;
    } else {
      const m = mfi.value;
      if (m < 20) volume += 5;
      else if (m < 40) volume += 4;
      else if (m <= 60) volume += 6;
      else if (m <= 80) volume += 7;
      else volume += 3;
    }

    const volRatio = ind.volRatio ?? null;
    if (volRatio == null) volume += 2;
    else if (volRatio < 0.8) volume += 1;
    else if (volRatio <= 1.2) volume += 2;
    else volume += 3;

    // ── Structure (25 pts) ──
    let structure = 0;

    if (!fibLevels) {
      structure += 4;
    } else if (close != null) {
      const levels = fibLevels.levels;
      const fib382 = parseFloat(levels['38.2']);
      const fib618 = parseFloat(levels['61.8']);
      if (close < fib382) structure += 2;
      else if (close <= fib618) structure += 5;
      else structure += 8;
    }

    if (!bb) {
      structure += 4;
    } else {
      const pctB = bb.percentB ?? bb.pct_b ?? null;
      if (pctB == null) structure += 4;
      else if (pctB < 20) structure += 2;
      else if (pctB < 40) structure += 5;
      else if (pctB <= 80) structure += 7;
      else structure += 3;
    }

    if (!rs) {
      structure += 4;
    } else {
      const rv = rs.value;
      if (rv < 0.8) structure += 0;
      else if (rv < 1) structure += 3;
      else if (rv <= 1.2) structure += 5;
      else structure += 7;
    }

    if (!st) {
      structure += 2;
    } else {
      const dir = st.direction ?? st.signal;
      if (dir === 'down' || dir === 'sell') structure += 0;
      else structure += 3;
    }

    const total = trend + momentum + volume + structure;

    let signal;
    if (total >= 80) signal = 'Strong Bullish';
    else if (total >= 65) signal = 'Bullish';
    else if (total >= 50) signal = 'Neutral';
    else if (total >= 35) signal = 'Bearish';
    else signal = 'Strong Bearish';

    return { trend, momentum, volume, structure, total, signal };
  } catch {
    return { trend: 0, momentum: 0, volume: 0, structure: 0, total: 0, signal: 'Neutral' };
  }
}

// ─── Generate Signals ────────────────────────────────────────────────────────

export function generateSignals(ind = {}, priceData = {}) {
  try {
    const signals = [];
    const { rsi, macd, bb, st, ema200, adx: adxObj, obvObj, fibLevels } = ind;
    const { close, prevClose, high52w, low52w, volume, avgVolume10d } = priceData;

    // 1. RSI overbought
    if (rsi != null && rsi > 75) {
      signals.push({ text: `RSI at ${rsi.toFixed ? rsi.toFixed(1) : rsi} — overbought, momentum may fade`, type: 'warning', priority: 2 });
    }
    // 2. RSI oversold
    if (rsi != null && rsi < 30) {
      signals.push({ text: `RSI at ${rsi.toFixed ? rsi.toFixed(1) : rsi} — oversold, potential bounce zone`, type: 'bullish', priority: 2 });
    }
    // 3. MACD bullish crossover
    if (macd?.crossover === 'bullish') {
      signals.push({ text: 'MACD bullish crossover — momentum building', type: 'bullish', priority: 1 });
    }
    // 4. MACD bearish crossover
    if (macd?.crossover === 'bearish') {
      signals.push({ text: 'MACD bearish crossover — momentum weakening', type: 'bearish', priority: 1 });
    }
    // 5. Price crossed above EMA200
    if (close != null && prevClose != null && ema200 != null && close > ema200 && prevClose < ema200) {
      signals.push({ text: 'Price broke above EMA200 — significant long-term trend shift', type: 'bullish', priority: 1 });
    }
    // 6. Price crossed below EMA200
    if (close != null && prevClose != null && ema200 != null && close < ema200 && prevClose > ema200) {
      signals.push({ text: 'Price broke below EMA200 — long-term trend turned bearish', type: 'bearish', priority: 1 });
    }
    // 7. OBV divergence
    if (obvObj?.trend === 'falling' && close != null && prevClose != null && close > prevClose * 1.01) {
      signals.push({ text: 'OBV falling while price rising — bearish divergence, caution', type: 'warning', priority: 2 });
    }
    // 8. Volume spike
    if (volume != null && avgVolume10d != null && avgVolume10d > 0 && volume > avgVolume10d * 2) {
      signals.push({ text: `Volume ${(volume / avgVolume10d).toFixed(1)}× above avg — institutional activity likely`, type: 'neutral', priority: 3 });
    }
    // 9. Fibonacci support test
    if (fibLevels?.nearestSupport && close != null) {
      const { label, price } = fibLevels.nearestSupport;
      if (Math.abs(close - price) / price <= 0.01) {
        signals.push({ text: `Near Fibonacci ${label}% support at ₹${price} — high-probability bounce zone`, type: 'bullish', priority: 3 });
      }
    }
    // 10. ADX strong trend
    if (adxObj?.adx > 30) {
      signals.push({ text: `ADX at ${adxObj.adx} — ${adxObj.trend} trend in place`, type: 'neutral', priority: 4 });
    }
    // 11. Bollinger squeeze
    if (bb?.squeeze === true) {
      signals.push({ text: 'Bollinger Band squeeze — breakout imminent, direction unclear', type: 'neutral', priority: 3 });
    }
    // 12. Supertrend bullish
    if (st?.signal === 'buy' || st?.direction === 'up') {
      signals.push({ text: 'Supertrend bullish — trend-following setup', type: 'bullish', priority: 4 });
    }
    // 13. Supertrend bearish
    if (st?.signal === 'sell' || st?.direction === 'down') {
      signals.push({ text: 'Supertrend bearish — avoid long positions', type: 'bearish', priority: 4 });
    }
    // 14. Near 52W high
    if (close != null && high52w != null && close > high52w * 0.97) {
      signals.push({ text: 'Within 3% of 52-week high — momentum zone', type: 'bullish', priority: 5 });
    }
    // 15. Near 52W low
    if (close != null && low52w != null && close < low52w * 1.03) {
      signals.push({ text: 'Within 3% of 52-week low — deep value zone', type: 'neutral', priority: 5 });
    }

    return signals.sort((a, b) => a.priority - b.priority).slice(0, 6);
  } catch { return []; }
}

// ─── Detect Chart Patterns ───────────────────────────────────────────────────

export function detectChartPatterns(candles) {
  try {
    if (!candles || candles.length < 20) return [];
    const results = [];

    const slice50 = candles.slice(-Math.min(50, candles.length));

    // Local high/low helpers (6-candle window: 3 neighbors each side)
    const localHighs = [];
    const localLows = [];
    for (let i = 3; i < slice50.length - 3; i++) {
      const c = slice50[i].close;
      if (c > slice50[i-1].close && c > slice50[i-2].close && c > slice50[i-3].close &&
          c > slice50[i+1].close && c > slice50[i+2].close && c > slice50[i+3].close) {
        localHighs.push({ idx: i, price: c });
      }
      if (c < slice50[i-1].close && c < slice50[i-2].close && c < slice50[i-3].close &&
          c < slice50[i+1].close && c < slice50[i+2].close && c < slice50[i+3].close) {
        localLows.push({ idx: i, price: c });
      }
    }

    // Double Top
    if (localHighs.length >= 2) {
      const h1 = localHighs[localHighs.length - 2];
      const h2 = localHighs[localHighs.length - 1];
      const priceDiff = Math.abs(h1.price - h2.price) / h1.price * 100;
      if (priceDiff <= 2) {
        // check trough between them
        const between = slice50.slice(h1.idx + 1, h2.idx);
        if (between.length > 0) {
          const troughClose = Math.min(...between.map(c => c.close));
          const drop = (h1.price - troughClose) / h1.price * 100;
          if (drop > 3) {
            const confidence = Math.round(100 - priceDiff * 20);
            if (confidence >= 70) {
              results.push({ name: 'Double Top', type: 'bearish', confidence, description: 'Two peaks at similar levels signal reversal' });
            }
          }
        }
      }
    }

    // Double Bottom
    if (localLows.length >= 2) {
      const l1 = localLows[localLows.length - 2];
      const l2 = localLows[localLows.length - 1];
      const priceDiff = Math.abs(l1.price - l2.price) / l1.price * 100;
      if (priceDiff <= 2) {
        const between = slice50.slice(l1.idx + 1, l2.idx);
        if (between.length > 0) {
          const peakClose = Math.max(...between.map(c => c.close));
          const rise = (peakClose - l1.price) / l1.price * 100;
          if (rise > 3) {
            const confidence = Math.round(100 - priceDiff * 20);
            if (confidence >= 70) {
              results.push({ name: 'Double Bottom', type: 'bullish', confidence, description: 'Two troughs at similar levels signal reversal' });
            }
          }
        }
      }
    }

    if (results.length < 2 && candles.length >= 10) {
      const last5 = candles.slice(-5).map(c => c.close);
      const prev5 = candles.slice(-10, -5).map(c => c.close);
      const slopeNow = linearSlope(last5);
      const slopePrev = linearSlope(prev5);
      const avgPrev = prev5.reduce((a, b) => a + b, 0) / prev5.length;
      const pctPerCandle = avgPrev > 0 ? (slopePrev / avgPrev * 100) : 0;

      if (slopeNow < 0 && pctPerCandle > 1) {
        results.push({ name: 'Bull Flag', type: 'bullish', confidence: 75, description: 'Consolidation after strong move — continuation likely' });
      } else if (slopeNow > 0 && pctPerCandle < -1) {
        results.push({ name: 'Bear Flag', type: 'bearish', confidence: 75, description: 'Consolidation after strong move down — continuation likely' });
      }
    }

    return results.filter(p => p.confidence >= 70).slice(0, 2);
  } catch { return []; }
}

// ─── Multi-Timeframe Alignment ────────────────────────────────────────────────

export function computeMTFAlignment(daily, weekly, monthly) {
  try {
    const map = { 'Strong Bullish': 2, 'Bullish': 1, 'Neutral': 0, 'Bearish': -1, 'Strong Bearish': -2 };
    const d = map[daily] ?? 0;
    const w = map[weekly] ?? 0;
    const m = map[monthly] ?? 0;
    const sum = d + w + m;

    if (sum >= 4) return { score: 5, label: 'Confirmed Uptrend', detail: 'All timeframes bullish' };
    if (sum >= 2) return { score: 4, label: 'Likely Uptrend', detail: '2/3 timeframes bullish' };
    if (sum >= -1) return { score: 3, label: 'Consolidation', detail: 'Mixed signals across timeframes' };
    if (sum >= -3) return { score: 2, label: 'Likely Downtrend', detail: '2/3 timeframes bearish' };
    return { score: 1, label: 'Confirmed Downtrend', detail: 'All timeframes bearish' };
  } catch { return { score: 3, label: 'Consolidation', detail: 'Mixed signals across timeframes' }; }
}

// ─── Pivot Camarilla ─────────────────────────────────────────────────────────

export function pivotCamarilla(candles) {
  try {
    if (!candles || candles.length < 2) return null;
    const { high: H, low: L, close: C } = candles[candles.length - 2];
    const range = H - L;
    return {
      h4: +(C + range * 1.1 / 2).toFixed(2),
      h3: +(C + range * 1.1 / 4).toFixed(2),
      l3: +(C - range * 1.1 / 4).toFixed(2),
      l4: +(C - range * 1.1 / 2).toFixed(2)
    };
  } catch { return null; }
}
