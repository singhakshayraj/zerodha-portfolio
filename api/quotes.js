import { getQuotes } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'];

    // Vercel parses query string into req.query automatically
    // Frontend sends: ?symbols=NSE%3AINFY,NSE%3ATCS (commas unencoded, each symbol encoded)
    const raw = req.query?.symbols || '';
    const symbols = raw.split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean);

    if (!symbols.length) { res.status(400).json({ error: 'symbols required' }); return; }

    const data = await getQuotes(symbols, enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
