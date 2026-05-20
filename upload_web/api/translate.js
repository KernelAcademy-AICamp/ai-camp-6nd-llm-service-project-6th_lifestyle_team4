import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslate } from '../lib/anthropic.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req);
    const card = body?.card;
    if (!card || typeof card !== 'object') {
      return res.status(400).json({ error: 'card object is required' });
    }

    const result = await runTranslate(card);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[translate] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
