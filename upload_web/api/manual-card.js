import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

// 수동 카드 추가 — LLM·번역 API 를 전혀 호출하지 않는 "크레딧 0" 경로.
// 어드민이 명대사 카드 1장을 직접 입력해 검토 큐(card_candidates, status='pending',
// source_kind='manual') 에 넣는다. 기존 작품(work_id)에 붙이거나 새 작품(work)을 만든다.
// 저장된 카드는 review.html 에서 승인하면 promote_candidate 로 cards 에 복사된다.
//
// /api/save 와의 차이:
//  - runKoreanizeAuthor(LLM) 호출 없음 → 크레딧 0. 영문 작가명도 그대로 저장.
//  - script_excerpt 최소 길이 검증 없음 → 어드민이 직접 넣은 짧은 발췌도 보존.
//  - 기존 작품에 카드만 추가 가능 (save.js 는 항상 새 work 생성).

const ALLOWED_FORMATS = new Set(['movie', 'drama', 'play', 'musical', 'opera', 'novel', 'poem', 'essay', 'prose']);
const BODY_MAX_BYTES = 2 * 1024 * 1024;

// 마이그레이션 010/011 및 save.js 와 동일 규칙: 말줄임표 통일 + 구두점 뒤 공백을 줄바꿈으로.
function normalizeText(s) {
  if (s == null) return null;
  return String(s)
    .replace(/\.{3,}|…/g, '⋯')
    .replace(/([,，.。?!？！⋯])[ \t]+/g, '$1\n');
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cleanArr(value, max = 10) {
  return Array.isArray(value)
    ? [...new Set(value.map((k) => String(k).trim()).filter(Boolean))].slice(0, max)
    : [];
}

// 비교 정규화 — quote == script_excerpt 인 카드 차단용 (save.js 의 _norm 축약판).
function normCompare(s) {
  return String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let createdWorkId = null;

  try {
    const adminUser = await requireAdmin(req);
    const body = await readJsonBody(req, { maxBytes: BODY_MAX_BYTES });

    const card = body?.card;
    if (!card || typeof card !== 'object') throw new HttpError('card is required', 400);

    const quote = String(card.quote || '').trim();
    const scriptExcerpt = String(card.script_excerpt || '').trim();
    if (!quote) throw new HttpError('명대사(quote)를 입력하세요.', 400);
    if (!scriptExcerpt) throw new HttpError('대본 발췌(script_excerpt)를 입력하세요.', 400);
    // 강한 규칙 — 명대사와 발췌가 같으면 안 된다 (라이브러리 표시가 깨짐).
    if (normCompare(quote) === normCompare(scriptExcerpt)) {
      throw new HttpError('명대사와 대본 발췌가 동일합니다. 발췌는 명대사를 둘러싼 더 긴 맥락이어야 합니다.', 422);
    }

    // 작품 결정 — 기존(work_id) 또는 새로 생성(work)
    let workId = null;
    const rawWorkId = body.work_id;
    if (rawWorkId != null && String(rawWorkId).trim() !== '') {
      workId = Number.parseInt(rawWorkId, 10);
      if (Number.isNaN(workId)) throw new HttpError('work_id 가 올바르지 않습니다.', 400);
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('works').select('work_id').eq('work_id', workId).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) throw new HttpError('선택한 작품을 찾을 수 없습니다.', 404);
    } else {
      const work = body.work;
      if (!work || typeof work !== 'object') throw new HttpError('work 또는 work_id 가 필요합니다.', 400);
      if (!work.title || !String(work.title).trim()) throw new HttpError('작품 제목을 입력하세요.', 400);
      if (!ALLOWED_FORMATS.has(work.format)) {
        throw new HttpError('작품 형식(format)이 올바르지 않습니다.', 400);
      }
      // works.full_script_text 는 NOT NULL — 수동 카드엔 원본 문서가 없으므로 발췌로 대체.
      const workRow = {
        title: String(work.title).trim().slice(0, 300),
        subtitle: work.subtitle ? String(work.subtitle).trim().slice(0, 300) || null : null,
        format: work.format,
        author: work.author == null ? null : String(work.author).trim().slice(0, 200) || null,
        release_year: work.release_year == null ? null : String(work.release_year).trim().slice(0, 20) || null,
        full_script_text: scriptExcerpt,
        // 이중 언어 — 어드민이 직접 입력한 영문 원본만 (번역 API 미사용)
        title_original: work.title_original ? String(work.title_original).trim().slice(0, 300) || null : null,
        author_original: work.author_original ? String(work.author_original).trim().slice(0, 200) || null : null,
      };
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('works').insert(workRow).select('work_id').single();
      if (insErr) throw insErr;
      workId = inserted.work_id;
      createdWorkId = workId;
    }

    // 후보 카드 1건 insert — source_kind='manual', status='pending'. Anthropic 호출 없음.
    const kwOrig = cleanArr(card.keywords_original, 10);
    const candidate = {
      work_id: workId,
      quote: normalizeText(quote)?.slice(0, 2000),
      script_excerpt: normalizeText(scriptExcerpt)?.slice(0, 10000),
      excerpt_description: card.excerpt_description ? normalizeText(card.excerpt_description)?.slice(0, 2000) : null,
      significance: card.significance ? normalizeText(card.significance)?.slice(0, 3000) : null,
      keywords: cleanArr(card.keywords, 10),
      temperature: clampInt(card.temperature, 1, 5),
      intensity: clampInt(card.intensity, 1, 5),
      // 이중 언어 — 어드민이 직접 입력한 영문 원본만 저장 (번역 API 미사용)
      quote_original: card.quote_original ? String(card.quote_original).trim().slice(0, 2000) || null : null,
      script_excerpt_original: card.script_excerpt_original ? String(card.script_excerpt_original).trim().slice(0, 10000) || null : null,
      excerpt_description_original: card.excerpt_description_original ? String(card.excerpt_description_original).trim().slice(0, 2000) || null : null,
      significance_original: card.significance_original ? String(card.significance_original).trim().slice(0, 3000) || null : null,
      keywords_original: kwOrig.length ? kwOrig : null,
      status: 'pending',
      source_kind: 'manual',
      source_url: null,
      source_text: null,
      quote_verbatim_verified: false,
      extracted_by: adminUser?.id || null,
      original_payload: { manual: true },
    };

    const { data: candRow, error: candErr } = await supabaseAdmin
      .from('card_candidates')
      .insert(candidate)
      .select('candidate_id')
      .single();
    if (candErr) throw candErr;

    return res.status(200).json({
      work_id: workId,
      candidate_id: candRow.candidate_id,
      pending_review: true,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    // 새로 만든 work 롤백 (candidate insert 실패 시 고아 work 방지)
    if (createdWorkId) {
      try {
        await supabaseAdmin.from('works').delete().eq('work_id', createdWorkId);
      } catch (cleanupErr) {
        console.error('[manual-card] rollback failed:', cleanupErr);
      }
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[manual-card] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
