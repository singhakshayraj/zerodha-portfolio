/**
 * Minimal Supabase REST client — no SDK dependency.
 * Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel env vars.
 */

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_ANON_KEY;

function headers(extra = {}) {
  return {
    'Content-Type':  'application/json',
    'apikey':        KEY,
    'Authorization': `Bearer ${KEY}`,
    ...extra,
  };
}

function configured() {
  if (!BASE || !KEY) throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
}

// ── trades ────────────────────────────────────────────────────────────────────

export async function listTrades(status = null) {
  configured();
  let url = `${BASE}/rest/v1/trades?order=opened_at.desc`;
  if (status) url += `&status=eq.${status}`;
  const r = await fetch(url, { headers: headers({ 'Prefer': 'return=representation' }) });
  if (!r.ok) throw new Error(`Supabase listTrades: ${await r.text()}`);
  return r.json(); // array
}

export async function insertTrade(trade) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/trades`, {
    method: 'POST',
    headers: headers({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(trade),
  });
  if (!r.ok) throw new Error(`Supabase insertTrade: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function updateTrade(id, patch) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/trades?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Supabase updateTrade: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function deleteTrades(ids) {
  configured();
  // ids is an array of id strings
  const list = ids.map(id => `"${id}"`).join(',');
  const r = await fetch(`${BASE}/rest/v1/trades?id=in.(${list})`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) throw new Error(`Supabase deleteTrades: ${await r.text()}`);
}

// ── portfolio_snapshots ───────────────────────────────────────────────────────

export async function getLatestSnapshot() {
  configured();
  const r = await fetch(`${BASE}/rest/v1/portfolio_snapshots?order=snapshot_date.desc&limit=1`, {
    headers: headers(),
  });
  if (!r.ok) throw new Error(`Supabase getLatestSnapshot: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] ?? null;
}

export async function upsertSnapshot(snapshot) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/portfolio_snapshots`, {
    method: 'POST',
    headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(snapshot),
  });
  if (!r.ok) throw new Error(`Supabase upsertSnapshot: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function listSnapshots(limit = 90) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/portfolio_snapshots?order=snapshot_date.asc&limit=${limit}`, {
    headers: headers(),
  });
  if (!r.ok) throw new Error(`Supabase listSnapshots: ${await r.text()}`);
  return r.json();
}

// ── Generic helpers (used by outcomes.js) ────────────────────────────────────

export async function supabaseInsert(table, rows, { upsert = false, conflictKey = null } = {}) {
  configured();
  const prefer = upsert && conflictKey
    ? `resolution=merge-duplicates,return=representation`
    : 'return=representation';
  const url = upsert && conflictKey
    ? `${BASE}/rest/v1/${table}?on_conflict=${conflictKey}`
    : `${BASE}/rest/v1/${table}`;
  const r = await fetch(url, {
    method:  'POST',
    headers: headers({ Prefer: prefer }),
    body:    JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!r.ok) throw new Error(`Supabase insert ${table}: ${await r.text()}`);
  return r.json();
}

export async function supabaseSelect(table, { filter = '', order = '', limit = 100 } = {}) {
  configured();
  let url = `${BASE}/rest/v1/${table}?limit=${limit}`;
  if (filter) url += `&${filter}`;
  if (order)  url += `&order=${order}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Supabase select ${table}: ${await r.text()}`);
  return r.json();
}

export async function supabaseUpdate(table, id, patch) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body:    JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Supabase update ${table}: ${await r.text()}`);
  return r.json();
}

// ── brain_cache ───────────────────────────────────────────────────────────────
// Single-row cache: id=1 always upserted. Stores full brain result + timestamp.

export async function getBrainCache() {
  configured();
  const r = await fetch(`${BASE}/rest/v1/brain_cache?id=eq.1`, { headers: headers() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ?? null;
}

export async function setBrainCache(data) {
  configured();
  const r = await fetch(`${BASE}/rest/v1/brain_cache`, {
    method: 'POST',
    headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase setBrainCache: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}
