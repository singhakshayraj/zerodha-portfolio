#!/usr/bin/env node
/**
 * Standalone daily portfolio report script.
 * Run: node scripts/daily-report.js
 *
 * In server mode (RUNTIME_MODE=server): fetches holdings from Kite REST API.
 * In local mode: use Claude Code MCP — this script is not needed.
 *
 * Outputs:
 *   - reports/daily/YYYY-MM-DD.html
 *   - data/history.json (appended)
 *   - dashboard/index.html (updated)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHoldings } from '../../dashboard/lib/kite.js';
import { generateDailyReportHTML } from './template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ── Paths ────────────────────────────────────────────────────────
const HISTORY_PATH    = path.join(ROOT, 'data', 'history.json');
const SECTORS_PATH    = path.join(ROOT, 'config', 'sectors.json');
const DASHBOARD_PATH  = path.join(ROOT, 'dashboard', 'index.html');
const REPORTS_DIR     = path.join(ROOT, 'reports', 'daily');

// ── Helpers ──────────────────────────────────────────────────────
function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function dateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dt = new Date(`${isoDate}T12:00:00+05:30`);
  return `${days[dt.getDay()]}, ${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function fmt(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ── Main ─────────────────────────────────────────────────────────
async function run() {
  console.log('📊 Daily Portfolio Report — ' + today());

  // 1. Fetch live holdings
  console.log('  Fetching holdings from Kite...');
  const rawHoldings = await getHoldings();

  // 2. Load sectors config
  const sectors = JSON.parse(fs.readFileSync(SECTORS_PATH, 'utf8'));

  // 3. Compute snapshot
  let totalInvested = 0, currentValue = 0, totalPnl = 0;
  let winners = 0, losers = 0;

  const holdings = rawHoldings.map(h => {
    const invested = h.quantity * h.average_price;
    const current  = h.quantity * h.last_price;
    const pnl      = h.pnl;
    const pnlPct   = invested > 0 ? (pnl / invested) * 100 : 0;

    totalInvested += invested;
    currentValue  += current;
    totalPnl      += pnl;
    if (pnl >= 0) winners++; else losers++;

    return {
      symbol:        h.tradingsymbol,
      sector:        sectors[h.tradingsymbol]?.sector || 'Other',
      qty:           h.quantity,
      avgPrice:      parseFloat(h.average_price.toFixed(2)),
      ltp:           parseFloat(h.last_price.toFixed(2)),
      pnl:           parseFloat(pnl.toFixed(2)),
      pnlPct:        parseFloat(pnlPct.toFixed(2)),
      dayChangePct:  parseFloat(h.day_change_percentage.toFixed(2)),
    };
  });

  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const snapshot = {
    date:          today(),
    totalInvested: Math.round(totalInvested),
    currentValue:  Math.round(currentValue),
    totalPnl:      Math.round(totalPnl),
    totalPnlPct:   parseFloat(totalPnlPct.toFixed(2)),
    winners,
    losers,
    holdings,
  };

  console.log(`  Invested: ${fmt(snapshot.totalInvested)} | Value: ${fmt(snapshot.currentValue)} | P&L: ${fmt(snapshot.totalPnl)} (${snapshot.totalPnlPct}%)`);

  // 4. Load history + get previous snapshot
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  const prevSnapshot = history.snapshots.length > 0
    ? history.snapshots[history.snapshots.length - 1]
    : null;

  // 5. Append snapshot to history (skip if same date already exists)
  const existingIdx = history.snapshots.findIndex(s => s.date === snapshot.date);
  if (existingIdx >= 0) {
    history.snapshots[existingIdx] = snapshot;
    console.log('  Updated existing snapshot for ' + snapshot.date);
  } else {
    history.snapshots.push(snapshot);
    console.log('  Appended new snapshot for ' + snapshot.date);
  }
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // 6. Generate daily report HTML
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `${snapshot.date}.html`);
  const reportHTML = generateDailyReportHTML({
    snapshot,
    prevSnapshot,
    dateLabel: dateLabel(snapshot.date),
  });
  fs.writeFileSync(reportPath, reportHTML);
  console.log('  Report written: reports/daily/' + snapshot.date + '.html');

  // 7. Update dashboard/index.html
  updateDashboard(history.snapshots, snapshot);
  console.log('  Dashboard updated.');

  console.log('\n✅ Done — ' + snapshot.date + ' | ' + snapshot.holdings.length + ' holdings | P&L: ' + snapshot.totalPnlPct + '%');
}

// ── Dashboard updater ────────────────────────────────────────────
function updateDashboard(snapshots, latest) {
  let html = fs.readFileSync(DASHBOARD_PATH, 'utf8');

  const fmt2 = (n) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const pnlClass = latest.totalPnl >= 0 ? 'green' : 'red';

  // Previous snapshot for delta
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const valueDelta = prev ? latest.currentValue - prev.currentValue : null;
  const deltaStr = valueDelta != null
    ? `${valueDelta >= 0 ? '▲' : '▼'} ₹${fmt2(Math.abs(valueDelta))} vs ${shortDate(prev.date)}`
    : '—';

  // Summary cards
  html = replaceBetween(html,
    '<!-- Latest Summary -->',
    '<!-- Charts -->',
    `<!-- Latest Summary -->
  <div class="cards">
    <div class="card">
      <div class="label">Total Invested</div>
      <div class="value white">₹${fmt2(latest.totalInvested)}</div>
      <div class="delta muted">Across ${latest.holdings.length} holdings</div>
    </div>
    <div class="card">
      <div class="label">Current Value</div>
      <div class="value white">₹${fmt2(latest.currentValue)}</div>
      <div class="delta ${valueDelta != null && valueDelta >= 0 ? 'green' : 'red'}">${deltaStr}</div>
    </div>
    <div class="card">
      <div class="label">Total P&L</div>
      <div class="value ${pnlClass}">${latest.totalPnl >= 0 ? '+' : '-'}₹${fmt2(latest.totalPnl)}</div>
      <div class="delta ${pnlClass}">${latest.totalPnlPct >= 0 ? '+' : ''}${latest.totalPnlPct.toFixed(2)}% overall</div>
    </div>
    <div class="card">
      <div class="label">Days Tracked</div>
      <div class="value white">${snapshots.length}</div>
      <div class="delta muted">Since ${shortDate(snapshots[0].date)}</div>
    </div>
  </div>

  <!-- Charts -->`
  );

  // History table
  const rows = [...snapshots].reverse().map((s, i) => {
    const isLatest = i === 0;
    const prevS = snapshots[snapshots.length - 1 - i - 1];
    const dayChange = prevS ? s.currentValue - prevS.currentValue : null;
    const dayChangeStr = dayChange != null
      ? `<span class="${dayChange >= 0 ? 'green' : 'red'}">${dayChange >= 0 ? '▲' : '▼'} ₹${fmt2(Math.abs(dayChange))}</span>`
      : '<span class="muted">— (Day 1)</span>';

    return `        <tr>
          <td><strong>${shortDate(s.date)} ${s.date.split('-')[0]}</strong>${isLatest ? ' <span style="font-size:11px;color:#68d391;margin-left:4px;">● Latest</span>' : ''}</td>
          <td>₹${fmt2(s.totalInvested)}</td>
          <td>₹${fmt2(s.currentValue)}</td>
          <td class="${s.totalPnl >= 0 ? 'green' : 'red'}">${s.totalPnl >= 0 ? '+' : '-'}₹${fmt2(s.totalPnl)}</td>
          <td class="${s.totalPnl >= 0 ? 'green' : 'red'}">${s.totalPnlPct >= 0 ? '+' : ''}${s.totalPnlPct.toFixed(2)}%</td>
          <td>${dayChangeStr}</td>
          <td><a class="report-link" href="/reports/daily/${s.date}.html">View →</a></td>
        </tr>`;
  }).join('\n');

  html = replaceBetween(html,
    '<tbody id="historyTable">',
    '</tbody>',
    `<tbody id="historyTable">\n${rows}\n      </tbody>`
  );

  // Stock grid
  const stockCards = latest.holdings.map(h => {
    const cls   = h.pnl >= 0 ? 'green' : 'red';
    const sign  = h.pnl >= 0 ? '+' : '-';
    const dayCls = h.dayChangePct >= 0.05 ? 'trend-up' : h.dayChangePct <= -0.05 ? 'trend-down' : 'trend-flat';
    const daySign = h.dayChangePct >= 0 ? '+' : '';
    return `      <div class="stock-card">
        <div class="sym">${h.symbol}</div>
        <div class="pnl ${cls}">${sign}₹${fmt2(Math.abs(h.pnl))} (${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%)</div>
        <div class="change ${dayCls}">Day: ${daySign}${h.dayChangePct.toFixed(2)}%</div>
      </div>`;
  }).join('\n');

  html = replaceBetween(html,
    `<h2>Stock Performance`,
    '</div>\n\n</div>',
    `<h2>Stock Performance — ${shortDate(latest.date)}</h2>
    <div class="stock-grid">
${stockCards}
    </div>
  </div>

</div>`
  );

  // Chart data
  const labels  = snapshots.map(s => shortDate(s.date));
  const invested = snapshots.map(s => s.totalInvested);
  const values   = snapshots.map(s => s.currentValue);
  html = html.replace(/labels: \[.*?\],/s, `labels: ${JSON.stringify(labels)},`);
  html = html.replace(/(label: 'Invested',\s*data: )\[.*?\]/s, `$1${JSON.stringify(invested)}`);
  html = html.replace(/(label: 'Current Value',\s*data: )\[.*?\]/s, `$1${JSON.stringify(values)}`);

  // Updated date in header
  html = html.replace(
    /Updated: <strong[^>]*>[^<]+<\/strong>/,
    `Updated: <strong style="color:#e2e8f0">${shortDate(latest.date)} ${latest.date.split('-')[0]}</strong>`
  );

  fs.writeFileSync(DASHBOARD_PATH, html);
}

function shortDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]}`;
}

function replaceBetween(html, startMarker, endMarker, replacement) {
  const startIdx = html.indexOf(startMarker);
  const endIdx   = html.indexOf(endMarker, startIdx + startMarker.length);
  if (startIdx === -1 || endIdx === -1) return html;
  return html.slice(0, startIdx) + replacement + html.slice(endIdx + endMarker.length);
}

run().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
