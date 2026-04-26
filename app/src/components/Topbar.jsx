// app/src/components/Topbar.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useMarket } from '../context/MarketContext.jsx';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/intraday': 'Intraday Scanner',
  '/research': 'Research Desk',
  '/journal': 'Trade Journal',
  '/connect': 'Connect Kite',
};

function fmt(n) {
  if (n == null) return '—';
  return (n / 100000).toFixed(2);
}

function fmtNum(n, prefix = '') {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '+';
  return `${sign}${prefix}${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function Chip({ label, value, color }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 6,
        background: 'var(--card-2)',
        border: '1px solid var(--border)',
        minWidth: 64,
      }}
    >
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1.4 }}>
        {value}
      </span>
    </div>
  );
}

function RegimeBadge({ regime }) {
  if (!regime) return <Chip label="Regime" value="—" />;
  const lower = regime.toLowerCase();
  const color = lower.includes('bull') ? 'var(--green)' : lower.includes('bear') ? 'var(--red)' : 'var(--yellow)';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 6,
        background: 'var(--card-2)',
        border: `1px solid ${color}`,
        minWidth: 64,
      }}
    >
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Regime</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{regime}</span>
    </div>
  );
}

function StateBadge({ label, value }) {
  if (!value) return null;
  const lower = (value || '').toLowerCase();
  const color = lower.includes('low') || lower.includes('bull') || lower.includes('positive')
    ? 'var(--green)'
    : lower.includes('high') || lower.includes('bear') || lower.includes('negative')
    ? 'var(--red)'
    : 'var(--yellow)';
  return (
    <div
      style={{
        padding: '3px 8px',
        borderRadius: 5,
        background: 'var(--card-2)',
        border: '1px solid var(--border)',
        fontSize: 11,
        color,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{label}: </span>
      {value}
    </div>
  );
}

export default function Topbar() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { pnl_summary, regime, vix_state, gift_nifty_bias } = useMarket();

  const title = PAGE_TITLES[location.pathname] || 'Brain';

  const invested = pnl_summary?.invested;
  const value = pnl_summary?.value;
  const totalPnl = pnl_summary?.total_pnl;
  const totalPct = pnl_summary?.total_pct;
  const dayPnl = pnl_summary?.day_pnl;
  const dayPct = pnl_summary?.day_pct;

  const pnlColor = (n) => (n == null ? 'var(--text-primary)' : n >= 0 ? 'var(--green)' : 'var(--red)');

  return (
    <header
      style={{
        height: 48,
        minHeight: 48,
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Page Title */}
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140 }}>
        {title}
      </span>

      {/* Center Stats */}
      <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
        <Chip label="Invested" value={invested != null ? `₹${fmt(invested)}L` : '—'} />
        <Chip label="Value" value={value != null ? `₹${fmt(value)}L` : '—'} />
        <Chip
          label="Total P&L"
          value={totalPnl != null ? `${fmtNum(totalPnl, '₹')} (${totalPct?.toFixed(1)}%)` : '—'}
          color={pnlColor(totalPnl)}
        />
        <Chip
          label="Day P&L"
          value={dayPnl != null ? fmtNum(dayPnl, '₹') : '—'}
          color={pnlColor(dayPnl)}
        />
        <RegimeBadge regime={regime} />
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StateBadge label="VIX" value={vix_state} />
        <StateBadge label="GIFT" value={gift_nifty_bias} />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--card-2)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
