/**
 * Adaptive Trade Plan Engine — v2
 *
 * Priority 2: Real ATR-14 + RSI-14 from 14-day NSE history (not single-day H-L)
 * Priority 3: Portfolio-aware position sizing — risk capped at 2% of portfolio,
 *             split across open trades
 *
 * 7 factors: ATR-14, VIX, sector beta, AI confidence, market trend, day-of-week, time-of-day
 */

import https from 'https';
import { atr14, rsi14, rsiSignal, macd, bollingerBands, supertrend, emaCross, supportResistance, candlestickPatterns, pivotPoints } from './indicators.js';
import { getLatestSnapshot, listTrades } from './supabase.js';

// ── Sector beta ───────────────────────────────────────────────────────────────
const SECTOR_BETA = {
  'Banking': 1.25, 'Financial Services': 1.20, 'IT': 0.90, 'Technology': 0.90,
  'Pharma': 0.95, 'Healthcare': 0.95, 'Auto': 1.05, 'Metal': 1.30,
  'Energy': 1.10, 'Oil & Gas': 1.10, 'FMCG': 0.70, 'Consumer': 0.75,
  'Realty': 1.35, 'Infrastructure': 1.15, 'Telecom': 0.85, 'Media': 1.20,
  'Chemicals': 1.00, 'Defence': 1.10, 'PSU': 1.10, 'default': 1.00,
};
function sectorBeta(sector) {
  if (!sector) return SECTOR_BETA.default;
  for (const [k, v] of Object.entries(SECTOR_BETA)) {
    if (k !== 'default' && sector.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return SECTOR_BETA.default;
}

// ── NSE session cookie (shared, 8-min cache) ──────────────────────────────────
let _nseCookie = null, _nseCookieAt = 0;
async function getNseCookie() {
  if (_nseCookie && Date.now() - _nseCookieAt < 8 * 60 * 1000) return _nseCookie;
  const cookie = await new Promise(resolve => {
    const req = https.request({
      hostname: 'www.nseindia.com', path: '/', method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
    }, res => {
      const raw = res.headers['set-cookie'] || [];
      resolve(raw.map(c => c.split(';')[0]).join('; '));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    req.end();
  });
  _nseCookie = cookie;
  _nseCookieAt = Date.now();
  return cookie;
}

// ── NSE VIX + Nifty snapshot (5-min cache) ───────────────────────────────────
let _mktCache = null, _mktCacheAt = 0;
async function getMarketSnapshot() {
  if (_mktCache && Date.now() - _mktCacheAt < 5 * 60 * 1000) return _mktCache;
  const cookie = await getNseCookie();
  const data = await new Promise(resolve => {
    const req = https.request({
      hostname: 'www.nseindia.com', path: '/api/allIndices', method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json',
                 'Referer': 'https://www.nseindia.com/', 'Cookie': cookie },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end();
  });
  const rows = data?.data || [];
  _mktCache = {
    vix:         parseFloat(rows.find(r => r.indexSymbol === 'INDIA VIX')?.last ?? 15),
    niftyChgPct: parseFloat(rows.find(r => r.indexSymbol === 'NIFTY 50')?.percentChange ?? 0),
  };
  _mktCacheAt = Date.now();
  return _mktCache;
}

// ── NSE 20-day historical OHLC for a symbol (1-hour cache per symbol) ─────────
const _histCache = new Map();
async function getHistory(symbol) {
  const cached = _histCache.get(symbol);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.candles;

  const cookie = await getNseCookie();
  const to   = new Date();
  const from = new Date(to); from.setDate(from.getDate() - 30); // 30 days to ensure 20 trading days
  const fmt  = d => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const path = `/api/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series=["EQ"]&from=${fmt(from)}&to=${fmt(to)}`;

  const data = await new Promise(resolve => {
    const req = https.request({
      hostname: 'www.nseindia.com', path, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json',
                 'Referer': 'https://www.nseindia.com/', 'Cookie': cookie },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });

  const rows = data?.data || [];
  // Sort oldest → newest, map to {high, low, close}
  const candles = rows
    .sort((a, b) => new Date(a.CH_TIMESTAMP) - new Date(b.CH_TIMESTAMP))
    .map(r => ({
      open:  parseFloat(r.CH_OPENING_PRICE || r.CH_CLOSING_PRICE),
      high:  parseFloat(r.CH_TRADE_HIGH_PRICE),
      low:   parseFloat(r.CH_TRADE_LOW_PRICE),
      close: parseFloat(r.CH_CLOSING_PRICE),
    }))
    .filter(c => c.high > 0);

  _histCache.set(symbol, { candles, at: Date.now() });
  return candles;
}

// ── Portfolio value + open trade count (Priority 3) ──────────────────────────
async function getPortfolioContext() {
  try {
    const [snapshot, trades] = await Promise.all([getLatestSnapshot(), listTrades('open')]);
    return {
      portfolioValue: snapshot?.current_value || 0,
      openTrades:     trades.length,
    };
  } catch {
    return { portfolioValue: 0, openTrades: 0 };
  }
}

// ── Price confirmation — VWAP approx + range position (Priority 5) ───────────
function priceConfirmation({ ltp, open, high, low, candles }) {
  // Approximate VWAP using today's OHLC typical price
  const vwap = (open + high + low + ltp) / 4;
  const aboveVwap = ltp >= vwap;

  // Where is price in today's range? 0 = at low, 1 = at high
  const rangeWidth = high - low;
  const rangePct   = rangeWidth > 0 ? (ltp - low) / rangeWidth : 0.5;
  const rangeZone  = rangePct > 0.66 ? 'upper-third'
                   : rangePct > 0.33 ? 'middle'
                   : 'lower-third';

  // Yesterday's close from candle history
  const prevClose  = candles.length >= 2 ? candles[candles.length - 2].close : null;
  const abovePrevClose = prevClose ? ltp > prevClose : null;

  // Signal
  let signal, signal_ok;
  if (aboveVwap && rangePct > 0.33 && rangePct < 0.80) {
    signal = '✅ Above VWAP · mid-range — good entry zone';
    signal_ok = true;
  } else if (!aboveVwap && rangePct < 0.40) {
    signal = '⚠ Below VWAP · lower range — wait for bounce';
    signal_ok = false;
  } else if (rangePct > 0.85) {
    signal = '⚠ Top of range — extended, wait for pullback';
    signal_ok = false;
  } else if (aboveVwap) {
    signal = '✅ Above VWAP · momentum intact';
    signal_ok = true;
  } else {
    signal = '⚠ Below VWAP · momentum weak';
    signal_ok = false;
  }

  return {
    vwap:             +vwap.toFixed(2),
    above_vwap:       aboveVwap,
    range_pct:        +( rangePct * 100).toFixed(1),
    range_zone:       rangeZone,
    above_prev_close: abovePrevClose,
    signal,
    signal_ok,
  };
}

// ── Core plan builder ─────────────────────────────────────────────────────────
function buildPlan({ ltp, open, high, low, sector, confidence, score, vix, niftyChgPct,
                     atrRs, rsi, portfolioValue, openTrades, candles,
                     macdVal, bbVal, stVal, emaVal, srVal, patterns, pivots }) {

  // 1. ATR% — real 14-day Wilder ATR (falls back to 1% if history unavailable)
  const atrPct = atrRs ? Math.max(atrRs / ltp, 0.003) : 0.010;

  // 2. VIX multiplier — VIX 15 = baseline 1.0×
  const vixMul = +(0.7 + (vix / 15) * 0.3).toFixed(2);

  // 3. Sector beta
  const beta = sectorBeta(sector);

  // 4. Market trend
  const trendFactor = niftyChgPct < -0.5 ? 0.85 : niftyChgPct > 0.5 ? 1.10 : 1.0;

  // 5. Confidence multiplier
  const confScore = Math.min(Math.max(score || confidence || 50, 0), 100);
  const confMul   = +(0.5 + confScore / 100).toFixed(2);

  // 6. Day-of-week
  const dow       = new Date().getDay();
  const dayFactor = dow === 4 ? 1.15 : dow === 1 ? 0.90 : 1.0;

  // 7. Time-of-day
  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hhmm   = nowIST.getUTCHours() * 100 + nowIST.getUTCMinutes();
  const timeWarn = hhmm < 930 ? 'early-session' : hhmm > 1500 ? 'late-session' : null;

  // ── Composite swing ──────────────────────────────────────────────────────────
  const swingPct  = atrPct * beta * vixMul * trendFactor * dayFactor;
  const targetPct = swingPct;
  const slPct     = swingPct * 0.80;           // R:R ≈ 1.25

  const target = Math.round((ltp * (1 + targetPct)) * 20) / 20;
  const sl     = Math.round((ltp * (1 - slPct))     * 20) / 20;
  const slDist = ltp - sl;

  // ── Position sizing — Priority 3 ─────────────────────────────────────────────
  // Budget: 2% of portfolio value, divided among open trades + this one
  // Floor: ₹15,000; ceiling: ₹50,000
  let capital;
  if (portfolioValue > 0) {
    const totalRiskBudget = portfolioValue * 0.02;          // 2% of portfolio
    const slots           = Math.max(1, openTrades + 1);    // include this new trade
    const riskPerTrade    = totalRiskBudget / slots;         // max loss per trade
    const qtyByRisk       = Math.floor(riskPerTrade / slDist);
    capital               = Math.min(Math.max(qtyByRisk * ltp, 15000), 50000);
  } else {
    // Fallback: fixed ₹25k × confidence
    capital = Math.round(25000 * confMul);
  }

  const qty      = Math.max(1, Math.floor(capital / ltp));
  const riskRs   = Math.round(qty * slDist);
  const rewardRs = Math.round(qty * (target - ltp));
  const rr       = +(rewardRs / (riskRs || 1)).toFixed(2);

  // RSI signal
  const rsig  = rsiSignal(rsi);
  // Price confirmation
  const pconf = priceConfirmation({ ltp, open, high, low, candles: candles || [] });

  // Composite signal score
  let bull = 0, total = 0;
  if (rsig.ok)                                              { bull++; total++; }
  if (pconf.signal_ok)                                      { bull++; total++; }
  if (macdVal?.crossover === 'bullish')                     { bull++; total++; }
  else if (macdVal)                                         {         total++; }
  if (stVal?.direction === 'up')                            { bull++; total++; }
  else if (stVal)                                           {         total++; }
  if (emaVal?.signal === 'bullish')                         { bull++; total++; }
  else if (emaVal)                                          {         total++; }
  if (bbVal && bbVal.pct_b > 40 && bbVal.pct_b < 80)       { bull++; total++; }
  else if (bbVal)                                           {         total++; }
  if ((patterns?.bullish?.length || 0) > 0)                { bull++; total++; }
  else if ((patterns?.bearish?.length || 0) > 0)           {         total++; }

  const signal_score = total ? Math.round(bull / total * 100) : 50;
  const trade_ready  = signal_score >= 60;

  return {
    ltp,
    entry:      ltp,
    target,
    sl,
    target_pct: +(targetPct * 100).toFixed(2),
    sl_pct:     +(slPct     * 100).toFixed(2),
    qty,
    capital,
    risk_rs:    riskRs,
    reward_rs:  rewardRs,
    rr,
    time_warn:  timeWarn,
    rsi,
    rsi_signal: rsig.label,
    rsi_ok:     rsig.ok,
    price_confirmation: pconf,
    macd:               macdVal,
    bollinger:          bbVal,
    supertrend:         stVal,
    ema_cross:          emaVal,
    support_resistance: srVal,
    pivots,
    patterns,
    signal_score,
    signal_detail:      `${bull}/${total} signals bullish`,
    trade_ready,
    sizing_note: portfolioValue > 0
      ? `2% of ₹${(portfolioValue/1000).toFixed(0)}k portfolio ÷ ${openTrades + 1} trades`
      : 'Fixed capital (connect Kite for portfolio sizing)',
    factors: {
      atr_pct:      +(atrPct   * 100).toFixed(2),
      atr_source:   atrRs ? 'ATR-14' : 'fallback-1%',
      rsi,
      vix,
      vix_mul:      vixMul,
      sector_beta:  beta,
      trend_pct:    +niftyChgPct.toFixed(2),
      trend_factor: trendFactor,
      day_factor:   dayFactor,
      conf_score:   confScore,
      conf_mul:     confMul,
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getTradePlan({ symbol, exchange = 'NSE', sector = '',
                                     confidence = 70, score = 70,
                                     ltp, open, high, low }) {
  const o = open ?? ltp; const h = high ?? ltp; const l = low ?? ltp;
  const [market, candles, portfolio] = await Promise.all([
    getMarketSnapshot(),
    getHistory(symbol),
    getPortfolioContext(),
  ]);
  const atrRs  = candles.length >= 2  ? atr14(candles)            : null;
  const rsi    = candles.length >= 15 ? rsi14(candles)            : null;
  const macdVal= candles.length >= 26 ? macd(candles)             : null;
  const bbVal  = candles.length >= 20 ? bollingerBands(candles)   : null;
  const stVal  = candles.length >= 14 ? supertrend(candles)       : null;
  const emaVal = candles.length >= 50 ? emaCross(candles)         : null;
  const srVal  = candles.length >= 5  ? supportResistance(candles): null;
  const patterns = candles.length >= 3 ? candlestickPatterns(candles) : null;
  const pivots   = candles.length >= 2 ? pivotPoints(candles)         : null;
  const plan  = buildPlan({
    ltp: +ltp, open: +o, high: +h, low: +l,
    sector, confidence: +confidence, score: +score,
    vix: market.vix, niftyChgPct: market.niftyChgPct,
    atrRs, rsi, candles,
    macdVal, bbVal, stVal, emaVal, srVal, patterns, pivots,
    portfolioValue: portfolio.portfolioValue,
    openTrades:     portfolio.openTrades,
  });
  return { symbol, exchange, sector, ...plan };
}
