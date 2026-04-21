import { getPositions } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'];
    const data = await getPositions(enc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
