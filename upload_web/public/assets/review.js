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
  selected: new Set(), // 일괄 액션용 — 선택된 candidate_id 들
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

  // 항목이 사라졌으면 selected 에서 자동 제거 (rollover/refresh 대응)
  const validIds = new Set(state.items.map((it) => it.candidate_id));
  for (const id of [...state.selected]) {
    if (!validIds.has(id)) state.selected.delete(id);
  }

  if (state.items.length === 0) {
    emptyEl.classList.remove('hidden');
    updateBulkBar();
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
    const isSelected = state.selected.has(it.candidate_id);
    // 다른 관리자가 점유 중이면 체크박스 숨김 (선택 불가)
    const checkboxHtml = lockedByOther
      ? '<div class="w-4 h-4 flex-shrink-0"></div>'
      : `<input type="checkbox" data-cb="${it.candidate_id}" ${isSelected ? 'checked' : ''} class="row-checkbox w-4 h-4 flex-shrink-0 mt-1 rounded border-outline-variant text-primary cursor-pointer" />`;
    row.innerHTML = `
      <div class="flex items-start gap-3">
        ${checkboxHtml}
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
        <span class="material-symbols-outlined text-on-surface-variant flex-shrink-0">chevron_right</span>
      </div>
    `;
    // 체크박스 클릭 — 선택 토글만, 상세 열기 X (이벤트 버블링 차단)
    const cb = row.querySelector('.row-checkbox');
    if (cb) {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) state.selected.add(it.candidate_id);
        else state.selected.delete(it.candidate_id);
        updateBulkBar();
      });
    }
    // 행 클릭(체크박스 외 영역) — 상세 열기
    if (!lockedByOther) {
      row.addEventListener('click', () => onOpenDetail(it));
    } else {
      row.addEventListener('click', () => toast('다른 관리자가 검토중입니다', 'err'));
    }
    listEl.appendChild(row);
  }

  updateBulkBar();
}

// 일괄 액션바 상태 업데이트 — 선택 카운트, 버튼 활성화, 전체선택 체크박스.
function updateBulkBar() {
  const bar = $('#bulk-action-bar');
  const countEl = $('#selected-count');
  const delBtn = $('#bulk-delete-btn');
  const apvBtn = $('#bulk-approve-btn');
  const selectAllCb = $('#select-all-checkbox');

  // 카드가 한 장이라도 있어야 액션바 표시
  const hasItems = state.items.length > 0;
  if (!bar) return;
  bar.classList.toggle('hidden', !hasItems);
  if (!hasItems) return;

  const selectableIds = state.items
    .filter((it) => !(it.claim_active && it.claimed_by && it.claimed_by !== state.currentUserId))
    .map((it) => it.candidate_id);
  const selectedCount = state.selected.size;

  if (countEl) countEl.textContent = `${selectedCount}장 선택됨 / 전체 ${selectableIds.length}장`;
  if (delBtn) delBtn.disabled = selectedCount === 0;
  if (apvBtn) apvBtn.disabled = selectedCount === 0;

  if (selectAllCb) {
    if (selectedCount === 0) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else if (selectedCount === selectableIds.length) {
      selectAllCb.checked = true;
      selectAllCb.indeterminate = false;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = true;
    }
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

  // 이중 언어 — 영문 원본 (마이그레이션 025 이후 card_candidates 에 직접 컬럼 존재)
  $('#edit-quote-original').value          = c.quote_original          || '';
  $('#edit-script-excerpt-original').value  = c.script_excerpt_original || '';
  $('#edit-excerpt-description-original').value = c.excerpt_description_original || '';
  $('#edit-significance-original').value   = c.significance_original   || '';
  $('#edit-keywords-original').value = Array.isArray(c.keywords_original)
    ? c.keywords_original.join(', ')
    : '';

  // 작품 메타 (works) — 현재 candidate 의 works join 데이터에서
  const w = c.works || {};
  $('#edit-work-title').value             = w.title || '';
  $('#edit-work-title-original').value    = w.title_original || '';
  $('#edit-work-subtitle').value          = w.subtitle || '';
  $('#edit-work-subtitle-original').value = w.subtitle_original || '';
  $('#edit-work-author').value            = w.author || '';
  $('#edit-work-author-original').value   = w.author_original || '';

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
  ['decide-approve', 'decide-delete', 'action-save'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = promoted;
    if (btn && promoted) btn.style.opacity = '0.5';
    if (btn && !promoted) btn.style.opacity = '';
  });
  if (promoted) {
    toast(`이미 cards #${c.promoted_card_id} 로 승격된 후보입니다`, 'ok');
  }
}

// 모달 닫기 — 큐는 항상 보이고 detail 모달만 토글.
function showQueue() {
  const modal = $('#view-detail');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  state.current = null;
}

// 모달 열기
function showDetail() {
  const modal = $('#view-detail');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  // 모달 내부 본문 스크롤은 위로
  const body = modal.querySelector('.review-modal-body');
  if (body) body.scrollTop = 0;
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
  // 키워드 영문 — 쉼표 구분 string → 배열
  const kwOrigArr = String($('#edit-keywords-original').value || '')
    .split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  return {
    quote: $('#edit-quote').value,
    script_excerpt: $('#edit-script-excerpt').value,
    excerpt_description: $('#edit-excerpt-description').value,
    significance: $('#edit-significance').value,
    keywords: currentKeywords(),
    // 이중 언어 — 영문 원본 (mig 025 후 card_candidates 에 컬럼 존재)
    quote_original:               $('#edit-quote-original').value.trim()                || null,
    script_excerpt_original:      $('#edit-script-excerpt-original').value.trim()       || null,
    excerpt_description_original: $('#edit-excerpt-description-original').value.trim()  || null,
    significance_original:        $('#edit-significance-original').value.trim()         || null,
    keywords_original:            kwOrigArr.length ? kwOrigArr : null,
  };
}

function collectWorkEdits() {
  // 작품(works) 메타 편집 — candidate 본문과 별도로 보냄 (서버가 works UPDATE)
  return {
    title:             $('#edit-work-title').value.trim()             || null,
    title_original:    $('#edit-work-title-original').value.trim()    || null,
    subtitle:          $('#edit-work-subtitle').value.trim()          || null,
    subtitle_original: $('#edit-work-subtitle-original').value.trim() || null,
    author:            $('#edit-work-author').value.trim()            || null,
    author_original:   $('#edit-work-author-original').value.trim()   || null,
  };
}

// ↻ KO 버튼 — 각 영문 칸 옆에. EN → KO 재번역해서 한국어 짝꿍에 채워줌.
function wireTranslateBackButtons() {
  document.querySelectorAll('button[data-trans-back]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const enSel = btn.dataset.transBack;
      const field = btn.dataset.transField;
      const enEl = document.querySelector(enSel);
      if (!enEl) return;
      const enText = (enEl.value || '').trim();
      if (!enText) { toast('영문 칸이 비어 있어요', 'err'); return; }
      // 짝꿍 KO 칸 — `-original` 빼면 됨
      const koSel = enSel.replace(/-original$/, '');
      const koEl = document.querySelector(koSel);
      if (!koEl) return;

      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⋯';
      try {
        const j = await apiFetch('/api/translate-field', {
          method: 'POST',
          body: JSON.stringify({
            text: enText, field, direction: 'en2ko',
            work: collectWorkEditsForCtx(),
          }),
        });
        if (j?.translated) {
          koEl.value = String(j.translated).trim();
          toast('재번역 완료', 'ok');
        }
      } catch (err) {
        console.warn('[review] translate-back failed:', err);
        toast(`재번역 실패: ${err.message || err}`, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  });
}

function collectWorkEditsForCtx() {
  const we = collectWorkEdits();
  return { title: we.title, subtitle: we.subtitle, author: we.author };
}

// 검토 큐 전체에서 영문이 비어 있는 *_original 필드만 골라 KO→EN 자동 채우기.
// 본문 재번역 X — 이미 채워진 영문은 그대로 보존.
// 후보 카드별로 누락 필드 모아 /api/translate-field 호출 → 'save' 액션으로 candidate UPDATE.
// works 메타(title/subtitle/author)는 같은 work_id 마다 한 번씩만 처리(memoize).
async function onQueueFillEn() {
  if (!Array.isArray(state.items) || state.items.length === 0) {
    toast('처리할 카드가 없습니다', 'err');
    return;
  }
  const btn = document.getElementById('queue-fill-en-btn');
  const refresh = document.getElementById('refresh-btn');
  btn.disabled = true; refresh.disabled = true;
  const origHtml = btn.innerHTML;

  // 1) 누락 필드 있는 카드 골라내기
  const targets = state.items.filter((it) => {
    const w = it.works || {};
    return (
      (!it.quote_original                  && it.quote) ||
      (!it.script_excerpt_original         && it.script_excerpt) ||
      (!it.excerpt_description_original    && it.excerpt_description) ||
      (!it.significance_original           && it.significance) ||
      ((!Array.isArray(it.keywords_original) || !it.keywords_original.length) && Array.isArray(it.keywords) && it.keywords.length) ||
      (!w.title_original    && w.title) ||
      (!w.subtitle_original && w.subtitle) ||
      (!w.author_original   && w.author)
    );
  });
  if (targets.length === 0) {
    toast('모든 카드에 영문 원본이 이미 채워져 있어요', 'ok');
    btn.disabled = false; refresh.disabled = false;
    return;
  }

  toast(`${targets.length}장 처리 시작 — 빈 영문만 채웁니다 (본문 재번역 X)`);

  // 같은 work_id 의 메타는 한 번만 번역 (memoize). 첫 카드가 작품 메타 처리 후 다른 카드는 skip.
  const workMetaDone = new Map(); // work_id → true (이미 처리됨)
  let done = 0, failedCards = [];
  for (let i = 0; i < targets.length; i++) {
    const it = targets[i];
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">progress_activity</span> ${i + 1}/${targets.length}`;
    try {
      await fillEnForCandidate(it, workMetaDone);
      done++;
    } catch (e) {
      console.warn(`[review] queue-fill candidate ${it.candidate_id} failed:`, e?.message || e);
      failedCards.push(it.candidate_id);
    }
  }

  btn.innerHTML = origHtml;
  btn.disabled = false; refresh.disabled = false;
  if (failedCards.length) {
    toast(`완료 — 성공 ${done}/${targets.length} · 실패 ${failedCards.length}장 (콘솔 확인)`, 'err');
    console.warn('[review] queue-fill failed candidate_ids:', failedCards);
  } else {
    toast(`영문 일괄 채우기 완료 — ${done}장`, 'ok');
  }
  await loadList();
}

// 후보 카드 한 장의 비어 있는 영문 필드를 모두 채우고 'save' 액션으로 commit.
// ★ 최적화: 비어 있는 필드를 모아 /api/translate-fields 1회 호출.
//   이전엔 필드당 별도 호출(최대 8회) → 0~1회.
async function fillEnForCandidate(it, workMetaDone) {
  const w = it.works || {};
  const workCtx = {
    title: w.title || '', subtitle: w.subtitle || '',
    author: w.author || '', format: w.format || '',
  };

  // 비어 있는 필드만 모으기. name 은 결과 객체의 키.
  const todo = [];
  // 1) 카드 본문
  if (!it.quote_original && it.quote) todo.push({ name: 'card.quote', text: it.quote, kind: 'quote' });
  if (!it.script_excerpt_original && it.script_excerpt) todo.push({ name: 'card.script_excerpt', text: it.script_excerpt, kind: 'script_excerpt' });
  if (!it.excerpt_description_original && it.excerpt_description) todo.push({ name: 'card.excerpt_description', text: it.excerpt_description, kind: 'excerpt_description' });
  if (!it.significance_original && it.significance) todo.push({ name: 'card.significance', text: it.significance, kind: 'significance' });
  if ((!Array.isArray(it.keywords_original) || !it.keywords_original.length)
      && Array.isArray(it.keywords) && it.keywords.length) {
    todo.push({ name: 'card.keywords', text: it.keywords.join(', '), kind: 'keywords' });
  }
  // 2) 작품 메타 — 같은 work_id 는 한 번만
  const wid = it.work_id;
  const includeWorkMeta = wid && !workMetaDone.get(wid);
  if (includeWorkMeta) {
    if (!w.title_original && w.title)       todo.push({ name: 'work.title',    text: w.title,    kind: 'title' });
    if (!w.subtitle_original && w.subtitle) todo.push({ name: 'work.subtitle', text: w.subtitle, kind: 'title' });
    if (!w.author_original && w.author)     todo.push({ name: 'work.author',   text: w.author,   kind: 'author' });
    workMetaDone.set(wid, true);
  }

  if (todo.length === 0) return;

  // 단일 호출 — 비어있는 모든 필드를 일괄 번역.
  let translations = {};
  try {
    const j = await apiFetch('/api/translate-fields', {
      method: 'POST',
      body: JSON.stringify({ fields: todo, direction: 'ko2en', work: workCtx }),
    });
    translations = (j && j.translations) || {};
  } catch (e) {
    console.warn(`[review] batch translate-fields failed for #${it.candidate_id}:`, e?.message || e);
    return;
  }

  // 결과를 카드 / 작품 edits 로 분류 + 로컬 객체에도 즉시 반영
  const edits = {};
  const workEdits = {};
  for (const [name, value] of Object.entries(translations)) {
    if (!value) continue;
    if (name === 'card.quote')              { edits.quote_original              = value; it.quote_original              = value; }
    if (name === 'card.script_excerpt')     { edits.script_excerpt_original     = value; it.script_excerpt_original     = value; }
    if (name === 'card.excerpt_description') { edits.excerpt_description_original = value; it.excerpt_description_original = value; }
    if (name === 'card.significance')       { edits.significance_original       = value; it.significance_original       = value; }
    if (name === 'card.keywords') {
      const arr = String(value).split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      if (arr.length) { edits.keywords_original = arr; it.keywords_original = arr; }
    }
    if (name === 'work.title')    { workEdits.title_original    = value; w.title_original    = value; }
    if (name === 'work.subtitle') { workEdits.subtitle_original = value; w.subtitle_original = value; }
    if (name === 'work.author')   { workEdits.author_original   = value; w.author_original   = value; }
  }

  if (Object.keys(edits).length === 0 && Object.keys(workEdits).length === 0) return;

  await apiFetch('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      action: 'save',
      candidateId: it.candidate_id,
      edits,
      workEdits,
    }),
  });
}

// ---------- 일괄 액션 (전체선택 / 일괄 삭제 / 일괄 승인) ----------
// 전체선택 — 현재 표시 중인 후보 중 다른 관리자가 점유하지 않은 것만 토글.
function onSelectAll(e) {
  const checked = !!e.target.checked;
  const selectableIds = state.items
    .filter((it) => !(it.claim_active && it.claimed_by && it.claimed_by !== state.currentUserId))
    .map((it) => it.candidate_id);
  if (checked) {
    for (const id of selectableIds) state.selected.add(id);
  } else {
    for (const id of selectableIds) state.selected.delete(id);
  }
  // 체크박스 시각 상태도 즉시 반영
  $$('.row-checkbox').forEach((cb) => {
    const id = Number(cb.dataset.cb);
    cb.checked = state.selected.has(id);
  });
  updateBulkBar();
}

// 일괄 삭제 — 선택된 후보를 순차 DELETE. 부분 실패는 경고.
async function onBulkDelete() {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!confirm(`선택한 ${ids.length}장을 삭제하시겠습니까?\n(영구 제거 — 복구 불가)`)) return;

  const btn = $('#bulk-delete-btn');
  const apvBtn = $('#bulk-approve-btn');
  const refresh = $('#refresh-btn');
  btn.disabled = true; apvBtn.disabled = true; if (refresh) refresh.disabled = true;
  const orig = btn.innerHTML;
  let done = 0, failed = 0;
  const errors = [];
  try {
    for (const id of ids) {
      btn.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">progress_activity</span> 삭제 중 (${done + failed}/${ids.length})`;
      try {
        await apiFetch('/api/candidates', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', candidateId: id }),
        });
        done++;
        state.selected.delete(id);
      } catch (e) {
        failed++;
        errors.push(`#${id}: ${e.message || e}`);
      }
    }
    if (failed === 0) {
      toast(`${done}장 삭제 완료`, 'ok');
    } else {
      toast(`삭제 ${done}장 성공 / ${failed}장 실패 — 첫 오류: ${errors[0]}`, 'err');
    }
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false; apvBtn.disabled = false; if (refresh) refresh.disabled = false;
    await loadList();
  }
}

// 일괄 승인 — 선택된 후보를 순차 approve. 검증(quote≈script, 길이미달 등) 실패는 그 카드만 skip.
async function onBulkApprove() {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!confirm(`선택한 ${ids.length}장을 승인하시겠습니까?\n(승인 시 자동으로 영문 채우기까지 진행됨)`)) return;

  const btn = $('#bulk-approve-btn');
  const delBtn = $('#bulk-delete-btn');
  const refresh = $('#refresh-btn');
  btn.disabled = true; delBtn.disabled = true; if (refresh) refresh.disabled = true;
  const orig = btn.innerHTML;
  let done = 0, failed = 0;
  const errors = [];
  try {
    for (const id of ids) {
      btn.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">progress_activity</span> 승인 중 (${done + failed}/${ids.length})`;
      try {
        await apiFetch('/api/candidates', {
          method: 'POST',
          body: JSON.stringify({ action: 'decide', candidateId: id, decision: 'approved' }),
        });
        done++;
        state.selected.delete(id);
      } catch (e) {
        failed++;
        errors.push(`#${id}: ${e.message || e}`);
        console.warn('[review] bulk approve failed:', id, e?.message);
      }
    }
    if (failed === 0) {
      toast(`${done}장 승인 완료 → 조회로 이동됨`, 'ok');
    } else {
      toast(`승인 ${done}장 성공 / ${failed}장 실패 — 첫 오류: ${errors[0]}`, 'err');
    }
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false; delBtn.disabled = false; if (refresh) refresh.disabled = false;
    await loadList();
  }
}

// 🌐 영문 일괄 채우기 — 비어 있는 영문 필드만 KO→EN 자동 번역해 채움
function wireFillEnBulk() {
  const btn = document.getElementById('fill-en-bulk-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = '⋯ 채우는 중';
    try {
      const work = collectWorkEditsForCtx();
      // 매핑: [한국어 input, 영문 input, field 이름, 다중값 여부]
      const pairs = [
        [$('#edit-work-title'),            $('#edit-work-title-original'),         'title',              false],
        [$('#edit-work-subtitle'),         $('#edit-work-subtitle-original'),      'subtitle',           false],
        [$('#edit-work-author'),           $('#edit-work-author-original'),        'author',             false],
        [$('#edit-quote'),                 $('#edit-quote-original'),              'quote',              false],
        [$('#edit-script-excerpt'),        $('#edit-script-excerpt-original'),     'script_excerpt',     false],
        [$('#edit-excerpt-description'),   $('#edit-excerpt-description-original'),'excerpt_description',false],
        [$('#edit-significance'),          $('#edit-significance-original'),       'significance',       false],
      ];
      // 키워드는 별도 (배열 ↔ 쉼표 string)
      const koKws = currentKeywords();
      const enKwInput = $('#edit-keywords-original');

      let filled = 0;
      for (const [koEl, enEl, field] of pairs) {
        if (!koEl || !enEl) continue;
        const koText = (koEl.value || '').trim();
        const enText = (enEl.value || '').trim();
        if (!koText || enText) continue;  // KO 없거나 EN 이미 있으면 스킵
        try {
          const j = await apiFetch('/api/translate-field', {
            method: 'POST',
            body: JSON.stringify({ text: koText, field, direction: 'ko2en', work }),
          });
          if (j?.translated) {
            enEl.value = String(j.translated).trim();
            filled++;
          }
        } catch (e) {
          console.warn('[review] fill-en-bulk', field, 'failed:', e.message);
        }
      }
      // 키워드
      if (koKws.length && enKwInput && !enKwInput.value.trim()) {
        try {
          const j = await apiFetch('/api/translate-field', {
            method: 'POST',
            body: JSON.stringify({ text: koKws.join(', '), field: 'keywords', direction: 'ko2en', work }),
          });
          if (j?.translated) {
            enKwInput.value = String(j.translated).trim();
            filled++;
          }
        } catch (e) { console.warn('[review] fill-en-bulk keywords failed:', e.message); }
      }
      toast(`영문 채우기 완료 — ${filled}개 필드`, filled ? 'ok' : 'err');
    } catch (err) {
      console.error('[review] fill-en-bulk error:', err);
      toast(`실패: ${err.message || err}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

// 편집만 저장 — 결정(승인/삭제) 없이 현재 폼의 값을 candidate 에 UPDATE.
// status='pending' 유지. 조회의 카드 편집·저장과 동일한 패턴.
async function onSave() {
  if (!state.current) return;
  const edits = collectEdits();
  const workEdits = collectWorkEdits();
  const notes = $('#edit-notes').value;
  const btn = $('#action-save');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = '⋯ 저장 중';
  try {
    await apiFetch('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({
        action: 'save',
        candidateId: state.current.candidate_id,
        edits, workEdits, notes,
      }),
    });
    // 메모리상 current 도 갱신 (다음 편집 시작점 일관성)
    Object.assign(state.current, edits);
    if (state.current.works) Object.assign(state.current.works, workEdits);
    if (notes != null) state.current.notes = notes;
    toast('저장 완료 (검토 대기 상태 유지)', 'ok');
  } catch (err) {
    console.error('[review] save failed:', err);
    toast(`저장 실패: ${err.message || err}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// 카드 후보 완전 삭제 — '거절' 의 대체. 확인 후 영구 제거.
async function onDelete() {
  if (!state.current) return;
  if (!confirm('이 카드 후보를 영구 삭제할까요? 복구할 수 없습니다.')) return;
  const btn = $('#decide-delete');
  btn.disabled = true;
  try {
    await apiFetch('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        candidateId: state.current.candidate_id,
      }),
    });
    toast('삭제됨', 'ok');
    showQueue();
    await loadList();
  } catch (err) {
    console.error('[review] delete failed:', err);
    toast(`삭제 실패: ${err.message || err}`, 'err');
    btn.disabled = false;
  }
}

// 승인 — 폼 편집까지 저장하고 cards 로 promote.
// (거절/수정필요 는 폐기. 거절은 'delete' 액션으로 분리.)
async function onDecide(decision) {
  if (!state.current) return;
  if (decision !== 'approved') {
    console.warn('[review] onDecide called with non-approved decision:', decision);
    return;
  }
  const edits = collectEdits();
  const workEdits = collectWorkEdits();
  const notes = $('#edit-notes').value;
  const btn = $('#decide-approve');
  btn.disabled = true;
  try {
    const j = await apiFetch('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({
        action: 'decide',
        candidateId: state.current.candidate_id,
        decision,
        edits,
        workEdits,
        notes,
      }),
    });
    const promotedMsg = j.promoted_card_id
      ? ` → 조회의 cards #${j.promoted_card_id} 로 이동`
      : '';
    toast(`승인됨${promotedMsg}`);
    showQueue();
    await loadList();
  } catch (err) {
    console.error('[review] approve failed', err);
    toast(`승인 실패: ${err.message}`, 'err');
    btn.disabled = false;
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
  $('#queue-fill-en-btn')?.addEventListener('click', onQueueFillEn);
  $('#select-all-checkbox')?.addEventListener('change', onSelectAll);
  $('#bulk-delete-btn')?.addEventListener('click', onBulkDelete);
  $('#bulk-approve-btn')?.addEventListener('click', onBulkApprove);
  $('#back-to-queue').addEventListener('click', onBack);
  // 모달 백드롭 클릭으로 닫기
  $('#view-detail').addEventListener('click', (e) => {
    if (e.target.id === 'view-detail') onBack();
  });
  // ESC 키로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#view-detail').classList.contains('open')) onBack();
  });
  $('#decide-approve').addEventListener('click', () => onDecide('approved'));
  $('#decide-delete').addEventListener('click', onDelete);
  $('#action-save').addEventListener('click', onSave);
  wireKeywordEditor();
  wireTranslateBackButtons();
  wireFillEnBulk();

  // 페이지를 떠나면 claim 이 자동 해제되지는 않는다 — TTL (10분) 이 지나면 다른 관리자가
  // 잡을 수 있게 자동 만료된다. 명시적으로 해제하려면 "목록으로" 버튼을 누른다.

  await loadList();
})();
