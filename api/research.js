// Merged into api/intel.js — this file is a stub to avoid breaking old direct links.
export default function handler(req, res) {
  res.status(301).setHeader('Location', req.url.replace('/api/research', '/api/intel')).end();
}
