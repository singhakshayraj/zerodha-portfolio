// app/src/components/Table.jsx
import React from 'react';

function SkeletonRow({ colCount }) {
  return (
    <tr>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} style={{ padding: '10px 12px' }}>
          <div
            style={{
              height: 12,
              borderRadius: 4,
              background: 'var(--border)',
              width: i === 0 ? '60%' : '40%',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function Table({ columns = [], data = [], onRowClick, loading = false }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={col.onSort}
                style={{
                  padding: '8px 12px',
                  textAlign: col.align || 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                  width: col.width,
                  cursor: col.onSort ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                {col.label}
                {col.sortDir && (
                  <span style={{ marginLeft: 4 }}>{col.sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <>
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
            </>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '32px 12px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                No data
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={row.id ?? rowIdx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={row._rowClass || ''}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--border)',
                  height: 36,
                  transition: 'background 0.1s ease',
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding: '4px 12px',
                      textAlign: col.align || 'left',
                      color: 'var(--text-primary)',
                      whiteSpace: col.nowrap !== false ? 'nowrap' : undefined,
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
