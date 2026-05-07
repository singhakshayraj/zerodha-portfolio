#!/usr/bin/env node
/**
 * Standalone auto-trade session script — no Vercel required.
 * node modules/auto-trade/session.js
 *
 * Required env vars:
 *   CAPITAL          — capital to deploy in ₹ (e.g. 10000)
 *   MAX_PROFIT_PCT   — profit target as % of capital (e.g. 15)
 *   MAX_LOSS_PCT     — loss limit as % of capital (e.g. 10)
 *   KITE_ENCTOKEN    — Kite enctoken (from browser or Zerodha account)
 *
 * Optional:
 *   MAX_TRADES       — max open positions (default: 5)
 *   RUNTIME_MODE     — must be 'server' (default for this script)
 *   LLM_PROVIDER / GROQ_API_KEY / ANTHROPIC_API_KEY — for brain refresh
 *   SUPABASE_URL / SUPABASE_ANON_KEY                — for trade journal
 *   UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN         — for session state
 *
 * Flow:
 *   Brain (cache or fresh) → NSE Triggers + Kite fallback
 *   → Intersection → Trade Plans → Allocate → Place Orders + GTTs
 *   → Write session to Redis + Supabase journal
 */

import { getBrainResult }                            from '../../dashboard/lib/brain.js';
import { getBrainCache, setBrainCache, insertTrade } from '../../dashboard/lib/supabase.js';
import { UNIVERSE, runTriggerCycle }                 from '../../dashboard/lib/trigger.js';
import { runIntersection }                           from '../../dashboard/lib/intersect.js';
import { generateTradePlans }                        from '../../dashboard/lib/tradeplan.js';
import { allocate }                                  from '../../dashboard/lib/allocate.js';
import { placeOrder, placeGTT, getQuotes }           from '../../dashboard/lib/kite.js';
import { redisGet, redisSet }                        from '../../dashboard/lib/redis.js';

// ── Params ────────────────────────────────────────────────────────────────────

const CAPITAL        = parseFloat(process.env.CAPITAL || '0');
const MAX_PROFIT_PCT = parseFloat(process.env.MAX_PROFIT_PCT || '0');
const MAX_LOSS_PCT   = parseFloat(process.env.MAX_LOSS_PCT || '0');
const MAX_TRADES     = parseInt(process.env.MAX_TRADES || '5', 10);
const ENCTOKEN       = process.env.KITE_ENCTOKEN || '';

// Force server mode so kite.js uses REST API
process.env.RUNTIME_MODE = 'server';

if (!CAPITAL || !MAX_PROFIT_PCT || !MAX_LOSS_PCT) {
  console.error('❌ Set CAPITAL, MAX_PROFIT_PCT, MAX_LOSS_PCT env vars before running.');
  process.exit(1);
}
if (!ENCTOKEN) {
  console.error('❌ KITE_ENCTOKEN is required to place orders.');
  process.exit(1);
}

// ── NSE quote helpers (self-contained, no Vercel) ─────────────────────────────

const UA      = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const NSE_HDR = { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.nseindia.com/' };

let _nseSess = null, _nseSessAt = 0;
async function getNSESession() {
  if (_nseSess && Date.now() - _nseSessAt < 8 * 60 * 1000) return _nseSess;
  const r   = await fetch('https://www.nseindia.com', { headers: NSE_HDR, redirect: 'follow' });
  const raw = r.headers.getSetCookie?.() ?? [];
  _nseSess  = raw.map(c => c.split(';')[0]).join('; ');
  _nseSessAt = Date.now();
  return _nseSess;
}

async function fetchNSEQuotes() {
  const cookie = await getNSESession();
  const hdrs   = { ...NSE_HDR, Cookie: cookie };
  const data   = {};
  await Promise.allSettled(UNIVERSE.map(async sym => {
    try {
      const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`, { headers: hdrs });
      if (!r.ok) return;
      const json = await r.json();
      const p    = json.priceInfo;
      if (!p) return;
      data[sym] = {
        last_price: p.lastPrice,
        change_pct: p.pChange,
        net_change: p.change,
        volume:     json.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0,
        ohlc: { open: p.open, high: p.intraDayHighLow?.max, low: p.intraDayHighLow?.min, close: p.previousClose },
      };
    } catch { /* skip symbol */ }
  }));
  return { data, cookie };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function istDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function fmt(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const BRAIN_TTL_MS = 30 * 60 * 1000; // 30 min

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const today        = istDate();
  const profitTarget = +(CAPITAL * MAX_PROFIT_PCT / 100).toFixed(2);
  const lossLimit    = +(CAPITAL * MAX_LOSS_PCT / 100).toFixed(2);
  const maxRiskPct   = MAX_LOSS_PCT;
  const targetRMult  = +(MAX_PROFIT_PCT / MAX_LOSS_PCT).toFixed(2);

  console.log(`\n🤖 Auto-Trade Session — ${today}`);
  console.log(`   Capital: ${fmt(CAPITAL)} | Profit target: +${fmt(profitTarget)} (${MAX_PROFIT_PCT}%) | Loss limit: −${fmt(lossLimit)} (${MAX_LOSS_PCT}%) | Max trades: ${MAX_TRADES}`);

  // Guard: don't double-start a session for today
  const existing = await redisGet('auto:session').catch(() => null);
  if (existing?.date === today && existing?.status === 'active') {
    console.log('⚠  Session already active for today — aborting to avoid duplicates.');
    console.log('   Use monitor.js for circuit-breaker checks or delete auto:session from Redis to restart.');
    process.exit(0);
  }

  // ── Step 1: Brain ─────────────────────────────────────────────────────────

  console.log('\n📡 Step 1 — Market Brain');
  let brain = null;
  try {
    const cached = await getBrainCache();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs < BRAIN_TTL_MS) {
        brain = cached.data;
        console.log(`   ✓ Using cached brain (${Math.floor(ageMs / 60000)}m old) — sentiment: ${brain.market_sentiment}, regime: ${brain.regime}`);
      }
    }
    if (!brain) {
      console.log('   Refreshing brain from LLM…');
      brain = await getBrainResult(true);
      setBrainCache(brain).catch(() => {});
      console.log(`   ✓ Brain refreshed — sentiment: ${brain.market_sentiment}, regime: ${brain.regime}`);
    }
  } catch (e) {
    console.warn(`   ⚠ Brain unavailable: ${e.message} — continuing without brain picks`);
  }

  const vixState   = brain?.vix_state   || 'unknown';
  const brainPicks = brain?.picks        || [];
  console.log(`   VIX state: ${vixState} | Brain picks: ${brainPicks.length}`);

  if (!brainPicks.length) {
    console.log('   ⚠ No brain picks available — run brain first or check LLM config.');
    await saveSession({ today, profitTarget, lossLimit, status: 'no_brain_picks', trades: [] });
    process.exit(0);
  }

  // ── Step 2: NSE Triggers ──────────────────────────────────────────────────

  console.log('\n📊 Step 2 — Live Triggers');
  console.log('   Fetching NSE quotes for universe…');
  const { data: quoteData, cookie } = await fetchNSEQuotes();
  let quoteSource = 'nse';
  const coverage  = Object.keys(quoteData).length / UNIVERSE.length;
  console.log(`   NSE coverage: ${Object.keys(quoteData).length}/${UNIVERSE.length} (${Math.round(coverage * 100)}%)`);

  // Kite fallback when NSE coverage is poor
  if (coverage < 0.70) {
    console.log('   NSE coverage < 70% — falling back to Kite for missing symbols…');
    try {
      const missing  = UNIVERSE.filter(s => !quoteData[s]).map(s => `NSE:${s}`);
      const kiteData = await getQuotes(missing, ENCTOKEN);
      let filled = 0;
      for (const [key, d] of Object.entries(kiteData || {})) {
        const sym = key.split(':')[1];
        if (sym && d?.last_price != null && !quoteData[sym]) {
          quoteData[sym] = {
            last_price: d.last_price,
            change_pct: d.net_change && d.ohlc?.close ? +(d.net_change / d.ohlc.close * 100).toFixed(2) : 0,
            net_change: d.net_change || 0,
            volume:     d.volume_traded || 0,
            ohlc: { open: d.ohlc?.open, high: d.ohlc?.high, low: d.ohlc?.low, close: d.ohlc?.close },
          };
          filled++;
        }
      }
      quoteSource = coverage < 0.10 ? 'kite' : 'mixed';
      console.log(`   Kite filled ${filled} symbols — total coverage: ${Object.keys(quoteData).length}/${UNIVERSE.length}`);
    } catch (e) {
      console.warn(`   Kite fallback failed: ${e.message}`);
    }
  }

  const cycleResult = await runTriggerCycle(quoteData, vixState, cookie);
  const triggers    = cycleResult.triggers || [];
  console.log(`   ✓ Triggers found: ${triggers.length} | Market open: ${cycleResult.market_open} | Quote source: ${quoteSource}`);

  if (!cycleResult.market_open) {
    console.log('   ⚠ Market is closed — no triggers emitted.');
    await saveSession({ today, profitTarget, lossLimit, status: 'market_closed', trades: [], nse_coverage_pct: Math.round(coverage * 100) });
    process.exit(0);
  }

  if (!triggers.length) {
    console.log('   No trigger signals today.');
    await saveSession({ today, profitTarget, lossLimit, status: 'no_signals', trades: [], nse_coverage_pct: Math.round(coverage * 100) });
    process.exit(0);
  }

  // ── Step 3: Intersection ──────────────────────────────────────────────────

  console.log('\n🔀 Step 3 — Intersection (brain × triggers)');
  const intersectResult = runIntersection(brainPicks, triggers);
  const opportunities   = intersectResult.opportunities || [];
  console.log(`   Brain picks: ${brainPicks.length} | Triggers: ${triggers.length} | Opportunities: ${opportunities.length}`);

  if (!opportunities.length) {
    console.log('   No intersection between brain picks and trigger events.');
    await saveSession({ today, profitTarget, lossLimit, status: 'no_opportunities', trades: [], triggers_found: triggers.length, nse_coverage_pct: Math.round(coverage * 100) });
    process.exit(0);
  }

  // ── Step 4: Trade Plans ───────────────────────────────────────────────────

  console.log('\n📋 Step 4 — Trade Plans');
  const planResult = await generateTradePlans(opportunities);
  const plans      = planResult.plans || [];
  console.log(`   Opportunities: ${opportunities.length} → Plans passed: ${plans.length} | Rejected: ${planResult.rejected?.length || 0}`);

  if (!plans.length) {
    console.log('   No valid trade plans generated (all rejected by filters).');
    await saveSession({ today, profitTarget, lossLimit, status: 'no_plans', trades: [], opportunities_found: opportunities.length, nse_coverage_pct: Math.round(coverage * 100) });
    process.exit(0);
  }

  // ── Step 5: Allocate ──────────────────────────────────────────────────────

  console.log('\n💰 Step 5 — Capital Allocation');
  const allocResult = await allocate({
    opportunities:  plans,
    capital:        CAPITAL,
    maxRiskPct,
    targetRMultiple: targetRMult,
    maxTrades:      MAX_TRADES,
    regime:         brain?.regime,
  });
  const allocated = allocResult.newTrades || [];
  console.log(`   Plans: ${plans.length} | Allocated: ${allocated.length} | Skipped: ${allocResult.skipped?.length || 0}`);
  console.log(`   Alloc session: risk used ${fmt(allocResult.session?.riskUsed || 0)} / ${fmt(allocResult.session?.riskBudget || 0)}`);

  if (!allocated.length) {
    const skipReasons = (allocResult.skipped || []).map(s => s.reason).slice(0, 3).join(', ');
    console.log(`   No positions allocated (reasons: ${skipReasons || 'unknown'})`);
    await saveSession({ today, profitTarget, lossLimit, status: 'no_trades', trades: [], plans_generated: plans.length, nse_coverage_pct: Math.round(coverage * 100) });
    process.exit(0);
  }

  // ── Step 6: Execute Trades ────────────────────────────────────────────────

  console.log('\n⚡ Step 6 — Execute Trades');
  const executedTrades = [];
  const execErrors     = [];

  for (const trade of allocated) {
    const symbol   = trade.symbol;
    const exchange = trade.exchange || 'NSE';
    const qty      = trade.qty;
    const entry    = trade.entry;
    const sl       = trade.sl;
    const target   = trade.t1 ?? trade.t2 ?? null;
    const side     = trade.direction === 'short' ? 'SELL' : 'BUY';

    if (!target) {
      console.warn(`   ⚠ ${symbol}: no target price in plan — skipping`);
      execErrors.push({ symbol, step: 'no_target', error: 'plan missing t1/t2' });
      continue;
    }

    process.stdout.write(`   ${symbol} (${side} ${qty} @ ${fmt(entry)}, target ${fmt(target)}, SL ${fmt(sl)})… `);

    let orderId   = null;
    let triggerId = null;

    // 6a. Market entry order
    try {
      const orderRes = await placeOrder({ symbol, transactionType: side, quantity: qty, enctoken: ENCTOKEN, exchange });
      orderId = orderRes.order_id;
      process.stdout.write(`order_id=${orderId} `);
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      execErrors.push({ symbol, step: 'entry_order', error: e.message });
      continue;
    }

    // 6b. GTT OCO — target + stop-loss, survives browser close
    try {
      const gttRes  = await placeGTT({ symbol, exchange, qty, ltp: entry, target, sl, enctoken: ENCTOKEN });
      triggerId = gttRes.trigger_id;
      process.stdout.write(`gtt_id=${triggerId} `);
    } catch (e) {
      console.log(`(GTT failed: ${e.message})`);
      execErrors.push({ symbol, step: 'gtt', error: e.message });
      // Continue — trade is open, GTT is best-effort
    }

    console.log('✓');

    // 6c. Journal to Supabase
    const record = {
      id:          `auto-${Date.now()}-${symbol}`,
      symbol,
      exchange,
      sector:      trade.sector    || '',
      side,
      entry:       +entry,
      target:      +target,
      sl:          +sl,
      qty:         +qty,
      capital:     +(trade.capitalAllocated || 0),
      risk_rs:     +(trade.risk || 0),
      reward_rs:   +((target - entry) * qty),
      rr:          entry !== sl ? +((target - entry) / Math.abs(entry - sl)).toFixed(2) : 0,
      trigger_id:  triggerId,
      factors:     { ev: trade.ev, final_score: trade.final_score, win_rate: trade.win_rate, setup_type: trade.setup_type, order_id: orderId },
      source:      'auto_session',
      confidence:  +(trade.confidence || 0),
      score:       +(trade.final_score || 0),
      status:      'open',
      pnl:         null,
      exit_price:  null,
      exit_reason: null,
      opened_at:   new Date().toISOString(),
      closed_at:   null,
    };
    try {
      await insertTrade(record);
    } catch (e) {
      execErrors.push({ symbol, step: 'db_insert', error: e.message });
    }

    executedTrades.push({ symbol, order_id: orderId, trigger_id: triggerId, entry, target, sl, qty, side });
  }

  // ── Step 7: Persist session ───────────────────────────────────────────────

  const sessionRecord = {
    date:             today,
    capital:          CAPITAL,
    max_profit_pct:   MAX_PROFIT_PCT,
    max_loss_pct:     MAX_LOSS_PCT,
    maxTrades:        MAX_TRADES,
    profit_target:    profitTarget,
    loss_limit:       lossLimit,
    status:           executedTrades.length > 0 ? 'active' : 'no_trades',
    trades:           executedTrades,
    realized_pnl:     0,
    stopped_at:       null,
    stop_reason:      null,
    started_at:       new Date().toISOString(),
    nse_coverage_pct: Math.round(coverage * 100),
    quote_source:     quoteSource,
    alloc_session:    allocResult.session,
    exec_errors:      execErrors,
  };
  await saveSession(sessionRecord);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n✅ Done — ${executedTrades.length} trade(s) placed | ${execErrors.length} error(s)`);
  if (execErrors.length) {
    execErrors.forEach(e => console.warn(`   ⚠ ${e.symbol} [${e.step}]: ${e.error}`));
  }
  console.log(`   Session status: ${sessionRecord.status} | Profit target: +${fmt(profitTarget)} | Loss limit: -${fmt(lossLimit)}`);
  console.log('   Monitor runs every 30 min via session-monitor.yml — circuit breaker active.\n');
}

async function saveSession(partial) {
  const record = {
    date:           partial.today || istDate(),
    capital:        CAPITAL,
    max_profit_pct: MAX_PROFIT_PCT,
    max_loss_pct:   MAX_LOSS_PCT,
    maxTrades:      MAX_TRADES,
    profit_target:  +(CAPITAL * MAX_PROFIT_PCT / 100).toFixed(2),
    loss_limit:     +(CAPITAL * MAX_LOSS_PCT / 100).toFixed(2),
    trades:         [],
    realized_pnl:   0,
    ...partial,
    started_at:     partial.started_at || new Date().toISOString(),
  };
  await redisSet('auto:session', record, 24 * 60 * 60).catch(e => {
    console.warn('   ⚠ Redis session save failed (non-fatal):', e.message);
  });
}

run().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
