import { getPositions } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  try {
    const enc = req.headers['x-kite-enctoken'] || process.env.KITE_ENCTOKEN || '';
    const decodedEnc = enc ? decodeURIComponent(enc) : '';
    const data = await getPositions(decodedEnc);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
