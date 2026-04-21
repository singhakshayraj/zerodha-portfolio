import { getHistorical } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'];
    const url = new URL(req.url, 'https://placeholder.vercel.app');
    const symbol   = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '5minute';

    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }

    if (!enc && !process.env.KITE_ENCTOKEN) {
      res.status(401).json({ error: 'Kite not connected. Go to /connect and save your enctoken.' });
      return;
    }

    const data = await getHistorical(symbol, interval, enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
