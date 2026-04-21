// Market data proxy using NSE India's public API — no API key needed
// Renamed file kept as yahoo-quotes.js for URL compatibility

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const NSE_HEADERS = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

// Cache NSE session cookies for 8 minutes
let _nseSession = null;
let _nseSessionAt = 0;

async function getNSESession() {
  if (_nseSession && Date.now() - _nseSessionAt < 8 * 60 * 1000) return _nseSession;
  const res = await fetch('https://www.nseindia.com', { headers: NSE_HEADERS, redirect: 'follow' });
  const raw = res.headers.getSetCookie?.() ?? [];
  _nseSession = raw.map(c => c.split(';')[0]).join('; ');
  _nseSessionAt = Date.now();
  return _nseSession;
}

// NSE index name → allIndices indexSymbol
const INDEX_MAP = {
  'NSE:NIFTY 50':        'NIFTY 50',
  'NSE:NIFTY BANK':      'NIFTY BANK',
  'NSE:NIFTY MIDCAP 50': 'NIFTY MIDCAP 50',
  'NSE:INDIA VIX':       'INDIA VIX',
};

function isIndex(sym) { return !!INDEX_MAP[sym]; }
function nseStockSym(sym) { return sym.split(':')[1]; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  try {
    const url = new URL(req.url, 'https://placeholder.vercel.app');
    const symbolsRaw = url.searchParams.get('symbols') || '';
    const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);
    if (!symbols.length) { res.status(400).json({ error: 'No symbols provided' }); return; }

    const cookie = await getNSESession();
    const hdrs = { ...NSE_HEADERS, Cookie: cookie };

    const data = {};

    // ── Indices ──────────────────────────────────────────────────────────────
    const indexSyms = symbols.filter(isIndex);
    if (indexSyms.length) {
      const r = await fetch('https://www.nseindia.com/api/allIndices', { headers: hdrs });
      if (r.ok) {
        const json = await r.json();
        const rows = json.data || [];
        indexSyms.forEach(sym => {
          const nseKey = INDEX_MAP[sym];
          const row = rows.find(r => r.indexSymbol === nseKey);
          if (!row) return;
          // NSE allIndices uses 'last'/'current' and 'previousClose'; compute change manually
          const ltp  = row.last ?? row.current ?? 0;
          const prev = row.previousClose ?? 0;
          const chg  = ltp - prev;
          const chgPct = prev ? (chg / prev * 100) : (row.percentChange ?? 0);
          data[sym] = {
            last_price: ltp,
            net_change:  chg,
            change_pct:  chgPct,
            volume:      row.turnover || 0,
            ohlc: {
              open:  row.open  ?? ltp,
              high:  row.high  ?? ltp,
              low:   row.low   ?? ltp,
              close: prev,
            },
          };
        });
      }
    }

    // ── Individual stocks ────────────────────────────────────────────────────
    const stockSyms = symbols.filter(s => !isIndex(s));
    await Promise.all(stockSyms.map(async sym => {
      try {
        const ticker = nseStockSym(sym);
        const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(ticker)}`, { headers: hdrs });
        if (!r.ok) return;
        const json = await r.json();
        const p = json.priceInfo;
        if (!p) return;
        data[sym] = {
          last_price: p.lastPrice,
          net_change:  p.change,
          change_pct:  p.pChange,
          volume:      json.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0,
          ohlc: {
            open:  p.open,
            high:  p.intraDayHighLow?.max,
            low:   p.intraDayHighLow?.min,
            close: p.previousClose,
          },
        };
      } catch (_) {}
    }));

    res.status(200).json({ data, source: 'nse' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
