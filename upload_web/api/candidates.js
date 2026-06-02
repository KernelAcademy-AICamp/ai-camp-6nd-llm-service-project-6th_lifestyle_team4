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
import { runTranslateField } from '../lib/anthropic.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

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

  // 잠금 검증: 다른 사람이 점유 중인 행은 결정할 수 없다.
  const cutoffMs = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  const { data: row, error: getErr } = await supabaseAdmin
    .from('card_candidates')
    .select('candidate_id, work_id, claimed_by, claimed_at, status, promoted_card_id')
    .eq('candidate_id', id)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!row) throw new HttpError('candidate not found', 404);
  if (row.promoted_card_id) throw new HttpError('candidate already promoted', 409);
  if (row.claimed_by && row.claimed_by !== adminUser.id
      && row.claimed_at && Date.parse(row.claimed_at) >= cutoffMs) {
    throw new HttpError('candidate is currently claimed by another reviewer', 409);
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
      // promote 실패시 status 를 needs_edit 으로 되돌려서 큐에 다시 들어가게.
      console.error('[candidates] promote failed:', rpcErr);
      await supabaseAdmin
        .from('card_candidates')
        .update({ status: 'needs_edit', notes: `promote 실패: ${rpcErr.message || rpcErr}` })
        .eq('candidate_id', id);
      throw new HttpError(`promote failed: ${rpcErr.message || rpcErr}`, 500);
    }
    promotedCardId = rpcData;

    // 자동 영문 채우기 — 새로 promote 된 카드의 빈 *_original 만 KO→EN 번역해서 채움.
    // 실패해도 승인 자체는 성공이므로 throw 하지 않고 로그만 남김.
    if (promotedCardId) {
      try {
        autoFillSummary = await autoFillEnglishForCard(promotedCardId);
      } catch (e) {
        console.warn(`[candidates] auto-fill EN failed card_id=${promotedCardId}:`, e?.message || e);
      }
    }
  }

  return res.status(200).json({
    ok: true,
    candidate_id: id,
    decision,
    promoted_card_id: promotedCardId,
    auto_fill: autoFillSummary,
  });
}

// 카드 한 장의 빈 *_original 만 골라 KO→EN 번역해 채운다.
// promote_candidate 직후 호출 — admin 이 별도로 백필 버튼 안 눌러도 됨.
// 이미 채워진 필드는 건너뜀 (영문 PDF 추출본의 quote_original / script_excerpt_original
// 은 save 시 이미 들어가 있고, 작가는 runKoreanizeAuthor 가드로 author_original 채워짐).
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

  // 한 필드 안전 번역 — 실패해도 다음 필드는 그대로 진행.
  async function safeTranslate(text, field) {
    try {
      if (!text || !String(text).trim()) return null;
      return await runTranslateField({ text, field, work: workCtx, direction: 'ko2en' });
    } catch (e) {
      console.warn(`[candidates] auto-fill ${field} failed:`, e?.message || e);
      return null;
    }
  }

  // 1) 작품 메타 — 비어 있는 칸만
  const workUpdate = {};
  if (!w.title_original    && w.title)    { const v = await safeTranslate(w.title,    'title');    if (v) workUpdate.title_original    = v; }
  if (!w.subtitle_original && w.subtitle) { const v = await safeTranslate(w.subtitle, 'subtitle'); if (v) workUpdate.subtitle_original = v; }
  if (!w.author_original   && w.author)   { const v = await safeTranslate(w.author,   'author');   if (v) workUpdate.author_original   = v; }
  if (Object.keys(workUpdate).length > 0) {
    const { error: werr } = await supabaseAdmin.from('works').update(workUpdate).eq('work_id', w.work_id);
    if (werr) console.warn('[candidates] works update failed:', werr.message);
  }

  // 2) 카드 본문 — 비어 있는 칸만 (quote/script_excerpt 는 보통 save 가 이미 채움)
  const cardUpdate = {};
  if (!card.quote_original          && card.quote)          { const v = await safeTranslate(card.quote,          'quote');          if (v) cardUpdate.quote_original          = v; }
  if (!card.script_excerpt_original && card.script_excerpt) { const v = await safeTranslate(card.script_excerpt, 'script_excerpt'); if (v) cardUpdate.script_excerpt_original = v; }
  if (!card.excerpt_description_original && card.excerpt_description) { const v = await safeTranslate(card.excerpt_description, 'excerpt_description'); if (v) cardUpdate.excerpt_description_original = v; }
  if (!card.significance_original   && card.significance)   { const v = await safeTranslate(card.significance,   'significance');   if (v) cardUpdate.significance_original   = v; }
  if ((!Array.isArray(card.keywords_original) || !card.keywords_original.length) && Array.isArray(card.keywords) && card.keywords.length) {
    const v = await safeTranslate(card.keywords.join(', '), 'keywords');
    if (v) {
      const arr = v.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      if (arr.length) cardUpdate.keywords_original = arr;
    }
  }
  if (Object.keys(cardUpdate).length > 0) {
    const { error: cerr } = await supabaseAdmin.from('cards').update(cardUpdate).eq('card_id', cardId);
    if (cerr) console.warn('[candidates] cards update failed:', cerr.message);
  }

  return {
    ok: true,
    work_filled: Object.keys(workUpdate),
    card_filled: Object.keys(cardUpdate),
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

    throw new HttpError('unknown action (expected claim | release | decide)', 400);
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
