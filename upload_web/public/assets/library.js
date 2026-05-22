import { getSupabase, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const userEmailEl = $('#user-email');
const logoutBtn = $('#logout-btn');
const libraryGrid = $('#library-grid');
const libraryShelf = $('#library-shelf');
const libraryStatus = $('#library-status');
const libraryEmpty = $('#library-empty');
const viewShelfBtn = $('#view-shelf-btn');
const viewGridBtn = $('#view-grid-btn');
const pulloutModal = $('#pullout-modal');
const pulloutClose = $('#pullout-close');
const pulloutBody = $('#pullout-body');
const confirmModal = $('#confirm-modal');
const confirmTitle = $('#confirm-title');
const confirmMessage = $('#confirm-message');
const confirmCancelBtn = $('#confirm-cancel');
const confirmDeleteBtn = $('#confirm-delete');
const libraryWorkFilter = $('#library-work-filter');
const librarySearchInput = $('#library-search');
const libraryRefreshBtn = $('#library-refresh');
const libraryCardTemplate = $('#library-card-template');
const libraryEditTemplate = $('#library-edit-template');
const librarySelectionBar = $('#library-selection-bar');
const librarySelectAll = $('#library-select-all');
const librarySelectedCount = $('#library-selected-count');
const libraryBulkDeleteBtn = $('#library-bulk-delete-btn');
const toastEl = $('#toast');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  rows: [],           // 카드 + 작품 정보
  workFilter: '',
  searchText: '',
  editing: null,      // editing card_id
  selectedIds: new Set(), // 그리드 전체 선택용 card_id Set
  viewMode: 'shelf',  // 'shelf' (책꽂이) | 'grid' (격자)
  // 책꽂이 카드 골라 삭제 모드
  deleteModeWorkId: null,         // 현재 삭제 모드인 work_id (한 번에 하나만)
  spineSelectedIds: new Set(),    // 삭제 모드에서 선택한 card_id 들
};

// ---------------------------------------------------------------------------
// Init: auth gate + load
// ---------------------------------------------------------------------------
(async () => {
  const token = await requireSessionOrRedirect('/');
  if (!token) return;
  const sb = await getSupabase();
  const { data } = await sb.auth.getUser();
  userEmailEl.textContent = emailToDisplayId(data?.user?.email);
  loadLibrary().catch((err) => console.error('[library] load failed:', err));
})();

logoutBtn.addEventListener('click', async () => {
  const sb = await getSupabase();
  await sb.auth.signOut();
  location.href = '/';
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
async function loadLibrary() {
  libraryStatus.textContent = '불러오는 중…';
  libraryStatus.classList.remove('text-error');

  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('cards')
      .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, works(work_id, title, format, author, release_year, characters)')
      .order('card_id', { ascending: false })
      .limit(500);
    if (error) throw error;

    state.rows = Array.isArray(data) ? data : [];
    refreshWorkFilterOptions();
    renderLibrary();
    libraryStatus.textContent = `총 ${state.rows.length}장 로드됨.`;
  } catch (err) {
    console.error('[library] load error:', err);
    libraryStatus.textContent = `불러오기 실패: ${err.message || err}`;
    libraryStatus.classList.add('text-error');
  }
}

function refreshWorkFilterOptions() {
  const seen = new Map();
  state.rows.forEach((c) => {
    const w = c.works;
    if (w && !seen.has(w.work_id)) seen.set(w.work_id, w.title || `Work #${w.work_id}`);
  });

  const current = libraryWorkFilter.value;
  libraryWorkFilter.innerHTML = '<option value="">모든 작품</option>';
  [...seen.entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .forEach(([id, title]) => {
      const opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = title;
      libraryWorkFilter.appendChild(opt);
    });
  if (current && [...seen.keys()].some((k) => String(k) === current)) {
    libraryWorkFilter.value = current;
  } else {
    libraryWorkFilter.value = '';
    state.workFilter = '';
  }
}

function filteredRows() {
  const q = state.searchText.trim().toLowerCase();
  return state.rows.filter((c) => {
    if (state.workFilter && String(c.work_id) !== state.workFilter) return false;
    if (q) {
      const hay = `${c.quote || ''} ${c.excerpt_description || ''} ${(c.keywords || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderLibrary() {
  libraryGrid.innerHTML = '';
  libraryShelf.innerHTML = '';
  const rows = filteredRows();

  if (rows.length === 0) {
    libraryEmpty.classList.remove('hidden');
    librarySelectionBar.classList.add('hidden');
    librarySelectionBar.classList.remove('flex');
    libraryGrid.classList.add('hidden');
    libraryShelf.classList.add('hidden');
    return;
  }
  libraryEmpty.classList.add('hidden');

  if (state.viewMode === 'grid') {
    // 그리드 모드: 전체선택 툴바 표시
    libraryGrid.classList.remove('hidden');
    libraryShelf.classList.add('hidden');
    librarySelectionBar.classList.remove('hidden');
    librarySelectionBar.classList.add('flex');
    rows.forEach((card) => {
      if (state.editing === card.card_id) {
        libraryGrid.appendChild(buildEditNode(card));
      } else {
        libraryGrid.appendChild(buildViewNode(card));
      }
    });
    updateSelectionUi();
  } else {
    // 책꽂이 모드: 전체선택 툴바 숨김 (작품별 카드 삭제 모드가 그 자리를 대신)
    libraryGrid.classList.add('hidden');
    libraryShelf.classList.remove('hidden');
    librarySelectionBar.classList.add('hidden');
    librarySelectionBar.classList.remove('flex');
    renderShelf(rows);
  }
}

// ---------------------------------------------------------------------------
// Bookshelf rendering — 작품별로 그룹화
// ---------------------------------------------------------------------------
function renderShelf(rows) {
  // 작품 ID로 그룹화 (작품 정보 + 카드 목록)
  const byWork = new Map();
  rows.forEach((card) => {
    const wid = card.work_id;
    if (!byWork.has(wid)) {
      byWork.set(wid, { work: card.works || { work_id: wid, title: `Work #${wid}` }, cards: [] });
    }
    byWork.get(wid).cards.push(card);
  });

  // 작품 제목 순으로 정렬
  const sortedWorks = [...byWork.values()].sort((a, b) =>
    String(a.work.title || '').localeCompare(String(b.work.title || ''))
  );

  sortedWorks.forEach(({ work, cards }) => {
    libraryShelf.appendChild(buildShelfSection(work, cards));
  });
}

function buildShelfSection(work, cards) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col gap-2';

  const isDeleteMode = state.deleteModeWorkId === work.work_id;

  // 헤더: 일반 모드 / 카드 삭제 모드에 따라 다른 컨트롤
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-2';

  if (isDeleteMode) {
    const selectedCount = cards.filter((c) => state.spineSelectedIds.has(c.card_id)).length;
    header.innerHTML = `
      <h3 class="text-lg font-bold text-error">${escapeHtml(work.title || '제목 없음')} <span class="text-sm font-medium">— 삭제할 책을 선택하세요</span></h3>
      <span class="text-sm font-semibold text-error flex-1"><span class="font-bold">${selectedCount}</span>장 선택됨</span>
      <button type="button" class="shelf-cancel-delete-btn px-3 py-1.5 rounded-lg border-2 border-outline-variant font-semibold text-sm hover:bg-surface-container-low transition-colors">
        놔두기
      </button>
      <button type="button" class="shelf-confirm-delete-btn px-3 py-1.5 rounded-lg bg-error text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1" ${selectedCount === 0 ? 'disabled' : ''}>
        <span class="material-symbols-outlined text-base">delete</span>
        삭제
      </button>
    `;
    header.querySelector('.shelf-cancel-delete-btn').addEventListener('click', () => {
      state.deleteModeWorkId = null;
      state.spineSelectedIds.clear();
      renderLibrary();
    });
    header.querySelector('.shelf-confirm-delete-btn').addEventListener('click', () => {
      const targetIds = cards
        .filter((c) => state.spineSelectedIds.has(c.card_id))
        .map((c) => c.card_id);
      if (targetIds.length === 0) return;
      showConfirmModal({
        title: '정말 삭제하시겠습니까?',
        message: `선택한 카드 ${targetIds.length}장이 영구 삭제됩니다.\n\n복구할 수 없습니다.`,
        onConfirm: () => bulkDeleteCards(targetIds),
      });
    });
  } else {
    const formatLabel = work.format ? `· ${work.format}` : '';
    const yearLabel = work.release_year ? `· ${work.release_year}` : '';
    const authorLabel = work.author ? `· ${work.author}` : '';
    header.innerHTML = `
      <h3 class="text-lg font-bold text-on-surface">${escapeHtml(work.title || '제목 없음')}</h3>
      <span class="text-xs text-on-surface-variant flex-1">${escapeHtml(`${cards.length}장 ${formatLabel} ${yearLabel} ${authorLabel}`.trim())}</span>
      <button type="button" class="shelf-start-delete-btn p-1.5 rounded hover:bg-primary/10 text-primary transition-colors flex items-center gap-1 text-sm font-semibold" title="카드 골라 삭제">
        <span class="material-symbols-outlined text-base">checklist</span>
        카드 골라 삭제
      </button>
      <button type="button" class="shelf-delete-work-btn p-1.5 rounded hover:bg-error/10 text-error transition-colors flex items-center gap-1 text-sm font-semibold" title="작품 전체 삭제">
        <span class="material-symbols-outlined text-base">delete_sweep</span>
        작품 삭제
      </button>
    `;
    header.querySelector('.shelf-start-delete-btn').addEventListener('click', () => {
      state.deleteModeWorkId = work.work_id;
      state.spineSelectedIds.clear();
      renderLibrary();
    });
    header.querySelector('.shelf-delete-work-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirmModal({
        title: '정말 삭제하시겠습니까?',
        message: `"${work.title || `Work #${work.work_id}`}" 작품과 카드 ${cards.length}장이 모두 영구 삭제됩니다.\n\n복구할 수 없습니다.`,
        onConfirm: () => deleteWork(work, cards),
      });
    });
  }
  wrap.appendChild(header);

  // 책꽂이 행
  const bookshelf = document.createElement('div');
  bookshelf.className = 'bookshelf';
  if (isDeleteMode) bookshelf.classList.add('bookshelf-delete-mode');
  const shelfRow = document.createElement('div');
  shelfRow.className = 'shelf-row';
  const baseColor = colorForWork(work.work_id);
  cards.forEach((card, idx) => {
    shelfRow.appendChild(buildSpine(card, baseColor, idx, isDeleteMode));
  });
  bookshelf.appendChild(shelfRow);
  wrap.appendChild(bookshelf);

  return wrap;
}

function buildSpine(card, baseColor, idx, isDeleteMode = false) {
  const spine = document.createElement('div');
  spine.className = 'spine';
  const isSelected = isDeleteMode && state.spineSelectedIds.has(card.card_id);
  if (isSelected) spine.classList.add('spine-selected');

  // 같은 작품 안에서 카드별 색조 약간 변화 (밝기 차이로 구분감)
  const shaded = shadeColor(baseColor, (idx % 5) * 6 - 12);
  spine.style.background = `linear-gradient(180deg, ${shaded} 0%, ${shadeColor(shaded, -8)} 100%)`;

  // 명대사 첫 단어 또는 키워드 첫 번째를 spine title로
  const titleSrc = (card.keywords && card.keywords[0]) || cleanForDisplay(card.quote || '').slice(0, 14);

  spine.innerHTML = `
    ${isSelected ? '<span class="spine-check material-symbols-outlined">check_circle</span>' : ''}
    <span class="spine-id">#${card.card_id}</span>
    <span class="spine-title">${escapeHtml(titleSrc)}</span>
    <span class="spine-format">${escapeHtml((card.works?.format || '').toUpperCase())}</span>
  `;

  if (isDeleteMode) {
    spine.addEventListener('click', () => {
      if (state.spineSelectedIds.has(card.card_id)) {
        state.spineSelectedIds.delete(card.card_id);
      } else {
        state.spineSelectedIds.add(card.card_id);
      }
      renderLibrary();
    });
  } else {
    spine.addEventListener('click', () => openPulloutCard(card));
  }
  return spine;
}

// 작품 ID 기반 베이스 색상 (HSL 회전)
function colorForWork(workId) {
  const id = Number(workId) || 0;
  const hue = (id * 67) % 360; // 각 작품마다 다른 hue
  return hslToHex(hue, 55, 38); // 중간 채도·중간 명도
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
  let b = (num & 0xff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Pullout card modal — spine 클릭 시 책 "꺼내 보기"
// ---------------------------------------------------------------------------
let currentPulloutCardId = null;

function openPulloutCard(card) {
  currentPulloutCardId = card.card_id;
  refreshPullout();
  pulloutModal.classList.remove('hidden');
  pulloutModal.classList.add('flex');
}

// state.editing 또는 state.rows 변경 시 호출 — 모달 내용 동기화
function refreshPullout() {
  if (currentPulloutCardId == null) return;
  const card = state.rows.find((c) => c.card_id === currentPulloutCardId);
  if (!card) {
    // 카드가 삭제됐으면 모달 닫기
    closePulloutCard();
    return;
  }
  pulloutBody.innerHTML = '';
  if (state.editing === card.card_id) {
    pulloutBody.appendChild(buildEditNode(card));
  } else {
    pulloutBody.appendChild(buildViewNode(card));
  }
}

function closePulloutCard() {
  pulloutModal.classList.add('hidden');
  pulloutModal.classList.remove('flex');
  pulloutBody.innerHTML = '';
  currentPulloutCardId = null;
}

pulloutClose.addEventListener('click', closePulloutCard);
pulloutModal.addEventListener('click', (e) => {
  if (e.target === pulloutModal) closePulloutCard();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !pulloutModal.classList.contains('hidden')) {
    closePulloutCard();
  }
});

// ---------------------------------------------------------------------------
// Confirm modal — 위험한 작업 전 사용자 확인 ('놔두기' / '삭제')
// ---------------------------------------------------------------------------
let confirmPendingFn = null;

function showConfirmModal({ title, message, onConfirm }) {
  confirmTitle.textContent = title || '정말 삭제하시겠습니까?';
  confirmMessage.textContent = message || '';
  confirmPendingFn = onConfirm;
  confirmModal.classList.remove('hidden');
  confirmModal.classList.add('flex');
}

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
  confirmModal.classList.remove('flex');
  confirmPendingFn = null;
}

confirmCancelBtn.addEventListener('click', closeConfirmModal);
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});
confirmDeleteBtn.addEventListener('click', async () => {
  const fn = confirmPendingFn;
  closeConfirmModal();
  if (fn) await fn();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
    closeConfirmModal();
  }
});

// ---------------------------------------------------------------------------
// 책꽂이 카드 골라 삭제 — 선택한 card_id 들을 한 번에 DELETE
// ---------------------------------------------------------------------------
async function bulkDeleteCards(targetIds) {
  if (!targetIds || targetIds.length === 0) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('cards').delete().in('card_id', targetIds);
    if (error) throw error;

    // 로컬 캐시 정리
    const idSet = new Set(targetIds);
    state.rows = state.rows.filter((c) => !idSet.has(c.card_id));
    targetIds.forEach((id) => {
      state.spineSelectedIds.delete(id);
      state.selectedIds.delete(id);
    });
    // 삭제 모드 종료
    state.deleteModeWorkId = null;
    state.spineSelectedIds.clear();

    refreshWorkFilterOptions();
    renderLibrary();
    refreshPullout();
    toast(`${targetIds.length}장 삭제 완료`, 'success');
  } catch (err) {
    console.error('[library] bulk delete cards failed:', err);
    toast(`삭제 실패: ${err.message || err}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// 작품 통째로 삭제 (book_genres → cards → works 순서, FK 위반 방지)
// ---------------------------------------------------------------------------
async function deleteWork(work, cards) {
  try {
    const sb = await getSupabase();
    // 1) work_genres 정리
    const { error: wgErr } = await sb.from('work_genres').delete().eq('work_id', work.work_id);
    if (wgErr) throw wgErr;
    // 2) cards 정리
    const { error: cErr } = await sb.from('cards').delete().eq('work_id', work.work_id);
    if (cErr) throw cErr;
    // 3) works 본체 삭제
    const { error: wErr } = await sb.from('works').delete().eq('work_id', work.work_id);
    if (wErr) throw wErr;

    // 로컬 캐시에서 제거
    const removedCardIds = new Set(cards.map((c) => c.card_id));
    state.rows = state.rows.filter((c) => c.work_id !== work.work_id);
    removedCardIds.forEach((id) => state.selectedIds.delete(id));

    refreshWorkFilterOptions();
    renderLibrary();
    refreshPullout();
    toast(`'${work.title || `Work #${work.work_id}`}' 작품 삭제 완료 (카드 ${cards.length}장 포함)`, 'success');
  } catch (err) {
    console.error('[library] delete work failed:', err);
    toast(`작품 삭제 실패: ${err.message || err}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// View mode toggle
// ---------------------------------------------------------------------------
function setViewMode(mode) {
  state.viewMode = mode;
  viewShelfBtn.classList.toggle('active', mode === 'shelf');
  viewGridBtn.classList.toggle('active', mode === 'grid');
  renderLibrary();
}
viewShelfBtn.addEventListener('click', () => setViewMode('shelf'));
viewGridBtn.addEventListener('click', () => setViewMode('grid'));

// 선택 상태 UI 갱신 (선택 개수, 전체 선택 체크박스, 일괄 삭제 버튼)
function updateSelectionUi() {
  const rows = filteredRows();
  const visibleIds = new Set(rows.map((c) => c.card_id));
  const selectedVisible = [...state.selectedIds].filter((id) => visibleIds.has(id));
  const count = selectedVisible.length;

  librarySelectedCount.textContent = count;
  libraryBulkDeleteBtn.disabled = count === 0;

  // 전체 선택 체크박스 상태
  if (rows.length > 0 && count === rows.length) {
    librarySelectAll.checked = true;
    librarySelectAll.indeterminate = false;
  } else if (count === 0) {
    librarySelectAll.checked = false;
    librarySelectAll.indeterminate = false;
  } else {
    librarySelectAll.checked = false;
    librarySelectAll.indeterminate = true;
  }
}

function buildViewNode(card) {
  const node = libraryCardTemplate.content.firstElementChild.cloneNode(true);
  const work = card.works || {};

  const workLine = [work.title || `Work #${card.work_id}`, work.format, work.release_year, work.author]
    .filter(Boolean).join(' · ');
  node.querySelector('.lib-work-title').textContent = workLine;
  node.querySelector('.lib-tag').textContent = (card.keywords && card.keywords[0]) || `Card #${card.card_id}`;
  node.querySelector('.lib-quote').textContent = card.quote ? `"${cleanForDisplay(card.quote)}"` : '';
  node.querySelector('.lib-excerpt').innerHTML = boldSpeakerLines(cleanForDisplay(card.script_excerpt || ''), work.characters);
  node.querySelector('.lib-description').textContent = cleanForDisplay(card.excerpt_description || '');

  const kwEl = node.querySelector('.lib-keywords');
  (card.keywords || []).forEach((k) => {
    const chip = document.createElement('span');
    chip.className = 'px-2 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant';
    chip.textContent = `#${k}`;
    kwEl.appendChild(chip);
  });

  fillMeter(node.querySelector('.lib-temp-bar'), node.querySelector('.lib-temp-num'), card.temperature, 'bg-primary');
  fillMeter(node.querySelector('.lib-intensity-bar'), node.querySelector('.lib-intensity-num'), card.intensity, 'bg-secondary');

  // significance — 있으면 표시
  const sigWrap = node.querySelector('.lib-significance-wrap');
  const sigEl = node.querySelector('.lib-significance');
  if (sigWrap && sigEl && card.significance && String(card.significance).trim()) {
    sigEl.textContent = cleanForDisplay(card.significance);
    sigWrap.classList.remove('hidden');
    sigWrap.classList.add('flex');
  }

  const created = card.created_at ? new Date(card.created_at).toLocaleString('ko-KR') : '';
  node.querySelector('.lib-meta').textContent = `card_id: ${card.card_id}${created ? ' · 생성: ' + created : ''}`;

  // 선택 체크박스 — 현재 state.selectedIds 와 동기화
  const checkbox = node.querySelector('.lib-select-checkbox');
  if (checkbox) {
    checkbox.checked = state.selectedIds.has(card.card_id);
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) state.selectedIds.add(card.card_id);
      else state.selectedIds.delete(card.card_id);
      updateSelectionUi();
    });
    // 체크박스 클릭 시 카드 전체 클릭 이벤트와 분리
    checkbox.addEventListener('click', (e) => e.stopPropagation());
  }

  node.querySelector('.lib-preview-btn').addEventListener('click', () => showMobilePreview(card));
  node.querySelector('.lib-edit-btn').addEventListener('click', () => {
    state.editing = card.card_id;
    renderLibrary();
    refreshPullout();
  });
  node.querySelector('.lib-delete-btn').addEventListener('click', () => onDelete(card));

  return node;
}

function buildEditNode(card) {
  const node = libraryEditTemplate.content.firstElementChild.cloneNode(true);

  const quoteEl = node.querySelector('.lib-edit-quote');
  const excerptEl = node.querySelector('.lib-edit-excerpt');
  const descEl = node.querySelector('.lib-edit-description');
  const kwEl = node.querySelector('.lib-edit-keywords');
  const sigEl = node.querySelector('.lib-edit-significance');
  const tempEl = node.querySelector('.lib-edit-temperature');
  const intensityEl = node.querySelector('.lib-edit-intensity');

  quoteEl.value = card.quote || '';
  excerptEl.value = card.script_excerpt || '';
  descEl.value = card.excerpt_description || '';
  kwEl.value = (card.keywords || []).join(', ');
  if (sigEl) sigEl.value = card.significance || '';
  tempEl.value = card.temperature ?? 3;
  intensityEl.value = card.intensity ?? 3;

  node.querySelector('.lib-save-edit-btn').addEventListener('click', async () => {
    const updates = {
      quote: quoteEl.value.trim(),
      script_excerpt: excerptEl.value.trim(),
      excerpt_description: descEl.value.trim() || null,
      keywords: kwEl.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
      significance: (sigEl && sigEl.value.trim()) || null,
      temperature: Math.max(1, Math.min(5, Number(tempEl.value) || 3)),
      intensity: Math.max(1, Math.min(5, Number(intensityEl.value) || 3)),
    };
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('cards').update(updates).eq('card_id', card.card_id);
      if (error) throw error;
      Object.assign(card, updates);
      state.editing = null;
      renderLibrary();
      refreshPullout();
      toast('DB 카드 수정 저장됨', 'success');
    } catch (err) {
      console.error('[library] update failed:', err);
      toast(`수정 실패: ${err.message || err}`, 'error');
    }
  });

  node.querySelector('.lib-cancel-edit-btn').addEventListener('click', () => {
    state.editing = null;
    renderLibrary();
    refreshPullout();
  });

  return node;
}

async function onDelete(card) {
  const preview = (card.quote || '').slice(0, 30) || `카드 ${card.card_id}`;
  if (!confirm(`"${preview}${(card.quote || '').length > 30 ? '…' : ''}" 카드를 DB에서 영구 삭제할까요?\n\n복구할 수 없습니다.`)) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('cards').delete().eq('card_id', card.card_id);
    if (error) throw error;
    state.rows = state.rows.filter((c) => c.card_id !== card.card_id);
    renderLibrary();
    refreshPullout();
    toast('카드 삭제됨', 'success');
  } catch (err) {
    console.error('[library] delete failed:', err);
    toast(`삭제 실패: ${err.message || err}`, 'error');
  }
}

function fillMeter(barEl, numEl, value, colorCls) {
  const v = Number(value) || 0;
  numEl.textContent = `${v}/5`;
  barEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const seg = document.createElement('div');
    seg.className = `h-1.5 flex-1 rounded-full ${i < v ? colorCls : 'bg-surface-container-high'}`;
    barEl.appendChild(seg);
  }
}

// ---------------------------------------------------------------------------
// Filter / search handlers
// ---------------------------------------------------------------------------
libraryWorkFilter.addEventListener('change', () => {
  state.workFilter = libraryWorkFilter.value;
  renderLibrary();
});

let searchDebounce = null;
librarySearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchText = librarySearchInput.value;
    renderLibrary();
  }, 200);
});

libraryRefreshBtn.addEventListener('click', () => loadLibrary());

// 전체 선택 체크박스 — 현재 필터된 카드들의 선택 상태를 토글
librarySelectAll.addEventListener('change', (e) => {
  const rows = filteredRows();
  if (e.target.checked) {
    rows.forEach((c) => state.selectedIds.add(c.card_id));
  } else {
    rows.forEach((c) => state.selectedIds.delete(c.card_id));
  }
  renderLibrary();
});

// 일괄 삭제
libraryBulkDeleteBtn.addEventListener('click', () => onBulkDelete());

async function onBulkDelete() {
  const rows = filteredRows();
  const visibleIds = new Set(rows.map((c) => c.card_id));
  const targetIds = [...state.selectedIds].filter((id) => visibleIds.has(id));
  if (targetIds.length === 0) return;
  if (!confirm(`선택한 ${targetIds.length}장의 카드를 DB에서 영구 삭제할까요?\n\n복구할 수 없습니다.`)) return;

  try {
    const sb = await getSupabase();
    const { error } = await sb.from('cards').delete().in('card_id', targetIds);
    if (error) throw error;
    // 로컬 캐시에서 제거
    state.rows = state.rows.filter((c) => !targetIds.includes(c.card_id));
    targetIds.forEach((id) => state.selectedIds.delete(id));
    renderLibrary();
    refreshPullout();
    toast(`${targetIds.length}장 삭제 완료`, 'success');
  } catch (err) {
    console.error('[library] bulk delete failed:', err);
    toast(`일괄 삭제 실패: ${err.message || err}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Mobile preview modal (iOS + Android)
// ---------------------------------------------------------------------------
const previewModal = $('#preview-modal');
const previewModalClose = $('#preview-modal-close');
const previewIosScreen = $('#preview-ios-screen');
const previewAndroidScreen = $('#preview-android-screen');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// DB에 콜론·em-dash가 남아 있는 옛 카드도 화면에선 정리해 보여줌
// 결과 포맷:
//   화자A
//   대사A
//   대사A 연속
//   (빈 줄)
//   화자B
//   대사B
function cleanForDisplay(s) {
  let text = String(s ?? '');

  // 1) em-dash 변형 일괄 제거 (regular hyphen은 유지)
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');

  // 2) 줄 머리의 "이름:" 패턴에서 이름 후보 수집 (공백 포함 1~14자)
  const speakers = new Set();
  const colonRegex = /^([^:：()\n]{1,14})[:：][ \t]*/gm;
  let m;
  while ((m = colonRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) speakers.add(name);
  }

  // 3) "이름:" → "이름\n" (콜론 제거, 다음 줄에 대사 오도록)
  text = text.replace(/^([^:：()\n]{1,14})[:：][ \t]*\n?/gm, '$1\n');

  // 4) 라인별로 다시 조립 — 화자 이름 줄 앞에 빈 줄 추가 (첫 화자는 제외)
  const lines = text.split('\n');
  const out = [];
  let firstSpeakerSeen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line && speakers.has(line)) {
      if (firstSpeakerSeen && out.length > 0 && out[out.length - 1] !== '') {
        out.push(''); // 화자 블록 사이 빈 줄
      }
      out.push(line);
      firstSpeakerSeen = true;
    } else {
      out.push(raw);
    }
  }

  // 5) 연속 공백·과다 빈 줄 정리
  return out.join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 발췌문에서 '등장인물 이름 줄'만 <strong>으로 감싼다.
// characterNames = 그 작품의 등장인물 이름 목록(works.characters).
//  - 목록이 있으면: 그 이름과 정확히 일치하는 줄만 볼드 (가사·대사 오탐 없음).
//  - 목록이 없으면(아직 백필 안 됨/null): 볼드하지 않음 (오탐 방지).
// innerHTML에 넣기 때문에 모든 줄을 HTML 이스케이프한다.
function boldSpeakerLines(cleanedText, characterNames) {
  const text = String(cleanedText ?? '');
  const names = Array.isArray(characterNames) ? characterNames : [];
  if (names.length === 0) return escapeHtml(text);

  const nameSet = new Set(names.map((n) => String(n).trim()).filter(Boolean));
  return text.split('\n').map((line) => {
    const safe = escapeHtml(line);
    const t = line.trim();
    // 괄호 지문 단서가 붙은 경우 이름 부분만 떼서 비교 ("카르멘 (살짝)" → "카르멘")
    const namePart = t.split('(')[0].trim();
    const isSpeaker = !!t && (nameSet.has(t) || nameSet.has(namePart));
    return isSpeaker ? `<strong>${safe}</strong>` : safe;
  }).join('\n');
}

function showMobilePreview(card) {
  const html = renderAppCardHtml(card);
  previewIosScreen.innerHTML = html;
  previewAndroidScreen.innerHTML = html;
  bindDeckToggle(previewIosScreen);
  bindDeckToggle(previewAndroidScreen);
  previewModal.classList.remove('hidden');
  previewModal.classList.add('flex');
}

function bindDeckToggle(screen) {
  const deck = screen.querySelector('.app-deck');
  if (!deck) return;
  // 클릭으로 front ↔ back 토글
  deck.addEventListener('click', (e) => {
    // 본문 스크롤이나 백 버튼 등 특정 영역은 토글 제외
    if (e.target.closest('.app-back-btn')) {
      deck.dataset.state = 'front';
      screen.scrollTop = 0;
      return;
    }
    const newState = deck.dataset.state === 'back' ? 'front' : 'back';
    deck.dataset.state = newState;
    screen.scrollTop = 0;
  });
  // 첫 화면(quote) 자동 사이즈 조절
  const bigQuote = deck.querySelector('.app-quote-big');
  if (bigQuote) autoFitBigQuote(bigQuote);
}

function autoFitBigQuote(el) {
  if (!el) return;
  const len = el.textContent.length;
  let size = 22, lh = 1.55;
  if (len > 24) { size = 20; lh = 1.5; }
  if (len > 40) { size = 18; lh = 1.45; }
  if (len > 60) { size = 16; lh = 1.45; }
  if (len > 85) { size = 14.5; lh = 1.4; }
  if (len > 120) { size = 13; lh = 1.4; }
  if (len > 160) { size = 12; lh = 1.4; }
  el.style.fontSize = size + 'px';
  el.style.lineHeight = lh;
}

function closeMobilePreview() {
  previewModal.classList.add('hidden');
  previewModal.classList.remove('flex');
}

function renderAppCardHtml(card) {
  const work = card.works || {};
  const workLine = [work.title || `Work #${card.work_id}`, work.author, work.release_year]
    .filter(Boolean).join(' · ');

  const keywords = (card.keywords || [])
    .map((k) => `<span>#${escapeHtml(k)}</span>`).join('');

  const temp = Math.max(0, Math.min(5, Number(card.temperature) || 0));
  const intensity = Math.max(0, Math.min(5, Number(card.intensity) || 0));
  const tempBars = Array.from({ length: 5 }, (_, i) =>
    `<div class="${i < temp ? 'on-temp' : ''}"></div>`
  ).join('');
  const intBars = Array.from({ length: 5 }, (_, i) =>
    `<div class="${i < intensity ? 'on-int' : ''}"></div>`
  ).join('');

  const cleanQuote = cleanForDisplay(card.quote || '');
  const significance = card.significance && String(card.significance).trim();

  return `
    <div class="app-deck" data-state="front">
      <div class="app-front">
        <p class="app-quote-big">${escapeHtml(cleanQuote)}</p>
        <p class="app-tap-hint">탭하여 자세히 보기</p>
      </div>
      <div class="app-back">
        <button type="button" class="app-back-btn">← 명대사로 돌아가기</button>
        <p class="app-work-title">${escapeHtml(workLine)}</p>
        <p class="app-quote">${escapeHtml(cleanQuote)}</p>
        ${card.excerpt_description ? `<p class="app-desc">${escapeHtml(cleanForDisplay(card.excerpt_description))}</p>` : ''}
        <div class="app-excerpt">${boldSpeakerLines(cleanForDisplay(card.script_excerpt || ''), work.characters)}</div>
        ${keywords ? `<div class="app-keywords">${keywords}</div>` : ''}
        <div class="app-meters">
          <div class="app-meter">
            <div class="flex justify-between"><span>Temperature</span><span>${temp}/5</span></div>
            <div class="app-meter-bar">${tempBars}</div>
          </div>
          <div class="app-meter">
            <div class="flex justify-between"><span>Intensity</span><span>${intensity}/5</span></div>
            <div class="app-meter-bar">${intBars}</div>
          </div>
        </div>
        ${significance ? `<div class="app-significance"><span class="app-significance-label">의의</span>${escapeHtml(significance)}</div>` : ''}
      </div>
    </div>
  `;
}

previewModalClose.addEventListener('click', closeMobilePreview);
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closeMobilePreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
    closeMobilePreview();
  }
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function toast(msg, kind = 'info') {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.classList.remove('bg-error', 'bg-primary', 'bg-inverse-surface');
  if (kind === 'error') toastEl.classList.add('bg-error');
  else if (kind === 'success') toastEl.classList.add('bg-primary');
  else toastEl.classList.add('bg-inverse-surface');
  toastEl.classList.add('text-white');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3500);
}
