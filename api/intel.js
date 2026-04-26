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
import { recordOutcomes, refreshSourceStats, fetchCalibration } from '../dashboard/lib/outcomes.js';
import { runIntersection }    from '../dashboard/lib/intersect.js';
import { generateTradePlans } from '../dashboard/lib/tradeplan.js';
import { allocate, closeTradeAlloc, getSession, resetSession } from '../dashboard/lib/allocate.js';

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

    // ── Record outcomes (called by cron or dashboard with live LTP map) ────────
    // POST /api/intel?action=record_outcome
    // Body: { ltpMap: { SYMBOL: ltp } }  — current prices for pending picks
    if (action === 'record_outcome') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { ltpMap = {} } = req.body ?? {};
      await recordOutcomes(async symbols => {
        // Use client-supplied ltpMap; only resolve symbols we have prices for
        return Object.fromEntries(symbols.filter(s => ltpMap[s]).map(s => [s, ltpMap[s]]));
      });
      await refreshSourceStats();
      return res.status(200).json({ ok: true });
    }

    // ── Calibration stats (read current source performance stats) ───────────
    // GET /api/intel?action=calibration_stats
    if (action === 'calibration_stats') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const map = await fetchCalibration();
      const stats = Object.fromEntries(map);
      return res.status(200).json({ stats, segment_count: map.size });
    }

    // ── Intersection Engine ──────────────────────────────────────────────────
    // POST /api/intel?action=intersect
    // Body: {
    //   triggers: TriggerEvent[],   — Step 2 output (required)
    //   picks:    BrainPick[],      — Step 1 picks (optional; falls back to Supabase cache)
    // }
    // Returns top actionable opportunities where Step 1 intelligence and Step 2
    // real-time movement intersect and agree.
    if (action === 'intersect') {
      if (req.method !== 'POST') { res.status(405).end(); return; }

      const { triggers, picks: bodyPicks } = req.body ?? {};
      if (!Array.isArray(triggers) || triggers.length === 0) {
        return res.status(400).json({ error: 'triggers[] required — pass Step 2 trigger events in body' });
      }

      // Use caller-supplied picks, or pull from Supabase brain cache
      let brainPicks = bodyPicks;
      if (!Array.isArray(brainPicks) || brainPicks.length === 0) {
        try {
          const cached = await getBrainCache();
          brainPicks = cached?.data?.picks ?? [];
        } catch {
          brainPicks = [];
        }
      }

      if (!brainPicks.length) {
        return res.status(503).json({
          error: 'No brain picks available. Run GET /api/intel?action=brain first to populate cache.',
        });
      }

      const result = runIntersection(brainPicks, triggers);
      return res.status(200).json(result);
    }

    // ── Trade Plan Engine (Step 4) ───────────────────────────────────────────
    // POST /api/intel?action=trade_plan
    // Body: { opportunities: Opportunity[] }  ← Step 3 intersect output
    // Returns fully defined trade plans with entry, SL, targets, sizing, and
    // logs each plan to the Supabase trades journal automatically.
    if (action === 'trade_plan') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { opportunities } = req.body ?? {};
      if (!Array.isArray(opportunities) || opportunities.length === 0) {
        return res.status(400).json({ error: 'opportunities[] required — pass Step 3 intersect output in body' });
      }
      const result = await generateTradePlans(opportunities);
      return res.status(200).json(result);
    }

    // ── Allocator — run one allocation cycle ────────────────────────────────
    // POST /api/intel?action=allocate
    // Body: { opportunities[], capital, maxRiskPct, targetRMultiple, maxTrades,
    //         minEV?, minScore?, regime?, date? }
    if (action === 'allocate') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { opportunities, capital, maxRiskPct, targetRMultiple, maxTrades } = req.body ?? {};
      if (!Array.isArray(opportunities) || !capital || !maxRiskPct || !targetRMultiple || !maxTrades) {
        return res.status(400).json({ error: 'opportunities[], capital, maxRiskPct, targetRMultiple, maxTrades required' });
      }
      const result = await allocate(req.body);
      return res.status(200).json(result);
    }

    // ── Allocator — close a trade and recycle capital ────────────────────────
    // POST /api/intel?action=allocate_update
    // Body: { tradeId, exitPrice, exitReason, date? }
    if (action === 'allocate_update') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { tradeId, exitPrice, exitReason } = req.body ?? {};
      if (!tradeId || exitPrice == null || !exitReason) {
        return res.status(400).json({ error: 'tradeId, exitPrice, exitReason required' });
      }
      const result = await closeTradeAlloc(req.body);
      return res.status(200).json(result);
    }

    // ── Allocator — read current session ─────────────────────────────────────
    // GET /api/intel?action=allocate_session[&date=YYYY-MM-DD]
    if (action === 'allocate_session') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const date = url.searchParams.get('date') || undefined;
      const session = await getSession(date);
      if (!session) return res.status(404).json({ error: 'no session found for date' });
      return res.status(200).json(session);
    }

    // ── Allocator — reset session ─────────────────────────────────────────────
    // POST /api/intel?action=allocate_reset[&date=YYYY-MM-DD]
    if (action === 'allocate_reset') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const date = url.searchParams.get('date') || undefined;
      const result = await resetSession(date);
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'action must be brain | plan | analyze | record_outcome | calibration_stats | intersect | trade_plan | allocate | allocate_update | allocate_session | allocate_reset' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
