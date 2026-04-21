import https from 'https';
import { config } from '../config.js';

const KITE_HOST = 'api.kite.trade';

function kiteRequest(path, enctoken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: KITE_HOST,
      path,
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
          if (parsed.status === 'error') reject(new Error(parsed.message || 'Kite API error'));
          else resolve(parsed.data);
        } catch (e) {
          reject(new Error('Kite returned non-JSON: ' + data.slice(0, 200)));
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
export async function getHoldings() {
  if (config.runtimeMode === 'local') {
    throw new Error('Local mode: use mcp__kite__get_holdings via Claude Code MCP');
  }
  const enctoken = config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set. Add it to your .env file.');
  return kiteRequest('/portfolio/holdings', enctoken);
}

/**
 * Fetch positions (intraday) from Kite.
 */
export async function getPositions() {
  if (config.runtimeMode === 'local') {
    throw new Error('Local mode: use mcp__kite__get_positions via Claude Code MCP');
  }
  const enctoken = config.kite.enctoken;
  if (!enctoken) throw new Error('KITE_ENCTOKEN is not set.');
  return kiteRequest('/portfolio/positions', enctoken);
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
      path: '/orders/regular',
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
