import { getQuotes } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'];

    // Parse query string manually — req.query is unreliable in Vercel ESM functions
    const url = new URL(req.url, 'https://placeholder.vercel.app');
    const symbolsRaw = url.searchParams.get('symbols') || '';
    const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);

    if (!symbols.length) {
      res.status(400).json({ error: `No symbols received. Raw query: ${req.url}` });
      return;
    }

    const effectiveEnc = enc || process.env.KITE_ENCTOKEN;
    if (!effectiveEnc || effectiveEnc === 'test') {
      res.status(401).json({ error: 'Kite not connected. Go to /connect and save your enctoken.' });
      return;
    }

    const data = await getQuotes(symbols, enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
