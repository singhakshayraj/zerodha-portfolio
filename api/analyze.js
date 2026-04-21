import { analyzeStock } from '../dashboard/lib/llm.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const { company } = req.body ?? {};
    if (!company) { res.status(400).json({ error: 'company required' }); return; }
    const result = await analyzeStock(company);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
