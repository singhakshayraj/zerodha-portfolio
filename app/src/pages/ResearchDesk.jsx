// app/src/pages/ResearchDesk.jsx
import React, { useState, useEffect, useRef } from 'react';
import { fetchAnalysis } from '../lib/api.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';

const MAX_RECENT = 5;

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem('research_recent') || '[]');
  } catch {
    return [];
  }
}

function saveRecent(searches) {
  try {
    localStorage.setItem('research_recent', JSON.stringify(searches));
  } catch {}
}

function ScoreBar({ score }) {
  const color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 30 }}>{score}%</span>
    </div>
  );
}

function verdictVariant(verdict) {
  if (!verdict) return 'neutral';
  const v = verdict.toUpperCase();
  if (v.includes('BUY') || v.includes('STRONG')) return 'bull';
  if (v.includes('SELL') || v.includes('AVOID')) return 'bear';
  if (v.includes('HOLD') || v.includes('WATCH')) return 'caution';
  return 'neutral';
}

function RatioTable({ ratios }) {
  if (!ratios) return null;
  const entries = typeof ratios === 'object'
    ? Object.entries(ratios)
    : [];

  if (!entries.length) return null;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{key}</td>
            <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>
              {val ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BulletList({ items, color }) {
  if (!items?.length) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None</span>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          <span style={{ color, flexShrink: 0, marginTop: 1 }}>●</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ResultCard({ result }) {
  const score = result.score ?? result.fundamental_score ?? 50;
  const symbol = result.symbol || result.ticker || '—';
  const exchange = result.exchange || 'NSE';
  const sector = result.sector || '—';
  const verdict = result.verdict || result.recommendation || '—';
  const bullCase = result.bull_case || result.bullish_factors || [];
  const bearCase = result.bear_case || result.bearish_factors || [];
  const ratios = result.ratios || result.key_ratios || null;
  const buyPrice = result.buy_price ?? result.entry ?? null;
  const target = result.target_price ?? result.target ?? null;
  const redFlags = result.red_flags || result.risks || [];
  const summary = result.summary || result.analysis || '';

  const upside = buyPrice && target ? (((target - buyPrice) / buyPrice) * 100).toFixed(1) : null;

  return (
    <Card style={{ marginTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{symbol}</span>
        <Badge variant="accent" size="sm">{exchange}</Badge>
        <Badge variant="neutral" size="sm">{sector}</Badge>
        <Badge variant={verdictVariant(verdict)} size="md" style={{ fontSize: 13, padding: '4px 12px', marginLeft: 'auto' }}>
          {verdict}
        </Badge>
      </div>

      {/* Score */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{score}</span>
          <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/ 100</span>
        </div>
        <ScoreBar score={score} />
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Bull Case
          </div>
          <BulletList items={bullCase} color="var(--green)" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Bear Case
          </div>
          <BulletList items={bearCase} color="var(--red)" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Key Ratios
          </div>
          <RatioTable ratios={ratios} />
        </div>
      </div>

      {/* Price row */}
      {(buyPrice || target) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--card-2)',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {buyPrice && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Buy <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>₹{Number(buyPrice).toFixed(2)}</span>
            </span>
          )}
          {buyPrice && target && (
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          )}
          {target && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Target <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>₹{Number(target).toFixed(2)}</span>
            </span>
          )}
          {upside && (
            <span style={{ color: 'var(--green)', fontWeight: 600, marginLeft: 'auto' }}>
              +{upside}% upside
            </span>
          )}
        </div>
      )}

      {/* Red flags */}
      {redFlags.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚠ Red Flags
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {redFlags.map((flag, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: 'rgba(255,234,0,0.08)',
                  border: '1px solid rgba(255,234,0,0.2)',
                  color: 'var(--yellow)',
                }}
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
          {summary}
        </div>
      )}
    </Card>
  );
}

export default function ResearchDesk() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(getRecent);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (searchQuery) => {
    const q = (searchQuery || query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await fetchAnalysis(q);
      setResult(data);

      // Update recent
      const updated = [q, ...recent.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
      setRecent(updated);
      saveRecent(updated);
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Search bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search any Indian stock or company..."
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: 15,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--blue)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            style={{
              padding: '12px 24px',
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !query.trim() ? 0.7 : 1,
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        {/* Recent searches */}
        {recent.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recent:</span>
            {recent.map(r => (
              <button
                key={r}
                onClick={() => { setQuery(r); handleSearch(r); }}
                style={{
                  fontSize: 11,
                  padding: '3px 9px',
                  borderRadius: 5,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              border: '3px solid var(--border)',
              borderTop: '3px solid var(--blue)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Analyzing {query}...
            </span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card>
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>⚠ {error}</div>
            <button
              onClick={() => handleSearch()}
              style={{
                fontSize: 12, padding: '6px 14px', borderRadius: 6,
                background: 'var(--card-2)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              Try again
            </button>
          </div>
        </Card>
      )}

      {/* Result */}
      {result && !loading && <ResultCard result={result} />}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
          <div style={{ fontSize: 14 }}>Search a company to get AI-powered fundamental analysis</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Examples: RELIANCE, Infosys, HDFC Bank</div>
        </div>
      )}
    </div>
  );
}
