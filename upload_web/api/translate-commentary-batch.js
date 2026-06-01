// 배치 KO→EN 번역 — 카드 N장의 description / significance / keywords 를 한 번의 LLM 호출로.
// 추출 직후 '번역' 버튼 흐름 끝에서 호출. 결과를 카드 객체에 부착해 저장 단계에서 *_original 로 함께 INSERT.
//
// body: { cards: [{ id, description?, significance?, keywords? }, ...], work?: {...} }
// 응답: { results: [{ id, description_en?, significance_en?, keywords_en? }, ...] }

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslateCommentaryBatch } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export const config = {
  // 카드 N장을 한 번에 처리 — 큰 work 는 LLM 응답이 길어 시간 여유 필요.
  maxDuration: 120,
};

const MAX_CARDS_PER_BATCH = 150;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 1 * 1024 * 1024 });
    const cards = Array.isArray(body?.cards) ? body.cards : null;
    if (!cards || !cards.length) throw new HttpError('cards array is required', 400);
    if (cards.length > MAX_CARDS_PER_BATCH) {
      throw new HttpError(`too many cards (max ${MAX_CARDS_PER_BATCH})`, 413);
    }
    const work = body?.work && typeof body.work === 'object' ? body.work : null;

    const results = await runTranslateCommentaryBatch({ cards, work });
    return res.status(200).json({ results });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[translate-commentary-batch] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    if (/prompt is too long|tokens.*maximum/i.test(err?.message || '')) {
      return res.status(413).json({
        error: '카드 수가 많아 한 번에 처리 불가. 적은 수로 나눠 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
