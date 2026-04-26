// app/src/lib/api.js
const BASE = import.meta.env.VITE_API_BASE || '';

function getEnctoken(enctoken) {
  if (enctoken) return enctoken;
  try {
    return localStorage.getItem('enctoken') || '';
  } catch {
    return '';
  }
}

function kiteHeaders(enctoken) {
  const token = getEnctoken(enctoken);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Kite-Enctoken'] = token;
  return headers;
}

export async function fetchBrain(force = false) {
  const url = `${BASE}/api/intel?action=brain${force ? '&force=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Brain fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPortfolio(enctoken) {
  const res = await fetch(`${BASE}/api/kite?action=portfolio`, {
    headers: kiteHeaders(enctoken),
  });
  if (!res.ok) throw new Error(`Portfolio fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchHoldings(enctoken) {
  const res = await fetch(`${BASE}/api/kite?action=holdings`, {
    headers: kiteHeaders(enctoken),
  });
  if (!res.ok) throw new Error(`Holdings fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchMargins(enctoken) {
  const res = await fetch(`${BASE}/api/kite?action=margins`, {
    headers: kiteHeaders(enctoken),
  });
  if (!res.ok) throw new Error(`Margins fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPlan(body, enctoken) {
  const res = await fetch(`${BASE}/api/intel?action=plan`, {
    method: 'POST',
    headers: kiteHeaders(enctoken),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Plan fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchAnalysis(company) {
  const res = await fetch(`${BASE}/api/intel?action=analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company }),
  });
  if (!res.ok) throw new Error(`Analysis fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchQuotes(symbols, enctoken) {
  const syms = Array.isArray(symbols) ? symbols.join(',') : symbols;
  const res = await fetch(`${BASE}/api/research?action=quotes&symbols=${encodeURIComponent(syms)}`, {
    headers: kiteHeaders(enctoken),
  });
  if (!res.ok) throw new Error(`Quotes fetch failed: ${res.status}`);
  return res.json();
}

export async function recordOutcome(ltpMap) {
  const res = await fetch(`${BASE}/api/intel?action=record_outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ltpMap }),
  });
  if (!res.ok) throw new Error(`Record outcome failed: ${res.status}`);
  return res.json();
}

export async function fetchTrades() {
  const res = await fetch(`${BASE}/api/orders?action=list`);
  if (!res.ok) throw new Error(`Trades fetch failed: ${res.status}`);
  return res.json();
}

export async function verifyKiteToken(enctoken) {
  const res = await fetch(`${BASE}/api/kite?action=profile`, {
    headers: kiteHeaders(enctoken),
  });
  if (!res.ok) throw new Error(`Token verification failed: ${res.status}`);
  return res.json();
}
