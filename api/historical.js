import { getHistorical } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const { symbol, interval = '5minute' } = req.query;
    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
    const enc = req.headers['x-kite-enctoken'];
    const data = await getHistorical(symbol, interval, enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
