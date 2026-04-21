// Yahoo Finance proxy — handles the cookie+crumb handshake that Yahoo requires
// NSE symbols: SYMBOL.NS  |  Indices: ^NSEI, ^NSEBANK, etc.

const SYMBOL_MAP = {
  'NSE:NIFTY 50':        '^NSEI',
  'NSE:NIFTY BANK':      '^NSEBANK',
  'NSE:NIFTY MIDCAP 50': '^NSMIDCP',
  'NSE:INDIA VIX':       '^NSEINDVIX',
};

function toYahoo(sym) {
  if (SYMBOL_MAP[sym]) return SYMBOL_MAP[sym];
  const [exch, ticker] = sym.split(':');
  return ticker + (exch === 'BSE' ? '.BO' : '.NS');
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Cache crumb for up to 55 minutes to avoid repeated handshakes
let _crumb = null;
let _cookie = null;
let _crumbAt = 0;

async function getYahooCrumb() {
  if (_crumb && Date.now() - _crumbAt < 55 * 60 * 1000) return { crumb: _crumb, cookie: _cookie };

  // Step 1 — visit Yahoo Finance to get session cookies
  const homeRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  // Collect Set-Cookie headers
  const rawCookies = homeRes.headers.getSetCookie?.() || [];
  const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

  // Step 2 — exchange cookies for a crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookieStr },
  });
  if (!crumbRes.ok) throw new Error(`Yahoo crumb fetch failed: ${crumbRes.status}`);
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes('<')) throw new Error('Yahoo crumb invalid — got HTML');

  _crumb  = crumb;
  _cookie = cookieStr;
  _crumbAt = Date.now();
  return { crumb, cookie: cookieStr };
}

export default async function handler(req, res) {
  // CORS — allow browser calls from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  try {
    const url = new URL(req.url, 'https://placeholder.vercel.app');
    const symbolsRaw = url.searchParams.get('symbols') || '';
    const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);
    if (!symbols.length) { res.status(400).json({ error: 'No symbols provided' }); return; }

    const yahooSyms = symbols.map(toYahoo);
    const { crumb, cookie } = await getYahooCrumb();

    const quotesUrl = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${yahooSyms.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent`;

    const quotesRes = await fetch(quotesUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookie },
    });
    if (!quotesRes.ok) throw new Error(`Yahoo quotes returned ${quotesRes.status}`);

    const json = await quotesRes.json();
    const quotes = json?.quoteResponse?.result || [];

    const data = {};
    quotes.forEach((q, i) => {
      data[symbols[i]] = {
        last_price: q.regularMarketPrice,
        net_change:  q.regularMarketChange,
        change_pct:  q.regularMarketChangePercent,
        volume:      q.regularMarketVolume,
        ohlc: {
          open:  q.regularMarketOpen,
          high:  q.regularMarketDayHigh,
          low:   q.regularMarketDayLow,
          close: q.regularMarketPreviousClose,
        },
      };
    });

    res.status(200).json({ data, source: 'yahoo' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
