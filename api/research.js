/**
 * Research domain — FA data proxy + AI narrative.
 * Kept separate from intel.js so ncc can bundle it reliably.
 *
 * Routes (via vercel.json rewrites):
 *   GET  /api/fa-data?symbol=   → action=fundamental
 *   POST /api/fa-narrative      → action=fa_narrative
 *   POST action=symbol          → symbol search (via /symbol-search rewrite)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_r = dirname(fileURLToPath(import.meta.url));
const nseSymbols = JSON.parse(readFileSync(join(__dirname_r, '../modules/alpha-scorer/nse_symbols.json'), 'utf8'));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BUILD_TIME = '2026-05-07T23:30:00Z'; // updated each deploy — check /api/research?action=version

// ── Kite historical data (for technical_full) ─────────────────────────────────
let _instrCache = null;
async function fetchKiteHistory(symbol, interval, count, enctoken) {
  const defaultCounts = { day: 200, week: 104, month: 60 };
  const n = count || defaultCounts[interval] || 200;
  let token;
  if (symbol === 'NIFTY 50' || symbol === 'NIFTY50') {
    token = '256265';
  } else {
    if (!_instrCache) {
      const r = await fetch('https://api.kite.trade/instruments/NSE', { headers: { 'X-Kite-Version': '3' } });
      const csv = await r.text();
      const lines = csv.trim().split('\n');
      const h = lines[0].split(',');
      const ti = h.indexOf('instrument_token'), si = h.indexOf('tradingsymbol');
      _instrCache = {};
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',');
        if (c[si]) _instrCache[c[si].trim()] = c[ti].trim();
      }
    }
    token = _instrCache[symbol.toUpperCase()];
    if (!token) throw new Error(`Token not found for ${symbol}`);
  }
  const to = new Date(), from = new Date(to);
  if (interval === 'day') from.setDate(from.getDate() - Math.ceil(n * 1.5));
  else if (interval === 'week') from.setDate(from.getDate() - n * 7 + 7);
  else if (interval === 'month') { from.setMonth(from.getMonth() - n + 1); from.setDate(1); }
  const fmt = d => d.toISOString().slice(0, 10);
  const url = `https://kite.zerodha.com/oms/instruments/historical/${token}/${interval}?from=${fmt(from)}&to=${fmt(to)}`;
  const r = await fetch(url, { headers: { Authorization: `enctoken ${enctoken}`, 'X-Kite-Version': '3' } });
  const data = await r.json();
  return (data?.data?.candles || data?.candles || [])
    .map(c => ({ date: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0 }))
    .slice(-n);
}

// ── Redis (Upstash HTTP — no persistent connection) ───────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(`${REDIS_URL}/GET/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const raw = j.result;
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  } catch { return null; }
}

async function redisSet(key, value, ttlSeconds) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  const s = JSON.stringify(value);
  fetch(`${REDIS_URL}/SETEX/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(s)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  }).catch(() => {});
}

// ── Yahoo Finance crumb ───────────────────────────────────────────────────────
let _yahooCrumb = null, _yahooCookie = null, _yahooCrumbAt = 0;
async function getYahooCrumb() {
  if (_yahooCrumb && Date.now() - _yahooCrumbAt < 30 * 60 * 1000) return { crumb: _yahooCrumb, cookie: _yahooCookie };
  const consentRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const rawCookies = consentRes.headers.getSetCookie?.() ?? [];
  _yahooCookie = rawCookies.map(c => c.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': _yahooCookie },
  });
  _yahooCrumb = await crumbRes.text();
  _yahooCrumbAt = Date.now();
  return { crumb: _yahooCrumb, cookie: _yahooCookie };
}

const TT_SLUGS = {
  'RVNL': 'RAIV', 'IRCTC': 'INIR', 'HAL': 'HIAE', 'BEL': 'BAJE',
  'COCHINSHIP': 'COCH', 'SBIN': 'SBI', 'PNB': 'PNBK', 'BANKBARODA': 'BOB',
  'POWERGRID': 'PGRD', 'RECLTD': 'RECM', 'PFC': 'PWFC',
  'HDFCBANK': 'HDBK', 'ICICIBANK': 'ICBK', 'AXISBANK': 'AXBK', 'KOTAKBANK': 'KTKM',
  'HINDUNILVR': 'HLL', 'NESTLEIND': 'NEST', 'BRITANNIA': 'BRIT',
  'WIPRO': 'WIPR', 'HCLTECH': 'HCLT', 'RELIANCE': 'RELI',
  'TATAMOTORS': 'TAMO', 'TATASTEEL': 'TISC', 'MARUTI': 'MRTI',
  'BAJFINANCE': 'BJFN', 'BAJAJFINSV': 'BJFS', 'ASIANPAINT': 'ASPN',
  'SUNPHARMA': 'SUN', 'DRREDDY': 'REDY', 'CIPLA': 'CIPL', 'DIVISLAB': 'DIVI',
  'ADANIENT': 'ADEL', 'ADANIPORTS': 'APSE', 'ULTRACEMCO': 'ULTC', 'TITAN': 'TITN',
  'HINDPETRO': 'HPCL', 'COALINDIA': 'COAL', 'ONGC': 'ONGC',
  'LT': 'LART', 'TECHM': 'TECHM', 'BAJAJ-AUTO': 'BAJA', 'HEROMOTOCO': 'HMOT',
  'APOLLOHOSP': 'APHS', 'DABUR': 'DABU', 'MARICO': 'MRIC', 'PIDILITIND': 'PIDI',
  'SIEMENS': 'SIEM', 'ABB': 'ABBI', 'HAVELLS': 'HAVL', 'DIXON': 'DIXN',
  'TRENT': 'TREN', 'VMART': 'VMAR', 'ZOMATO': 'ZOMA', 'PAYTM': 'PAYT',
  // user portfolio
  'AARTIIND': 'ARTI', 'BANKINDIA': 'BOI', 'BHEL': 'BHEL', 'ATGL': 'ATGL',
  'NMDC': 'NMDC', 'RVNL': 'RAIV', 'SAIL': 'SAIL', 'NTPC': 'NTPC',
  'GAIL': 'GAIL', 'BPCL': 'BPCL', 'IOC': 'IOC', 'NHPC': 'NHPC',
  'SJVN': 'SJVN', 'IRFC': 'IRFC', 'HUDCO': 'HUDC', 'NBCC': 'NBCC',
};

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
const fetchT = (url, opts, ms = 5000) => Promise.race([fetch(url, opts), timeout(ms)]);

// ── Symbol search helper ──────────────────────────────────────────────────────
function scoreMatch(query, target) {
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  let matches = 0;
  for (const ch of q) if (t.includes(ch)) matches++;
  return Math.round((matches / q.length) * 50);
}

// ── LLM config ────────────────────────────────────────────────────────────────
const LLM_PROVIDER   = process.env.LLM_PROVIDER   || 'groq';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';
const GROQ_MODEL     = process.env.GROQ_MODEL     || 'llama-3.3-70b-versatile';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL   || 'gemini-2.0-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Kite-Enctoken');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  try {
    // ── Symbol search ──────────────────────────────────────────────────────────
    if (action === 'symbol') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const query = (req.body?.query || '').trim();
      if (!query) { res.status(400).json({ error: 'query required' }); return; }
      const results = nseSymbols
        .map(s => ({ symbol: s.symbol, name: s.name || s.symbol, sector: s.sector || '',
                     score: Math.max(scoreMatch(query, s.symbol), scoreMatch(query, s.name || '')) }))
        .filter(s => s.score > 20)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ symbol, name, sector }) => ({ symbol, name, sector }));
      return res.status(200).json(results);
    }

    // ── Fundamental Data Proxy ─────────────────────────────────────────────────
    if (action === 'fundamental') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }

      const cacheKey = `fa2:${symbol}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.lastUpdated) {
        const ageMs = Date.now() - new Date(cached.lastUpdated).getTime();
        if (ageMs < 4 * 60 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const result = { symbol, sources: [], lastUpdated: new Date().toISOString() };

      // Run all sources in parallel to stay within Vercel's 10s limit
      const [yahooRes, ttRes, nseQRes, nseShRes, screenerRes] = await Promise.allSettled([
        // Yahoo Finance
        (async () => {
          const { crumb, cookie } = await getYahooCrumb();
          const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,incomeStatementHistoryQuarterly,balanceSheetHistory,cashflowStatementHistory,cashflowStatementHistoryQuarterly';
          const yUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
          const r = await fetchT(yUrl, { headers: { 'User-Agent': UA, 'Cookie': cookie } }, 6000);
          if (!r.ok) throw new Error(`yahoo ${r.status}`);
          return r.json();
        })(),
        // Tickertape — resolve sid via TT_SLUGS, direct lookup, or search fallback
        (async () => {
          const ttHeaders = { 'User-Agent': UA };
          const knownSlug = TT_SLUGS[symbol];
          // 1. Known slug — go direct, skip wasted direct-symbol call
          if (knownSlug) {
            const r = await fetchT(`https://api.tickertape.in/stocks/info/${knownSlug}`, { headers: ttHeaders }, 5000);
            if (r.ok) { const j = await r.json(); if (j.success !== false && j.data?.ratios) return j; }
          }
          // 2. Direct symbol (works when NSE ticker == TT sid e.g. NMDC, BHEL)
          const r2 = await fetchT(`https://api.tickertape.in/stocks/info/${symbol}`, { headers: ttHeaders }, 4000);
          if (r2.ok) { const j = await r2.json(); if (j.success !== false && j.data?.ratios) return j; }
          return null;
        })(),
        // NSE quote
        (async () => {
          const r = await fetchT(
            `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
            { headers: { 'User-Agent': UA, 'Referer': `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`, 'Accept': 'application/json' } },
            5000
          );
          if (!r.ok) throw new Error(`nse_quote ${r.status}`);
          return r.json();
        })(),
        // NSE shareholding
        (async () => {
          const r = await fetchT(
            `https://www.nseindia.com/api/corporate-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&series=EQ`,
            { headers: { 'User-Agent': UA, 'Referer': 'https://www.nseindia.com/', 'Accept': 'application/json' } },
            5000
          );
          if (!r.ok) throw new Error(`nse_sh ${r.status}`);
          return r.json();
        })(),
        // Screener.in — ROCE + Net Margin via HTML scrape
        (async () => {
          const r = await fetchT(
            `https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`,
            { headers: { 'User-Agent': UA, 'Accept': 'text/html' } },
            6000
          );
          if (!r.ok) throw new Error(`screener ${r.status}`);
          const html = await r.text();
          const out = {};
          // Top ratios block
          const topM = html.match(/id="top-ratios"([\s\S]*?)<\/ul>/);
          if (topM) {
            const pairs = [...topM[1].matchAll(/<span class="name">\s*([\s\S]*?)\s*<\/span>[\s\S]*?<span class="number">([\d,\.]+)<\/span>/g)];
            for (const [, name, val] of pairs) {
              const n = name.trim().replace(/\s+/g,' ');
              const v = parseFloat(val.replace(/,/g,''));
              if (n === 'ROCE') out.roce = v;
              else if (n === 'ROE') out.roe = v;
              else if (n === 'Stock P/E') out.pe = v;
              else if (n === 'Book Value') out.bvps = v;
            }
          }
          // Helper: parse table rows from a section block
          const parseRows = (block) => {
            const map = {};
            for (const [, label, rest] of block.matchAll(/<td[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/g)) {
              const lbl = label.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim().replace(/\s*\+\s*$/,'');
              const nums = [...rest.matchAll(/<td[^>]*>\s*([\d,\.\-]+)\s*<\/td>/g)].map(m => parseFloat(m[1].replace(/,/g,'')));
              if (lbl && nums.length) map[lbl.toLowerCase()] = nums;
            }
            return map;
          };

          // Quarterly P&L — revenueQoQ
          const qplM = html.match(/id="quarters"([\s\S]*?)id="profit-loss"/);
          if (qplM) {
            const qrows = parseRows(qplM[1]);
            const sales = qrows['sales'] || qrows['revenue'];
            if (sales && sales.length >= 2 && sales[1] > 0) out.revenueQoQ = +((sales[0] - sales[1]) / sales[1] * 100).toFixed(1);
          }

          // Annual P&L — netMargin, operatingMargin, profitCagr3yr, revCagr3yr
          const plM = html.match(/id="profit-loss"([\s\S]*?)id="balance-sheet"/);
          if (plM) {
            const rows = parseRows(plM[1]);
            const sales = rows['sales'] || rows['revenue'];
            const np = rows['net profit'];
            const op = rows['operating profit'];
            if (sales && np && sales[0] > 0) out.netMargin = +((np[0] / sales[0]) * 100).toFixed(1);
            if (sales && op && sales[0] > 0) out.operatingMargin = +((op[0] / sales[0]) * 100).toFixed(1);
            if (sales && sales.length >= 4 && sales[3] > 0) out.revenueCagr3yr = +((Math.pow(sales[0]/sales[3], 1/3)-1)*100).toFixed(1);
            if (np && np.length >= 4 && np[3] > 0) {
              out.epsCagr3yr = +((Math.pow(Math.abs(np[0]/np[3]), 1/3)-1)*100).toFixed(1);
              out.profitCagr3yr = out.epsCagr3yr;
            }
          }

          // Balance sheet — debtEquity, currentRatio, Piotroski prev-year fields
          const bsM = html.match(/id="balance-sheet"([\s\S]*?)id="cash-flow"/);
          if (bsM) {
            const rows = parseRows(bsM[1]);
            const faceVal = parseFloat((html.match(/Face Value.*?<span class="number">([\d\.]+)<\/span>/) || [])[1] || '10');
            for (let i = 0; i <= 1; i++) {
              const eq = (rows['equity capital']?.[i] ?? 0) + (rows['reserves']?.[i] ?? 0);
              const debt = rows['borrowings']?.[i] ?? 0;
              const totalAssets = rows['total assets']?.[i] ?? 0;
              const fixedAssets = (rows['fixed assets']?.[i] ?? 0) + (rows['cwip']?.[i] ?? 0) + (rows['investments']?.[i] ?? 0);
              const currentAssets = totalAssets - fixedAssets;
              const currentLiab = Math.max(1, totalAssets - eq - debt);
              const sharesOut = rows['equity capital']?.[i] ? rows['equity capital'][i] * 1e7 / faceVal : null;
              if (i === 0) {
                if (eq > 0) out.debtEquity = +(debt / eq).toFixed(2);
                if (currentLiab > 0) out.currentRatio = +(currentAssets / currentLiab).toFixed(2);
                out.totalAssets = totalAssets * 1e7;
                out.sharesOutstanding = sharesOut;
              } else {
                if (eq > 0) out.debtEquity_prev = +(debt / eq).toFixed(2);
                if (currentLiab > 0) out.currentRatio_prev = +(currentAssets / currentLiab).toFixed(2);
                out.totalAssets_prev = totalAssets * 1e7;
                out.sharesOutstanding_prev = sharesOut;
              }
            }
          }

          // Cash flow — operatingCashflow for Piotroski F2/F4
          const cfM = html.match(/id="cash-flow"([\s\S]*?)(?:id="ratios"|id="shareholding"|<\/section>)/);
          if (cfM) {
            const rows = parseRows(cfM[1]);
            const cfo = rows['cash from operating activity'];
            if (cfo) {
              out.operatingCashflow = cfo[0] * 1e7;
              out.operatingCashflow_prev = cfo[1] != null ? cfo[1] * 1e7 : null;
            }
          }

          // Annual P&L prev-year for Piotroski gross margin / asset turnover
          if (plM) {
            const rows = parseRows(plM[1]);
            const sales = rows['sales'] || rows['revenue'];
            const np = rows['net profit'];
            const op = rows['operating profit'];
            if (sales && np && out.totalAssets && out.totalAssets > 0) {
              out.roa = +((np[0] * 1e7) / out.totalAssets * 100).toFixed(2);
              out.assetTurnover = +((sales[0] * 1e7) / out.totalAssets).toFixed(3);
            }
            if (sales?.[1] && np?.[1] && out.totalAssets_prev && out.totalAssets_prev > 0) {
              out.roa_prev = +((np[1] * 1e7) / out.totalAssets_prev * 100).toFixed(2);
              out.assetTurnover_prev = +((sales[1] * 1e7) / out.totalAssets_prev).toFixed(3);
            }
            if (sales && op) {
              out.grossMargin = sales[0] > 0 ? +((op[0] / sales[0]) * 100).toFixed(1) : null;
              out.grossMargin_prev = sales[1] > 0 ? +((op[1] / sales[1]) * 100).toFixed(1) : null;
            }
          }

          // Promoter holding — embedded in page meta text
          const promoM = html.match(/Promoter Holding:\s*([\d\.]+)%/);
          if (promoM) out.promoterHolding = parseFloat(promoM[1]);

          return Object.keys(out).length > 0 ? out : null;
        })(),
      ]);

      // Parse Yahoo
      if (yahooRes.status === 'fulfilled') {
        try {
          const yData = yahooRes.value;
          const s = yData?.quoteSummary?.result?.[0];
          if (s) {
            const fd = s.financialData || {};
            const ks = s.defaultKeyStatistics || {};
            const sd = s.summaryDetail || {};
            const income  = s.incomeStatementHistory?.incomeStatementHistory || [];
            const incomeQ = s.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
            const balance  = s.balanceSheetHistory?.balanceSheetStatements || [];
            const cashflow  = s.cashflowStatementHistory?.cashflowStatements || [];
            const cashflowQ = s.cashflowStatementHistoryQuarterly?.cashflowStatements || [];

            result.companyName   = ks.shortName || symbol;
            result.pe            = sd.trailingPE?.raw ?? null;
            result.forwardPE     = sd.forwardPE?.raw ?? null;
            result.pb            = ks.priceToBook?.raw ?? null;
            result.evEbitda      = ks.enterpriseToEbitda?.raw ?? null;
            result.roe           = fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : null;
            result.netMargin     = fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : null;
            result.operatingMargin = fd.operatingMargins?.raw != null ? fd.operatingMargins.raw * 100 : null;
            result.grossMargin   = fd.grossMargins?.raw != null ? fd.grossMargins.raw * 100 : null;
            result.revenueGrowth = fd.revenueGrowth?.raw != null ? fd.revenueGrowth.raw * 100 : null;
            result.earningsGrowth = fd.earningsGrowth?.raw != null ? fd.earningsGrowth.raw * 100 : null;
            result.debtEquity    = fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : null;
            result.currentRatio  = fd.currentRatio?.raw ?? null;
            result.quickRatio    = fd.quickRatio?.raw ?? null;
            result.operatingCashflow = fd.operatingCashflow?.raw ?? null;
            result.freeCashflow  = fd.freeCashflow?.raw ?? null;
            result.dividendYield = sd.dividendYield?.raw != null ? sd.dividendYield.raw * 100 : null;
            result.beta          = ks.beta?.raw ?? null;
            result.high52w       = sd.fiftyTwoWeekHigh?.raw ?? null;
            result.low52w        = sd.fiftyTwoWeekLow?.raw ?? null;
            result.marketCap     = sd.marketCap?.raw ?? null;
            result.sharesOutstanding = ks.sharesOutstanding?.raw ?? null;

            const fcfYears = cashflow.slice(0, 3).filter(c =>
              (c.totalCashFromOperatingActivities?.raw || 0) > (c.capitalExpenditures?.raw || 0) * -1
            ).length;
            result.fcfPositiveYears3yr = fcfYears;

            if (income.length >= 4) {
              const revNow = income[0]?.totalRevenue?.raw, rev3yr = income[3]?.totalRevenue?.raw;
              if (revNow && rev3yr && rev3yr > 0) result.revenueCagr3yr = +((Math.pow(revNow/rev3yr, 1/3)-1)*100).toFixed(1);
              const epsNow = income[0]?.dilutedEPS?.raw ?? income[0]?.basicEPS?.raw;
              const eps3yr = income[3]?.dilutedEPS?.raw ?? income[3]?.basicEPS?.raw;
              if (epsNow && eps3yr && eps3yr > 0) result.epsCagr3yr = +((Math.pow(Math.abs(epsNow/eps3yr), 1/3)-1)*100).toFixed(1);
              const pnow = income[0]?.netIncome?.raw, p3yr = income[3]?.netIncome?.raw;
              if (pnow && p3yr && p3yr > 0) result.profitCagr3yr = +((Math.pow(pnow/p3yr, 1/3)-1)*100).toFixed(1);
            }

            const ebit0 = income[0]?.ebit?.raw ?? null;
            const totalAssets0 = balance[0]?.totalAssets?.raw ?? null;
            const currLiab0 = balance[0]?.totalCurrentLiabilities?.raw ?? null;
            result.totalAssets = totalAssets0;
            if (ebit0 != null && totalAssets0 != null && currLiab0 != null) {
              const cap = totalAssets0 - currLiab0;
              if (cap > 0) result.roce = +((ebit0 / cap) * 100).toFixed(1);
            }
            const intExp0 = income[0]?.interestExpense?.raw ?? null;
            if (ebit0 != null && intExp0 != null && intExp0 !== 0) result.interestCoverage = +(ebit0 / Math.abs(intExp0)).toFixed(1);

            const netInc0 = income[0]?.netIncome?.raw ?? null;
            const netInc1 = income[1]?.netIncome?.raw ?? null;
            const totalAssets1 = balance[1]?.totalAssets?.raw ?? null;
            if (netInc0 != null && totalAssets0 != null && totalAssets0 > 0) result.roa = +((netInc0 / totalAssets0) * 100).toFixed(2);
            if (netInc1 != null && totalAssets1 != null && totalAssets1 > 0) result.roa_prev = +((netInc1 / totalAssets1) * 100).toFixed(2);

            const equity1 = balance[1]?.totalStockholderEquity?.raw ?? null;
            const totalDebt1 = (balance[1]?.longTermDebt?.raw ?? 0) + (balance[1]?.shortLongTermDebt?.raw ?? 0);
            if (equity1 && equity1 > 0) result.debtEquity_prev = +(totalDebt1 / equity1).toFixed(2);
            const currAssets1 = balance[1]?.totalCurrentAssets?.raw ?? null;
            const currLiab1 = balance[1]?.totalCurrentLiabilities?.raw ?? null;
            if (currAssets1 && currLiab1 && currLiab1 > 0) result.currentRatio_prev = +(currAssets1 / currLiab1).toFixed(2);
            result.sharesOutstanding_prev = balance[1]?.commonStockSharesOutstanding?.raw ?? null;

            const gm1 = income[1]?.grossProfit?.raw ?? null, rev1 = income[1]?.totalRevenue?.raw ?? null;
            if (gm1 != null && rev1 != null && rev1 > 0) result.grossMargin_prev = +((gm1 / rev1) * 100).toFixed(1);
            const rev0 = income[0]?.totalRevenue?.raw ?? null;
            if (rev0 && totalAssets0 && totalAssets0 > 0) result.assetTurnover = +(rev0 / totalAssets0).toFixed(3);
            if (rev1 && totalAssets1 && totalAssets1 > 0) result.assetTurnover_prev = +(rev1 / totalAssets1).toFixed(3);

            if (incomeQ.length >= 2) {
              const rq0 = incomeQ[0]?.totalRevenue?.raw, rq1 = incomeQ[1]?.totalRevenue?.raw;
              if (rq0 && rq1 && rq1 > 0) result.revenueQoQ = +((rq0 - rq1) / rq1 * 100).toFixed(1);
            }
            const totalDebt0 = (balance[0]?.longTermDebt?.raw ?? 0) + (balance[0]?.shortLongTermDebt?.raw ?? 0);
            if (balance.length >= 4) {
              const td3 = (balance[3]?.longTermDebt?.raw ?? 0) + (balance[3]?.shortLongTermDebt?.raw ?? 0);
              if (totalDebt0 > 0 && td3 > 0) result.debtCagr3yr = +((Math.pow(totalDebt0/td3, 1/3)-1)*100).toFixed(1);
            }
            let negCFO = 0;
            for (const q of cashflowQ) { if ((q.totalCashFromOperatingActivities?.raw ?? 1) < 0) negCFO++; else break; }
            result.negativeCFOQuarters = negCFO;

            if (incomeQ.length > 0) {
              result.quarterly = incomeQ.slice(0, 8).reverse().map(q => ({
                label: q.endDate?.fmt || '',
                revenue: q.totalRevenue?.raw != null ? +(q.totalRevenue.raw / 1e7).toFixed(1) : null,
                netProfit: q.netIncome?.raw != null ? +(q.netIncome.raw / 1e7).toFixed(1) : null,
              }));
            }
            result.sources.push('yahoo');
          }
        } catch (_) { /* parse error — skip */ }
      }

      // Parse Tickertape (fill gaps if Yahoo missed)
      if (ttRes.status === 'fulfilled' && ttRes.value) {
        const ttData = ttRes.value;
        const r = ttData?.data?.ratios || {}, info = ttData?.data?.info || {}, gic = ttData?.data?.gic || {};
        if (r.pe != null || r.roe != null || r.pb != null || r.roce != null) {
          result.companyName   = result.companyName   || info.name  || symbol;
          result.sector        = result.sector        || gic.industry || info.sector || null;
          result.pe            = result.pe            ?? r.pe       ?? null;
          result.pb            = result.pb            ?? r.pb       ?? null;
          result.roe           = result.roe           ?? r.roe      ?? null;
          result.roce          = result.roce          ?? r.roce     ?? null;
          result.netMargin     = result.netMargin     ?? r.npm      ?? r.netProfitMargin ?? null;
          result.debtEquity    = result.debtEquity    ?? r.deRatio  ?? null;
          result.currentRatio  = result.currentRatio  ?? r.currentRatio ?? null;
          result.beta          = result.beta          ?? r.beta     ?? null;
          result.dividendYield = result.dividendYield ?? r.divYield ?? null;
          result.marketCap     = result.marketCap     ?? (r.marketCap ? r.marketCap * 1e7 : null);
          result.high52w       = result.high52w       ?? r['52wHigh'] ?? null;
          result.low52w        = result.low52w        ?? r['52wLow']  ?? null;
          result.sources.push('tickertape');
        }
      }

      // Parse NSE quote
      if (nseQRes.status === 'fulfilled') {
        try {
          const nseQ = nseQRes.value;
          const md = nseQ?.metadata || {}, ii = nseQ?.industryInfo || {};
          result.pe     = result.pe     ?? md.pdSymbolPe ?? null;
          result.sector = result.sector || ii.industry  || ii.sector || null;
          result.exchange = 'NSE';
          result.sources.push('nse_quote');
        } catch (_) {}
      }

      // Parse NSE shareholding
      if (nseShRes.status === 'fulfilled') {
        try {
          const shData = nseShRes.value;
          const rows = shData?.data || [];
          if (rows.length > 0) {
            const latest = rows[0];
            result.promoterHolding = latest?.promoterAndPromoterGroup ?? null;
            result.fiiHolding      = latest?.foreignInstitutionalInvestors ?? null;
            result.diiHolding      = latest?.domesticInstitutionalInvestors ?? null;
            result.promoterPledge  = latest?.promoterPledge ?? null;
            if (rows.length >= 4) {
              const old = rows[3]?.promoterAndPromoterGroup ?? null, now = rows[0]?.promoterAndPromoterGroup ?? null;
              result.promoterTrendDelta4q = (now != null && old != null) ? +(now - old).toFixed(2) : null;
            }
            result.sources.push('nse_shareholding');
          }
        } catch (_) {}
      }

      // Parse Screener.in (fills ROCE, netMargin, CAGR, D/E, currentRatio, promoter)
      if (screenerRes.status === 'fulfilled' && screenerRes.value) {
        const sc = screenerRes.value;
        result.roce            = result.roce            ?? sc.roce            ?? null;
        result.roe             = result.roe             ?? sc.roe             ?? null;
        result.netMargin       = result.netMargin       ?? sc.netMargin       ?? null;
        result.pe              = result.pe              ?? sc.pe              ?? null;
        result.revenueCagr3yr  = result.revenueCagr3yr  ?? sc.revenueCagr3yr  ?? null;
        result.epsCagr3yr      = result.epsCagr3yr      ?? sc.epsCagr3yr      ?? null;
        result.revenueQoQ      = result.revenueQoQ      ?? sc.revenueQoQ      ?? null;
        result.debtEquity      = result.debtEquity      ?? sc.debtEquity      ?? null;
        result.currentRatio        = result.currentRatio        ?? sc.currentRatio        ?? null;
        result.currentRatio_prev   = result.currentRatio_prev   ?? sc.currentRatio_prev   ?? null;
        result.debtEquity_prev     = result.debtEquity_prev     ?? sc.debtEquity_prev     ?? null;
        result.promoterHolding     = result.promoterHolding     ?? sc.promoterHolding     ?? null;
        result.fiiHolding          = result.fiiHolding          ?? sc.fiiHolding          ?? null;
        result.operatingMargin     = result.operatingMargin     ?? sc.operatingMargin     ?? null;
        result.profitCagr3yr       = result.profitCagr3yr       ?? sc.profitCagr3yr       ?? null;
        result.operatingCashflow   = result.operatingCashflow   ?? sc.operatingCashflow   ?? null;
        result.roa                 = result.roa                 ?? sc.roa                 ?? null;
        result.roa_prev            = result.roa_prev            ?? sc.roa_prev            ?? null;
        result.grossMargin         = result.grossMargin         ?? sc.grossMargin         ?? null;
        result.grossMargin_prev    = result.grossMargin_prev    ?? sc.grossMargin_prev    ?? null;
        result.assetTurnover       = result.assetTurnover       ?? sc.assetTurnover       ?? null;
        result.assetTurnover_prev  = result.assetTurnover_prev  ?? sc.assetTurnover_prev  ?? null;
        result.sharesOutstanding   = result.sharesOutstanding   ?? sc.sharesOutstanding   ?? null;
        result.sharesOutstanding_prev = result.sharesOutstanding_prev ?? sc.sharesOutstanding_prev ?? null;
        result.totalAssets         = result.totalAssets         ?? sc.totalAssets         ?? null;
        result.sources.push('screener');
      }

      result.exchange = result.exchange || 'NSE';
      if (!result.companyName) result.companyName = symbol;
      result.name = result.companyName;
      if (result.promoterHolding != null || result.fiiHolding != null) {
        const pub = Math.max(0, +(100 - (result.promoterHolding||0) - (result.fiiHolding||0) - (result.diiHolding||0)).toFixed(1));
        result.ownership = {
          promoter: result.promoterHolding ?? null,
          fii:      result.fiiHolding      ?? null,
          dii:      result.diiHolding      ?? null,
          public:   pub,
          pledge:   result.promoterPledge  ?? null,
        };
      }

      if (result.sources.length > 0 && (result.pe != null || result.roe != null)) {
        redisSet(cacheKey, result, 4 * 60 * 60);
      }
      return res.status(200).json(result);
    }

    // ── FA Narrative ───────────────────────────────────────────────────────────
    if (action === 'fa_narrative') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbol, faData } = req.body ?? {};
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
      const d = faData || {};

      const cacheKey = `fa:narrative:${symbol}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.generatedAt) {
        const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
        if (ageMs < 4 * 60 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const SYSTEM = `You are a fundamental analyst at a top-tier Indian institutional fund. Write precise, jargon-light analysis. Every sentence must contain a specific data point. Never pad. Never make up numbers.`;
      const buildPrompt = (sym, d) => `Analyze ${sym} (${d.companyName || d.name || sym}), sector: ${d.sector || 'Unknown'}.
Key metrics: PE ${d.pe ?? 'N/A'} | PB ${d.pb ?? 'N/A'} | ROE ${d.roe?.toFixed(1) ?? 'N/A'}% | ROCE ${d.roce?.toFixed(1) ?? 'N/A'}% | Net Margin ${d.netMargin?.toFixed(1) ?? 'N/A'}%
Rev CAGR 3yr: ${d.revenueCagr3yr?.toFixed(1) ?? 'N/A'}% | EPS CAGR: ${d.epsCagr3yr?.toFixed(1) ?? 'N/A'}% | D/E: ${d.debtEquity?.toFixed(2) ?? 'N/A'} | Promoter: ${d.promoterHolding?.toFixed(1) ?? 'N/A'}% | Pledge: ${d.promoterPledge?.toFixed(1) ?? 'N/A'}%
Return ONLY raw JSON: {"summary":"<1 para>","bullCase":["<point>","<point>","<point>"],"bearCase":["<point>","<point>","<point>"],"watchQuestion":"<1 sentence>","management":"<1 sentence>"}`;

      let narrative;
      const provider = LLM_PROVIDER;
      if (provider === 'gemini' || !GROQ_API_KEY) {
        if (!GOOGLE_API_KEY) throw new Error('No LLM API key configured');
        const model = GEMINI_MODEL;
        const prompt = SYSTEM + '\n\n' + buildPrompt(symbol, d);
        const r = await fetchT(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' } }) },
          9000
        );
        if (!r.ok) throw new Error(`Gemini ${r.status}`);
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        narrative = JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());
      } else {
        const { default: Groq } = await import('groq-sdk');
        const client = new Groq({ apiKey: GROQ_API_KEY });
        const msg = await client.chat.completions.create({
          model: GROQ_MODEL, max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: buildPrompt(symbol, d) },
          ],
        });
        narrative = JSON.parse(msg.choices[0].message.content.trim());
      }

      const result2 = { ...narrative, symbol, generatedAt: new Date().toISOString() };
      redisSet(cacheKey, result2, 4 * 60 * 60);
      return res.status(200).json(result2);
    }

    if (action === 'version') {
      return res.status(200).json({ version: BUILD_TIME, buildTime: BUILD_TIME });
    }

    if (action === 'technical_full') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      const timeframe = url.searchParams.get('timeframe') || 'daily';
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
      const enctoken = req.headers['x-kite-enctoken'] || '';
      if (!enctoken) { res.status(401).json({ error: 'X-Kite-Enctoken header required' }); return; }
      const cacheKey = `ta:${symbol}:${timeframe}`;
      const cached = await redisGet(cacheKey);
      if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < 15 * 60 * 1000) {
        return res.status(200).json({ ...cached, _cached: true });
      }
      const intervalMap = { daily: 'day', weekly: 'week', monthly: 'month' };
      const countMap = { daily: 200, weekly: 104, monthly: 60 };
      const kiteInterval = intervalMap[timeframe] || 'day';
      const count = countMap[timeframe] || 200;
      const [candles, niftyCandles] = await Promise.allSettled([
        fetchKiteHistory(symbol, kiteInterval, count, enctoken),
        fetchKiteHistory('NIFTY 50', kiteInterval, count, enctoken).catch(() => []),
      ]);
      const stockCandles = candles.status === 'fulfilled' ? candles.value : [];
      const nifty = niftyCandles.status === 'fulfilled' ? niftyCandles.value : [];
      if (!stockCandles.length) return res.status(502).json({ error: `No candle data for ${symbol}` });
      const taResult = { symbol, timeframe, candles: stockCandles, niftyCandles: nifty, fetchedAt: new Date().toISOString(), count: stockCandles.length };
      redisSet(cacheKey, taResult, 15 * 60).catch(() => {});
      return res.status(200).json(taResult);
    }

    res.status(400).json({ error: 'action must be symbol | fundamental | fa_narrative | version | technical_full' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
