// Proxies to the alpha-scorer FastAPI service (modules/alpha-scorer/app.py).
// Set ALPHA_SCORER_URL in Vercel env vars once the HF Space is deployed.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const scorerUrl = process.env.ALPHA_SCORER_URL;
  if (!scorerUrl) {
    res.status(503).json({ error: 'Alpha scorer not configured. Set ALPHA_SCORER_URL env var.' });
    return;
  }

  try {
    const { ticker } = req.body ?? {};
    if (!ticker) { res.status(400).json({ error: 'ticker required' }); return; }

    const upstream = await fetch(`${scorerUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
