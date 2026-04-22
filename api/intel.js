/**
 * Intelligence domain router
 * GET  /api/intel?action=brain       — AI Market Brain picks
 * POST /api/intel?action=plan        — Adaptive trade plan
 * POST /api/intel?action=analyze     — Individual stock analysis
 */
export const config = { maxDuration: 30 };

import { getBrainResult }  from '../dashboard/lib/brain.js';
import { getTradePlan }    from '../dashboard/lib/plan.js';
import { analyzeStock }    from '../dashboard/lib/llm.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Kite-Enctoken');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  try {
    // ── Market Brain ────────────────────────────────────────────────────────
    if (action === 'brain') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const bust   = url.searchParams.get('bust');
      const result = await getBrainResult(!!bust);
      return res.status(200).json(result);
    }

    // ── Trade Plan ──────────────────────────────────────────────────────────
    if (action === 'plan') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbol, ltp } = req.body ?? {};
      if (!symbol || !ltp) { res.status(400).json({ error: 'symbol and ltp required' }); return; }
      const plan = await getTradePlan(req.body);
      return res.status(200).json(plan);
    }

    // ── Individual Stock Analysis ────────────────────────────────────────────
    if (action === 'analyze') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { company } = req.body ?? {};
      if (!company) { res.status(400).json({ error: 'company required' }); return; }
      const result = await analyzeStock(company);
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'action must be brain | plan | analyze' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
