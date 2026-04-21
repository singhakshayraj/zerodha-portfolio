import https from 'https';
import { config } from '../config.js';

const KITE_HOST = 'kite.zerodha.com';
const KITE_PATH_PREFIX = '/oms';

// In-memory instruments cache (symbol → token), refreshed once per process
let _instrumentsCache = null;

// host: 'oms' (default) → kite.zerodha.com/oms, 'connect' → api.kite.trade
function kiteRequest(path, enctoken, host = 'oms') {
  const hostname = host === 'connect' ? 'api.kite.trade' : KITE_HOST;
  const fullPath = host === 'connect' ? path : KITE_PATH_PREFIX + path;
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: fullPath,
      method: 'GET',
      headers: {
        'Authorization': `enctoken ${enctoken}`,
        'X-Kite-Version': '3',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'error') {
            reject(new Error(`[${res.statusCode}] ${parsed.error_type || ''} ${parsed.message || 'Kite API error'}`.trim()));
          } else {
            resolve(parsed.data);
          }
        } catch (e) {
          reject(new Error(`Kite HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch all holdings from Kite.
 * In server mode: calls REST API with enctoken.
 * In local mode: throws — use mcp__kite__get_holdings via Claude Code instead.
 */
export async function getHoldings(clientEnctoken) {
  if (config.runtimeMode === 'local') {
    throw new Error('Local mode: use mcp__kite__get_holdings via Claude Code MCP');
  }
  const enctoken = clientEnctoken || config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set. Add it to your .env file.');
  return kiteRequest('/portfolio/holdings', enctoken);
}

/**
 * Fetch positions (intraday) from Kite.
 */
export async function getPositions(clientEnctoken) {
  if (config.runtimeMode === 'local') {
    throw new Error('Local mode: use mcp__kite__get_positions via Claude Code MCP');
  }
  const enctoken = clientEnctoken || config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set.');
  return kiteRequest('/portfolio/positions', enctoken);
}

/**
 * Fetch live quotes (LTP, OHLC, change) for given symbols.
 * symbols: ['NSE:INFY', 'NSE:TCS', 'NSE:NIFTY 50']
 * Accepts optional clientEnctoken to override config (for browser-stored tokens).
 */
export async function getQuotes(symbols, clientEnctoken) {
  const enctoken = clientEnctoken || config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set.');
  const qs = symbols.map(s => `i=${encodeURIComponent(s)}`).join('&');
  return kiteRequest(`/quote?${qs}`, enctoken);
}

/**
 * Fetch today's intraday candles for a symbol.
 * Looks up instrument_token from the NSE instruments list (cached in memory).
 */
export async function getHistorical(symbol, interval = '5minute', clientEnctoken) {
  const enctoken = clientEnctoken || config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set.');

  // Load instruments once
  if (!_instrumentsCache) {
    const csv = await new Promise((resolve, reject) => {
      const opts = { hostname: 'api.kite.trade', path: '/instruments/NSE', method: 'GET',
        headers: { 'X-Kite-Version': '3' } };
      const req = https.request(opts, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
      });
      req.on('error', reject); req.end();
    });
    const lines = csv.trim().split('\n');
    const h = lines[0].split(',');
    const ti = h.indexOf('instrument_token'), si = h.indexOf('tradingsymbol');
    _instrumentsCache = {};
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c[si]) _instrumentsCache[c[si].trim()] = c[ti].trim();
    }
  }

  const token = _instrumentsCache[symbol.toUpperCase()];
  if (!token) throw new Error(`Instrument token not found for ${symbol}`);

  // Today's session: 9:15 AM IST to now
  const now = new Date();
  const from = new Date(now);
  from.setHours(3, 45, 0, 0); // 9:15 AM IST = 3:45 AM UTC
  const fmt = d => d.toISOString().slice(0, 19).replace('T', '%2B');

  const path = `/instruments/historical/${token}/${interval}?from=${fmt(from)}&to=${fmt(now)}`;
  return kiteRequest(path, enctoken, 'connect');
}

/**
 * Place a market order via Kite REST API.
 * Works in both modes (already used this way in server.js /trade endpoint).
 */
export async function placeOrder({ symbol, transactionType, quantity, enctoken, exchange = 'NSE' }) {
  const token = enctoken || config.kite.enctoken;
  if (!token) throw new Error('enctoken required to place orders');

  const postData = new URLSearchParams({
    tradingsymbol: symbol.toUpperCase(),
    exchange,
    transaction_type: transactionType.toUpperCase(),
    order_type: 'MARKET',
    quantity: String(quantity),
    product: 'CNC',
    validity: 'DAY',
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: KITE_HOST,
      path: KITE_PATH_PREFIX + '/orders/regular',
      method: 'POST',
      headers: {
        'Authorization': `enctoken ${token}`,
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200 && result.status === 'success') resolve({ order_id: result.data.order_id });
          else {
            const errType = result.error_type || '';
            const errMsg  = result.message || result.error || '';
            reject(new Error(errType ? `[${errType}] ${errMsg}` : errMsg || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('Kite returned non-JSON (HTTP ' + res.statusCode + '): ' + data.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
