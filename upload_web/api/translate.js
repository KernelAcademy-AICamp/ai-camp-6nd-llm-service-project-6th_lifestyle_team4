import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslate } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
    const card = body?.card;
    if (!card || typeof card !== 'object') {
      throw new HttpError('card object is required', 400);
    }
    const quote = String(card.quote || '');
    const script = String(card.script_excerpt || '');
    if (!quote.trim() || !script.trim()) {
      throw new HttpError('card.quote and card.script_excerpt are required', 400);
    }
    if (quote.length > 2000 || script.length > 10000) {
      throw new HttpError('card text is too large', 413);
    }
    const work = body?.work && typeof body.work === 'object' ? body.work : null;

    const result = await runTranslate(work, card);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[translate] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
