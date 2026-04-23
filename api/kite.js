/**
 * Kite domain router
 * GET  /api/kite?action=holdings   — portfolio holdings
 * GET  /api/kite?action=quotes     — real-time quotes (?symbols=NSE:X,NSE:Y)
 * GET  /api/kite?action=historical — intraday OHLCV (?symbol=X&interval=5minute)
 * GET  /api/kite?action=positions  — open positions
 * GET  /api/kite?action=margins    — available cash & margin
 */
import { getHoldings, getQuotes, getHistorical, getPositions, getMargins } from '../dashboard/lib/kite.js';

function enc(req) {
  const raw = req.headers['x-kite-enctoken'] || process.env.KITE_ENCTOKEN || '';
  return raw ? decodeURIComponent(raw) : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Kite-Enctoken');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  const token = enc(req);
  if (!token || token === 'test') {
    // positions is optional — return empty gracefully
    if (action === 'positions') { res.status(200).json({ data: { net: [], day: [] } }); return; }
    res.status(401).json({ error: 'Kite not connected. Go to /connect and save your enctoken.' });
    return;
  }

  try {
    if (action === 'holdings') {
      const data = await getHoldings(token);
      return res.status(200).json({ data });
    }

    if (action === 'quotes') {
      const symbolsRaw = url.searchParams.get('symbols') || '';
      const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);
      if (!symbols.length) { res.status(400).json({ error: 'symbols required' }); return; }
      const data = await getQuotes(symbols, token);
      return res.status(200).json({ data });
    }

    if (action === 'historical') {
      const symbol   = url.searchParams.get('symbol');
      const interval = url.searchParams.get('interval') || '5minute';
      if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
      const data = await getHistorical(symbol, interval, token);
      return res.status(200).json({ data });
    }

    if (action === 'positions') {
      const data = await getPositions(token);
      return res.status(200).json({ data });
    }

    if (action === 'margins') {
      const data = await getMargins(token);
      return res.status(200).json({ data });
    }

    res.status(400).json({ error: 'action must be holdings | quotes | historical | positions | margins' });
  } catch (e) {
    const status = e.message?.includes('[403]') ? 403 : e.message?.includes('[400]') ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
}
