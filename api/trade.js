import { placeOrder } from '../dashboard/lib/kite.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const { symbol, transaction_type, quantity, enctoken, exchange } = req.body ?? {};
    if (!symbol || !transaction_type || !quantity) {
      res.status(400).json({ error: 'symbol, transaction_type, and quantity are required' });
      return;
    }
    const result = await placeOrder({ symbol, transactionType: transaction_type, quantity, enctoken, exchange });
    res.status(200).json({ ...result, status: 'success' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
