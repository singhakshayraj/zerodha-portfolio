// app/src/pages/TradeJournal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { fetchTrades } from '../lib/api.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';

// ── Helpers ───────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

function fmtRR(rr) {
  if (rr == null) return '—';
  return typeof rr === 'number' ? rr.toFixed(2) : rr;
}

function rrColor(rr) {
  if (rr == null) return 'var(--text-muted)';
  const n = typeof rr === 'string' ? parseFloat(rr) : rr;
  if (n >= 2) return 'var(--green)';
  if (n >= 1) return 'var(--yellow)';
  return 'var(--red)';
}

function statusVariant(status) {
  const s = (status || '').toLowerCase();
  if (s === 'open') return 'accent';
  if (s === 'closed') return 'bull';
  if (s === 'cancelled') return 'neutral';
  return 'neutral';
}

function sideVariant(side) {
  const s = (side || '').toUpperCase();
  if (s === 'BUY') return 'bull';
  if (s === 'SELL') return 'bear';
  return 'neutral';
}

function pnlColor(n) {
  if (n == null) return 'var(--text-muted)';
  return n >= 0 ? 'var(--green)' : 'var(--red)';
}

function fmtPnl(n) {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '-';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// ── Stat Cards ────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ── Trade Drawer ──────────────────────────────────────────
function TradeDrawer({ trade, onClose }) {
  const factors = Array.isArray(trade.factors) ? trade.factors
    : typeof trade.factors === 'object' && trade.factors ? Object.values(trade.factors)
    : [];

  const confidence = trade.confidence_score ?? trade.confidence ?? null;
  const pnl = trade.pnl ?? trade.realized_pnl ?? null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.35)' }}
      />
      <div
        className="slide-in-right"
        style={{
          position: 'fixed',
          top: 48,
          right: 0,
          width: 400,
          bottom: 0,
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          zIndex: 50,
          overflowY: 'auto',
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{trade.symbol}</span>
            <Badge variant={statusVariant(trade.status)} size="md">{trade.status || '—'}</Badge>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* P&L big number */}
        {pnl != null && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: pnl >= 0 ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)',
              border: `1px solid ${pnl >= 0 ? 'rgba(0,230,118,0.2)' : 'rgba(255,82,82,0.2)'}`,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>P&L</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: pnlColor(pnl) }}>{fmtPnl(pnl)}</div>
          </div>
        )}

        {/* Price section */}
        <Section title="Prices">
          <Row label="Entry" value={trade.entry_price ? `₹${trade.entry_price}` : '—'} />
          <Row label="Target" value={trade.target_price ? `₹${trade.target_price}` : '—'} />
          <Row label="Stop Loss" value={trade.stop_loss ? `₹${trade.stop_loss}` : '—'} />
          <Row label="Exit Price" value={trade.exit_price ? `₹${trade.exit_price}` : '—'} />
          <Row
            label="R:R"
            value={<span style={{ color: rrColor(trade.rr_ratio) }}>{fmtRR(trade.rr_ratio)}</span>}
          />
          <Row label="Quantity" value={trade.quantity ?? '—'} />
          <Row label="Capital" value={trade.capital ? `₹${Number(trade.capital).toLocaleString('en-IN')}` : '—'} />
        </Section>

        {/* Confidence */}
        {confidence != null && (
          <Section title="Confidence">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(confidence / 10) * 100}%`, height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{confidence}/10</span>
            </div>
          </Section>
        )}

        {/* Factors */}
        {factors.length > 0 && (
          <Section title="Factors">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {factors.map((f, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 5,
                  background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                }}>
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Meta */}
        <Section title="Details">
          <Row label="Source" value={trade.source || '—'} />
          <Row label="Opened" value={fmtDate(trade.opened_at || trade.created_at)} />
          <Row label="Closed" value={fmtDate(trade.closed_at)} />
        </Section>

        {/* Notes */}
        {trade.notes && (
          <Section title="Notes">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{trade.notes}</p>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>
      <div style={{ background: 'var(--card-2)', borderRadius: 8, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export default function TradeJournal() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedTrade, setSelectedTrade] = useState(null);

  useEffect(() => {
    fetchTrades()
      .then(data => {
        const list = Array.isArray(data) ? data : data?.trades ?? [];
        setTrades(list);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return trades.filter(t => {
      const statusMatch = statusFilter === 'All' || (t.status || '').toLowerCase() === statusFilter.toLowerCase();
      const symbolMatch = !symbolSearch || (t.symbol || '').toLowerCase().includes(symbolSearch.toLowerCase());
      return statusMatch && symbolMatch;
    });
  }, [trades, statusFilter, symbolSearch]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => (t.status || '').toLowerCase() === 'closed');
    const wins = closed.filter(t => (t.pnl ?? t.realized_pnl ?? 0) > 0);
    const totalPnl = closed.reduce((acc, t) => acc + (t.pnl ?? t.realized_pnl ?? 0), 0);
    const avgRR = closed.length
      ? closed.reduce((acc, t) => acc + (parseFloat(t.rr_ratio) || 0), 0) / closed.length
      : 0;
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    return { total: trades.length, winRate, totalPnl, avgRR };
  }, [trades]);

  const STATUS_TABS = ['All', 'Open', 'Closed', 'Cancelled'];

  const columns = [
    { key: 'symbol', label: 'Symbol', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    {
      key: 'side', label: 'Side',
      render: v => <Badge variant={sideVariant(v)} size="sm">{v || '—'}</Badge>,
    },
    { key: 'entry_price', label: 'Entry', align: 'right', render: v => v ? `₹${v}` : '—' },
    { key: 'target_price', label: 'Target', align: 'right', render: v => v ? `₹${v}` : '—' },
    { key: 'stop_loss', label: 'SL', align: 'right', render: v => v ? `₹${v}` : '—' },
    {
      key: 'rr_ratio', label: 'R:R', align: 'right',
      render: v => <span style={{ color: rrColor(v), fontWeight: 600 }}>{fmtRR(v)}</span>,
    },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'capital', label: 'Capital', align: 'right', render: v => v ? `₹${Number(v).toLocaleString('en-IN')}` : '—' },
    {
      key: 'status', label: 'Status',
      render: v => <Badge variant={statusVariant(v)} size="sm">{v || '—'}</Badge>,
    },
    {
      key: 'pnl', label: 'P&L', align: 'right',
      render: (v, row) => {
        const pnl = v ?? row.realized_pnl;
        const status = (row.status || '').toLowerCase();
        if (status !== 'closed' || pnl == null) return '—';
        return <span style={{ color: pnlColor(pnl), fontWeight: 600 }}>{fmtPnl(pnl)}</span>;
      },
    },
    {
      key: 'opened_at', label: 'Opened', align: 'right',
      render: (v, row) => fmtDate(v || row.created_at),
    },
  ];

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Trades" value={stats.total} />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label="Total P&L"
          value={fmtPnl(stats.totalPnl)}
          color={pnlColor(stats.totalPnl)}
        />
        <StatCard
          label="Avg R:R"
          value={stats.avgRR.toFixed(2)}
          color={rrColor(stats.avgRR)}
        />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: statusFilter === tab ? 600 : 400,
                background: statusFilter === tab ? 'var(--blue)' : 'transparent',
                color: statusFilter === tab ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
                transition: 'all 0.12s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Symbol search */}
        <input
          value={symbolSearch}
          onChange={e => setSymbolSearch(e.target.value)}
          placeholder="Search symbol..."
          style={{
            padding: '6px 12px',
            fontSize: 13,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: 'Inter, system-ui, sans-serif',
            width: 180,
          }}
        />

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {error ? (
        <Card>
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      style={{
                        padding: '9px 12px',
                        textAlign: col.align || 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', height: 36 }}>
                      {columns.map(col => (
                        <td key={col.key} style={{ padding: '8px 12px' }}>
                          <div style={{ height: 12, borderRadius: 4, background: 'var(--border)', width: '60%', animation: 'pulse 2s ease-in-out infinite' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No trades found
                    </td>
                  </tr>
                ) : (
                  filtered.map((trade, idx) => (
                    <tr
                      key={trade.id || idx}
                      onClick={() => setSelectedTrade(trade)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        height: 36,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--card-2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          style={{
                            padding: '4px 12px',
                            textAlign: col.align || 'left',
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'middle',
                          }}
                        >
                          {col.render ? col.render(trade[col.key], trade) : trade[col.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Drawer */}
      {selectedTrade && (
        <TradeDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
    </div>
  );
}
