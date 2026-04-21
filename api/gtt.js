import { placeGTT } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const { symbol, exchange = 'NSE', qty, ltp, target, sl } = req.body ?? {};
    if (!symbol || !qty || !ltp || !target || !sl) {
      res.status(400).json({ error: 'symbol, qty, ltp, target, sl required' }); return;
    }
    const enctoken = req.headers['x-kite-enctoken'] || '';
    const decoded  = enctoken ? decodeURIComponent(enctoken) : '';
    const result = await placeGTT({ symbol, exchange, qty: +qty, ltp: +ltp,
                                    target: +target, sl: +sl, enctoken: decoded });
    res.status(200).json({ ...result, status: 'success' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
