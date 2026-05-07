#!/usr/bin/env node
/**
 * Standalone session monitor — circuit breaker for auto-trade sessions.
 * node modules/auto-trade/monitor.js
 *
 * Called every 30 min during market hours (9:30–3:30 PM IST) by GitHub Actions.
 * Reads the current session from Redis, computes realized P&L from Supabase,
 * and cancels GTTs + stops the session if profit/loss limits are hit.
 *
 * Required env vars:
 *   KITE_ENCTOKEN    — to cancel GTTs
 *   SUPABASE_URL / SUPABASE_ANON_KEY
 *   UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN
 */

import { listTrades, updateTrade }   from '../../dashboard/lib/supabase.js';
import { cancelGTT }                 from '../../dashboard/lib/kite.js';
import { redisGet, redisSet }        from '../../dashboard/lib/redis.js';

process.env.RUNTIME_MODE = 'server';

const ENCTOKEN = process.env.KITE_ENCTOKEN || '';

function istDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function fmt(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

async function run() {
  const today = istDate();
  console.log(`\n🔍 Session Monitor — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

  // Read current session from Redis
  const session = await redisGet('auto:session').catch(() => null);

  if (!session) {
    console.log('   No session found in Redis — nothing to monitor.');
    process.exit(0);
  }

  if (session.date !== today) {
    console.log(`   Session is from ${session.date} (today is ${today}) — stale, skipping.`);
    process.exit(0);
  }

  if (session.status !== 'active') {
    console.log(`   Session status is '${session.status}' — not active, nothing to do.`);
    process.exit(0);
  }

  console.log(`   Session found: capital ${fmt(session.capital)}, profit target +${fmt(session.profit_target)}, loss limit -${fmt(session.loss_limit)}`);

  // Load all trades from Supabase
  const allTrades = await listTrades();

  // Auto-session open trades
  const autoOpen = allTrades.filter(t => t.source === 'auto_session' && t.status === 'open');

  // Auto-session closed trades from today → realized P&L
  const autoClosed = allTrades.filter(t =>
    t.source === 'auto_session' &&
    t.status === 'closed' &&
    t.closed_at?.slice(0, 10) === today
  );

  const realizedPnl = +autoClosed.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2);
  console.log(`   Open trades: ${autoOpen.length} | Closed today: ${autoClosed.length} | Realized P&L: ${realizedPnl >= 0 ? '+' : ''}${fmt(realizedPnl)}`);

  // All positions closed naturally
  if (!autoOpen.length) {
    const done = { ...session, status: 'completed', realized_pnl: realizedPnl, stopped_at: new Date().toISOString(), stop_reason: 'all_positions_closed' };
    await redisSet('auto:session', done, 24 * 60 * 60).catch(() => {});
    console.log('   ✅ All positions closed — session marked completed.');
    process.exit(0);
  }

  // Circuit breaker logic
  const { profit_target, loss_limit } = session;
  let circuitFired = false;
  let stopReason   = null;

  if (profit_target != null && realizedPnl >= profit_target) {
    circuitFired = true;
    stopReason   = `profit_target_hit (+${fmt(realizedPnl)} ≥ +${fmt(profit_target)})`;
  } else if (loss_limit != null && realizedPnl <= -loss_limit) {
    circuitFired = true;
    stopReason   = `loss_limit_hit (-${fmt(Math.abs(realizedPnl))} ≥ -${fmt(loss_limit)})`;
  }

  if (!circuitFired) {
    // Normal check-in
    const profitPct = profit_target ? (realizedPnl / profit_target * 100).toFixed(1) : '?';
    const lossPct   = loss_limit    ? (Math.abs(Math.min(0, realizedPnl)) / loss_limit * 100).toFixed(1) : '?';
    console.log(`   ✅ No circuit trip — profit ${profitPct}% of target, loss exposure ${lossPct}% of limit`);
    await redisSet('auto:session', { ...session, realized_pnl: realizedPnl }, 24 * 60 * 60).catch(() => {});
    process.exit(0);
  }

  // ── Circuit breaker fired ─────────────────────────────────────────────────

  console.log(`\n🛑 CIRCUIT BREAKER: ${stopReason}`);
  console.log(`   Cancelling GTTs and marking ${autoOpen.length} open trade(s) as cancelled…`);
  console.log('   ⚠ Open positions NOT auto-exited — please close them manually in Kite.');

  const cancelled = [];
  const errors    = [];

  for (const trade of autoOpen) {
    // Cancel GTT
    if (trade.trigger_id) {
      if (ENCTOKEN) {
        try {
          await cancelGTT(trade.trigger_id, ENCTOKEN);
          cancelled.push(trade.trigger_id);
          console.log(`   GTT ${trade.trigger_id} (${trade.symbol}) cancelled.`);
        } catch (e) {
          console.warn(`   ⚠ GTT cancel failed for ${trade.symbol}: ${e.message}`);
          errors.push({ symbol: trade.symbol, error: e.message });
        }
      } else {
        console.warn(`   ⚠ KITE_ENCTOKEN not set — skipping GTT cancel for ${trade.symbol}`);
      }
    }

    // Mark trade as cancelled in Supabase
    try {
      await updateTrade(trade.id, {
        status:      'cancelled',
        exit_reason: 'circuit_breaker',
        closed_at:   new Date().toISOString(),
      });
    } catch (e) {
      console.warn(`   ⚠ DB update failed for ${trade.symbol}: ${e.message}`);
    }
  }

  const stopped = {
    ...session,
    status:        'stopped',
    realized_pnl:  realizedPnl,
    stopped_at:    new Date().toISOString(),
    stop_reason:   stopReason,
    gtts_cancelled: cancelled.length,
    cancel_errors:  errors,
  };
  await redisSet('auto:session', stopped, 24 * 60 * 60).catch(() => {});

  console.log(`\n✅ Circuit breaker complete — ${cancelled.length} GTT(s) cancelled, ${autoOpen.length} trade(s) marked.`);
  console.log('   Session status: stopped. Go to Kite → Portfolio and exit open positions manually.\n');

  if (errors.length) {
    console.warn(`   ⚠ ${errors.length} GTT cancellation error(s) — check Kite manually.`);
    process.exit(1); // non-zero so GitHub Actions flags it
  }
}

run().catch(err => {
  console.error('\n❌ Monitor error:', err.message);
  process.exit(1);
});
