/**
 * Intelligence + Research domain router
 * Merged from api/research.js to keep function count within Vercel Hobby limits.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBrainResult }  from '../dashboard/lib/brain.js';
// plan.js uses Node 'https' module — lazy-imported inside the handler to avoid
// Vercel ncc bundling conflict that silently drops the function at deploy time.
import { analyzeStock, analyzeEventStocks, analyzeEventScenario } from '../dashboard/lib/llm.js';
import { getBrainCache, setBrainCache } from '../dashboard/lib/supabase.js';
import { recordOutcomes, refreshSourceStats, fetchCalibration } from '../dashboard/lib/outcomes.js';
import { runIntersection }    from '../dashboard/lib/intersect.js';
import { generateTradePlans } from '../dashboard/lib/tradeplan.js';
import { allocate, closeTradeAlloc, getSession, resetSession } from '../dashboard/lib/allocate.js';
import { getEventPlays, getActiveEvent, buildQuantContext } from '../dashboard/lib/eventplays.js';
import { redisGet, redisSet } from '../dashboard/lib/redis.js';
import { config as appConfig } from '../dashboard/config.js';
import { UNIVERSE, runTriggerCycle } from '../dashboard/lib/trigger.js';

// ── Research: module-level helpers (merged from api/research.js) ──────────────

const __dirname_r = dirname(fileURLToPath(import.meta.url));
const nseSymbols = JSON.parse(readFileSync(join(__dirname_r, '../modules/alpha-scorer/nse_symbols.json'), 'utf8'));

function scoreMatch(query, target) {
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  let matches = 0;
  for (const ch of q) if (t.includes(ch)) matches++;
  return Math.round((matches / q.length) * 50);
}

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

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Kite-Enctoken');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  try {
    // ── Market Brain ────────────────────────────────────────────────────────
    if (action === 'brain') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const force = url.searchParams.get('bust') || url.searchParams.get('force');

      // Check Supabase cache unless force-refresh
      if (!force) {
        try {
          const cached = await getBrainCache();
          if (cached) {
            const ageMs = Date.now() - new Date(cached.updated_at).getTime();
            if (ageMs < CACHE_TTL_MS) {
              return res.status(200).json({ ...cached.data, cached: true, cache_age_min: Math.floor(ageMs / 60000) });
            }
          }
        } catch { /* cache miss — fall through to fresh fetch */ }
      }

      const result = await getBrainResult(true);
      // Save to Supabase cache (non-blocking)
      setBrainCache(result).catch(() => {});
      return res.status(200).json({ ...result, cached: false, cache_age_min: 0 });
    }

    // ── Trade Plan ──────────────────────────────────────────────────────────
    if (action === 'plan') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbol, ltp } = req.body ?? {};
      if (!symbol || !ltp) { res.status(400).json({ error: 'symbol and ltp required' }); return; }
      const { getTradePlan } = await import('../dashboard/lib/plan.js');
      const plan = await getTradePlan(req.body);
      return res.status(200).json(plan);
    }

    // ── Individual Stock Analysis ────────────────────────────────────────────
    if (action === 'analyze') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { company } = req.body ?? {};
      if (!company) { res.status(400).json({ error: 'company required' }); return; }
      const result = await analyzeStock(company);
      return res.status(200).json(result);
    }

    // ── Record outcomes (called by cron or dashboard with live LTP map) ────────
    // POST /api/intel?action=record_outcome
    // Body: { ltpMap: { SYMBOL: ltp } }  — current prices for pending picks.
    // If ltpMap is empty or omitted, auto-fetches LTP from NSE (cron mode).
    if (action === 'record_outcome') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { ltpMap = {} } = req.body ?? {};
      const hasClientLtp = Object.keys(ltpMap).length > 0;

      let ltpFetcher;
      if (hasClientLtp) {
        // Dashboard-supplied prices — use as-is
        ltpFetcher = async symbols =>
          Object.fromEntries(symbols.filter(s => ltpMap[s]).map(s => [s, ltpMap[s]]));
      } else {
        // Cron / no-arg mode — self-fetch from NSE for all pending symbols.
        // Prefix plain symbols with 'NSE:' so fetchNSEQuotes stockSym() works,
        // then strip the prefix back out for the returned map.
        ltpFetcher = async symbols => {
          try {
            const prefixed  = symbols.map(s => s.includes(':') ? s : `NSE:${s}`);
            const nseData   = await fetchNSEQuotes(prefixed);
            const result    = {};
            for (const [key, d] of Object.entries(nseData)) {
              const sym = key.includes(':') ? key.split(':')[1] : key;
              if (sym && d?.last_price != null) result[sym] = d.last_price;
            }
            return result;
          } catch { return {}; }
        };
      }

      await recordOutcomes(ltpFetcher);
      await refreshSourceStats();
      return res.status(200).json({ ok: true, mode: hasClientLtp ? 'client_ltp' : 'nse_auto' });
    }

    // ── Calibration stats (read current source performance stats) ───────────
    // GET /api/intel?action=calibration_stats
    if (action === 'calibration_stats') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const map = await fetchCalibration();
      const stats = Object.fromEntries(map);
      return res.status(200).json({ stats, segment_count: map.size });
    }

    // ── Intersection Engine ──────────────────────────────────────────────────
    // POST /api/intel?action=intersect
    // Body: {
    //   triggers: TriggerEvent[],   — Step 2 output (required)
    //   picks:    BrainPick[],      — Step 1 picks (optional; falls back to Supabase cache)
    // }
    // Returns top actionable opportunities where Step 1 intelligence and Step 2
    // real-time movement intersect and agree.
    if (action === 'intersect') {
      if (req.method !== 'POST') { res.status(405).end(); return; }

      const { triggers, picks: bodyPicks } = req.body ?? {};
      if (!Array.isArray(triggers) || triggers.length === 0) {
        return res.status(400).json({ error: 'triggers[] required — pass Step 2 trigger events in body' });
      }

      // Use caller-supplied picks, or pull from Supabase brain cache
      let brainPicks = bodyPicks;
      if (!Array.isArray(brainPicks) || brainPicks.length === 0) {
        try {
          const cached = await getBrainCache();
          brainPicks = cached?.data?.picks ?? [];
        } catch {
          brainPicks = [];
        }
      }

      if (!brainPicks.length) {
        return res.status(503).json({
          error: 'No brain picks available. Run GET /api/intel?action=brain first to populate cache.',
        });
      }

      const result = runIntersection(brainPicks, triggers);
      return res.status(200).json(result);
    }

    // ── Trade Plan Engine (Step 4) ───────────────────────────────────────────
    // POST /api/intel?action=trade_plan
    // Body: { opportunities: Opportunity[] }  ← Step 3 intersect output
    // Returns fully defined trade plans with entry, SL, targets, sizing, and
    // logs each plan to the Supabase trades journal automatically.
    if (action === 'trade_plan') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { opportunities } = req.body ?? {};
      if (!Array.isArray(opportunities) || opportunities.length === 0) {
        return res.status(400).json({ error: 'opportunities[] required — pass Step 3 intersect output in body' });
      }
      const result = await generateTradePlans(opportunities);
      return res.status(200).json(result);
    }

    // ── Allocator — run one allocation cycle ────────────────────────────────
    // POST /api/intel?action=allocate
    // Body: { opportunities[], capital, maxRiskPct, targetRMultiple, maxTrades,
    //         minEV?, minScore?, regime?, date? }
    if (action === 'allocate') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { opportunities, capital, maxRiskPct, targetRMultiple, maxTrades } = req.body ?? {};
      if (!Array.isArray(opportunities) || !capital || !maxRiskPct || !targetRMultiple || !maxTrades) {
        return res.status(400).json({ error: 'opportunities[], capital, maxRiskPct, targetRMultiple, maxTrades required' });
      }
      const result = await allocate(req.body);
      return res.status(200).json(result);
    }

    // ── Allocator — close a trade and recycle capital ────────────────────────
    // POST /api/intel?action=allocate_update
    // Body: { tradeId, exitPrice, exitReason, date? }
    if (action === 'allocate_update') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { tradeId, exitPrice, exitReason } = req.body ?? {};
      if (!tradeId || exitPrice == null || !exitReason) {
        return res.status(400).json({ error: 'tradeId, exitPrice, exitReason required' });
      }
      const result = await closeTradeAlloc(req.body);
      return res.status(200).json(result);
    }

    // ── Allocator — read current session ─────────────────────────────────────
    // GET /api/intel?action=allocate_session[&date=YYYY-MM-DD]
    if (action === 'allocate_session') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const date = url.searchParams.get('date') || undefined;
      const session = await getSession(date);
      if (!session) return res.status(404).json({ error: 'no session found for date' });
      return res.status(200).json(session);
    }

    // ── Allocator — reset session ─────────────────────────────────────────────
    // POST /api/intel?action=allocate_reset[&date=YYYY-MM-DD]
    if (action === 'allocate_reset') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const date = url.searchParams.get('date') || undefined;
      const result = await resetSession(date);
      return res.status(200).json(result);
    }

    // ── Event Plays ───────────────────────────────────────────────────────────
    // GET /api/intel?action=event_plays[&scenario=nda_strong|nda_weak|hung_parliament]
    if (action === 'event_plays') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const scenario = url.searchParams.get('scenario') || 'nda_strong';
      const activeEvent = getActiveEvent();

      // Reuse brain cache — event plays are brain-boosted, not brain-blocked
      let brain = null;
      try {
        const cached = await getBrainCache();
        if (cached) {
          const ageMs = Date.now() - new Date(cached.updated_at).getTime();
          if (ageMs < CACHE_TTL_MS) brain = cached.data;
        }
      } catch { /* no cache — brain boost simply won't fire */ }

      const result = getEventPlays(brain, scenario);
      return res.status(200).json({
        ...result,
        active_event: activeEvent,
        brain_context: brain ? {
          sentiment: brain.market_sentiment,
          regime: brain.regime,
          vix_state: brain.vix_state,
          gift_nifty_bias: brain.gift_nifty_bias,
          cached: true
        } : null
      });
    }

    // ── Event Stock Analysis (runtime LLM scoring for event plays) ──────────────
    // POST /api/intel?action=event_stock_analysis
    // Body: { symbols: ['HAL','BEL',...], event_context: '...', scenario_label: '...' }
    if (action === 'event_stock_analysis') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbols, event_context, scenario_label } = req.body ?? {};
      if (!symbols?.length || !event_context) {
        return res.status(400).json({ error: 'symbols[] and event_context required' });
      }
      const scores = await analyzeEventStocks(symbols, event_context, scenario_label || '');
      return res.status(200).json({ scores, analyzed_at: new Date().toISOString() });
    }

    // ── Live Event Scenario — quant pipeline + LLM synthesis ────────────────────
    // POST /api/intel?action=event_live_intel
    // Body: { event_context, scenario_label, event_type? }
    if (action === 'event_live_intel') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { event_context, scenario_label, event_type } = req.body ?? {};
      if (!event_context) return res.status(400).json({ error: 'event_context required' });

      // Step 1: get brain cache for regime context
      let brainContext = null;
      try {
        const cached = await getBrainCache();
        if (cached) {
          const ageMs = Date.now() - new Date(cached.updated_at).getTime();
          if (ageMs < CACHE_TTL_MS) {
            brainContext = {
              vix_state:      cached.data?.vix_state,
              sentiment:      cached.data?.market_sentiment,
              regime:         cached.data?.regime,
              gift_nifty_bias: cached.data?.gift_nifty_bias
            };
          }
        }
      } catch { /* no cache — use neutral regime */ }

      // Step 2: build quantitative context (sector EVs, probabilities, regime adjustment)
      const resolvedEventType = event_type || getActiveEvent()?.type || 'assembly_election_exit_poll';
      const quantContext = buildQuantContext(resolvedEventType, brainContext);

      // Step 3: LLM synthesis — takes structured quant context, adds narrative + stock picks
      const today = new Date().toISOString().slice(0, 10);
      const result = await analyzeEventScenario(event_context, scenario_label || '', quantContext, today);

      return res.status(200).json({
        ...result,
        quant_context: quantContext,
        generated_at: new Date().toISOString(),
        source: 'quant_llm_pipeline'
      });
    }

    // ── FA Narrative (LLM-generated fundamental analysis narrative) ─────────────
    // POST /api/intel?action=fa_narrative
    // Body: { symbol, faData: { companyName, sector, pe, pb, roe, roce, netMargin,
    //         revenueCagr3yr, epsCagr3yr, debtEquity, promoterHolding, promoterPledge,
    //         revenueGrowth, earningsGrowth, marketCap, dividendYield, beta,
    //         high52w, low52w, freeCashflow, currentRatio } }
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

      const FA_NARRATIVE_SYSTEM = `You are a fundamental analyst at a top-tier Indian institutional fund. You write precise, jargon-light analysis. You never pad. Every sentence must contain a specific data point or observable fact. You do not assign buy/sell ratings. You never make up numbers not given to you.`;

      const FA_NARRATIVE_PROMPT = (sym, d) => `Analyze ${sym} (${d.companyName || sym}), sector: ${d.sector || 'Unknown'}.

Key metrics:
- Market Cap: ${d.marketCap ? '₹' + (d.marketCap/1e7).toFixed(0) + ' Cr' : 'N/A'}
- PE: ${d.pe ?? 'N/A'} | Forward PE: ${d.forwardPE ?? 'N/A'} | PB: ${d.pb ?? 'N/A'}
- ROE: ${d.roe?.toFixed(1) ?? 'N/A'}% | ROCE: ${d.roce?.toFixed(1) ?? 'N/A'}% | Net Margin: ${d.netMargin?.toFixed(1) ?? 'N/A'}%
- Revenue CAGR 3yr: ${d.revenueCagr3yr?.toFixed(1) ?? 'N/A'}% | EPS CAGR 3yr: ${d.epsCagr3yr?.toFixed(1) ?? 'N/A'}%
- D/E: ${d.debtEquity?.toFixed(2) ?? 'N/A'} | Current Ratio: ${d.currentRatio?.toFixed(2) ?? 'N/A'}
- Promoter Holding: ${d.promoterHolding?.toFixed(1) ?? 'N/A'}% | Pledge: ${d.promoterPledge?.toFixed(1) ?? 'N/A'}%
- Dividend Yield: ${d.dividendYield?.toFixed(2) ?? 'N/A'}% | Beta: ${d.beta?.toFixed(2) ?? 'N/A'}
- 52W Range: ₹${d.low52w ?? 'N/A'} – ₹${d.high52w ?? 'N/A'}

Return ONLY raw JSON (no markdown):
{
  "business_summary": "<one paragraph: what this company does, its competitive moat if any, and dominant revenue driver — cite specific % or ₹ figures from the data above>",
  "bull_case": ["<specific data-backed point>", "<specific point>", "<specific point>"],
  "bear_case": ["<specific risk tied to data>", "<specific risk>", "<specific risk>"],
  "watch_next_quarter": "<one sentence: the single most important metric to monitor>",
  "management_quality": "<one sentence: observation on promoter holding trend, pledge level, or capital allocation based on the data provided>"
}`;

      async function callGroq(sym, d) {
        const { default: Groq } = await import('groq-sdk');
        const client = new Groq({ apiKey: appConfig.llm.groqApiKey });
        const msg = await client.chat.completions.create({
          model: appConfig.llm.groqModel,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: FA_NARRATIVE_SYSTEM },
            { role: 'user', content: FA_NARRATIVE_PROMPT(sym, d) }
          ],
        });
        return JSON.parse(msg.choices[0].message.content.trim());
      }

      async function callGemini(sym, d) {
        const apiKey = appConfig.llm.googleApiKey;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
        const model = appConfig.llm.geminiModel || 'gemini-2.0-flash';
        const prompt = FA_NARRATIVE_SYSTEM + '\n\n' + FA_NARRATIVE_PROMPT(sym, d);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' } }) }
        );
        if (!r.ok) throw new Error(`Gemini ${r.status}`);
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        return JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());
      }

      let narrative;
      try {
        const provider = appConfig.llm.provider;
        if (provider === 'gemini') {
          narrative = await callGemini(symbol, faData);
        } else {
          narrative = await callGroq(symbol, faData);
        }
      } catch (err) {
        const isRateLimit = err.message?.includes('429') || err.status === 429;
        if (isRateLimit && appConfig.llm.googleApiKey) {
          narrative = await callGemini(symbol, faData);
        } else {
          throw err;
        }
      }

      const result = { ...narrative, symbol, generatedAt: new Date().toISOString() };
      redisSet(cacheKey, result, 4 * 60 * 60).catch(() => {});
      return res.status(200).json(result);
    }

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
      if (!scorerUrl) { res.status(503).json({ error: 'Alpha scorer not configured.' }); return; }
      const { ticker } = req.body ?? {};
      if (!ticker) { res.status(400).json({ error: 'ticker required' }); return; }
      const upstream = await fetch(`${scorerUrl}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      return res.status(upstream.status).json(await upstream.json());
    }

    // ── Trigger Engine ──────────────────────────────────────────────────────────
    if (action === 'triggers') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const vixState = url.searchParams.get('vix') || 'unknown';
      const cookie = await getNSESession();
      const hdrs   = { ...NSE_HDR, Cookie: cookie };
      const quoteData = {};
      await Promise.allSettled(UNIVERSE.map(async symbol => {
        try {
          const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, { headers: hdrs });
          if (!r.ok) return;
          const json = await r.json();
          const p = json.priceInfo;
          if (!p) return;
          quoteData[symbol] = { last_price: p.lastPrice, change_pct: p.pChange, net_change: p.change,
            volume: json.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0,
            ohlc: { open: p.open, high: p.intraDayHighLow?.max, low: p.intraDayHighLow?.min, close: p.previousClose } };
        } catch { /* skip */ }
      }));

      // Item 7: Kite fallback when NSE coverage drops below 70%.
      // Uses enctoken from request header — lazy-imported to avoid Vercel ncc
      // bundling the Node https module at the top level.
      const nseCoverage = Object.keys(quoteData).length / UNIVERSE.length;
      let quoteSource = 'nse';
      const rawEnc = req.headers['x-kite-enctoken'] || '';
      const encForFallback = rawEnc ? decodeURIComponent(rawEnc) : '';
      if (nseCoverage < 0.70 && encForFallback) {
        try {
          const { getQuotes } = await import('../dashboard/lib/kite.js');
          const missing = UNIVERSE.filter(s => !quoteData[s]).map(s => `NSE:${s}`);
          if (missing.length) {
            const kiteData = await getQuotes(missing, encForFallback);
            for (const [key, d] of Object.entries(kiteData || {})) {
              const sym = key.split(':')[1];
              if (sym && d?.last_price != null && !quoteData[sym]) {
                quoteData[sym] = {
                  last_price: d.last_price,
                  change_pct: d.net_change && d.ohlc?.close
                    ? +(d.net_change / d.ohlc.close * 100).toFixed(2) : 0,
                  net_change: d.net_change || 0,
                  volume:     d.volume_traded || 0,
                  ohlc: { open: d.ohlc?.open, high: d.ohlc?.high, low: d.ohlc?.low, close: d.ohlc?.close },
                };
              }
            }
            quoteSource = nseCoverage < 0.10 ? 'kite_fallback' : 'mixed';
          }
        } catch { /* Kite fallback failed — proceed with partial NSE data */ }
      }

      const cycleResult = await runTriggerCycle(quoteData, vixState, cookie);

      // Item 5: Read persistent degrade_alert from Redis and surface in response.
      const degradeAlert = await redisGet('trig:degrade_alert').catch(() => null);

      return res.status(200).json({
        ...cycleResult,
        degraded:         !cycleResult.health?.healthy,
        degrade_reason:   cycleResult.health?.reason || null,
        persistent_alert: degradeAlert?.alerting ?? false,
        quote_source:     quoteSource,
        nse_coverage_pct: Math.round(nseCoverage * 100),
      });
    }

    // ── Fundamental Data Proxy ──────────────────────────────────────────────────
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

      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
      const fetchWithTimeout = (url, opts, ms=8000) => Promise.race([fetch(url, opts), timeout(ms)]);

      const result = { symbol, sources: [], lastUpdated: new Date().toISOString() };

      try {
        const { crumb, cookie } = await getYahooCrumb();
        const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,incomeStatementHistoryQuarterly,balanceSheetHistory,cashflowStatementHistory,cashflowStatementHistoryQuarterly,earningsTrend';
        const yUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
        let yRes = await fetchWithTimeout(yUrl, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
        if (yRes.status === 429 || yRes.status === 401) {
          _yahooCrumb = null;
          const { crumb: c2, cookie: co2 } = await getYahooCrumb();
          yRes = await fetchWithTimeout(
            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=${modules}&crumb=${encodeURIComponent(c2)}`,
            { headers: { 'User-Agent': UA, 'Cookie': co2 } }
          );
        }
        if (yRes.ok) {
          const yData = await yRes.json();
          const s = yData?.quoteSummary?.result?.[0];
          if (s) {
            const fd = s.financialData || {};
            const ks = s.defaultKeyStatistics || {};
            const sd = s.summaryDetail || {};
            const income = s.incomeStatementHistory?.incomeStatementHistory || [];
            const incomeQ = s.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
            const balance = s.balanceSheetHistory?.balanceSheetStatements || [];
            const cashflow = s.cashflowStatementHistory?.cashflowStatements || [];
            const cashflowQ = s.cashflowStatementHistoryQuarterly?.cashflowStatements || [];

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
            const fcfYears = cashflow.slice(0, 3).filter(c => (c.totalCashFromOperatingActivities?.raw || 0) > (c.capitalExpenditures?.raw || 0) * -1).length;
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
        }
      } catch (e) { /* Yahoo failed — continue */ }

      if (!result.sources.includes('yahoo')) {
        try {
          let ttData = null;
          let ttRes = await fetchWithTimeout(`https://api.tickertape.in/stocks/info/${symbol}`, { headers: { 'User-Agent': UA } });
          if (ttRes.ok) { const j = await ttRes.json(); if (j.success !== false) ttData = j; }
          if (!ttData || !ttData?.data?.ratios?.pe) {
            const slugId = TT_SLUGS[symbol];
            if (slugId) {
              const tt2 = await fetchWithTimeout(`https://api.tickertape.in/stocks/info/${slugId}`, { headers: { 'User-Agent': UA } });
              if (tt2.ok) { const j = await tt2.json(); if (j.success !== false) ttData = j; }
            }
          }
          if (ttData) {
            const r = ttData?.data?.ratios || {}, info = ttData?.data?.info || {}, gic = ttData?.data?.gic || {};
            if (r.pe != null || r.roe != null) {
              result.companyName = result.companyName || info.name || symbol;
              result.sector = result.sector || gic.industry || info.sector || null;
              result.pe = result.pe ?? r.pe ?? null; result.pb = result.pb ?? r.pb ?? null;
              result.roe = result.roe ?? r.roe ?? null; result.eps = result.eps ?? r.eps ?? null;
              result.beta = result.beta ?? r.beta ?? null;
              result.dividendYield = result.dividendYield ?? r.divYield ?? null;
              result.marketCap = result.marketCap ?? (r.marketCap ? r.marketCap * 1e7 : null);
              result.high52w = result.high52w ?? r['52wHigh'] ?? null;
              result.low52w = result.low52w ?? r['52wLow'] ?? null;
              result.sources.push('tickertape');
            }
          }
        } catch (e) { /* Tickertape failed */ }
      }

      try {
        const nseQRes = await fetchWithTimeout(
          `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
          { headers: { 'User-Agent': UA, 'Referer': `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`, 'Accept': 'application/json' } }
        );
        if (nseQRes.ok) {
          const nseQ = await nseQRes.json();
          const md = nseQ?.metadata || {}, ii = nseQ?.industryInfo || {};
          result.pe = result.pe ?? md.pdSymbolPe ?? null;
          result.sector = result.sector || ii.industry || ii.sector || null;
          result.exchange = 'NSE';
          result.sources.push('nse_quote');
        }
      } catch (e) { /* NSE failed */ }

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
            if (rows.length >= 4) {
              const old = rows[3]?.promoterAndPromoterGroup ?? null, now = rows[0]?.promoterAndPromoterGroup ?? null;
              result.promoterTrendDelta4q = (now != null && old != null) ? +(now - old).toFixed(2) : null;
            }
            result.sources.push('nse_shareholding');
          }
        }
      } catch (e) { /* NSE shareholding failed */ }

      result.exchange = result.exchange || 'NSE';
      if (!result.companyName) result.companyName = symbol;
      result.name = result.companyName;
      if (result.promoterHolding != null || result.fiiHolding != null) {
        const pub = Math.max(0, +(100 - (result.promoterHolding||0) - (result.fiiHolding||0) - (result.diiHolding||0)).toFixed(1));
        result.ownership = { promoter: result.promoterHolding ?? null, fii: result.fiiHolding ?? null, dii: result.diiHolding ?? null, public: pub, pledge: result.promoterPledge ?? null };
      }
      if (result.sources.length > 0 && (result.pe != null || result.roe != null)) redisSet(cacheKey, result, 4 * 60 * 60).catch(() => {});
      return res.status(200).json(result);
    }

    // ── Technical Full Data ──────────────────────────────────────────────────────
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

    // ── Health check ─────────────────────────────────────────────────────────────
    if (action === 'health') {
      const checks = {};
      let crumbOk = false;
      try {
        const { crumb, cookie } = await getYahooCrumb();
        crumbOk = crumb && crumb.length > 0;
        checks.yahoo_crumb = crumbOk ? 'ok' : 'empty';
        if (crumbOk) {
          const r = await fetch(
            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/INFY.NS?modules=financialData&crumb=${encodeURIComponent(crumb)}`,
            { headers: { 'User-Agent': UA, 'Cookie': cookie }, signal: AbortSignal.timeout(6000) }
          );
          const txt = await r.text();
          let d;
          try { d = JSON.parse(txt); } catch { checks.yahoo_data = `not-json (HTTP ${r.status}): ${txt.slice(0, 80)}`; d = null; }
          if (d) checks.yahoo_data = d?.quoteSummary?.result?.[0] ? 'ok' : `bad: ${JSON.stringify(d?.finance?.error || d?.quoteSummary?.error || 'empty')}`;
        } else { checks.yahoo_data = 'skipped (no crumb)'; }
      } catch (e) { if (!checks.yahoo_crumb) checks.yahoo_crumb = `error: ${e.message}`; checks.yahoo_data = `error: ${e.message}`; }
      try {
        const ttDirect = await fetch('https://api.tickertape.in/stocks/info/INFY', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
        checks.tickertape_direct = ttDirect.ok ? 'ok' : `http_${ttDirect.status}`;
        const ttSearch = await fetch('https://api.tickertape.in/search?text=RVNL', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
        if (ttSearch.ok) {
          const sr = await ttSearch.json();
          const slug = sr?.data?.stocks?.find(s => s.ticker === 'RVNL')?.slug;
          checks.tickertape_search = slug ? `ok (slug=${slug})` : `no_slug`;
        } else { checks.tickertape_search = `http_${ttSearch.status}`; }
      } catch (e) { checks.tickertape_direct = `error: ${e.message}`; checks.tickertape_search = 'skipped'; }
      if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
        checks.redis = 'not_configured';
      } else {
        try {
          await redisSet('health:ping', { ts: Date.now() }, 60);
          const v = await redisGet('health:ping');
          checks.redis = v?.ts ? 'ok' : 'empty';
        } catch (e) { checks.redis = `error: ${e.message}`; }
      }
      // Check Kite token staleness (set by api/kite.js on any 403)
      try {
        const kiteStale = await redisGet('kite:token_stale');
        checks.kite_token = kiteStale ? 'stale — go to /connect' : 'ok';
      } catch { checks.kite_token = 'unknown'; }

      const warnings = new Set(['not_configured', 'unknown']);
      const critical = Object.entries(checks).filter(([k, v]) => v !== 'ok' && !warnings.has(v) && !(k === 'yahoo_data' && v.includes('429')));
      const status = critical.length === 0 ? 'ok' : 'degraded';
      if (checks.yahoo_data?.includes('429')) checks._note = 'Yahoo IP-blocked on Vercel; Tickertape fallback active';
      return res.status(status === 'ok' ? 200 : 207).json({ status, checks, ts: new Date().toISOString() });
    }

    res.status(400).json({ error: 'action must be brain | plan | analyze | record_outcome | calibration_stats | intersect | trade_plan | allocate | allocate_update | allocate_session | allocate_reset | event_plays | event_stock_analysis | event_live_intel | fa_narrative | quotes | symbol | alpha | triggers | fundamental | technical_full | health' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
