import { requireAdmin, AuthError } from '../lib/auth.js';
import { runClassifyKeywords } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 128 * 1024 });
    const keywords = Array.isArray(body?.keywords) ? body.keywords : null;
    if (!keywords) {
      throw new HttpError('keywords array is required', 400);
    }
    if (keywords.length > 1000) {
      throw new HttpError('too many keywords (max 1000)', 400);
    }
    if (keywords.some((k) => String(k).length > 80)) {
      throw new HttpError('keyword is too long (max 80 chars)', 400);
    }

    const assignments = await runClassifyKeywords(keywords);
    return res.status(200).json({ assignments });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
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
