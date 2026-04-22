/**
 * Research domain router
 * GET  /api/research?action=quotes  — NSE India market data proxy (?symbols=NSE:X,...)
 * POST /api/research?action=symbol  — symbol search (body: { query })
 * POST /api/research?action=alpha   — alpha scorer proxy (body: { ticker })
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

    res.status(400).json({ error: 'action must be quotes | symbol | alpha' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
