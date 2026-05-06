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
      const [yahooRes, ttRes, nseQRes, nseShRes] = await Promise.allSettled([
        // Yahoo Finance
        (async () => {
          const { crumb, cookie } = await getYahooCrumb();
          const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,incomeStatementHistoryQuarterly,balanceSheetHistory,cashflowStatementHistory,cashflowStatementHistoryQuarterly';
          const yUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
          const r = await fetchT(yUrl, { headers: { 'User-Agent': UA, 'Cookie': cookie } }, 6000);
          if (!r.ok) throw new Error(`yahoo ${r.status}`);
          return r.json();
        })(),
        // Tickertape
        (async () => {
          let r = await fetchT(`https://api.tickertape.in/stocks/info/${symbol}`, { headers: { 'User-Agent': UA } }, 5000);
          if (r.ok) { const j = await r.json(); if (j.success !== false && j?.data?.ratios?.pe != null) return j; }
          const slugId = TT_SLUGS[symbol];
          if (slugId) {
            r = await fetchT(`https://api.tickertape.in/stocks/info/${slugId}`, { headers: { 'User-Agent': UA } }, 5000);
            if (r.ok) { const j = await r.json(); if (j.success !== false) return j; }
          }
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
        if (r.pe != null || r.roe != null) {
          result.companyName   = result.companyName   || info.name  || symbol;
          result.sector        = result.sector        || gic.industry || info.sector || null;
          result.pe            = result.pe            ?? r.pe       ?? null;
          result.pb            = result.pb            ?? r.pb       ?? null;
          result.roe           = result.roe           ?? r.roe      ?? null;
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
      if (!symbol || !faData) { res.status(400).json({ error: 'symbol and faData required' }); return; }

      const cacheKey = `fa:narrative:${symbol}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.generatedAt) {
        const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
        if (ageMs < 4 * 60 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const SYSTEM = `You are a fundamental analyst at a top-tier Indian institutional fund. Write precise, jargon-light analysis. Every sentence must contain a specific data point. Never pad. Never make up numbers.`;
      const buildPrompt = (sym, d) => `Analyze ${sym} (${d.companyName || sym}), sector: ${d.sector || 'Unknown'}.
Key metrics: PE ${d.pe ?? 'N/A'} | PB ${d.pb ?? 'N/A'} | ROE ${d.roe?.toFixed(1) ?? 'N/A'}% | ROCE ${d.roce?.toFixed(1) ?? 'N/A'}% | Net Margin ${d.netMargin?.toFixed(1) ?? 'N/A'}%
Rev CAGR 3yr: ${d.revenueCagr3yr?.toFixed(1) ?? 'N/A'}% | EPS CAGR: ${d.epsCagr3yr?.toFixed(1) ?? 'N/A'}% | D/E: ${d.debtEquity?.toFixed(2) ?? 'N/A'} | Promoter: ${d.promoterHolding?.toFixed(1) ?? 'N/A'}% | Pledge: ${d.promoterPledge?.toFixed(1) ?? 'N/A'}%
Return ONLY raw JSON: {"summary":"<1 para>","bullCase":["<point>","<point>","<point>"],"bearCase":["<point>","<point>","<point>"],"watchQuestion":"<1 sentence>","management":"<1 sentence>"}`;

      let narrative;
      const provider = LLM_PROVIDER;
      if (provider === 'gemini' || !GROQ_API_KEY) {
        if (!GOOGLE_API_KEY) throw new Error('No LLM API key configured');
        const model = GEMINI_MODEL;
        const prompt = SYSTEM + '\n\n' + buildPrompt(symbol, faData);
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
            { role: 'user', content: buildPrompt(symbol, faData) },
          ],
        });
        narrative = JSON.parse(msg.choices[0].message.content.trim());
      }

      const result2 = { ...narrative, symbol, generatedAt: new Date().toISOString() };
      redisSet(cacheKey, result2, 4 * 60 * 60);
      return res.status(200).json(result2);
    }

    res.status(400).json({ error: 'action must be symbol | fundamental | fa_narrative' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
