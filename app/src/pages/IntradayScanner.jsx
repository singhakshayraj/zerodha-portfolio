// app/src/pages/IntradayScanner.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchQuotes, fetchPlan } from '../lib/api.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';

const WATCHLIST = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'SBIN', 'AXISBANK', 'BAJFINANCE', 'WIPRO', 'TATAMOTORS',
  'MARUTI', 'SUNPHARMA', 'LTIM', 'ADANIENT', 'ONGC',
];

// ── Market hours ──────────────────────────────────────────
function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ── Helpers ───────────────────────────────────────────────
function rsiColor(rsi) {
  if (rsi == null) return 'var(--text-muted)';
  if (rsi > 70) return 'var(--red)';
  if (rsi < 30) return 'var(--green)';
  return 'var(--text-secondary)';
}

function signalVariant(signal) {
  if (!signal) return 'neutral';
  const s = signal.toUpperCase();
  if (s.includes('STRONG BUY')) return 'bull';
  if (s.includes('BUY')) return 'bull';
  if (s.includes('STRONG SELL')) return 'bear';
  if (s.includes('SELL')) return 'bear';
  return 'neutral';
}

function rowClass(signal) {
  if (!signal) return '';
  const s = signal.toUpperCase();
  if (s.includes('BUY')) return 'row-bull-tint';
  if (s.includes('SELL')) return 'row-bear-tint';
  return '';
}

function BbBar({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pct = Math.max(0, Math.min(100, value));
  const barColor = pct > 80 || pct < 20 ? 'var(--red)' : 'var(--blue)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 48, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pct.toFixed(0)}</span>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────
function DetailPanel({ row, onClose, onLoadIndicators }) {
  const [indicators, setIndicators] = useState(row._indicators || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (indicators) return;
    setLoading(true);
    onLoadIndicators(row.symbol)
      .then(data => setIndicators(data))
      .catch(() => setIndicators(null))
      .finally(() => setLoading(false));
  }, [row.symbol]);

  const ind = indicators;

  return (
    <div
      className="slide-in-right"
      style={{
        position: 'fixed',
        top: 48,
        right: 0,
        width: 380,
        bottom: 0,
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        zIndex: 50,
        overflowY: 'auto',
        padding: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{row.symbol}</span>
          <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>NSE</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
        >
          ✕
        </button>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          ₹{row.ltp?.toFixed(2) ?? '—'}
        </div>
        <div style={{ fontSize: 13, color: row.chg_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {row.chg_pct != null ? `${row.chg_pct >= 0 ? '+' : ''}${row.chg_pct.toFixed(2)}%` : '—'}
        </div>
      </div>

      {/* Signal badge */}
      {row.signal && (
        <div style={{ marginBottom: 16 }}>
          <Badge variant={signalVariant(row.signal)} size="md" style={{ fontSize: 13, padding: '6px 14px' }}>
            {row.signal}
          </Badge>
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading indicators...</div>
      )}

      {ind && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'RSI (14)', value: ind.rsi?.toFixed(1) },
            { label: 'MACD', value: ind.macd_signal || (ind.macd_histogram >= 0 ? 'Bullish' : 'Bearish') },
            { label: 'Supertrend', value: ind.supertrend_direction || '—' },
            { label: 'BB %B', value: ind.bb_pct_b?.toFixed(1) },
            { label: 'BB Upper', value: ind.bb_upper?.toFixed(2) },
            { label: 'BB Lower', value: ind.bb_lower?.toFixed(2) },
            { label: 'Volume Trigger', value: ind.volume_trigger ? 'TRIGGERED' : 'No' },
            { label: 'Pattern', value: ind.pattern || '—' },
            { label: 'ATR', value: ind.atr?.toFixed(2) },
            { label: 'EMA 20', value: ind.ema_20?.toFixed(2) },
            { label: 'EMA 50', value: ind.ema_50?.toFixed(2) },
            { label: 'Stochastic', value: ind.stoch_k?.toFixed(1) },
          ].map(item => item.value && (
            <div
              key={item.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '7px 10px',
                background: 'var(--card-2)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export default function IntradayScanner() {
  const [rows, setRows] = useState(
    WATCHLIST.map(sym => ({ symbol: sym, ltp: null, chg_pct: null, _loading: true }))
  );
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [marketOpen] = useState(isMarketOpen);
  const intervalRef = useRef(null);

  const loadQuotes = useCallback(async () => {
    try {
      const symbols = WATCHLIST.map(s => `NSE:${s}`).join(',');
      const data = await fetchQuotes(symbols);
      setRows(prev => prev.map(row => {
        const key = `NSE:${row.symbol}`;
        const q = data?.[key] || data?.[row.symbol];
        if (!q) return { ...row, _loading: false };
        return {
          ...row,
          ltp: q.last_price,
          chg_pct: q.net_change != null && q.ohlc?.close
            ? ((q.last_price - q.ohlc.close) / q.ohlc.close) * 100
            : q.change_percent ?? null,
          volume: q.volume,
          ohlc: q.ohlc,
          _loading: false,
        };
      }));
      setLastUpdated(new Date());
    } catch {
      setRows(prev => prev.map(r => ({ ...r, _loading: false })));
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    if (marketOpen) {
      intervalRef.current = setInterval(loadQuotes, 60_000);
    }
    return () => clearInterval(intervalRef.current);
  }, [loadQuotes, marketOpen]);

  const loadIndicators = useCallback(async (symbol) => {
    const data = await fetchPlan({ symbol, exchange: 'NSE' });
    return data?.indicators || data;
  }, []);

  const handleRowClick = (row) => {
    setSelectedRow(row);
  };

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN')}` : 'Loading...'}
        </span>
        <button
          onClick={loadQuotes}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 12,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
        <span
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            background: marketOpen ? 'rgba(0,230,118,0.1)' : 'rgba(107,114,128,0.1)',
            color: marketOpen ? 'var(--green)' : 'var(--text-muted)',
            border: `1px solid ${marketOpen ? 'rgba(0,230,118,0.3)' : 'var(--border)'}`,
            fontWeight: 600,
          }}
        >
          {marketOpen ? '● MARKET OPEN' : '○ MARKET CLOSED'}
        </span>
        {marketOpen && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Auto-refresh every 60s</span>
        )}
      </div>

      {/* Table */}
      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'LTP', 'Chg%', 'RSI', 'MACD', 'Supertrend', 'BB %B', 'Vol Trigger', 'Pattern', 'Signal'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 12px',
                      textAlign: h === 'Symbol' ? 'left' : 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rc = rowClass(row.signal);
                const isLoading = row._loading;
                return (
                  <tr
                    key={row.symbol}
                    className={rc}
                    onClick={() => handleRowClick(row)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      height: 38,
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* Symbol */}
                    <td style={{ padding: '4px 12px', fontWeight: 600 }}>{row.symbol}</td>

                    {/* LTP */}
                    <td style={{ padding: '4px 12px', textAlign: 'center', fontWeight: 500 }}>
                      {isLoading ? <Skel w={50} /> : row.ltp?.toFixed(2) ?? '—'}
                    </td>

                    {/* Chg% */}
                    <td style={{ padding: '4px 12px', textAlign: 'center', color: row.chg_pct >= 0 ? 'var(--green)' : row.chg_pct < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {isLoading ? <Skel w={40} /> : row.chg_pct != null ? `${row.chg_pct >= 0 ? '+' : ''}${row.chg_pct.toFixed(2)}%` : '—'}
                    </td>

                    {/* RSI */}
                    <td style={{ padding: '4px 12px', textAlign: 'center', color: rsiColor(row.rsi), fontWeight: row.rsi > 70 || row.rsi < 30 ? 700 : 400 }}>
                      {isLoading ? <Skel w={30} /> : row.rsi?.toFixed(1) ?? '—'}
                    </td>

                    {/* MACD */}
                    <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                      {isLoading ? <Skel w={40} /> : row.macd_signal ? (
                        <Badge variant={row.macd_signal === 'Bull' ? 'bull' : 'bear'} size="sm">
                          {row.macd_signal}
                        </Badge>
                      ) : '—'}
                    </td>

                    {/* Supertrend */}
                    <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                      {isLoading ? <Skel w={30} /> : row.supertrend != null ? (
                        <span style={{ color: row.supertrend === 'up' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                          {row.supertrend === 'up' ? '▲' : '▼'}
                        </span>
                      ) : '—'}
                    </td>

                    {/* BB %B */}
                    <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                      {isLoading ? <Skel w={60} /> : <BbBar value={row.bb_pct_b} />}
                    </td>

                    {/* Vol Trigger */}
                    <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                      {isLoading ? <Skel w={40} /> : row.vol_trigger ? (
                        <span style={{ color: 'var(--yellow)', fontWeight: 700, fontSize: 11 }}>🔥 TRIGGERED</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Pattern */}
                    <td style={{ padding: '4px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>
                      {isLoading ? <Skel w={50} /> : row.pattern || '—'}
                    </td>

                    {/* Signal */}
                    <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                      {isLoading ? <Skel w={60} /> : row.signal ? (
                        <Badge variant={signalVariant(row.signal)} size="sm">
                          {row.signal}
                        </Badge>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Panel */}
      {selectedRow && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedRow(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 49,
              background: 'rgba(0,0,0,0.3)',
            }}
          />
          <DetailPanel
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            onLoadIndicators={loadIndicators}
          />
        </>
      )}
    </div>
  );
}

function Skel({ w }) {
  return (
    <span style={{
      display: 'inline-block',
      width: w,
      height: 12,
      borderRadius: 4,
      background: 'var(--border)',
      animation: 'pulse 2s ease-in-out infinite',
      verticalAlign: 'middle',
    }} />
  );
}
