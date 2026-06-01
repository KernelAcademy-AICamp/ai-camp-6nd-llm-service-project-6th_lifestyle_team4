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
    // 이중 언어 — 영문 원본 (있을 때만, 마이그레이션 021)
    title_original:    work.title_original    ? String(work.title_original).trim().slice(0, 300)    || null : null,
    subtitle_original: work.subtitle_original ? String(work.subtitle_original).trim().slice(0, 300) || null : null,
    author_original:   work.author_original   ? String(work.author_original).trim().slice(0, 200)   || null : null,
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
// 이중 언어 모드: 번역본이 있으면 한국어를 기본, 영문 원본을 *_original 에도 함께 저장.
function pickDisplayedFields(card) {
  const t = card.translated;
  const useTranslation = card.showingTranslation && t;
  const display = {
    quote: String(useTranslation ? t.quote_translated : card.quote),
    script_excerpt: String(useTranslation ? t.script_excerpt_translated : card.script_excerpt),
    excerpt_description: card.excerpt_description ?? null,
  };
  // 영문 원본 분리 — 추출본은 영문이고 번역본이 한국어인 경우에만 의미가 있다.
  // useTranslation=true → card.quote/script_excerpt가 영문 원본, t.*_translated가 한국어.
  if (useTranslation) {
    display.quote_original = String(card.quote);
    display.script_excerpt_original = String(card.script_excerpt);
  } else {
    // 클라이언트가 quote_original / script_excerpt_original 을 명시적으로 보낸 경우 보존
    // (편집 화면에서 좌(KO)/우(EN)을 따로 수정한 후 저장하는 경우).
    display.quote_original          = card.quote_original ?? null;
    display.script_excerpt_original = card.script_excerpt_original ?? null;
  }
  return display;
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
    // 이중 언어 — 영문 원본 (있을 때만, 마이그레이션 021)
    quote_original:          display.quote_original          ? String(display.quote_original).slice(0, 2000) : null,
    script_excerpt_original: display.script_excerpt_original ? String(display.script_excerpt_original).slice(0, 10000) : null,
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

  // 이중 언어 컬럼(*_original)은 cards 테이블에는 있지만 card_candidates 에는 없다
  // (마이그레이션 021/022/023 은 cards 만 확장). normalizedCard 에 섞여 있으면 candidate
  // insert 가 schema cache 에러로 500. 분리해서 original_payload JSONB 안에 보존 →
  // 향후 promote_candidate RPC 가 cards 로 다시 복원할 수 있게 한다.
  const {
    quote_original,
    script_excerpt_original,
    ...candidateFields
  } = normalizedCard;

  // 원본 LLM 출력 + 이중 언어 원본을 그대로 보관 — 인라인 편집 후 비교/감사 + bilingual 복원용
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
    // bilingual originals — candidate schema 에는 컬럼이 없어서 JSONB 안에 보존.
    quote_original:          quote_original          ?? null,
    script_excerpt_original: script_excerpt_original ?? null,
  };

  return {
    ...candidateFields,
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
    // 이중 언어: 한국어로 변환하기 전 영문 원본을 author_original 에 보존.
    if (workInput.author && /[A-Za-z]/.test(workInput.author)) {
      try {
        const originalEnglish = workInput.author;
        const ko = await runKoreanizeAuthor(originalEnglish);
        if (ko && ko.trim()) {
          console.log(`[save] author koreanized: "${originalEnglish}" → "${ko}"`);
          workInput.author = ko.trim();
          // 클라이언트가 author_original 을 명시적으로 보내지 않은 경우에만 이 영문을 기록.
          // (편집 단계에서 사용자가 명시 입력했으면 그걸 존중)
          if (!workInput.author_original) workInput.author_original = originalEnglish;
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
