// "전체 번역" 통합 endpoint — 카드 N장의 5필드를 한 LLM 호출로 양방향 일괄 처리.
//   EN→KO: quote, script_excerpt
//   KO→EN: excerpt_description, significance, keywords
//
// body: { cards: [{ id, quote?, script_excerpt?, excerpt_description?, significance?, keywords? }, ...], work?: {...} }
// 응답: { results: [{ id, quote_translated?, script_excerpt_translated?, excerpt_description_en?, significance_en?, keywords_en? }, ...] }
//
// 이전엔 /api/translate (카드당 1회) + /api/translate-commentary-batch (청크당 1회) 두 흐름 → 본 endpoint 하나로 통합.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runTranslateCardBatch } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export const config = {
  // 카드 5장 양방향 = LLM 응답 큼 → 마진 넉넉히
  maxDuration: 120,
};

const MAX_CARDS_PER_BATCH = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
    const cards = Array.isArray(body?.cards) ? body.cards : null;
    if (!cards || !cards.length) throw new HttpError('cards array is required', 400);
    if (cards.length > MAX_CARDS_PER_BATCH) {
      throw new HttpError(`too many cards (max ${MAX_CARDS_PER_BATCH})`, 413);
    }
    const work = body?.work && typeof body.work === 'object' ? body.work : null;

    const results = await runTranslateCardBatch({ cards, work });
    return res.status(200).json({ results });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error(
      `[translate-card-batch] error status=${err?.status} ` +
      `type=${err?.error?.type || err?.type} message=${(err?.message || '').slice(0, 300)}`
    );
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    if (/prompt is too long|tokens.*maximum/i.test(err?.message || '')) {
      return res.status(413).json({
        error: '카드 수가 많아 한 번에 처리 불가. 청크 크기를 줄여주세요.',
      });
    }
    if (/usage limits|reached your specified/i.test(err?.message || '')) {
      return res.status(402).json({
        error: 'Anthropic API 사용량 한도에 도달했습니다.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
