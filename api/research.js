/**
 * Research domain router
 * GET  /api/research?action=quotes  — NSE India market data proxy (?symbols=NSE:X,...)
 * POST /api/research?action=symbol  — symbol search (body: { query })
 * POST /api/research?action=alpha   — alpha scorer proxy (body: { ticker })
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { UNIVERSE, runTriggerCycle } from '../dashboard/lib/trigger.js';
import { redisGet, redisSet } from '../dashboard/lib/redis.js';
import { getHistory } from '../dashboard/lib/kite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nseSymbols = JSON.parse(readFileSync(join(__dirname, '../modules/alpha-scorer/nse_symbols.json'), 'utf8'));

// ── Symbol search ─────────────────────────────────────────────────────────────
function scoreMatch(query, target) {
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  let matches = 0;
  for (const ch of q) if (t.includes(ch)) matches++;
  return Math.round((matches / q.length) * 50);
}

// ── NSE quotes proxy ──────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const NSE_HDR = { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.nseindia.com/' };

let _nseSess = null, _nseSessAt = 0;
async function getNSESession() {
  if (_nseSess && Date.now() - _nseSessAt < 8 * 60 * 1000) return _nseSess;
  const r = await fetch('https://www.nseindia.com', { headers: NSE_HDR, redirect: 'follow' });
  const raw = r.headers.getSetCookie?.() ?? [];
  _nseSess = raw.map(c => c.split(';')[0]).join('; ');
  _nseSessAt = Date.now();
  return _nseSess;
}

const INDEX_MAP = {
  'NSE:NIFTY 50': 'NIFTY 50', 'NSE:NIFTY BANK': 'NIFTY BANK',
  'NSE:NIFTY MIDCAP 50': 'NIFTY MIDCAP 50', 'NSE:INDIA VIX': 'INDIA VIX',
};
const isIndex  = sym => !!INDEX_MAP[sym];
const stockSym = sym => sym.split(':')[1];

async function fetchNSEQuotes(symbols) {
  const cookie = await getNSESession();
  const hdrs   = { ...NSE_HDR, Cookie: cookie };
  const data   = {};

  const indexSyms = symbols.filter(isIndex);
  if (indexSyms.length) {
    const r = await fetch('https://www.nseindia.com/api/allIndices', { headers: hdrs });
    if (r.ok) {
      const json = await r.json();
      const rows = json.data || [];
      indexSyms.forEach(sym => {
        const row = rows.find(r => r.indexSymbol === INDEX_MAP[sym]);
        if (!row) return;
        const ltp = row.last ?? row.current ?? 0;
        const prev = row.previousClose ?? 0;
        const chg  = ltp - prev;
        data[sym] = { last_price: ltp, net_change: chg,
          change_pct: prev ? chg / prev * 100 : (row.percentChange ?? 0),
          volume: row.turnover || 0,
          ohlc: { open: row.open ?? ltp, high: row.high ?? ltp, low: row.low ?? ltp, close: prev } };
      });
    }
  }

  if (symbols.includes('NSE:GIFT NIFTY')) {
    try {
      const r = await fetch('https://www.nseindia.com/api/giFtNifty', { headers: hdrs });
      if (r.ok) {
        const json = await r.json();
        const row  = (json.data || [])[0];
        if (row) {
          const ltp  = row.lastPrice ?? row.last ?? 0;
          const prev = row.previousClose ?? row.prevClose ?? 0;
          const chg  = ltp - prev;
          data['NSE:GIFT NIFTY'] = { last_price: ltp, net_change: chg,
            change_pct: prev ? chg / prev * 100 : 0,
            volume: row.totalTradedVolume || row.volume || 0,
            expiry: row.expiryDate || row.expiry || '',
            ohlc: { open: row.open ?? ltp, high: row.high ?? ltp, low: row.low ?? ltp, close: prev } };
        }
      }
    } catch (_) {}
  }

  const stockSyms = symbols.filter(s => !isIndex(s) && s !== 'NSE:GIFT NIFTY');
  await Promise.all(stockSyms.map(async sym => {
    try {
      const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(stockSym(sym))}`, { headers: hdrs });
      if (!r.ok) return;
      const json = await r.json();
      const p = json.priceInfo;
      if (!p) return;
      data[sym] = { last_price: p.lastPrice, net_change: p.change, change_pct: p.pChange,
        volume: json.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0,
        ohlc: { open: p.open, high: p.intraDayHighLow?.max, low: p.intraDayHighLow?.min, close: p.previousClose } };
    } catch (_) {}
  }));

  return data;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  try {
    // ── NSE quotes ──────────────────────────────────────────────────────────────
    if (action === 'quotes') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const symbolsRaw = url.searchParams.get('symbols') || '';
      const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);
      if (!symbols.length) { res.status(400).json({ error: 'symbols required' }); return; }
      const data = await fetchNSEQuotes(symbols);
      return res.status(200).json({ data, source: 'nse' });
    }

    // ── Symbol search ───────────────────────────────────────────────────────────
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

    // ── Alpha scorer ────────────────────────────────────────────────────────────
    if (action === 'alpha') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const scorerUrl = process.env.ALPHA_SCORER_URL;
      if (!scorerUrl) {
        res.status(503).json({ error: 'Alpha scorer not configured. Set ALPHA_SCORER_URL env var.' }); return;
      }
      const { ticker } = req.body ?? {};
      if (!ticker) { res.status(400).json({ error: 'ticker required' }); return; }
      const upstream = await fetch(`${scorerUrl}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    // ── Trigger Engine ──────────────────────────────────────────────────────────
    // GET /api/research?action=triggers&vix=normal
    // Fetches live OHLCV for the NIFTY 50 universe, runs one trigger cycle,
    // returns structured movement events — no scores, no brain context.
    if (action === 'triggers') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const vixState = url.searchParams.get('vix') || 'unknown';

      // Ensure NSE session cookie is fresh (reuses existing session cache)
      const cookie = await getNSESession();
      const hdrs   = { ...NSE_HDR, Cookie: cookie };

      // Batch-fetch all UNIVERSE quotes in parallel
      const quoteData = {};
      await Promise.allSettled(UNIVERSE.map(async symbol => {
        try {
          const r = await fetch(
            `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
            { headers: hdrs },
          );
          if (!r.ok) return;
          const json = await r.json();
          const p = json.priceInfo;
          if (!p) return;
          quoteData[symbol] = {
            last_price: p.lastPrice,
            change_pct: p.pChange,
            net_change:  p.change,
            volume:      json.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0,
            ohlc: {
              open:  p.open,
              high:  p.intraDayHighLow?.max,
              low:   p.intraDayHighLow?.min,
              close: p.previousClose,
            },
          };
        } catch { /* data gap for this symbol — trigger.js will skip it */ }
      }));

      const result = await runTriggerCycle(quoteData, vixState, cookie);
      return res.status(200).json(result);
    }

    // ── Fundamental Data Proxy ──────────────────────────────────────────────────
    // GET /api/research?action=fundamental&symbol=RELIANCE
    if (action === 'fundamental') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }

      const cacheKey = `fa:${symbol}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.lastUpdated) {
        const ageMs = Date.now() - new Date(cached.lastUpdated).getTime();
        if (ageMs < 4 * 60 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
      const fetchWithTimeout = (url, opts, ms=8000) => Promise.race([fetch(url, opts), timeout(ms)]);

      const result = { symbol, sources: [], lastUpdated: new Date().toISOString() };

      // --- Yahoo Finance ---
      try {
        const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,earningsTrend';
        const yUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=${modules}`;
        const yRes = await fetchWithTimeout(yUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (yRes.ok) {
          const yData = await yRes.json();
          const s = yData?.quoteSummary?.result?.[0];
          if (s) {
            const fd = s.financialData || {};
            const ks = s.defaultKeyStatistics || {};
            const sd = s.summaryDetail || {};
            const income = s.incomeStatementHistory?.incomeStatementHistory || [];
            const balance = s.balanceSheetHistory?.balanceSheetStatements || [];
            const cashflow = s.cashflowStatementHistory?.cashflowStatements || [];

            result.companyName = ks.shortName || symbol;
            result.pe = sd.trailingPE?.raw ?? null;
            result.forwardPE = sd.forwardPE?.raw ?? null;
            result.pb = ks.priceToBook?.raw ?? null;
            result.evEbitda = ks.enterpriseToEbitda?.raw ?? null;
            result.roe = fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : null;
            result.netMargin = fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : null;
            result.operatingMargin = fd.operatingMargins?.raw != null ? fd.operatingMargins.raw * 100 : null;
            result.grossMargin = fd.grossMargins?.raw != null ? fd.grossMargins.raw * 100 : null;
            result.revenueGrowth = fd.revenueGrowth?.raw != null ? fd.revenueGrowth.raw * 100 : null;
            result.earningsGrowth = fd.earningsGrowth?.raw != null ? fd.earningsGrowth.raw * 100 : null;
            result.debtEquity = fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : null;
            result.currentRatio = fd.currentRatio?.raw ?? null;
            result.quickRatio = fd.quickRatio?.raw ?? null;
            result.operatingCashflow = fd.operatingCashflow?.raw ?? null;
            result.freeCashflow = fd.freeCashflow?.raw ?? null;
            result.dividendYield = sd.dividendYield?.raw != null ? sd.dividendYield.raw * 100 : null;
            result.beta = ks.beta?.raw ?? null;
            result.high52w = sd.fiftyTwoWeekHigh?.raw ?? null;
            result.low52w = sd.fiftyTwoWeekLow?.raw ?? null;
            result.marketCap = sd.marketCap?.raw ?? null;
            result.sharesOutstanding = ks.sharesOutstanding?.raw ?? null;
            // FCF positive years from last 3 cashflow statements
            const fcfYears = cashflow.slice(0, 3).filter(c => (c.totalCashFromOperatingActivities?.raw || 0) > (c.capitalExpenditures?.raw || 0) * -1).length;
            result.fcfPositiveYears3yr = fcfYears;
            // Revenue CAGR 3yr from income statements
            if (income.length >= 4) {
              const revNow = income[0]?.totalRevenue?.raw;
              const rev3yr = income[3]?.totalRevenue?.raw;
              if (revNow && rev3yr && rev3yr > 0) result.revenueCagr3yr = +((Math.pow(revNow/rev3yr, 1/3)-1)*100).toFixed(1);
            }
            if (income.length >= 4) {
              const epsNow = income[0]?.dilutedEPS?.raw ?? income[0]?.basicEPS?.raw;
              const eps3yr = income[3]?.dilutedEPS?.raw ?? income[3]?.basicEPS?.raw;
              if (epsNow && eps3yr && eps3yr > 0) result.epsCagr3yr = +((Math.pow(Math.abs(epsNow/eps3yr), 1/3)-1)*100).toFixed(1);
            }
            result.sources.push('yahoo');
          }
        }
      } catch (e) { /* Yahoo failed — continue */ }

      // --- NSE shareholding ---
      try {
        const nseHdrs = { 'User-Agent': UA, 'Referer': 'https://www.nseindia.com/', 'Accept': 'application/json' };
        const shRes = await fetchWithTimeout(
          `https://www.nseindia.com/api/corporate-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&series=EQ`,
          { headers: nseHdrs }
        );
        if (shRes.ok) {
          const shData = await shRes.json();
          const rows = shData?.data || [];
          if (rows.length > 0) {
            const latest = rows[0];
            result.promoterHolding = latest?.promoterAndPromoterGroup ?? null;
            result.fiiHolding = latest?.foreignInstitutionalInvestors ?? null;
            result.diiHolding = latest?.domesticInstitutionalInvestors ?? null;
            result.promoterPledge = latest?.promoterPledge ?? null;
            // Trend: delta over available quarters
            if (rows.length >= 4) {
              const old = rows[3]?.promoterAndPromoterGroup ?? null;
              const now = rows[0]?.promoterAndPromoterGroup ?? null;
              result.promoterTrendDelta4q = (now != null && old != null) ? +(now - old).toFixed(2) : null;
            }
            result.sources.push('nse_shareholding');
          }
        }
      } catch (e) { /* NSE failed — continue */ }

      // Fallback defaults for missing fields
      result.exchange = result.exchange || 'NSE';
      if (!result.companyName) result.companyName = symbol;

      // Cache if we got at least one source
      if (result.sources.length > 0) {
        redisSet(cacheKey, result, 4 * 60 * 60).catch(() => {});
      }

      return res.status(200).json(result);
    }

    // ── Technical Full Data ──────────────────────────────────────────────────────
    // GET /api/research?action=technical_full&symbol=RELIANCE&timeframe=daily
    if (action === 'technical_full') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      const timeframe = url.searchParams.get('timeframe') || 'daily';
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }

      const enctoken = req.headers['x-kite-enctoken'] || '';
      if (!enctoken) { res.status(401).json({ error: 'X-Kite-Enctoken header required' }); return; }

      const cacheKey = `ta:${symbol}:${timeframe}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.fetchedAt) {
        const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
        if (ageMs < 15 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const intervalMap = { daily: 'day', weekly: 'week', monthly: 'month' };
      const kiteInterval = intervalMap[timeframe] || 'day';
      const countMap = { daily: 200, weekly: 104, monthly: 60 };
      const count = countMap[timeframe] || 200;

      // Fetch stock + Nifty50 in parallel
      const [candles, niftyCandles] = await Promise.allSettled([
        getHistory(symbol, kiteInterval, count, enctoken),
        getHistory('NIFTY 50', kiteInterval, count, enctoken).catch(() => []),
      ]);

      const stockCandles = candles.status === 'fulfilled' ? candles.value : [];
      const nifty = niftyCandles.status === 'fulfilled' ? niftyCandles.value : [];

      if (!stockCandles.length) {
        return res.status(502).json({ error: `No candle data for ${symbol}` });
      }

      const result = {
        symbol,
        timeframe,
        candles: stockCandles,
        niftyCandles: nifty,
        fetchedAt: new Date().toISOString(),
        count: stockCandles.length,
      };

      redisSet(cacheKey, result, 15 * 60).catch(() => {});
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'action must be quotes | symbol | alpha | triggers | fundamental | technical_full' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
