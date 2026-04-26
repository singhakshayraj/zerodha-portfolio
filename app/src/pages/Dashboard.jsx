// app/src/pages/Dashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useMarket } from '../context/MarketContext.jsx';
import { fetchQuotes } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Table from '../components/Table.jsx';

// ── Helpers ──────────────────────────────────────────────
function fmtL(n) {
  if (n == null) return '—';
  return `₹${(n / 100000).toFixed(2)}L`;
}

function fmtPct(n) {
  if (n == null) return '';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPnl(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function pnlColor(n) {
  if (n == null) return 'var(--text-primary)';
  return n >= 0 ? 'var(--green)' : 'var(--red)';
}

function ScoreDots({ score, max = 5 }) {
  return (
    <span style={{ letterSpacing: 2, fontSize: 12 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ color: i < score ? 'var(--blue)' : 'var(--border)' }}>●</span>
      ))}
    </span>
  );
}

// ── Summary Card ─────────────────────────────────────────
function SummaryCard({ label, value, sub, subColor }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: subColor || 'var(--text-secondary)' }}>{sub}</div>
      )}
    </Card>
  );
}

// ── Custom Tooltip ────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--blue)', fontWeight: 600 }}>
        ₹{payload[0].value?.toFixed(2)}L
      </div>
    </div>
  );
}

// ── Brain Card ────────────────────────────────────────────
function BrainCard() {
  const {
    brain, picks, regime, macro_risk, gift_nifty_bias,
    vix_state, market_sentiment, monitor, algo_note,
    brainUpdatedAt, loadingBrain, refreshBrain,
  } = useMarket();

  function regimeVariant(r) {
    if (!r) return 'neutral';
    const l = r.toLowerCase();
    if (l.includes('bull')) return 'bull';
    if (l.includes('bear')) return 'bear';
    return 'caution';
  }

  const bullPicks = picks.filter(p => p.bias?.toLowerCase() === 'bull' || p.direction?.toLowerCase() === 'bull');
  const bearPicks = picks.filter(p => p.bias?.toLowerCase() === 'bear' || p.direction?.toLowerCase() === 'bear');

  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Market Brain</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {brainUpdatedAt && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {brainUpdatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={refreshBrain}
            disabled={loadingBrain}
            style={{
              background: 'var(--card-2)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text-secondary)',
              fontSize: 11,
              padding: '3px 8px',
              cursor: loadingBrain ? 'not-allowed' : 'pointer',
              opacity: loadingBrain ? 0.5 : 1,
            }}
          >
            {loadingBrain ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {!brain ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {loadingBrain ? 'Loading brain data...' : 'No brain data available'}
        </div>
      ) : (
        <>
          {/* Regime */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Badge variant={regimeVariant(regime)} size="md" style={{ fontSize: 13, padding: '4px 10px' }}>
              {regime || 'Unknown'}
            </Badge>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {market_sentiment || 'Market conditions loading...'}
            </span>
          </div>

          {/* Context chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { label: 'Macro Risk', value: macro_risk },
              { label: 'GIFT Nifty', value: gift_nifty_bias },
              { label: 'VIX', value: vix_state },
              { label: 'Sentiment', value: market_sentiment },
            ].map(chip => chip.value && (
              <span
                key={chip.label}
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--card-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{chip.label}: </span>
                {chip.value}
              </span>
            ))}
          </div>

          {/* Monitor */}
          {monitor && (
            <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
              Coverage: {monitor.coverage_pct ?? '—'}% &nbsp;|&nbsp;
              🟢 {monitor.bull_count ?? 0} Bull &nbsp;
              🔴 {monitor.bear_count ?? 0} Bear &nbsp;
              ⚪ {monitor.neutral_count ?? 0} Neutral
            </div>
          )}

          {/* Picks table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {picks.slice(0, 8).map((pick, idx) => {
              const isBull = (pick.bias || pick.direction || '').toLowerCase() === 'bull';
              return (
                <div
                  key={pick.symbol || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 70px 70px 60px auto',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    borderRadius: 6,
                    borderLeft: `2px solid ${isBull ? 'var(--green)' : 'var(--red)'}`,
                    marginBottom: 3,
                    background: 'var(--card-2)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{idx + 1}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pick.symbol}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{pick.event_type || pick.type || '—'}</span>
                  <ScoreDots score={pick.confidence ?? pick.score ?? 3} />
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={pick.reason}
                  >
                    {(pick.reason || '').slice(0, 40)}{pick.reason?.length > 40 ? '...' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          {algo_note && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {algo_note}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Holdings Table ────────────────────────────────────────
function HoldingsTable({ holdings, picks, quotes }) {
  const [sortDir, setSortDir] = useState('desc');

  const pickMap = useMemo(() => {
    const m = {};
    (picks || []).forEach(p => { m[p.symbol] = p; });
    return m;
  }, [picks]);

  const rows = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => {
      const pa = a.pnl_pct ?? 0;
      const pb = b.pnl_pct ?? 0;
      return sortDir === 'desc' ? pb - pa : pa - pb;
    });
    return sorted.map(h => {
      const ltp = quotes?.[h.tradingsymbol]?.last_price ?? h.last_price ?? null;
      const pick = pickMap[h.tradingsymbol];
      return { ...h, _ltp: ltp, _pick: pick };
    });
  }, [holdings, sortDir, quotes, pickMap]);

  const toggleSort = () => setSortDir(d => d === 'desc' ? 'asc' : 'desc');

  const columns = [
    { key: 'tradingsymbol', label: 'Symbol', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'sector', label: 'Sector', render: (v) => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v || '—'}</span> },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'average_price', label: 'Avg', align: 'right', render: (v) => v?.toFixed(2) },
    {
      key: '_ltp', label: 'LTP', align: 'right',
      render: (v) => <span style={{ fontWeight: 500 }}>{v?.toFixed(2) ?? '—'}</span>,
    },
    {
      key: 'pnl', label: 'P&L ₹', align: 'right',
      render: (v, row) => {
        const pnl = row.pnl ?? (row._ltp != null ? (row._ltp - row.average_price) * row.quantity : null);
        return pnl != null ? (
          <span style={{ color: pnlColor(pnl), fontWeight: 600 }}>{fmtPnl(pnl)}</span>
        ) : '—';
      },
    },
    {
      key: 'pnl_pct', label: 'P&L %', align: 'right',
      onSort: toggleSort,
      sortDir,
      render: (v, row) => {
        const pct = row.pnl_pct ?? (row._ltp != null && row.average_price
          ? ((row._ltp - row.average_price) / row.average_price) * 100
          : null);
        return pct != null ? (
          <span style={{ color: pnlColor(pct) }}>{fmtPct(pct)}</span>
        ) : '—';
      },
    },
    {
      key: 'day_change_pct', label: 'Day %', align: 'right',
      render: (v) => v != null ? (
        <span style={{ color: pnlColor(v) }}>{fmtPct(v)}</span>
      ) : '—',
    },
    {
      key: '_pick', label: 'Signal',
      render: (pick) => {
        if (!pick) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
        const isBull = (pick.bias || pick.direction || '').toLowerCase() === 'bull';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Badge variant={isBull ? 'bull' : 'bear'} size="sm">
              {isBull ? '▲ Bull' : '▼ Bear'}
            </Badge>
            <ScoreDots score={pick.confidence ?? pick.score ?? 3} />
          </div>
        );
      },
    },
  ];

  return <Table columns={columns} data={rows} loading={!holdings.length && holdings.length === 0 ? false : false} />;
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const { holdings, pnl_summary, picks, loadingPortfolio } = useMarket();
  const [quotes, setQuotes] = useState(null);

  useEffect(() => {
    if (!holdings?.length) return;
    const symbols = holdings.map(h => `NSE:${h.tradingsymbol}`).join(',');
    fetchQuotes(symbols).then(setQuotes).catch(() => {});
  }, [holdings]);

  // Build chart data from holdings (simulate 30 days from portfolio snapshots)
  const chartData = useMemo(() => {
    if (!pnl_summary) return [];
    const currentValue = pnl_summary.value ?? 0;
    const invested = pnl_summary.invested ?? currentValue;
    // Generate 30 mock data points converging to current
    const points = 30;
    return Array.from({ length: points }).map((_, i) => {
      const progress = i / (points - 1);
      const noise = (Math.random() - 0.5) * 0.5;
      const val = invested + (currentValue - invested) * progress + noise * (invested * 0.005);
      const d = new Date();
      d.setDate(d.getDate() - (points - 1 - i));
      return {
        date: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        value: val / 100000,
      };
    });
  }, [pnl_summary]);

  const invested = pnl_summary?.invested;
  const value = pnl_summary?.value;
  const totalPnl = pnl_summary?.total_pnl ?? (invested != null && value != null ? value - invested : null);
  const totalPct = pnl_summary?.total_pct ?? (invested ? ((totalPnl / invested) * 100) : null);
  const dayPnl = pnl_summary?.day_pnl;
  const dayPct = pnl_summary?.day_pct;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Row 1 — Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <SummaryCard
          label="Invested"
          value={fmtL(invested)}
        />
        <SummaryCard
          label="Current Value"
          value={fmtL(value)}
          sub={totalPnl != null ? fmtPnl(totalPnl) : null}
          subColor={pnlColor(totalPnl)}
        />
        <SummaryCard
          label="Total P&L"
          value={<span style={{ color: pnlColor(totalPnl) }}>{fmtPnl(totalPnl)}</span>}
          sub={totalPct != null ? fmtPct(totalPct) : null}
          subColor={pnlColor(totalPct)}
        />
        <SummaryCard
          label="Day P&L"
          value={<span style={{ color: pnlColor(dayPnl) }}>{fmtPnl(dayPnl)}</span>}
          sub={dayPct != null ? fmtPct(dayPct) : null}
          subColor={pnlColor(dayPct)}
        />
      </div>

      {/* Row 2 — Chart + Brain */}
      <div style={{ display: 'grid', gridTemplateColumns: '60fr 40fr', gap: 12, minHeight: 320 }}>
        {/* Portfolio Chart */}
        <Card title="Portfolio Value (30 Days)" style={{ display: 'flex', flexDirection: 'column' }}>
          {chartData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              {loadingPortfolio ? 'Loading portfolio...' : 'No chart data available'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `₹${v.toFixed(1)}L`}
                  width={56}
                />
                <ReferenceLine
                  y={invested ? invested / 100000 : undefined}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--blue)"
                  strokeWidth={2}
                  fill="url(#chartGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--blue)', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Brain Card */}
        <BrainCard />
      </div>

      {/* Row 3 — Holdings Table */}
      <Card title="Holdings">
        {loadingPortfolio && holdings.length === 0 ? (
          <Table columns={[
            { key: 'tradingsymbol', label: 'Symbol' },
            { key: 'quantity', label: 'Qty', align: 'right' },
            { key: 'average_price', label: 'Avg', align: 'right' },
            { key: '_ltp', label: 'LTP', align: 'right' },
            { key: 'pnl', label: 'P&L ₹', align: 'right' },
            { key: 'pnl_pct', label: 'P&L %', align: 'right' },
            { key: 'day_change_pct', label: 'Day %', align: 'right' },
            { key: '_pick', label: 'Signal' },
          ]} data={[]} loading />
        ) : (
          <HoldingsTable holdings={holdings} picks={picks} quotes={quotes} />
        )}
      </Card>
    </div>
  );
}
