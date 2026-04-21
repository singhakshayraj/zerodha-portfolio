// Temporary debug endpoint — shows exactly what we send to Kite and what it returns
// Remove after debugging is done

import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const raw = req.headers['x-kite-enctoken'] || '';
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch (_) {}
  const trimmed = decoded.trim();

  // Make the raw Kite request and return everything
  const result = await new Promise(resolve => {
    const options = {
      hostname: 'api.kite.trade',
      path: '/user/profile',   // lighter endpoint than /portfolio/holdings
      method: 'GET',
      headers: {
        'Authorization': `enctoken ${trimmed}`,
        'X-Kite-Version': '3',
        'User-Agent': 'Mozilla/5.0',
      },
    };
    const req2 = https.request(options, r => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req2.on('error', e => resolve({ status: 0, body: e.message }));
    req2.end();
  });

  res.status(200).json({
    token_received_raw_length: raw.length,
    token_after_decode_length: trimmed.length,
    token_first_10_chars: trimmed.slice(0, 10) + '...',
    token_last_5_chars: '...' + trimmed.slice(-5),
    kite_status: result.status,
    kite_response: result.body.slice(0, 500),
  });
}
