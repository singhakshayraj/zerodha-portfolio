import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const symbols = JSON.parse(readFileSync(join(__dirname, '../modules/alpha-scorer/nse_symbols.json'), 'utf8'));

function score(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  // partial character overlap
  let matches = 0;
  for (const ch of q) if (t.includes(ch)) matches++;
  return Math.round((matches / q.length) * 50);
}

export default function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const query = (req.body?.query || '').trim();
  if (!query || query.length < 1) { res.status(400).json({ error: 'query required' }); return; }

  const results = symbols
    .map(s => ({
      symbol: s.symbol,
      name:   s.name || s.symbol,
      sector: s.sector || '',
      score:  Math.max(score(query, s.symbol), score(query, s.name || '')),
    }))
    .filter(s => s.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ symbol, name, sector }) => ({ symbol, name, sector }));

  res.status(200).json(results);
}
