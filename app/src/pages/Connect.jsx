// app/src/pages/Connect.jsx
import React, { useState, useEffect } from 'react';
import { verifyKiteToken } from '../lib/api.js';
import Card from '../components/Card.jsx';

export default function Connect() {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { ok, message, profile }
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('enctoken') || '';
    setSavedToken(stored);
    setToken(stored);
  }, []);

  const isConnected = Boolean(savedToken);

  const handleSave = () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    localStorage.setItem('enctoken', trimmed);
    setSavedToken(trimmed);
    setVerifyResult(null);
    setError(null);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('enctoken');
    setSavedToken('');
    setToken('');
    setVerifyResult(null);
    setError(null);
  };

  const handleTest = async () => {
    setVerifying(true);
    setVerifyResult(null);
    setError(null);
    try {
      const data = await verifyKiteToken(savedToken || token.trim());
      const profile = data?.data || data;
      setVerifyResult({
        ok: true,
        message: `Connected as ${profile?.user_name || profile?.name || 'Unknown'}`,
        profile,
      });
    } catch (err) {
      setVerifyResult({ ok: false, message: err.message || 'Token verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 40,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Connect Kite Account
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Link your Zerodha Kite account to enable live portfolio tracking, quotes, and order data.
          </p>
        </div>

        {/* Status badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 20,
            background: isConnected ? 'rgba(0,230,118,0.1)' : 'rgba(107,114,128,0.1)',
            border: `1px solid ${isConnected ? 'rgba(0,230,118,0.3)' : 'var(--border)'}`,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isConnected ? 'var(--green)' : 'var(--text-muted)',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isConnected ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {/* Instructions */}
        <div
          style={{
            background: 'var(--card-2)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            How to get your enctoken
          </div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {[
              'Open Kite Web (kite.zerodha.com) in your browser',
              'Log in to your account',
              <>Open DevTools → Network tab (<kbd style={{ fontFamily: 'monospace', fontSize: 10, background: 'var(--border)', padding: '1px 5px', borderRadius: 3 }}>F12</kbd>)</>,,
              'Reload the page and click on any API request',
              <>In Request Headers, find and copy the <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>enctoken</code> value</>,
              'Paste it in the field below and click Save',
            ].filter(Boolean).map((step, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 7, lineHeight: 1.5 }}>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            Enctoken
          </label>
          <textarea
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your enctoken here..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'var(--card-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--blue)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={handleSave}
            disabled={!token.trim() || token.trim() === savedToken}
            style={{
              flex: 1,
              padding: '9px 0',
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: !token.trim() || token.trim() === savedToken ? 'not-allowed' : 'pointer',
              opacity: !token.trim() || token.trim() === savedToken ? 0.6 : 1,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Save Token
          </button>

          {savedToken && (
            <button
              onClick={handleTest}
              disabled={verifying}
              style={{
                padding: '9px 16px',
                background: 'var(--card-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: verifying ? 'not-allowed' : 'pointer',
                opacity: verifying ? 0.7 : 1,
                fontFamily: 'Inter, system-ui, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {verifying ? 'Testing...' : '✓ Test Connection'}
            </button>
          )}

          {savedToken && (
            <button
              onClick={handleDisconnect}
              style={{
                padding: '9px 16px',
                background: 'rgba(255,82,82,0.08)',
                border: '1px solid rgba(255,82,82,0.2)',
                borderRadius: 8,
                color: 'var(--red)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Test result */}
        {verifyResult && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: verifyResult.ok ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)',
              border: `1px solid ${verifyResult.ok ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.25)'}`,
              fontSize: 13,
              color: verifyResult.ok ? 'var(--green)' : 'var(--red)',
              fontWeight: 500,
            }}
          >
            {verifyResult.ok ? '✓ ' : '✗ '}{verifyResult.message}
            {verifyResult.profile && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {verifyResult.profile.email && <div>Email: {verifyResult.profile.email}</div>}
                {verifyResult.profile.user_id && <div>User ID: {verifyResult.profile.user_id}</div>}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Security note */}
        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>Security note:</strong> Your enctoken is stored only in your browser's localStorage and never sent to any third-party server. It is only used to make requests to the Kite API on your behalf.
        </div>
      </Card>
    </div>
  );
}
