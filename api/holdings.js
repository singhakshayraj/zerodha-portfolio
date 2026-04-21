import { getHoldings } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'] || '';
    const effectiveEnc = enc || process.env.KITE_ENCTOKEN;
    if (!effectiveEnc || effectiveEnc === 'test') {
      res.status(401).json({ error: 'Kite not connected. Go to /connect and save your enctoken.' });
      return;
    }
    const holdings = await getHoldings(effectiveEnc);
    res.status(200).json({ data: holdings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
