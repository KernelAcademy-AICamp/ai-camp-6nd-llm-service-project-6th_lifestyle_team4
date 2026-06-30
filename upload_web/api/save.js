import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { runKoreanizeAuthor, validateAndFilterCards } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

const ALLOWED_FORMATS = new Set(['movie', 'drama', 'play', 'musical', 'opera', 'novel', 'poem', 'essay', 'prose']);

// works.format → 추출 프롬프트 카테고리 (validateAndFilterCards 의 MIN_SCRIPT_CHARS_BY_CATEGORY 와 정합)
function formatToCategory(format) {
  switch (format) {
    case 'movie':
    case 'drama':   return 'screen';
    case 'musical':
    case 'opera':   return 'opera';
    case 'play':    return 'play';
    case 'novel':   return 'novel';
    case 'poem':    return 'poem';
    case 'essay':   return 'essay';
    case 'prose':   return 'prose';
    default:        return 'screen';
  }
}

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

function cleanArr(value, max = 10) {
  return Array.isArray(value)
    ? [...new Set(value.map((k) => String(k).trim()).filter(Boolean))].slice(0, max)
    : [];
}

// 비교 정규화 — quote == script_excerpt 차단용.
function normCompare(s) {
  return String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
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

  // dashboard.js 가 번역 단계에서 KO→EN 배치로 채운 해설 영문. 마이그레이션 025 후 candidate 에도 직접 저장.
  const tc = card.translated_commentary && typeof card.translated_commentary === 'object'
    ? card.translated_commentary : null;
  const descOrig = tc?.excerpt_description_original || null;
  const sigOrig  = tc?.significance_original || null;
  const kwOrigArr = Array.isArray(tc?.keywords_original)
    ? tc.keywords_original.map((k) => String(k).trim()).filter(Boolean).slice(0, 10)
    : null;

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
    // 이중 언어 — 영문 원본 (마이그레이션 021/022/023 의 cards 컬럼; 025 로 card_candidates 도 동일 컬럼 보유)
    quote_original:          display.quote_original          ? String(display.quote_original).slice(0, 2000) : null,
    script_excerpt_original: display.script_excerpt_original ? String(display.script_excerpt_original).slice(0, 10000) : null,
    // 해설(설명·의의·키워드) 영문 — 번역 버튼에서 배치로 채워 보냄
    excerpt_description_original: descOrig ? String(descOrig).slice(0, 2000) : null,
    significance_original:        sigOrig  ? String(sigOrig).slice(0, 3000)  : null,
    keywords_original:            (kwOrigArr && kwOrigArr.length) ? kwOrigArr : null,
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

  // 마이그레이션 025 이후 card_candidates 에도 quote/script_excerpt/excerpt_description/
  // significance/keywords 의 *_original 컬럼이 있음 → normalizedCard 를 그대로 spread.
  // 감사용 original_payload 는 LLM 원본 그대로 (편집 흔적 비교용).
  const originalPayload = {
    quote: card.quote ?? null,
    script_excerpt: card.script_excerpt ?? null,
    excerpt_description: card.excerpt_description ?? null,
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    temperature: card.temperature ?? null,
    intensity: card.intensity ?? null,
    significance: card.significance ?? null,
    translated: card.translated ?? null,
    translated_commentary: card.translated_commentary ?? null,
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

// 수동 입력 경로 — LLM·번역 API 를 전혀 호출하지 않는 "크레딧 0" 저장.
// body.manual === true 일 때 handler 가 이 함수로 분기한다.
// 카드 1장을 card_candidates(source_kind='manual', status='pending') 에 넣는다.
// 기존 작품(work_id) 또는 새 작품(work) 둘 다 지원. runKoreanizeAuthor(LLM)·길이검증 없음.
// 별도 api/ 파일로 두면 Vercel 함수 개수 한도(12)를 넘기므로 save.js 안에 합쳤다.
async function saveManualCard(res, body, adminUser) {
  let createdWorkId = null;
  try {
    const card = body?.card;
    if (!card || typeof card !== 'object') throw new HttpError('card is required', 400);

    const quote = String(card.quote || '').trim();
    const scriptExcerpt = String(card.script_excerpt || '').trim();
    if (!quote) throw new HttpError('명대사(quote)를 입력하세요.', 400);
    if (!scriptExcerpt) throw new HttpError('대본 발췌(script_excerpt)를 입력하세요.', 400);
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
      if (!ALLOWED_FORMATS.has(work.format)) throw new HttpError('작품 형식(format)이 올바르지 않습니다.', 400);
      // works.full_script_text 는 NOT NULL — 수동 카드엔 원본 문서가 없으므로 발췌로 대체.
      const workRow = {
        title: String(work.title).trim().slice(0, 300),
        subtitle: work.subtitle ? String(work.subtitle).trim().slice(0, 300) || null : null,
        format: work.format,
        author: work.author == null ? null : String(work.author).trim().slice(0, 200) || null,
        release_year: work.release_year == null ? null : String(work.release_year).trim().slice(0, 20) || null,
        full_script_text: scriptExcerpt,
        title_original: work.title_original ? String(work.title_original).trim().slice(0, 300) || null : null,
        author_original: work.author_original ? String(work.author_original).trim().slice(0, 200) || null : null,
      };
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('works').insert(workRow).select('work_id').single();
      if (insErr) throw insErr;
      workId = inserted.work_id;
      createdWorkId = workId;
    }

    // 후보 카드 1건 insert — Anthropic 호출 없음.
    const kwOrig = cleanArr(card.keywords_original, 10);
    const candidate = {
      work_id: workId,
      quote: normalizeText(quote)?.slice(0, 2000),
      script_excerpt: normalizeText(scriptExcerpt)?.slice(0, 10000),
      excerpt_description: card.excerpt_description ? normalizeText(card.excerpt_description)?.slice(0, 2000) : null,
      significance: card.significance ? normalizeText(String(card.significance)).slice(0, 3000) : null,
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
      .from('card_candidates').insert(candidate).select('candidate_id').single();
    if (candErr) throw candErr;

    return res.status(200).json({
      work_id: workId,
      candidate_id: candRow.candidate_id,
      candidate_count: 1,
      pending_review: true,
    });
  } catch (err) {
    // 새로 만든 work 롤백 (candidate insert 실패 시 고아 work 방지)
    if (createdWorkId) {
      try { await supabaseAdmin.from('works').delete().eq('work_id', createdWorkId); }
      catch (cleanupErr) { console.error('[save:manual] rollback failed:', cleanupErr); }
    }
    if (err instanceof HttpError) return sendError(res, err);
    console.error('[save:manual] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
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

    // 수동 입력(크레딧 0) 경로 — 별도 함수로 분기. LLM 호출 없음.
    if (body?.manual === true) {
      return await saveManualCard(res, body, adminUser);
    }

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
    //    저장 직전 2차 검증 — extract 단계에서 빠져나왔거나 클라이언트가 직접 보낸
    //    카드 중 quote==script_excerpt 또는 길이 미달은 여기서 다시 한 번 거른다.
    const category = formatToCategory(workInput.format);
    const validated = validateAndFilterCards(body.cards, category);
    const goodCards = validated.cards;
    if (goodCards.length === 0) {
      throw new HttpError(
        '저장 가능한 카드가 없습니다. 모든 카드가 추출 프롬프트 규칙을 위반했습니다 ' +
        `(중복: ${validated.summary.dropped_identical}, 길이미달: ${validated.summary.dropped_short}).`,
        422
      );
    }
    const cardRows = goodCards.map((c) => {
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
      validation: validated.summary,
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
