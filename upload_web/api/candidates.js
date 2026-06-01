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
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

const CLAIM_TTL_MIN = 10;
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'needs_edit']);
const VALID_DECISIONS = new Set(['approved', 'rejected', 'needs_edit']);
const EDITABLE_FIELDS = new Set([
  'quote', 'script_excerpt', 'excerpt_description',
  'keywords', 'significance',
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
      works ( title, subtitle, format, author, release_year )
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
    if (k === 'keywords') {
      if (!Array.isArray(v)) continue;
      out.keywords = [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, 10);
    } else {
      if (v == null) { out[k] = null; continue; }
      const s = String(v);
      if (k === 'quote') out.quote = s.slice(0, 2000);
      else if (k === 'script_excerpt') out.script_excerpt = s.slice(0, 10000);
      else if (k === 'excerpt_description') out.excerpt_description = s.slice(0, 2000);
      else if (k === 'significance') out.significance = s.slice(0, 3000);
    }
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
  const notes = body.notes != null ? String(body.notes).slice(0, 2000) : null;

  // 잠금 검증: 다른 사람이 점유 중인 행은 결정할 수 없다.
  const cutoffMs = Date.now() - CLAIM_TTL_MIN * 60 * 1000;
  const { data: row, error: getErr } = await supabaseAdmin
    .from('card_candidates')
    .select('candidate_id, claimed_by, claimed_at, status, promoted_card_id')
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

  let promotedCardId = null;
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
  }

  return res.status(200).json({
    ok: true,
    candidate_id: id,
    decision,
    promoted_card_id: promotedCardId,
  });
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
