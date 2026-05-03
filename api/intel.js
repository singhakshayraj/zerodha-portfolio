/**
 * Intelligence domain router
 * GET  /api/intel?action=brain       — AI Market Brain picks
 * POST /api/intel?action=plan        — Adaptive trade plan
 * POST /api/intel?action=analyze     — Individual stock analysis
 */
export const config = { maxDuration: 30 };

import { getBrainResult }  from '../dashboard/lib/brain.js';
import { getTradePlan }    from '../dashboard/lib/plan.js';
import { analyzeStock, analyzeEventStocks, analyzeEventScenario } from '../dashboard/lib/llm.js';
import { getBrainCache, setBrainCache } from '../dashboard/lib/supabase.js';
import { recordOutcomes, refreshSourceStats, fetchCalibration } from '../dashboard/lib/outcomes.js';
import { runIntersection }    from '../dashboard/lib/intersect.js';
import { generateTradePlans } from '../dashboard/lib/tradeplan.js';
import { allocate, closeTradeAlloc, getSession, resetSession } from '../dashboard/lib/allocate.js';
import { getEventPlays, getActiveEvent, buildQuantContext } from '../dashboard/lib/eventplays.js';
import { redisGet, redisSet } from '../dashboard/lib/redis.js';
import { config as appConfig } from '../dashboard/config.js';

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

    // ── Event Plays ───────────────────────────────────────────────────────────
    // GET /api/intel?action=event_plays[&scenario=nda_strong|nda_weak|hung_parliament]
    if (action === 'event_plays') {
      if (req.method !== 'GET') { res.status(405).end(); return; }
      const scenario = url.searchParams.get('scenario') || 'nda_strong';
      const activeEvent = getActiveEvent();

      // Reuse brain cache — event plays are brain-boosted, not brain-blocked
      let brain = null;
      try {
        const cached = await getBrainCache();
        if (cached) {
          const ageMs = Date.now() - new Date(cached.updated_at).getTime();
          if (ageMs < CACHE_TTL_MS) brain = cached.data;
        }
      } catch { /* no cache — brain boost simply won't fire */ }

      const result = getEventPlays(brain, scenario);
      return res.status(200).json({
        ...result,
        active_event: activeEvent,
        brain_context: brain ? {
          sentiment: brain.market_sentiment,
          regime: brain.regime,
          vix_state: brain.vix_state,
          gift_nifty_bias: brain.gift_nifty_bias,
          cached: true
        } : null
      });
    }

    // ── Event Stock Analysis (runtime LLM scoring for event plays) ──────────────
    // POST /api/intel?action=event_stock_analysis
    // Body: { symbols: ['HAL','BEL',...], event_context: '...', scenario_label: '...' }
    if (action === 'event_stock_analysis') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbols, event_context, scenario_label } = req.body ?? {};
      if (!symbols?.length || !event_context) {
        return res.status(400).json({ error: 'symbols[] and event_context required' });
      }
      const scores = await analyzeEventStocks(symbols, event_context, scenario_label || '');
      return res.status(200).json({ scores, analyzed_at: new Date().toISOString() });
    }

    // ── Live Event Scenario — quant pipeline + LLM synthesis ────────────────────
    // POST /api/intel?action=event_live_intel
    // Body: { event_context, scenario_label, event_type? }
    if (action === 'event_live_intel') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { event_context, scenario_label, event_type } = req.body ?? {};
      if (!event_context) return res.status(400).json({ error: 'event_context required' });

      // Step 1: get brain cache for regime context
      let brainContext = null;
      try {
        const cached = await getBrainCache();
        if (cached) {
          const ageMs = Date.now() - new Date(cached.updated_at).getTime();
          if (ageMs < CACHE_TTL_MS) {
            brainContext = {
              vix_state:      cached.data?.vix_state,
              sentiment:      cached.data?.market_sentiment,
              regime:         cached.data?.regime,
              gift_nifty_bias: cached.data?.gift_nifty_bias
            };
          }
        }
      } catch { /* no cache — use neutral regime */ }

      // Step 2: build quantitative context (sector EVs, probabilities, regime adjustment)
      const resolvedEventType = event_type || getActiveEvent()?.type || 'assembly_election_exit_poll';
      const quantContext = buildQuantContext(resolvedEventType, brainContext);

      // Step 3: LLM synthesis — takes structured quant context, adds narrative + stock picks
      const today = new Date().toISOString().slice(0, 10);
      const result = await analyzeEventScenario(event_context, scenario_label || '', quantContext, today);

      return res.status(200).json({
        ...result,
        quant_context: quantContext,
        generated_at: new Date().toISOString(),
        source: 'quant_llm_pipeline'
      });
    }

    // ── FA Narrative (LLM-generated fundamental analysis narrative) ─────────────
    // POST /api/intel?action=fa_narrative
    // Body: { symbol, faData: { companyName, sector, pe, pb, roe, roce, netMargin,
    //         revenueCagr3yr, epsCagr3yr, debtEquity, promoterHolding, promoterPledge,
    //         revenueGrowth, earningsGrowth, marketCap, dividendYield, beta,
    //         high52w, low52w, freeCashflow, currentRatio } }
    if (action === 'fa_narrative') {
      if (req.method !== 'POST') { res.status(405).end(); return; }
      const { symbol, faData } = req.body ?? {};
      if (!symbol || !faData) { res.status(400).json({ error: 'symbol and faData required' }); return; }

      const cacheKey = `fa:narrative:${symbol}`;
      const cached = await redisGet(cacheKey);
      if (cached && cached.generatedAt) {
        const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
        if (ageMs < 4 * 60 * 60 * 1000) return res.status(200).json({ ...cached, _cached: true });
      }

      const FA_NARRATIVE_SYSTEM = `You are a fundamental analyst at a top-tier Indian institutional fund. You write precise, jargon-light analysis. You never pad. Every sentence must contain a specific data point or observable fact. You do not assign buy/sell ratings. You never make up numbers not given to you.`;

      const FA_NARRATIVE_PROMPT = (sym, d) => `Analyze ${sym} (${d.companyName || sym}), sector: ${d.sector || 'Unknown'}.

Key metrics:
- Market Cap: ${d.marketCap ? '₹' + (d.marketCap/1e7).toFixed(0) + ' Cr' : 'N/A'}
- PE: ${d.pe ?? 'N/A'} | Forward PE: ${d.forwardPE ?? 'N/A'} | PB: ${d.pb ?? 'N/A'}
- ROE: ${d.roe?.toFixed(1) ?? 'N/A'}% | ROCE: ${d.roce?.toFixed(1) ?? 'N/A'}% | Net Margin: ${d.netMargin?.toFixed(1) ?? 'N/A'}%
- Revenue CAGR 3yr: ${d.revenueCagr3yr?.toFixed(1) ?? 'N/A'}% | EPS CAGR 3yr: ${d.epsCagr3yr?.toFixed(1) ?? 'N/A'}%
- D/E: ${d.debtEquity?.toFixed(2) ?? 'N/A'} | Current Ratio: ${d.currentRatio?.toFixed(2) ?? 'N/A'}
- Promoter Holding: ${d.promoterHolding?.toFixed(1) ?? 'N/A'}% | Pledge: ${d.promoterPledge?.toFixed(1) ?? 'N/A'}%
- Dividend Yield: ${d.dividendYield?.toFixed(2) ?? 'N/A'}% | Beta: ${d.beta?.toFixed(2) ?? 'N/A'}
- 52W Range: ₹${d.low52w ?? 'N/A'} – ₹${d.high52w ?? 'N/A'}

Return ONLY raw JSON (no markdown):
{
  "business_summary": "<one paragraph: what this company does, its competitive moat if any, and dominant revenue driver — cite specific % or ₹ figures from the data above>",
  "bull_case": ["<specific data-backed point>", "<specific point>", "<specific point>"],
  "bear_case": ["<specific risk tied to data>", "<specific risk>", "<specific risk>"],
  "watch_next_quarter": "<one sentence: the single most important metric to monitor>",
  "management_quality": "<one sentence: observation on promoter holding trend, pledge level, or capital allocation based on the data provided>"
}`;

      async function callGroq(sym, d) {
        const { default: Groq } = await import('groq-sdk');
        const client = new Groq({ apiKey: appConfig.llm.groqApiKey });
        const msg = await client.chat.completions.create({
          model: appConfig.llm.groqModel,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: FA_NARRATIVE_SYSTEM },
            { role: 'user', content: FA_NARRATIVE_PROMPT(sym, d) }
          ],
        });
        return JSON.parse(msg.choices[0].message.content.trim());
      }

      async function callGemini(sym, d) {
        const apiKey = appConfig.llm.googleApiKey;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
        const model = appConfig.llm.geminiModel || 'gemini-2.0-flash';
        const prompt = FA_NARRATIVE_SYSTEM + '\n\n' + FA_NARRATIVE_PROMPT(sym, d);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' } }) }
        );
        if (!r.ok) throw new Error(`Gemini ${r.status}`);
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        return JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim());
      }

      let narrative;
      try {
        const provider = appConfig.llm.provider;
        if (provider === 'gemini') {
          narrative = await callGemini(symbol, faData);
        } else {
          narrative = await callGroq(symbol, faData);
        }
      } catch (err) {
        const isRateLimit = err.message?.includes('429') || err.status === 429;
        if (isRateLimit && appConfig.llm.googleApiKey) {
          narrative = await callGemini(symbol, faData);
        } else {
          throw err;
        }
      }

      const result = { ...narrative, symbol, generatedAt: new Date().toISOString() };
      redisSet(cacheKey, result, 4 * 60 * 60).catch(() => {});
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'action must be brain | plan | analyze | record_outcome | calibration_stats | intersect | trade_plan | allocate | allocate_update | allocate_session | allocate_reset | event_plays | event_stock_analysis | event_live_intel | fa_narrative' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
