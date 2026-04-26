// app/src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/intraday', label: 'Intraday', icon: '⚡' },
  { to: '/research', label: 'Research', icon: '🔬' },
  { to: '/journal', label: 'Journal', icon: '📒' },
  { to: '/connect', label: 'Connect', icon: '🔗' },
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
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          📈 Brain
        </span>
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
              borderLeft: isActive ? '2px solid var(--blue)' : '2px solid transparent',
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
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        v1.0
      </div>
    </aside>
  );
}
