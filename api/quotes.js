import { getQuotes } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    // symbols are comma-separated, each individually URI-encoded
    const raw = req.url.split('?')[1] || '';
    const params = new URLSearchParams(raw);
    const symbolsRaw = params.get('symbols') || '';
    const symbols = symbolsRaw.split(',').map(s => decodeURIComponent(s)).filter(Boolean);
    if (!symbols.length) { res.status(400).json({ error: 'symbols required' }); return; }
    const enc = req.headers['x-kite-enctoken'];
    const data = await getQuotes(symbols, enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
