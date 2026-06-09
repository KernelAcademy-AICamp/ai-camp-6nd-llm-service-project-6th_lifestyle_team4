// 단일 필드 재번역 — 편집 화면에서 영문 칸 우측 "↻ KO" 버튼이 호출.
// 카드 전체를 다시 돌리지 않고, 한 필드(quote / script_excerpt / title / subtitle / author)만 EN→KO 로 변환한다.
// 영어가 원본이므로 KO→EN 방향은 제공하지 않는다.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslateField } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

const ALLOWED_FIELDS = new Set([
  'quote', 'script_excerpt', 'title', 'subtitle', 'author',
  'excerpt_description', 'significance', 'keywords',
]);
const ALLOWED_DIRECTIONS = new Set(['en2ko', 'ko2en']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
    const text = String(body?.text ?? '').trim();
    const field = String(body?.field ?? '').trim();
    const direction = String(body?.direction ?? 'en2ko');
    if (!text) throw new HttpError('text is required', 400);
    if (!ALLOWED_FIELDS.has(field)) {
      throw new HttpError(`field must be one of ${[...ALLOWED_FIELDS].join(' | ')}`, 400);
    }
    if (!ALLOWED_DIRECTIONS.has(direction)) {
      throw new HttpError('direction must be en2ko or ko2en', 400);
    }
    if (text.length > 12000) throw new HttpError('text is too large', 413);

    // 작품 메타는 톤 추론 컨텍스트로만 사용 (선택)
    const work = body?.work && typeof body.work === 'object' ? body.work : null;

    const model = String(body?.model || 'haiku');
    const translated = await runTranslateField({ text, field, work, direction, model });
    return res.status(200).json({ translated });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[translate-field] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
