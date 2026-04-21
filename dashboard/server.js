import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { config } from './config.js';
import { analyzeStock } from './lib/llm.js';
import { getHoldings, getPositions, getQuotes, getHistorical, placeOrder } from './lib/kite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = config.port;

const server = http.createServer(async (req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // Serve dashboard (root)
  if (req.method === 'GET' && req.url === '/') {
    const file = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Serve research.html
  if (req.method === 'GET' && req.url === '/research.html') {
    const file = fs.readFileSync(path.join(__dirname, 'research.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Serve intraday page
  if (req.method === 'GET' && req.url === '/intraday') {
    const file = fs.readFileSync(path.join(__dirname, 'intraday.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Serve connect page
  if (req.method === 'GET' && req.url === '/connect') {
    const file = fs.readFileSync(path.join(__dirname, 'connect.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Serve daily reports
  if (req.method === 'GET' && req.url.startsWith('/reports/daily/')) {
    const reportPath = path.join(__dirname, '..', req.url);
    if (!fs.existsSync(reportPath)) { res.writeHead(404); res.end('Report not found'); return; }
    const file = fs.readFileSync(reportPath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Serve alpha report
  if (req.method === 'GET' && req.url === '/alpha') {
    const alphaPath = path.join(__dirname, '..', 'modules', 'alpha-scorer', 'report.html');
    if (!fs.existsSync(alphaPath)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h2 style="font-family:sans-serif;padding:40px">Alpha report not generated yet.<br><br>Run: <code>python3 modules/alpha-scorer/model.py</code> first.</h2>');
      return;
    }
    const file = fs.readFileSync(alphaPath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file); return;
  }

  // Symbol search / suggestions
  if (req.method === 'POST' && req.url === '/symbol-search') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { query } = JSON.parse(body);
        if (!query) { res.writeHead(400); res.end(JSON.stringify({ error: 'query required' })); return; }
        const scriptPath = path.join(__dirname, '..', 'modules', 'alpha-scorer', 'symbol_search.py');
        execFile('python3', [scriptPath, query], { timeout: 15000 }, (err, stdout, stderr) => {
          try {
            const result = JSON.parse(stdout.trim());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch(e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Search failed' }));
          }
        });
      } catch(e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // On-demand alpha score for any ticker
  if (req.method === 'POST' && req.url === '/alpha-score') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { ticker } = JSON.parse(body);
        if (!ticker) { res.writeHead(400); res.end(JSON.stringify({ error: 'ticker required' })); return; }

        const scriptPath = path.join(__dirname, '..', 'modules', 'alpha-scorer', 'model.py');
        execFile('python3', [scriptPath, '--ticker', ticker.toUpperCase()], { timeout: 60000 }, (err, stdout, stderr) => {
          if (err && !stdout) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: stderr || err.message })); return;
          }
          try {
            const result = JSON.parse(stdout.trim());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch(e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid response from model: ' + stdout.slice(0,200) }));
          }
        });
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Analyze endpoint — provider-agnostic via lib/llm.js
  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { company } = JSON.parse(body);
        if (!company) { res.writeHead(400); res.end(JSON.stringify({ error: 'company required' })); return; }
        const json = await analyzeStock(company);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      } catch (e) {
        console.error(`[${config.llm.provider}] analyze error:`, e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Live holdings endpoint
  if (req.method === 'GET' && req.url === '/api/holdings') {
    try {
      const enc = req.headers['x-kite-enctoken'];
      const holdings = await getHoldings(enc);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: holdings }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Live positions endpoint
  if (req.method === 'GET' && req.url === '/api/positions') {
    try {
      const enc = req.headers['x-kite-enctoken'];
      const data = await getPositions(enc);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Live quotes endpoint — GET /api/quotes?symbols=NSE:INFY,NSE:TCS
  if (req.method === 'GET' && req.url.startsWith('/api/quotes')) {
    try {
      const enc = req.headers['x-kite-enctoken'];
      const u = new URL(req.url, 'http://x');
      const symbols = (u.searchParams.get('symbols') || '').split(',').filter(Boolean);
      if (!symbols.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbols required' })); return; }
      const data = await getQuotes(symbols, enc);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Historical candles — GET /api/historical?symbol=INFY&interval=5minute
  if (req.method === 'GET' && req.url.startsWith('/api/historical')) {
    try {
      const enc = req.headers['x-kite-enctoken'];
      const u = new URL(req.url, 'http://x');
      const symbol   = u.searchParams.get('symbol');
      const interval = u.searchParams.get('interval') || '5minute';
      if (!symbol) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbol required' })); return; }
      const data = await getHistorical(symbol, interval, enc);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Place order via lib/kite.js
  if (req.method === 'POST' && req.url === '/trade') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { symbol, transaction_type, quantity, enctoken, exchange } = JSON.parse(body);
        if (!symbol || !transaction_type || !quantity) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'symbol, transaction_type, and quantity are required' }));
          return;
        }
        const result = await placeOrder({ symbol, transactionType: transaction_type, quantity, enctoken, exchange });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, status: 'success' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📊 Portfolio Intelligence Server running on port ${PORT}`);
  console.log(`   Mode          : ${config.runtimeMode}`);
  console.log(`   LLM Provider  : ${config.llm.provider}`);
  console.log(`   Dashboard     : http://localhost:${PORT}/`);
  console.log(`   Alpha Finder  : http://localhost:${PORT}/alpha`);
  console.log(`   Research Desk : http://localhost:${PORT}/research.html`);
  console.log(`\nTo expose publicly: npx cloudflared tunnel --url http://localhost:${PORT}`);
});
