/**
 * Upstash Redis HTTP wrapper — graceful degradation layer.
 *
 * Uses Upstash's REST API (HTTP-based, no persistent connection).
 * If UPSTASH_REDIS_URL or UPSTASH_REDIS_TOKEN are absent, every
 * operation is a silent no-op and the caller falls back to in-memory state.
 *
 * Design contract:
 *   - redisGet()  → returns parsed value or null (never throws)
 *   - redisSet()  → fire-and-forget, never throws, never delays caller
 *   - redisDel()  → fire-and-forget, never throws
 *
 * All JSON serialisation/deserialisation is handled internally.
 */

const REDIS_URL   = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

function configured() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function cmd(...args) {
  if (!configured()) return null;
  try {
    const path = args.map(a => encodeURIComponent(String(a))).join('/');
    const res  = await fetch(`${REDIS_URL}/${path}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ?? null;
  } catch {
    return null;
  }
}

export async function redisGet(key) {
  const raw = await cmd('GET', key);
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function redisSet(key, value, ttlSeconds) {
  if (!configured()) return;
  const s = JSON.stringify(value);
  // SETEX: key ttl value — atomic set with expiry
  cmd('SETEX', key, ttlSeconds, s).catch(() => {});
}

export async function redisDel(key) {
  if (!configured()) return;
  cmd('DEL', key).catch(() => {});
}
