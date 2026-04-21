/**
 * Generates a daily portfolio report HTML string.
 * Takes a snapshot object and optional previous snapshot for comparison.
 */
export function generateDailyReportHTML({ snapshot, prevSnapshot, dateLabel }) {
  const { date, totalInvested, currentValue, totalPnl, totalPnlPct, winners, losers, holdings } = snapshot;
  const pnlClass = totalPnl >= 0 ? 'green' : 'red';
  const pnlSign  = totalPnl >= 0 ? '+' : '';

  const prevValue  = prevSnapshot?.currentValue ?? null;
  const valueDelta = prevValue != null ? currentValue - prevValue : null;

  const fmt = (n) => '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const pct  = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  // Build holdings rows
  const holdingRows = holdings.map(h => {
    const invested = (h.qty * h.avgPrice);
    const current  = (h.qty * h.ltp);
    const pnlCls   = h.pnl >= 0 ? 'green' : 'red';
    const dayCls   = h.dayChangePct >= 0.05 ? 'green' : h.dayChangePct <= -0.05 ? 'red' : 'muted';
    const dayArrow = h.dayChangePct >= 0.05 ? '▲' : h.dayChangePct <= -0.05 ? '▼' : '—';

    // vs previous
    let vsCell = '<td class="muted">—</td>';
    if (prevSnapshot) {
      const prevH = prevSnapshot.holdings.find(p => p.symbol === h.symbol);
      if (prevH) {
        const prevCurrent = prevH.qty * prevH.ltp;
        const delta = current - prevCurrent;
        const deltaPct = prevCurrent ? (delta / prevCurrent) * 100 : 0;
        const dCls = delta >= 0 ? 'green' : 'red';
        const dArrow = delta >= 0 ? '▲' : '▼';
        vsCell = `<td class="${dCls}">${dArrow} ${pct(deltaPct)}</td>`;
      } else {
        vsCell = '<td style="color:#63b3ed;font-size:11px">New</td>';
      }
    }

    return `
      <tr>
        <td><div class="symbol">${h.symbol}</div><div class="sector">${h.sector || ''}</div></td>
        <td>${h.qty}</td>
        <td>₹${h.avgPrice.toFixed(2)}</td>
        <td>₹${h.ltp.toFixed(2)}</td>
        <td>${fmt(invested)}</td>
        <td>${fmt(current)}</td>
        <td class="${pnlCls}">${h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)}</td>
        <td class="${pnlCls}">${pct(h.pnlPct)}</td>
        ${vsCell}
      </tr>`;
  }).join('');

  // Simple action plan: sort by pnlPct
  const sorted = [...holdings].sort((a, b) => b.pnlPct - a.pnlPct);
  const topHold   = sorted.filter(h => h.pnlPct >  5).map(h => h.symbol).join(' · ') || '—';
  const toReview  = sorted.filter(h => h.pnlPct < -30).map(h => h.symbol).join(' · ') || '—';
  const toProfit  = sorted.filter(h => h.pnlPct > 30).map(h => h.symbol).join(' · ') || '—';

  const recoveryBanner = valueDelta != null && valueDelta > 0 ? `
  <div class="improvement-banner">
    ▲ Portfolio recovered ${fmt(valueDelta)} since last snapshot &nbsp;·&nbsp;
    P&L improved to ${pct(totalPnlPct)}
  </div>` : valueDelta != null && valueDelta < 0 ? `
  <div style="background:rgba(252,129,129,0.1);border:1px solid rgba(252,129,129,0.3);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:14px;color:#fc8181;">
    ▼ Portfolio declined ${fmt(Math.abs(valueDelta))} since last snapshot &nbsp;·&nbsp;
    P&L at ${pct(totalPnlPct)}
  </div>` : '';

  const prevLabel = prevSnapshot ? prevSnapshot.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m)-1]}`;
  }) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Portfolio Report — ${dateLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
    header { background: linear-gradient(135deg, #1a1f2e, #232840); padding: 32px 40px; border-bottom: 1px solid #2d3748; }
    header h1 { font-size: 24px; font-weight: 700; color: #fff; }
    header p { color: #718096; margin-top: 4px; font-size: 14px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px 40px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; padding: 20px; }
    .card .label { font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .card .sub { font-size: 12px; margin-top: 4px; }
    .red { color: #fc8181; } .green { color: #68d391; } .white { color: #fff; } .muted { color: #718096; }
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 16px; font-weight: 600; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #2d3748; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 14px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2d3748; }
    td { padding: 12px 14px; border-bottom: 1px solid #1e2535; }
    tr:hover td { background: #1e2535; }
    .symbol { font-weight: 600; color: #fff; }
    .sector { font-size: 12px; color: #718096; }
    .rec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .rec-card { background: #1a1f2e; border-radius: 8px; padding: 14px; }
    .rec-card.hold { border-left: 3px solid #68d391; }
    .rec-card.review { border-left: 3px solid #f6e05e; }
    .rec-card.profit { border-left: 3px solid #63b3ed; }
    .rec-card .rec-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .rec-card.hold .rec-label { color: #68d391; }
    .rec-card.review .rec-label { color: #f6e05e; }
    .rec-card.profit .rec-label { color: #63b3ed; }
    .rec-card .stocks { font-size: 13px; color: #e2e8f0; line-height: 1.8; }
    .improvement-banner { background: rgba(104,211,145,0.1); border: 1px solid rgba(104,211,145,0.3); border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; font-size: 14px; color: #68d391; }
    footer { text-align: center; padding: 24px; color: #4a5568; font-size: 12px; border-top: 1px solid #2d3748; margin-top: 16px; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topnav { background: #0d111c; border-bottom: 1px solid #2d3748; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; height: 48px; position: sticky; top: 0; z-index: 100; }
    .topnav-brand { font-size: 14px; font-weight: 700; color: #e2e8f0; text-decoration: none; letter-spacing: 0.02em; }
    .topnav-links { display: flex; gap: 28px; }
    .topnav-links a { font-size: 13px; color: #718096; text-decoration: none; transition: color 0.15s; }
    .topnav-links a:hover { color: #e2e8f0; }
    @media (max-width: 640px) { .topnav { padding: 0 16px; } .topnav-links { gap: 16px; } .container { padding: 16px; } .cards { grid-template-columns: repeat(2,1fr); } .rec-grid { grid-template-columns: 1fr; } table { font-size: 12px; } }
  </style>
</head>
<body>

<nav class="topnav">
  <a href="/" class="topnav-brand">📈 Portfolio</a>
  <div class="topnav-links">
    <a href="/">Dashboard</a>
    <a href="/alpha">Alpha Finder</a>
    <a href="/research.html">Research Desk</a>
  </div>
</nav>

<header>
  <h1>📊 Portfolio Report</h1>
  <p>${dateLabel} &nbsp;·&nbsp; Kite Connect via API</p>
</header>

<div class="container">
  ${recoveryBanner}

  <div class="cards">
    <div class="card">
      <div class="label">Total Invested</div>
      <div class="value white">${fmt(totalInvested)}</div>
      <div class="sub muted">Across ${holdings.length} holdings</div>
    </div>
    <div class="card">
      <div class="label">Current Value</div>
      <div class="value white">${fmt(currentValue)}</div>
      <div class="sub ${valueDelta != null && valueDelta >= 0 ? 'green' : 'red'}">${valueDelta != null ? (valueDelta >= 0 ? '▲' : '▼') + ' ' + fmt(Math.abs(valueDelta)) + (prevLabel ? ' vs ' + prevLabel : '') : '—'}</div>
    </div>
    <div class="card">
      <div class="label">Total P&L</div>
      <div class="value ${pnlClass}">${pnlSign}${fmt(totalPnl)}</div>
      <div class="sub ${pnlClass}">${pct(totalPnlPct)} overall</div>
    </div>
    <div class="card">
      <div class="label">Winners / Losers</div>
      <div class="value white">${winners} <span style="color:#718096;font-size:18px">/</span> <span class="red">${losers}</span></div>
      <div class="sub muted">${holdings.length} total positions</div>
    </div>
  </div>

  <div class="section">
    <h2>Holdings Detail</h2>
    <table>
      <thead>
        <tr>
          <th>Stock</th><th>Qty</th><th>Avg Buy</th><th>LTP</th>
          <th>Invested</th><th>Current</th><th>P&L</th><th>Return</th>
          ${prevSnapshot ? `<th>vs ${prevLabel || 'Prev'}</th>` : ''}
        </tr>
      </thead>
      <tbody>${holdingRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Action Plan</h2>
    <div class="rec-grid">
      <div class="rec-card hold">
        <div class="rec-label">✅ Hold — Strong Positions</div>
        <div class="stocks">${topHold}</div>
      </div>
      <div class="rec-card review">
        <div class="rec-label">⚠️ Review — Weak Positions</div>
        <div class="stocks">${toReview || 'None currently'}</div>
      </div>
      <div class="rec-card profit">
        <div class="rec-label">💰 Consider Booking Profits</div>
        <div class="stocks">${toProfit || 'None currently'}</div>
      </div>
    </div>
  </div>
</div>

<footer>
  Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST &nbsp;·&nbsp;
  <a href="/">View Consolidated Dashboard →</a>
</footer>
</body>
</html>`;
}
