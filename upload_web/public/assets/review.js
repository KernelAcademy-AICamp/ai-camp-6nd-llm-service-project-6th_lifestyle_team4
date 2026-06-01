// 검토 큐 — card_candidates 목록·잠금·결정.
// 모든 데이터 호출은 /api/candidates 를 통해 Bearer 토큰으로. RLS 가 어드민만 통과시킨다.
import { getSupabase, getAccessToken, requireSessionOrRedirect } from './supabase-client.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---------- state ----------
const state = {
  status: 'pending',
  items: [],
  userMap: {},
  currentUserId: null,
  current: null, // open candidate
  claimTtlMinutes: 10,
  loading: false,
};

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind === 'err' ? 'err' : 'ok'}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function labelFor(uuid) {
  if (!uuid) return '';
  return state.userMap[uuid] || uuid.slice(0, 8);
}

async function apiFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...options, headers });
  const raw = await res.text();
  let json = null;
  if (raw) { try { json = JSON.parse(raw); } catch { /* not JSON */ } }
  if (!res.ok) {
    const detail = json?.error || raw.slice(0, 300) || res.statusText;
    const err = new Error(`HTTP ${res.status} · ${detail}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ---------- queue render ----------
function workLabel(work) {
  if (!work) return '(작품 없음)';
  const parts = [work.title, work.subtitle].filter(Boolean).join(' — ');
  const meta = [work.format, work.author, work.release_year].filter(Boolean).join(' · ');
  return meta ? `${parts} · ${meta}` : parts;
}

function statusBadge(status) {
  const map = {
    pending:    ['badge-pending',  'PENDING'],
    approved:   ['badge-approved', 'APPROVED'],
    rejected:   ['badge-rejected', 'REJECTED'],
    needs_edit: ['badge-needs',    'NEEDS EDIT'],
  };
  const [cls, label] = map[status] || ['badge-pending', status?.toUpperCase() || ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

function verifiedBadge(verified) {
  return verified
    ? '<span class="badge badge-verified">VERBATIM ✓</span>'
    : '<span class="badge badge-unverified">UNVERIFIED</span>';
}

function renderQueue() {
  const listEl = $('#queue-list');
  const emptyEl = $('#queue-empty');
  const loadingEl = $('#queue-loading');
  loadingEl.classList.add('hidden');
  listEl.innerHTML = '';

  // 사이드바 pending 카운트
  const pendingCount = state.status === 'pending' ? state.items.length : null;
  const navCount = $('#nav-pending-count');
  if (navCount) {
    if (pendingCount != null && pendingCount > 0) {
      navCount.textContent = String(pendingCount);
      navCount.classList.remove('hidden');
    } else {
      navCount.classList.add('hidden');
    }
  }

  if (state.items.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  for (const it of state.items) {
    const lockedByOther = it.claim_active && it.claimed_by && it.claimed_by !== state.currentUserId;
    const row = document.createElement('div');
    row.className = `queue-row bg-surface-container-lowest border border-outline-variant rounded-lg p-4 ${lockedByOther ? 'locked' : 'cursor-pointer'}`;
    const claimLine = lockedByOther
      ? `<span class="badge badge-claim">🔒 ${escapeHtml(labelFor(it.claimed_by))} 검토중 · ${formatRelative(it.claimed_at)}</span>`
      : (it.claim_active && it.claimed_by === state.currentUserId
          ? `<span class="badge badge-claim">🔒 내가 잡고 있음 · ${formatRelative(it.claimed_at)}</span>`
          : '');
    const reviewerLine = it.reviewer_id
      ? `<span class="text-xs text-on-surface-variant">검토자 ${escapeHtml(labelFor(it.reviewer_id))} · ${formatRelative(it.reviewed_at)}</span>`
      : '';
    row.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-on-surface-variant mb-1">#${it.candidate_id} · ${escapeHtml(workLabel(it.works))}</p>
          <p class="text-base font-medium text-on-surface mb-2 truncate">${escapeHtml(it.quote || '')}</p>
          <div class="flex gap-2 flex-wrap items-center">
            ${statusBadge(it.status)}
            ${verifiedBadge(it.quote_verbatim_verified)}
            <span class="text-xs text-on-surface-variant">추출 ${formatRelative(it.extracted_at)}${it.extracted_by ? ` · ${escapeHtml(labelFor(it.extracted_by))}` : ''}</span>
            ${claimLine}
            ${reviewerLine}
          </div>
        </div>
        <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
      </div>
    `;
    if (!lockedByOther) {
      row.addEventListener('click', () => onOpenDetail(it));
    } else {
      row.addEventListener('click', () => toast('다른 관리자가 검토중입니다', 'err'));
    }
    listEl.appendChild(row);
  }
}

// ---------- detail / edit ----------
function renderKeywords(keywords) {
  const cont = $('#keywords-container');
  cont.innerHTML = '';
  for (const kw of keywords) {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.innerHTML = `${escapeHtml(kw)} <button type="button" data-kw="${escapeHtml(kw)}" title="제거">×</button>`;
    cont.appendChild(tag);
  }
}

function currentKeywords() {
  return $$('#keywords-container .keyword-tag').map((el) => el.firstChild.nodeValue.trim());
}

function paintDetail(c) {
  $('#detail-work').textContent = workLabel(c.works);
  $('#detail-title').textContent = `#${c.candidate_id}`;
  const statusEl = $('#detail-status');
  statusEl.className = 'badge ' + ({
    pending: 'badge-pending', approved: 'badge-approved',
    rejected: 'badge-rejected', needs_edit: 'badge-needs',
  }[c.status] || 'badge-pending');
  statusEl.textContent = (c.status || '').toUpperCase().replace('_', ' ');
  const verEl = $('#detail-verified');
  verEl.className = 'badge ' + (c.quote_verbatim_verified ? 'badge-verified' : 'badge-unverified');
  verEl.textContent = c.quote_verbatim_verified ? 'VERBATIM ✓' : 'UNVERIFIED';
  $('#detail-source').textContent = [c.source_kind, c.source_url].filter(Boolean).join(' · ');

  $('#edit-quote').value = c.quote || '';
  $('#edit-script-excerpt').value = c.script_excerpt || '';
  $('#edit-excerpt-description').value = c.excerpt_description || '';
  $('#edit-significance').value = c.significance || '';
  renderKeywords(Array.isArray(c.keywords) ? c.keywords : []);
  $('#edit-notes').value = c.notes || '';

  $('#display-temperature').textContent = c.temperature != null ? `${c.temperature} / 5` : '—';
  $('#display-intensity').textContent = c.intensity != null ? `${c.intensity} / 5` : '—';

  // claim 안내 배너
  const banner = $('#detail-claim-banner');
  if (c.claim_active && c.claimed_by === state.currentUserId) {
    banner.textContent = `이 카드는 당신이 검토중입니다 (잠금 ${state.claimTtlMinutes}분 · ${formatRelative(c.claimed_at)} 시작). 목록으로 돌아가면 잠금이 풀립니다.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  // 결정 상태가 이미 결정된 항목이면 (큐에서 status 필터 바꿔서 본 경우)
  // 편집 + 결정 버튼은 보여주되, 이미 promoted 된 항목은 비활성화 표시.
  const promoted = !!c.promoted_card_id;
  ['decide-approve', 'decide-reject', 'decide-needs-edit'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = promoted;
    if (btn && promoted) btn.style.opacity = '0.5';
    if (btn && !promoted) btn.style.opacity = '';
  });
  if (promoted) {
    toast(`이미 cards #${c.promoted_card_id} 로 승격된 후보입니다`, 'ok');
  }
}

function showQueue() {
  $('#view-detail').classList.add('hidden');
  $('#view-queue').classList.remove('hidden');
  state.current = null;
}

function showDetail() {
  $('#view-queue').classList.add('hidden');
  $('#view-detail').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---------- actions ----------
async function loadList() {
  state.loading = true;
  $('#queue-loading').classList.remove('hidden');
  $('#queue-empty').classList.add('hidden');
  $('#queue-list').innerHTML = '';
  try {
    const j = await apiFetch(`/api/candidates?status=${encodeURIComponent(state.status)}`);
    state.items = Array.isArray(j.items) ? j.items : [];
    state.userMap = j.user_map || {};
    state.claimTtlMinutes = j.claim_ttl_minutes || 10;
    renderQueue();
  } catch (err) {
    console.error('[review] list failed', err);
    toast(`목록 로드 실패: ${err.message}`, 'err');
    $('#queue-loading').classList.add('hidden');
  } finally {
    state.loading = false;
  }
}

async function onOpenDetail(it) {
  // 다른 status 의 항목은 claim 없이 그냥 열기 (조회 전용).
  if (it.status !== 'pending') {
    state.current = { ...it };
    paintDetail(state.current);
    showDetail();
    return;
  }
  try {
    const j = await apiFetch('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({ action: 'claim', candidateId: it.candidate_id }),
    });
    // 성공: claim 받음. 로컬 카드에 반영.
    state.current = {
      ...it,
      claimed_by: j.candidate.claimed_by,
      claimed_at: j.candidate.claimed_at,
      claim_active: true,
    };
    paintDetail(state.current);
    showDetail();
  } catch (err) {
    if (err.status === 409) {
      const c = err.body?.candidate;
      const who = c?.claimed_by ? labelFor(c.claimed_by) : '다른 관리자';
      toast(`이미 ${who} 가 검토중입니다`, 'err');
      await loadList();
    } else {
      console.error('[review] claim failed', err);
      toast(`잠금 실패: ${err.message}`, 'err');
    }
  }
}

async function onBack() {
  // pending 항목을 보고 있었으면 claim 해제. 이미 결정된 항목은 무시.
  if (state.current && state.current.status === 'pending') {
    try {
      await apiFetch('/api/candidates', {
        method: 'POST',
        body: JSON.stringify({ action: 'release', candidateId: state.current.candidate_id }),
      });
    } catch (err) {
      console.warn('[review] release failed (ignored):', err);
    }
  }
  showQueue();
  await loadList();
}

function collectEdits() {
  return {
    quote: $('#edit-quote').value,
    script_excerpt: $('#edit-script-excerpt').value,
    excerpt_description: $('#edit-excerpt-description').value,
    significance: $('#edit-significance').value,
    keywords: currentKeywords(),
  };
}

async function onDecide(decision) {
  if (!state.current) return;
  const edits = collectEdits();
  const notes = $('#edit-notes').value;
  try {
    const j = await apiFetch('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({
        action: 'decide',
        candidateId: state.current.candidate_id,
        decision,
        edits,
        notes,
      }),
    });
    const promotedMsg = j.promoted_card_id
      ? ` → cards #${j.promoted_card_id} 로 승격`
      : '';
    toast(`결정 저장됨 (${decision})${promotedMsg}`);
    showQueue();
    await loadList();
  } catch (err) {
    console.error('[review] decide failed', err);
    toast(`결정 실패: ${err.message}`, 'err');
  }
}

// ---------- keyword editor wiring ----------
function addKeyword(raw) {
  const v = String(raw || '').trim();
  if (!v) return;
  const existing = currentKeywords();
  if (existing.includes(v)) return;
  if (existing.length >= 10) {
    toast('키워드는 최대 10개', 'err');
    return;
  }
  renderKeywords([...existing, v]);
}

function wireKeywordEditor() {
  $('#keyword-add-btn').addEventListener('click', () => {
    const input = $('#keyword-input');
    addKeyword(input.value);
    input.value = '';
    input.focus();
  });
  $('#keyword-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(e.currentTarget.value);
      e.currentTarget.value = '';
    }
  });
  // delegation for tag remove buttons
  $('#keywords-container').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-kw]');
    if (!btn) return;
    const kw = btn.dataset.kw;
    renderKeywords(currentKeywords().filter((k) => k !== kw));
  });
}

// ---------- boot ----------
(async () => {
  const token = await requireSessionOrRedirect('/');
  if (!token) return;
  const sb = await getSupabase();
  try {
    const { data } = await sb.auth.getUser();
    const u = data?.user;
    if (u?.app_metadata?.role !== 'admin') {
      toast('관리자 권한이 없습니다', 'err');
      setTimeout(() => { location.href = '/'; }, 1500);
      return;
    }
    state.currentUserId = u.id;
    const emailEl = $('#user-email');
    if (emailEl && u.email) emailEl.textContent = u.email.replace('@admin.local', '');
  } catch (err) {
    console.warn('[review] getUser failed', err);
  }

  $('#logout-btn')?.addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch { /* noop */ }
    location.href = '/';
  });
  $('#status-filter').addEventListener('change', (e) => {
    state.status = e.target.value;
    loadList();
  });
  $('#refresh-btn').addEventListener('click', () => loadList());
  $('#back-to-queue').addEventListener('click', onBack);
  $('#decide-approve').addEventListener('click', () => onDecide('approved'));
  $('#decide-reject').addEventListener('click', () => onDecide('rejected'));
  $('#decide-needs-edit').addEventListener('click', () => onDecide('needs_edit'));
  wireKeywordEditor();

  // 페이지를 떠나면 claim 이 자동 해제되지는 않는다 — TTL (10분) 이 지나면 다른 관리자가
  // 잡을 수 있게 자동 만료된다. 명시적으로 해제하려면 "목록으로" 버튼을 누른다.

  await loadList();
})();
