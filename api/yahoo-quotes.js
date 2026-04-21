// Fetches quotes from Yahoo Finance — no auth needed, 15-min delayed for indices
// NSE symbols: append .NS (e.g. INFY.NS)
// Indices: ^NSEI (NIFTY 50), ^NSEBANK (BANK NIFTY), ^NSMIDCP (MIDCAP 50), ^NSEINDVIX (VIX)

const SYMBOL_MAP = {
  'NSE:NIFTY 50':       '^NSEI',
  'NSE:NIFTY BANK':     '^NSEBANK',
  'NSE:NIFTY MIDCAP 50':'^NSMIDCP',
  'NSE:INDIA VIX':      '^NSEINDVIX',
};

function toYahoo(sym) {
  if (SYMBOL_MAP[sym]) return SYMBOL_MAP[sym];
  // NSE:INFY → INFY.NS, BSE:500209 → 500209.BO
  const [exch, ticker] = sym.split(':');
  if (exch === 'BSE') return ticker + '.BO';
  return ticker + '.NS';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const url = new URL(req.url, 'https://placeholder.vercel.app');
    const symbolsRaw = url.searchParams.get('symbols') || '';
    const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);

    if (!symbols.length) {
      res.status(400).json({ error: 'No symbols provided' });
      return;
    }

    const yahooSyms = symbols.map(toYahoo);
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${yahooSyms.join(',')}&fields=regularMarketPrice,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent`;

    const yahooRes = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!yahooRes.ok) {
      res.status(502).json({ error: `Yahoo Finance returned ${yahooRes.status}` });
      return;
    }

    const json = await yahooRes.json();
    const quotes = json?.quoteResponse?.result || [];

    // Normalise to same shape as Kite quotes so the frontend code is identical
    const data = {};
    quotes.forEach((q, i) => {
      const origSym = symbols[i];
      data[origSym] = {
        last_price:   q.regularMarketPrice,
        net_change:   q.regularMarketChange,
        change_pct:   q.regularMarketChangePercent,
        volume:       q.regularMarketVolume,
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
