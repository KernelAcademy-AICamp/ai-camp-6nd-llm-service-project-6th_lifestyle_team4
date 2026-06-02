// 검토 게이트 API — card_candidates 조회 / 잠금(claim) / 결정(decide).
//   GET  /api/candidates?status=pending     → 목록
//   POST /api/candidates  { action: 'claim',   candidateId }
//   POST /api/candidates  { action: 'release', candidateId }
//   POST /api/candidates  { action: 'decide',  candidateId, decision,
//                            edits?, notes? }
//
// 모든 경로 admin 만 (requireAdmin). 동시 검토를 위해 claim TTL = 10분.
// approve 결정시 promote_candidate RPC 가 자동 호출되어 cards 로 복사된다.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase-admin.js';
import { runTranslateField, runTranslateFields, validateAndFilterCards } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

// 카드 + 작품 메타가 한·영 모두 채워졌는지 확인 (autoFillEnglishForCard 호출 스킵 판단용).
// "한국어 본문이 있는데 영문 원본이 비어있다" 가 한 개라도 있으면 false.
// 한국어 본문 자체가 없으면 영문도 채울 의무가 없으므로 통과.
function isEnglishFullyFilled(card, work) {
  // 카드 본문
  if (card.quote                    && !card.quote_original)                    return false;
  if (card.script_excerpt           && !card.script_excerpt_original)           return false;
  if (card.excerpt_description      && !card.excerpt_description_original)      return false;
  if (card.significance             && !card.significance_original)             return false;
  if (Array.isArray(card.keywords) && card.keywords.length
      && (!Array.isArray(card.keywords_original) || !card.keywords_original.length)) return false;
  // 작품 메타
  if (work?.title    && !work.title_original)    return false;
  if (work?.subtitle && !work.subtitle_original) return false;
  if (work?.author   && !work.author_original)   return false;
  return true;
}

// works.format → 추출 프롬프트 카테고리 (save.js 와 동일 매핑)
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

// 승인(approve) 시 promote_candidate + KO→EN 자동 채우기까지 한 번에 처리.
// 카드당 LLM 호출 최대 ~6회 (각 ~2~5s). Vercel 기본 60s 한도를 넘을 여지가 있어 120s 로 확장.
export const config = { maxDuration: 120 };

const CLAIM_TTL_MIN = 10;
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'needs_edit']);
const VALID_DECISIONS = new Set(['approved', 'rejected', 'needs_edit']);
const EDITABLE_FIELDS = new Set([
  'quote', 'script_excerpt', 'excerpt_description',
  'keywords', 'significance',
  // 이중 언어 — 영문 원본 (마이그레이션 025 후 card_candidates 에 직접 컬럼 존재)
  'quote_original', 'script_excerpt_original',
  'excerpt_description_original', 'significance_original', 'keywords_original',
]);
// 검토에서 편집 가능한 works(작품 메타) 필드 — 별도로 workEdits 로 받는다
const EDITABLE_WORK_FIELDS = new Set([
  'title', 'subtitle', 'author',
  'title_original', 'subtitle_original', 'author_original',
]);
// temperature, intensity 는 LLM 결정값 — 편집 UI 에서 표시만 하고 변경 불가.

async function listCandidates(req, res) {
  const status = String(req.query?.status || 'pending');
  if (!VALID_STATUSES.has(status)) {
    throw new HttpError(`invalid status (must be one of ${[...VALID_STATUSES].join(',')})`, 400);
  }
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query?.limit, 10) || 100));

  const { data, error } = await supabaseAdmin
    .from('card_candidates')
    .select(`
      candidate_id, work_id, quote, script_excerpt, excerpt_description,
      keywords, temperature, intensity, significance,
      status, source_kind, source_url, quote_verbatim_verified,
      claimed_by, claimed_at, reviewer_id, reviewed_at, notes,
      extracted_by, extracted_at, promoted_card_id, created_at, updated_at,
      original_payload,
      quote_original, script_excerpt_original,
      excerpt_description_original, significance_original, keywords_original,
      works ( title, subtitle, format, author, release_year,
              title_original, subtitle_original, author_original )
    `)
    .eq('status', status)
    .order('extracted_at', { ascending: status === 'pending' })
    .limit(limit);
  if (error) throw error;

  // claim 만료 표시 — UI 가 직접 시간 비교하지 않게 서버에서 같이 알려준다.
  const cutoff = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  const items = (data || []).map((row) => {
    const claimedMs = row.claimed_at ? Date.parse(row.claimed_at) : null;
    const claimActive = !!(row.claimed_by && claimedMs && claimedMs >= cutoff);
    return { ...row, claim_active: claimActive };
  });

  // claimed_by / reviewer_id / extracted_by 의 표시 이름 매핑
  const userIds = new Set();
  items.forEach((it) => {
    if (it.claimed_by) userIds.add(it.claimed_by);
    if (it.reviewer_id) userIds.add(it.reviewer_id);
    if (it.extracted_by) userIds.add(it.extracted_by);
  });
  const userMap = {};
  if (userIds.size > 0) {
    // service-role 이라 auth.admin 사용 가능. 한 번에 다 받아오기 위해 listUsers 사용.
    try {
      const { data: u } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      (u?.users || []).forEach((user) => {
        if (userIds.has(user.id)) {
          // <id>@admin.local 의 id 부분만. 없으면 email 전체.
          const email = user.email || '';
          const label = email.includes('@admin.local')
            ? email.replace('@admin.local', '')
            : email || user.id.slice(0, 8);
          userMap[user.id] = label;
        }
      });
    } catch (e) {
      console.warn('[candidates] listUsers failed:', e?.message || e);
    }
  }

  return res.status(200).json({
    status,
    claim_ttl_minutes: CLAIM_TTL_MIN,
    items,
    user_map: userMap,
  });
}

async function claimCandidate(req, res, body, adminUser) {
  const id = Number.parseInt(body.candidateId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('candidateId required', 400);
  }
  const cutoffIso = new Date(Date.now() - CLAIM_TTL_MIN * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // claimed_at IS NULL  또는  TTL 지난 경우  또는  본인이 들고 있는 경우  만 claim 성공.
  const { data, error } = await supabaseAdmin
    .from('card_candidates')
    .update({ claimed_by: adminUser.id, claimed_at: nowIso })
    .eq('candidate_id', id)
    .eq('status', 'pending')
    .or(`claimed_by.is.null,claimed_at.lt.${cutoffIso},claimed_by.eq.${adminUser.id}`)
    .select('candidate_id, claimed_by, claimed_at')
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // 이미 다른 관리자가 잡고 있음 — 현재 claim 정보를 돌려준다.
    const { data: row } = await supabaseAdmin
      .from('card_candidates')
      .select('candidate_id, claimed_by, claimed_at, status')
      .eq('candidate_id', id)
      .maybeSingle();
    return res.status(409).json({
      error: 'claim_conflict',
      candidate: row || null,
      claim_ttl_minutes: CLAIM_TTL_MIN,
    });
  }
  return res.status(200).json({ ok: true, candidate: data });
}

async function releaseCandidate(req, res, body, adminUser) {
  const id = Number.parseInt(body.candidateId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('candidateId required', 400);
  }
  // 본인이 들고 있는 claim 만 풀 수 있다.
  const { error } = await supabaseAdmin
    .from('card_candidates')
    .update({ claimed_by: null, claimed_at: null })
    .eq('candidate_id', id)
    .eq('claimed_by', adminUser.id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

function sanitizeEdits(edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return {};
  const out = {};
  for (const [k, v] of Object.entries(edits)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    if (k === 'keywords' || k === 'keywords_original') {
      if (!Array.isArray(v)) {
        // null 명시 → DB null (영문 키워드는 비울 수 있어야 함)
        if (k === 'keywords_original' && v === null) out.keywords_original = null;
        continue;
      }
      const dedup = [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, 10);
      out[k] = dedup;
    } else {
      if (v == null) { out[k] = null; continue; }
      const s = String(v);
      if (k === 'quote' || k === 'quote_original') out[k] = s.slice(0, 2000);
      else if (k === 'script_excerpt' || k === 'script_excerpt_original') out[k] = s.slice(0, 10000);
      else if (k === 'excerpt_description' || k === 'excerpt_description_original') out[k] = s.slice(0, 2000);
      else if (k === 'significance' || k === 'significance_original') out[k] = s.slice(0, 3000);
    }
  }
  return out;
}

function sanitizeWorkEdits(workEdits) {
  if (!workEdits || typeof workEdits !== 'object' || Array.isArray(workEdits)) return {};
  const out = {};
  for (const [k, v] of Object.entries(workEdits)) {
    if (!EDITABLE_WORK_FIELDS.has(k)) continue;
    if (v == null) { out[k] = null; continue; }
    const s = String(v).trim();
    if (k === 'title' || k === 'title_original')       out[k] = s.slice(0, 300);
    else if (k === 'subtitle' || k === 'subtitle_original') out[k] = s.slice(0, 300) || null;
    else if (k === 'author' || k === 'author_original') out[k] = s.slice(0, 200) || null;
  }
  return out;
}

async function decideCandidate(req, res, body, adminUser) {
  const id = Number.parseInt(body.candidateId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('candidateId required', 400);
  }
  const decision = String(body.decision || '');
  if (!VALID_DECISIONS.has(decision)) {
    throw new HttpError(`decision must be one of ${[...VALID_DECISIONS].join(',')}`, 400);
  }
  const edits = sanitizeEdits(body.edits);
  const workEdits = sanitizeWorkEdits(body.workEdits);
  const notes = body.notes != null ? String(body.notes).slice(0, 2000) : null;

  // 잠금 검증 + 승인 검증 + 영문 완료 사전 체크용으로 모든 본문/원본/메타 필드 함께 조회.
  // autoFillEnglishForCard 호출 여부를 미리 결정 → 이미 다 채워졌으면 LLM 호출 X, 즉시 응답.
  const cutoffMs = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  const { data: row, error: getErr } = await supabaseAdmin
    .from('card_candidates')
    .select(`
      candidate_id, work_id, claimed_by, claimed_at, status, promoted_card_id,
      quote, script_excerpt, excerpt_description, significance, keywords,
      quote_original, script_excerpt_original, excerpt_description_original,
      significance_original, keywords_original,
      works:work_id(format, title, title_original, subtitle, subtitle_original, author, author_original)
    `)
    .eq('candidate_id', id)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!row) throw new HttpError('candidate not found', 404);
  if (row.promoted_card_id) throw new HttpError('candidate already promoted', 409);
  if (row.claimed_by && row.claimed_by !== adminUser.id
      && row.claimed_at && Date.parse(row.claimed_at) >= cutoffMs) {
    throw new HttpError('candidate is currently claimed by another reviewer', 409);
  }

  // 승인(promote) 직전 게이트 — 편집 적용 후 최종 카드 본문이 추출 프롬프트 규칙 위반이면 차단.
  //  · quote == script_excerpt (또는 95% 이상 포함)
  //  · script_excerpt 가 카테고리별 최소 길이 미달
  // 추출/저장 시점에 검증이 통과했어도, 사람이 편집해서 다시 깨질 수 있으므로 여기서 마지막 게이트.
  if (decision === 'approved') {
    const finalQuote = (edits.quote != null) ? edits.quote : row.quote;
    const finalScript = (edits.script_excerpt != null) ? edits.script_excerpt : row.script_excerpt;
    const category = formatToCategory(row.works?.format);
    const checked = validateAndFilterCards(
      [{ quote: finalQuote, script_excerpt: finalScript }],
      category
    );
    if (checked.cards.length === 0) {
      const reason = checked.summary.dropped_identical
        ? '명대사(quote)와 대본 발췌(script_excerpt)가 동일/거의 동일합니다. 발췌에 앞뒤 맥락을 더 포함하도록 편집해 주세요.'
        : `대본 발췌가 카테고리(${category}) 최소 길이(${checked.summary.min_chars}자) 미달입니다.`;
      throw new HttpError(`승인 불가: ${reason}`, 422);
    }
  }

  // 결정 + 편집 동시 적용. status=approved 면 promote_candidate RPC 호출.
  const patch = {
    ...edits,
    status: decision,
    reviewer_id: adminUser.id,
    reviewed_at: new Date().toISOString(),
    notes: notes,
    // 결정 후에는 claim 풀어둔다 (큐에서 다른 관리자가 다음 카드 작업 가능).
    claimed_by: null,
    claimed_at: null,
  };

  const { error: updErr } = await supabaseAdmin
    .from('card_candidates')
    .update(patch)
    .eq('candidate_id', id);
  if (updErr) throw updErr;

  // 작품 메타(works) 편집 — 같은 work_id 의 다른 카드에도 즉시 영향. 별도 UPDATE.
  if (row.work_id && Object.keys(workEdits).length > 0) {
    const { error: wErr } = await supabaseAdmin
      .from('works')
      .update(workEdits)
      .eq('work_id', row.work_id);
    if (wErr) {
      console.warn('[candidates] works update failed:', wErr.message || wErr);
      // candidate 결정 자체는 이미 성공 — 작품 메타 실패는 경고만.
    }
  }

  let promotedCardId = null;
  let autoFillSummary = null;
  if (decision === 'approved') {
    const { data: rpcData, error: rpcErr } = await supabaseAdmin
      .rpc('promote_candidate', { p_candidate_id: id });
    if (rpcErr) {
      // promote 실패시 status 를 pending 으로 되돌려 큐에 다시 보이게.
      // (이전엔 needs_edit 으로 변경했는데 큐 필터는 pending 만 표시해서 카드가 사라진 것처럼 보임)
      console.error('[candidates] promote failed:', rpcErr);
      await supabaseAdmin
        .from('card_candidates')
        .update({
          status: 'pending',
          notes: `promote 실패: ${rpcErr.message || rpcErr}`,
          reviewer_id: null,
          reviewed_at: null,
        })
        .eq('candidate_id', id);
      throw new HttpError(`promote failed: ${rpcErr.message || rpcErr}`, 500);
    }
    promotedCardId = rpcData;
    // ★ autoFillEnglishForCard 호출 제거 — 사용자 요청: "그냥 바로 조회로 올려".
    //   영문이 비어 있더라도 LLM 호출하지 않음. 라이브러리 EN 토글에서 lazy 번역 가능.
    //   추출+전체번역 단계에서 이미 양 언어 모두 채워지는 게 정상 흐름.
    autoFillSummary = { ok: true, skipped: 'autofill-disabled-on-approve' };
  }

  return res.status(200).json({
    ok: true,
    candidate_id: id,
    decision,
    promoted_card_id: promotedCardId,
    auto_fill: autoFillSummary,
  });
}

// 편집만 저장 — status, reviewer_id 그대로. 조회의 카드 편집·저장 패턴과 동일.
// admin 가 중간 저장 후 나중에 승인/삭제 결정 가능.
async function saveEdits(req, res, body, adminUser) {
  const id = Number.parseInt(body.candidateId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('candidateId required', 400);
  }
  const edits = sanitizeEdits(body.edits);
  const workEdits = sanitizeWorkEdits(body.workEdits);
  const notes = body.notes != null ? String(body.notes).slice(0, 2000) : null;

  const { data: row, error: getErr } = await supabaseAdmin
    .from('card_candidates')
    .select('candidate_id, work_id, claimed_by, claimed_at, status, promoted_card_id')
    .eq('candidate_id', id)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!row) throw new HttpError('candidate not found', 404);
  if (row.promoted_card_id) throw new HttpError('candidate already promoted', 409);

  // claim 검증 — 본인 락이거나 락 없는 경우만 (decideCandidate 와 동일)
  const cutoffMs = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  if (row.claimed_by && row.claimed_by !== adminUser.id
      && row.claimed_at && Date.parse(row.claimed_at) >= cutoffMs) {
    throw new HttpError('candidate is currently claimed by another reviewer', 409);
  }

  const patch = { ...edits };
  if (notes != null) patch.notes = notes;
  // status 는 건드리지 않음 (pending 유지). claim 도 유지.

  const { error: updErr } = await supabaseAdmin
    .from('card_candidates')
    .update(patch)
    .eq('candidate_id', id);
  if (updErr) throw updErr;

  // 작품 메타 — 변경분 있으면 works 도 UPDATE (같은 작품 다른 카드에도 즉시 반영)
  if (row.work_id && Object.keys(workEdits).length > 0) {
    const { error: wErr } = await supabaseAdmin
      .from('works')
      .update(workEdits)
      .eq('work_id', row.work_id);
    if (wErr) console.warn('[candidates] works update failed:', wErr.message || wErr);
  }

  return res.status(200).json({ ok: true, candidate_id: id, saved: true });
}

// 카드 후보 완전 삭제 — admin 가 검토 큐에서 "삭제" 누름.
// 이전 'rejected' 상태로 보존하던 패턴 폐기 → 단순화.
async function deleteCandidate(req, res, body, adminUser) {
  const id = Number.parseInt(body.candidateId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('candidateId required', 400);
  }

  const { data: row, error: getErr } = await supabaseAdmin
    .from('card_candidates')
    .select('candidate_id, claimed_by, claimed_at, status, promoted_card_id')
    .eq('candidate_id', id)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!row) throw new HttpError('candidate not found', 404);
  if (row.promoted_card_id) {
    throw new HttpError('이미 승인되어 cards 로 옮겨간 후보는 삭제할 수 없습니다 (조회에서 직접 삭제하세요)', 409);
  }
  // claim 검증
  const cutoffMs = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  if (row.claimed_by && row.claimed_by !== adminUser.id
      && row.claimed_at && Date.parse(row.claimed_at) >= cutoffMs) {
    throw new HttpError('candidate is currently claimed by another reviewer', 409);
  }

  const { error: delErr } = await supabaseAdmin
    .from('card_candidates')
    .delete()
    .eq('candidate_id', id);
  if (delErr) throw delErr;

  return res.status(200).json({ ok: true, candidate_id: id, deleted: true });
}

// 카드 한 장의 빈 *_original 만 골라 KO→EN 번역해 채운다.
// promote_candidate 직후 호출 — admin 이 별도로 백필 버튼 안 눌러도 됨.
// 이미 채워진 필드는 건너뜀 (영문 PDF 추출본의 quote_original / script_excerpt_original
// 은 save 시 이미 들어가 있고, 작가는 runKoreanizeAuthor 가드로 author_original 채워짐).
//
// ★ 최적화: 비어 있는 필드를 모아 한 번의 LLM 호출(runTranslateFields)로 일괄 번역.
//   이전엔 필드당 별도 호출(최대 8회) → 이제 0~1회.
async function autoFillEnglishForCard(cardId) {
  const { data: card, error } = await supabaseAdmin
    .from('cards')
    .select([
      'card_id', 'work_id',
      'quote', 'script_excerpt', 'excerpt_description', 'keywords', 'significance',
      'quote_original', 'script_excerpt_original',
      'excerpt_description_original', 'significance_original', 'keywords_original',
      'works(work_id, title, subtitle, author, format, title_original, subtitle_original, author_original)',
    ].join(', '))
    .eq('card_id', cardId)
    .single();
  if (error || !card) return { ok: false, reason: error?.message || 'card not found' };

  const w = card.works || {};
  const workCtx = {
    title: w.title || '', subtitle: w.subtitle || '',
    author: w.author || '', format: w.format || '',
  };

  // 비어 있는 필드만 모으기 — 이미 채워진 건 건너뛴다 (LLM 호출 절약).
  // name 은 결과 객체의 키로 쓰임. 'work.*' 접두로 작품/카드 출처를 구분.
  const todo = [];
  if (!w.title_original    && w.title)    todo.push({ name: 'work.title',    text: w.title,    kind: 'title' });
  if (!w.subtitle_original && w.subtitle) todo.push({ name: 'work.subtitle', text: w.subtitle, kind: 'title' });
  if (!w.author_original   && w.author)   todo.push({ name: 'work.author',   text: w.author,   kind: 'author' });
  if (!card.quote_original          && card.quote)          todo.push({ name: 'card.quote',          text: card.quote,          kind: 'quote' });
  if (!card.script_excerpt_original && card.script_excerpt) todo.push({ name: 'card.script_excerpt', text: card.script_excerpt, kind: 'script_excerpt' });
  if (!card.excerpt_description_original && card.excerpt_description) todo.push({ name: 'card.excerpt_description', text: card.excerpt_description, kind: 'excerpt_description' });
  if (!card.significance_original   && card.significance)   todo.push({ name: 'card.significance',   text: card.significance,   kind: 'significance' });
  if ((!Array.isArray(card.keywords_original) || !card.keywords_original.length)
      && Array.isArray(card.keywords) && card.keywords.length) {
    todo.push({ name: 'card.keywords', text: card.keywords.join(', '), kind: 'keywords' });
  }

  if (todo.length === 0) {
    return { ok: true, work_filled: [], card_filled: [], skipped: 'nothing-to-fill' };
  }

  // 한 LLM 호출로 모든 비어 있는 필드 번역 (KO → EN).
  // 실패하면 폴백으로 필드별 개별 호출 (전부 실패 시에도 일부는 살릴 수 있게).
  let translations = {};
  try {
    translations = await runTranslateFields({ fields: todo, direction: 'ko2en', work: workCtx });
  } catch (e) {
    console.warn(`[candidates] batch auto-fill failed, falling back per-field:`, e?.message || e);
    // 폴백 — 각 필드 개별 호출. 한두 개라도 살리는 게 목표.
    for (const f of todo) {
      try {
        const v = await runTranslateField({ text: String(f.text), field: f.kind, work: workCtx, direction: 'ko2en' });
        if (v) translations[f.name] = v;
      } catch (e2) {
        console.warn(`[candidates] per-field fallback ${f.name} failed:`, e2?.message || e2);
      }
    }
  }

  // 결과를 work/card 업데이트 객체로 분류.
  const workUpdate = {};
  const cardUpdate = {};
  for (const [name, value] of Object.entries(translations)) {
    if (!value) continue;
    if (name === 'work.title')    workUpdate.title_original    = value;
    if (name === 'work.subtitle') workUpdate.subtitle_original = value;
    if (name === 'work.author')   workUpdate.author_original   = value;
    if (name === 'card.quote')              cardUpdate.quote_original              = value;
    if (name === 'card.script_excerpt')     cardUpdate.script_excerpt_original     = value;
    if (name === 'card.excerpt_description') cardUpdate.excerpt_description_original = value;
    if (name === 'card.significance')       cardUpdate.significance_original       = value;
    if (name === 'card.keywords') {
      const arr = String(value).split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      if (arr.length) cardUpdate.keywords_original = arr;
    }
  }

  if (Object.keys(workUpdate).length > 0) {
    const { error: werr } = await supabaseAdmin.from('works').update(workUpdate).eq('work_id', w.work_id);
    if (werr) console.warn('[candidates] works update failed:', werr.message);
  }
  if (Object.keys(cardUpdate).length > 0) {
    const { error: cerr } = await supabaseAdmin.from('cards').update(cardUpdate).eq('card_id', cardId);
    if (cerr) console.warn('[candidates] cards update failed:', cerr.message);
  }

  return {
    ok: true,
    work_filled: Object.keys(workUpdate),
    card_filled: Object.keys(cardUpdate),
    llm_calls: 1, // batch 1회 (폴백 안 가면)
  };
}

export default async function handler(req, res) {
  try {
    const adminUser = await requireAdmin(req);

    if (req.method === 'GET') {
      return await listCandidates(req, res);
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const body = await readJsonBody(req, { maxBytes: 1024 * 1024 });
    const action = String(body.action || '');
    if (action === 'claim')   return await claimCandidate(req, res, body, adminUser);
    if (action === 'release') return await releaseCandidate(req, res, body, adminUser);
    if (action === 'decide')  return await decideCandidate(req, res, body, adminUser);
    // 신규 — 편집만 저장 (status 그대로 pending). 조회 페이지의 "수정 후 저장" 과 동일 패턴.
    if (action === 'save')    return await saveEdits(req, res, body, adminUser);
    // 신규 — 거절 대신 완전 삭제 (admin 가 "삭제" 버튼 누름).
    if (action === 'delete')  return await deleteCandidate(req, res, body, adminUser);

    throw new HttpError('unknown action (expected claim | release | decide | save | delete)', 400);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[candidates] error:', err);
    return res.status(500).json({ error: err.message || 'internal_error' });
  }
}
