import { getHoldings } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const holdings = await getHoldings();
    res.status(200).json({ data: holdings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
