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
import { getBrainCache, setBrainCache } from '../dashboard/lib/supabase.js';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
      const force = url.searchParams.get('bust') || url.searchParams.get('force');

      // Check Supabase cache unless force-refresh
      if (!force) {
        try {
          const cached = await getBrainCache();
          if (cached) {
            const ageMs = Date.now() - new Date(cached.updated_at).getTime();
            if (ageMs < CACHE_TTL_MS) {
              return res.status(200).json({ ...cached.data, cached: true, cache_age_min: Math.floor(ageMs / 60000) });
            }
          }
        } catch { /* cache miss — fall through to fresh fetch */ }
      }

      const result = await getBrainResult(true);
      // Save to Supabase cache (non-blocking)
      setBrainCache(result).catch(() => {});
      return res.status(200).json({ ...result, cached: false, cache_age_min: 0 });
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
