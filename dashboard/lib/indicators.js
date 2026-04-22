/**
 * Technical indicator library — ATR-14, RSI-14
 * Input: array of { high, low, close } sorted oldest → newest
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
