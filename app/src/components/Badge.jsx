// app/src/components/Badge.jsx
import React from 'react';

const VARIANT_STYLES = {
  bull: {
    background: 'rgba(0, 230, 118, 0.12)',
    color: 'var(--green)',
    border: '1px solid rgba(0, 230, 118, 0.25)',
  },
  bear: {
    background: 'rgba(255, 82, 82, 0.12)',
    color: 'var(--red)',
    border: '1px solid rgba(255, 82, 82, 0.25)',
  },
  caution: {
    background: 'rgba(255, 234, 0, 0.1)',
    color: 'var(--yellow)',
    border: '1px solid rgba(255, 234, 0, 0.25)',
  },
  neutral: {
    background: 'rgba(107, 114, 128, 0.12)',
    color: 'var(--text-muted)',
    border: '1px solid rgba(107, 114, 128, 0.2)',
  },
  accent: {
    background: 'rgba(41, 121, 255, 0.12)',
    color: 'var(--blue)',
    border: '1px solid rgba(41, 121, 255, 0.25)',
  },
};

const SIZE_STYLES = {
  sm: { fontSize: 10, padding: '1px 6px', borderRadius: 4 },
  md: { fontSize: 12, padding: '2px 8px', borderRadius: 5 },
};

export default function Badge({ variant = 'neutral', size = 'md', children, style = {} }) {
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...variantStyle,
        ...sizeStyle,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
