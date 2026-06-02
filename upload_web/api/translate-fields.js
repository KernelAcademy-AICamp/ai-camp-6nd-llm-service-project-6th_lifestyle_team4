// 여러 필드 한 번에 번역하는 일반 batch endpoint.
//   body: { fields: [{ name, text, kind? }], direction, work? }
//   응답: { translations: { [name]: translated_text, ... } }
//
// kind 는 선택적 힌트: 'title' | 'author' | 'quote' | 'script_excerpt'
//                  | 'excerpt_description' | 'significance' | 'keywords'
// 사용처: review.js 의 "영문 일괄 채우기" 가 카드/작품 의 비어 있는 필드를 모아 한 번에 호출.
//        이전엔 필드당 /api/translate-field 별도 호출(5+회) → 이 endpoint 1회로.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslateFields } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export const config = { maxDuration: 90 };

const MAX_FIELDS_PER_BATCH = 12;
const ALLOWED_KINDS = new Set([
  'title', 'subtitle', 'author',
  'quote', 'script_excerpt',
  'excerpt_description', 'significance', 'keywords',
  'general',
]);
const ALLOWED_DIRECTIONS = new Set(['en2ko', 'ko2en']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
    const fieldsIn = Array.isArray(body?.fields) ? body.fields : null;
    if (!fieldsIn || !fieldsIn.length) throw new HttpError('fields array is required', 400);
    if (fieldsIn.length > MAX_FIELDS_PER_BATCH) {
      throw new HttpError(`too many fields (max ${MAX_FIELDS_PER_BATCH})`, 413);
    }
    const direction = String(body?.direction || 'en2ko');
    if (!ALLOWED_DIRECTIONS.has(direction)) {
      throw new HttpError('direction must be en2ko or ko2en', 400);
    }
    // 입력 정규화 + 검증
    const fields = fieldsIn.map((f, i) => {
      if (!f || typeof f !== 'object') throw new HttpError(`fields[${i}] invalid`, 400);
      const name = String(f.name || '').trim();
      if (!name) throw new HttpError(`fields[${i}].name required`, 400);
      const text = String(f.text ?? '').trim();
      if (!text) throw new HttpError(`fields[${i}].text empty`, 400);
      if (text.length > 12000) throw new HttpError(`fields[${i}].text too long`, 413);
      const kind = String(f.kind || 'general').trim();
      return {
        name,
        text,
        kind: ALLOWED_KINDS.has(kind) ? kind : 'general',
      };
    });
    const work = body?.work && typeof body.work === 'object' ? body.work : null;

    const translations = await runTranslateFields({ fields, direction, work });
    return res.status(200).json({ translations });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[translate-fields] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
