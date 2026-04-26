// app/src/components/Card.jsx
import React from 'react';

export default function Card({ title, children, className = '', style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
