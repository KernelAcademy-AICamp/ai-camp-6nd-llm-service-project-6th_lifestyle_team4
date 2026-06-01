import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { runKoreanizeAuthor } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

const ALLOWED_FORMATS = new Set(['movie', 'drama', 'play', 'musical', 'opera', 'novel', 'poem', 'essay', 'prose']);

const MAX_CARDS_PER_SAVE = 150;
const MAX_FULL_SCRIPT_CHARS = 5000000;
const SAVE_BODY_MAX_BYTES = 30 * 1024 * 1024;

function normalizeWork(work, fullScriptText) {
  if (!work || typeof work !== 'object') throw new HttpError('work is required', 400);
  if (!work.title) throw new HttpError('work.title is required', 400);
  if (!ALLOWED_FORMATS.has(work.format)) {
    throw new HttpError('work.format must be one of movie | drama | play | musical | opera | novel | poem | essay | prose', 400);
  }
  const script = String(fullScriptText || '');
  if (!script.trim()) throw new HttpError('full_script_text is required', 400);
  if (MAX_FULL_SCRIPT_CHARS > 0 && script.length > MAX_FULL_SCRIPT_CHARS) {
    throw new HttpError('full_script_text is too large', 413);
  }
  return {
    title: String(work.title).trim().slice(0, 300),
    // 시리즈물(예: 셜록홈즈 → 보헤미아 왕국의 스캔들)의 개별 편 이름.
    // LLM이 비워서 보내면 null.
    subtitle: work.subtitle ? String(work.subtitle).trim() || null : null,
    format: work.format,
    author: work.author == null ? null : String(work.author).trim().slice(0, 200) || null,
    release_year: work.release_year == null ? null : String(work.release_year).trim().slice(0, 20) || null,
    full_script_text: script,
    // 등장인물 이름 목록 (jsonb). LLM이 줬을 때만 저장, 없으면 null.
    characters: Array.isArray(work.characters)
      ? [...new Set(work.characters.map((c) => String(c).trim()).filter(Boolean))]
      : null,
  };
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// 마이그레이션 010/011과 동일 규칙: 말줄임표 통일 + 구두점 뒤 공백을 줄바꿈으로 치환.
// 새 카드가 항상 정규형으로 들어가도록 DB 저장 직전에 한 번 더 강제.
function normalizeText(s) {
  if (s == null) return s;
  return String(s)
    .replace(/\.{3,}|…/g, '⋯')
    .replace(/([,，.。?!？！⋯])[ \t]+/g, '$1\n');
}

// 카드의 quote / script_excerpt 는 "현재 보고 있는 텍스트"(원문 또는 번역본)로 저장.
// excerpt_description 은 번역하지 않으므로 항상 원본 저장.
function pickDisplayedFields(card) {
  const t = card.translated;
  const useTranslation = card.showingTranslation && t;
  return {
    quote: String(useTranslation ? t.quote_translated : card.quote),
    script_excerpt: String(useTranslation ? t.script_excerpt_translated : card.script_excerpt),
    excerpt_description: card.excerpt_description ?? null,
  };
}

function normalizeCard(card, workId) {
  if (!card || typeof card !== 'object') throw new HttpError('card must be an object', 400);
  if (!card.quote || !card.script_excerpt) {
    throw new HttpError('card.quote and card.script_excerpt are required', 400);
  }
  const display = pickDisplayedFields(card);
  return {
    work_id: workId,
    quote: normalizeText(display.quote)?.slice(0, 2000),
    script_excerpt: normalizeText(display.script_excerpt)?.slice(0, 10000),
    excerpt_description: normalizeText(display.excerpt_description)?.slice(0, 2000),
    // keywords 컬럼은 jsonb. Supabase JS가 배열을 그대로 JSON으로 직렬화함.
    keywords: Array.isArray(card.keywords)
      ? [...new Set(card.keywords.map((k) => String(k).trim()).filter(Boolean))].slice(0, 10)
      : [],
    temperature: clampInt(card.temperature, 1, 5),
    intensity: clampInt(card.intensity, 1, 5),
    // 의의(significance) — DB의 cards.significance 컬럼에 저장 (텍스트, NULL 허용)
    significance: card.significance ? normalizeText(String(card.significance)).slice(0, 3000) : null,
  };
}

// 후보를 만들 때 추가로 들어가는 검토용 메타.
// quote_verbatim_verified: 업로드된 원문에서 추출된 카드는 quote 가 원문에 substring 으로
// 존재하는지 확인. 번역본을 저장하는 경우 (showingTranslation && translated) 는 원문
// 비교가 의미 없으므로 false 로 둔다.
function buildCandidateMeta(card, normalizedCard, fullScriptText, extractedBy) {
  const usingTranslation = !!(card.showingTranslation && card.translated);
  const verbatim = !usingTranslation
    && typeof fullScriptText === 'string'
    && fullScriptText.length > 0
    && typeof normalizedCard.quote === 'string'
    && fullScriptText.includes(normalizedCard.quote);

  // 원본 LLM 출력을 그대로 보관 — 인라인 편집 후 비교/감사용
  const originalPayload = {
    quote: card.quote ?? null,
    script_excerpt: card.script_excerpt ?? null,
    excerpt_description: card.excerpt_description ?? null,
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    temperature: card.temperature ?? null,
    intensity: card.intensity ?? null,
    significance: card.significance ?? null,
    translated: card.translated ?? null,
    showingTranslation: !!card.showingTranslation,
  };

  return {
    ...normalizedCard,
    status: 'pending',
    source_kind: 'uploaded_doc',
    source_url: null,
    source_text: null, // uploaded_doc 은 works.full_script_text 가 원본 — 중복 저장 안 함
    quote_verbatim_verified: verbatim,
    extracted_by: extractedBy || null,
    original_payload: originalPayload,
  };
}

// 장르 이름 배열을 받아 genres 테이블에 upsert(없으면 insert)하고 genre_id 목록 반환.
async function resolveGenreIds(genreNames) {
  if (!genreNames || genreNames.length === 0) return [];

  const uniqueNames = [...new Set(genreNames.map((g) => String(g).trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return [];

  // 1) 기존 genres 조회
  const { data: existing, error: selErr } = await supabaseAdmin
    .from('genres')
    .select('genre_id, name')
    .in('name', uniqueNames);
  if (selErr) throw selErr;

  const existingByName = new Map(existing.map((g) => [g.name, g.genre_id]));
  const missing = uniqueNames.filter((n) => !existingByName.has(n));

  // 2) 누락된 genre insert
  if (missing.length > 0) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('genres')
      .insert(missing.map((name) => ({ name })))
      .select('genre_id, name');
    if (insErr) throw insErr;
    inserted.forEach((g) => existingByName.set(g.name, g.genre_id));
  }

  return uniqueNames.map((n) => existingByName.get(n)).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let createdWorkId = null;
  let createdGenreLinks = false;

  try {
    const adminUser = await requireAdmin(req);

    const body = await readJsonBody(req, { maxBytes: SAVE_BODY_MAX_BYTES });
    const workInput = normalizeWork(body.work, body.full_script_text);

    // 저장 직전 가드: LLM이 영문 작가명을 보냈으면 한국어로 변환 후 저장.
    // (프롬프트가 1차로 한국어를 강제하지만 실수로 영문이 들어오는 경우 자동 보정)
    if (workInput.author && /[A-Za-z]/.test(workInput.author)) {
      try {
        const ko = await runKoreanizeAuthor(workInput.author);
        if (ko && ko.trim()) {
          console.log(`[save] author koreanized: "${workInput.author}" → "${ko}"`);
          workInput.author = ko.trim();
        }
      } catch (e) {
        console.warn('[save] runKoreanizeAuthor failed, keeping original:', e?.message || e);
      }
    }

    if (!Array.isArray(body.cards) || body.cards.length === 0) {
      throw new HttpError('cards array is required and non-empty', 400);
    }
    if (body.cards.length > MAX_CARDS_PER_SAVE) {
      throw new HttpError(`too many cards (max ${MAX_CARDS_PER_SAVE})`, 413);
    }

    // 1) works insert
    const { data: workRow, error: workErr } = await supabaseAdmin
      .from('works')
      .insert(workInput)
      .select('work_id')
      .single();
    if (workErr) throw workErr;
    createdWorkId = workRow.work_id;

    // 2) genres + work_genres (LLM이 work.genres를 줬을 때만)
    const genreIds = await resolveGenreIds(body.work?.genres);
    if (genreIds.length > 0) {
      const links = genreIds.map((genre_id) => ({ work_id: createdWorkId, genre_id }));
      const { error: linkErr } = await supabaseAdmin.from('work_genres').insert(links);
      if (linkErr) throw linkErr;
      createdGenreLinks = true;
    }

    // 3) card_candidates bulk insert — 검토 게이트.
    //    cards 로 직접 들어가지 않는다. 어드민이 review 페이지에서 승인해야
    //    promote_candidate RPC 가 해당 행을 cards 로 복사한다.
    const cardRows = body.cards.map((c) => {
      const normalized = normalizeCard(c, createdWorkId);
      return buildCandidateMeta(c, normalized, workInput.full_script_text, adminUser?.id);
    });
    const { data: inserted, error: cardErr } = await supabaseAdmin
      .from('card_candidates')
      .insert(cardRows)
      .select('candidate_id, quote_verbatim_verified');
    if (cardErr) throw cardErr;

    const verifiedCount = inserted.filter((r) => r.quote_verbatim_verified).length;
    return res.status(200).json({
      work_id: createdWorkId,
      candidate_count: inserted.length,
      verbatim_verified_count: verifiedCount,
      pending_review: true,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (!(err instanceof HttpError)) {
      console.error('[save] error:', err);
    }

    // Best-effort rollback (Supabase REST에는 트랜잭션이 없음)
    if (createdWorkId) {
      try {
        if (createdGenreLinks) {
          await supabaseAdmin.from('work_genres').delete().eq('work_id', createdWorkId);
        }
        await supabaseAdmin.from('works').delete().eq('work_id', createdWorkId);
      } catch (cleanupErr) {
        console.error('[save] rollback failed:', cleanupErr);
      }
    }

    if (err instanceof HttpError) {
      return sendError(res, err);
    }

    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
