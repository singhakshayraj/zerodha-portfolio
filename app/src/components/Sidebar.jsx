// app/src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  {
    to: '/', label: 'Dashboard',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5"/></svg>,
  },
  {
    to: '/intraday', label: 'Intraday',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><polyline points="1,11 5,6 8,9 11,4 15,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    to: '/research', label: 'Research',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    to: '/journal', label: 'Journal',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    to: '/connect', label: 'Connect',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 22, height: 22,
          background: 'oklch(65% 0.18 165)',
          borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 11,
          color: '#000',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>Z</div>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '0.02em',
        }}>Intelligence</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px' }}>
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 2,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isActive ? 'var(--card-2)' : 'transparent',
              borderLeft: isActive ? '2px solid oklch(65% 0.18 165)' : '2px solid transparent',
              transition: 'all 0.12s ease',
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.classList.contains('active-nav')) {
                e.currentTarget.style.background = 'var(--card-2)';
              }
            }}
            onMouseLeave={e => {
              const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'oklch(65% 0.18 165)',
          display: 'inline-block',
          animation: 'pulse 2s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Market Open · NSE</span>
      </div>
    </aside>
  );
}
