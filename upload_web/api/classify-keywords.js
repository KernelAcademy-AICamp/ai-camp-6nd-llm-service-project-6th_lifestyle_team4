import { requireAdmin, AuthError } from '../lib/auth.js';
import { runClassifyKeywords } from '../lib/anthropic.js';

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
    const keywords = Array.isArray(body?.keywords) ? body.keywords : null;
    if (!keywords) {
      return res.status(400).json({ error: 'keywords array is required' });
    }
    if (keywords.length > 1000) {
      return res.status(400).json({ error: 'too many keywords (max 1000)' });
    }

    const assignments = await runClassifyKeywords(keywords);
    return res.status(200).json({ assignments });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[classify-keywords] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
