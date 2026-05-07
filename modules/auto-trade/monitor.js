#!/usr/bin/env node
/**
 * Standalone session monitor — circuit breaker for auto-trade sessions.
 * node modules/auto-trade/monitor.js
 *
 * State is read from and written to:
 *   data/auto-session.json   — primary (committed to Git, readable anywhere)
 *   Redis auto:session        — optional sync copy
 *
 * Called every 30 min during market hours by GitHub Actions.
 * Also accepts FORCE_STOP=true to immediately fire the circuit breaker.
 *
 * Required env vars:
 *   KITE_ENCTOKEN             — to cancel GTTs
 *   SUPABASE_URL / SUPABASE_ANON_KEY
 *
 * Optional:
 *   UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN
 *   FORCE_STOP=true           — bypass P&L check and stop the session immediately
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { listTrades, updateTrade } from '../../dashboard/lib/supabase.js';
import { cancelGTT }               from '../../dashboard/lib/kite.js';
import { redisSet }                from '../../dashboard/lib/redis.js';

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', '..', 'data', 'auto-session.json');

process.env.RUNTIME_MODE = 'server';

const ENCTOKEN   = process.env.KITE_ENCTOKEN || '';
const FORCE_STOP = process.env.FORCE_STOP === 'true';

// ── State helpers ─────────────────────────────────────────────────────────────
function readSession() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { return null; }
}

function writeSession(session) {
  const updated = { ...session, updated_at: new Date().toISOString() };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(updated, null, 2));
  redisSet('auto:session', updated, 24 * 60 * 60).catch(() => {});
  return updated;
}

function istDate() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
function fmt(n)    { return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

// ── Circuit breaker ───────────────────────────────────────────────────────────
async function fireCircuitBreaker(session, autoOpen, realizedPnl, stopReason) {
  console.log(`\n🛑 CIRCUIT BREAKER: ${stopReason}`);
  console.log(`   Cancelling GTTs and marking ${autoOpen.length} open trade(s)…`);
  console.log('   ⚠ Positions NOT auto-exited — close them manually in Kite.');

  const cancelled = [], errors = [];

  for (const trade of autoOpen) {
    if (trade.trigger_id && ENCTOKEN) {
      try {
        await cancelGTT(trade.trigger_id, ENCTOKEN);
        cancelled.push(trade.trigger_id);
        console.log(`   GTT ${trade.trigger_id} (${trade.symbol}) cancelled.`);
      } catch (e) {
        console.warn(`   ⚠ GTT cancel failed for ${trade.symbol}: ${e.message}`);
        errors.push({ symbol: trade.symbol, error: e.message });
      }
    } else if (!ENCTOKEN) {
      console.warn(`   ⚠ KITE_ENCTOKEN not set — skipping GTT cancel for ${trade.symbol}`);
    }

    await updateTrade(trade.id, {
      status: 'cancelled', exit_reason: 'circuit_breaker', closed_at: new Date().toISOString(),
    }).catch(e => console.warn(`   ⚠ DB update failed for ${trade.symbol}: ${e.message}`));
  }

  writeSession({
    ...session, status: 'stopped', realized_pnl: realizedPnl,
    stopped_at: new Date().toISOString(), stop_reason: stopReason,
    gtts_cancelled: cancelled.length, cancel_errors: errors,
  });

  console.log(`\n✅ Circuit breaker done — ${cancelled.length} GTT(s) cancelled, ${autoOpen.length} trade(s) marked.`);
  console.log('   Open data/auto-session.json or /auto dashboard to confirm.\n');

  if (errors.length) { process.exit(1); } // signal failure for GitHub Actions
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const today = istDate();
  console.log(`\n🔍 Session Monitor — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  if (FORCE_STOP) console.log('   FORCE_STOP=true — will stop immediately regardless of P&L');

  const session = readSession();

  if (!session) {
    console.log('   No session file found — nothing to monitor.'); process.exit(0);
  }

  if (session.date !== today) {
    console.log(`   Session is from ${session.date} (today ${today}) — stale, skipping.`); process.exit(0);
  }

  if (!FORCE_STOP && session.status !== 'active') {
    console.log(`   Session status '${session.status}' — not active, nothing to do.`); process.exit(0);
  }

  console.log(`   Capital: ${fmt(session.capital)} | Target: +${fmt(session.profit_target)} | Limit: −${fmt(session.loss_limit)}`);

  // Load auto-session trades from Supabase
  const allTrades  = await listTrades();
  const autoOpen   = allTrades.filter(t => t.source === 'auto_session' && t.status === 'open');
  const autoClosed = allTrades.filter(t => t.source === 'auto_session' && t.status === 'closed' && t.closed_at?.slice(0, 10) === today);
  const realizedPnl = +autoClosed.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2);

  console.log(`   Open: ${autoOpen.length} | Closed today: ${autoClosed.length} | Realized P&L: ${realizedPnl >= 0 ? '+' : ''}${fmt(realizedPnl)}`);

  // Force stop overrides everything
  if (FORCE_STOP) {
    await fireCircuitBreaker(session, autoOpen, realizedPnl, 'manual_force_stop');
    return;
  }

  // All positions closed naturally
  if (!autoOpen.length) {
    writeSession({ ...session, status: 'completed', realized_pnl: realizedPnl, stopped_at: new Date().toISOString(), stop_reason: 'all_positions_closed' });
    console.log('   ✅ All positions closed — session marked completed.'); process.exit(0);
  }

  // Circuit breaker check
  const { profit_target, loss_limit } = session;
  if (profit_target != null && realizedPnl >= profit_target) {
    await fireCircuitBreaker(session, autoOpen, realizedPnl, `profit_target_hit (+${fmt(realizedPnl)} ≥ +${fmt(profit_target)})`);
    return;
  }
  if (loss_limit != null && realizedPnl <= -loss_limit) {
    await fireCircuitBreaker(session, autoOpen, realizedPnl, `loss_limit_hit (−${fmt(Math.abs(realizedPnl))} ≥ −${fmt(loss_limit)})`);
    return;
  }

  // Normal check-in
  const pPct = profit_target ? (realizedPnl / profit_target * 100).toFixed(1) : '?';
  const lPct = loss_limit    ? (Math.abs(Math.min(0, realizedPnl)) / loss_limit * 100).toFixed(1) : '?';
  console.log(`   ✅ No circuit trip — profit ${pPct}% of target, loss ${lPct}% of limit`);
  writeSession({ ...session, realized_pnl: realizedPnl });
}

run().catch(err => { console.error('\n❌ Monitor error:', err.message); process.exit(1); });
