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
  workFilter: '',     // 작품 제목 문자열 (이전엔 work_id)
  searchText: '',
  editing: null,      // editing card_id
  selectedIds: new Set(), // 그리드 전체 선택용 card_id Set
  viewMode: 'shelf',  // 'shelf' (책꽂이) | 'grid' (격자)
  // 책꽂이 카드 골라 삭제 모드
  deleteModeGroupKey: null,       // 현재 삭제 모드인 작품 그룹 키 (제목+작가)
  spineSelectedIds: new Set(),    // 삭제 모드에서 선택한 card_id 들
};

// 작품 그룹 키 — 제목+작가가 같으면 같은 그룹
function makeGroupKey(work) {
  if (!work) return '__';
  return `${(work.title || '').trim()}__${(work.author || '').trim()}`;
}

// 표시용 제목 정규화 — DB 원본은 그대로 두고 화면에만 한글 표기 적용
const TITLE_DISPLAY_ALIASES = {
  'titanic': '타이타닉',
  '아,저,씨': '아저씨',
};
function displayTitle(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t) return t;
  const key = t.toLowerCase();
  return TITLE_DISPLAY_ALIASES[key] || t;
}

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
  // 작품 제목 기준으로 중복 제거 (같은 제목 여러 work_id는 한 옵션으로 통합)
  const titles = new Set();
  state.rows.forEach((c) => {
    const t = (c.works?.title || '').trim();
    if (t) titles.add(t);
  });

  const current = libraryWorkFilter.value;
  libraryWorkFilter.innerHTML = '<option value="">모든 작품</option>';
  [...titles]
    .sort((a, b) => a.localeCompare(b))
    .forEach((title) => {
      const opt = document.createElement('option');
      opt.value = title;
      opt.textContent = displayTitle(title);
      libraryWorkFilter.appendChild(opt);
    });
  if (current && titles.has(current)) {
    libraryWorkFilter.value = current;
  } else {
    libraryWorkFilter.value = '';
    state.workFilter = '';
  }
}

function filteredRows() {
  const q = state.searchText.trim().toLowerCase();
  return state.rows.filter((c) => {
    if (state.workFilter && (c.works?.title || '').trim() !== state.workFilter) return false;
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
// Bookshelf rendering — 작품 제목+작가 기준 그룹화 (같은 제목은 한 책꽂이로 통합)
// ---------------------------------------------------------------------------
function renderShelf(rows) {
  const byGroup = new Map();
  rows.forEach((card) => {
    const work = card.works || { work_id: card.work_id, title: `Work #${card.work_id}` };
    const key = makeGroupKey(work);
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        key,
        // 대표 work 정보 (제목·작가·형식·연도는 대표 work에서)
        representative: work,
        // 통합된 모든 work_id 모음
        workIds: new Set(),
        cards: [],
      });
    }
    const group = byGroup.get(key);
    group.workIds.add(card.work_id);
    group.cards.push(card);
  });

  // 제목 순으로 정렬
  const sortedGroups = [...byGroup.values()].sort((a, b) =>
    String(a.representative.title || '').localeCompare(String(b.representative.title || ''))
  );

  sortedGroups.forEach((group) => {
    libraryShelf.appendChild(buildShelfSection(group));
  });
}

function buildShelfSection(group) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col gap-2';

  const work = group.representative;
  const cards = group.cards;
  const isDeleteMode = state.deleteModeGroupKey === group.key;
  const uploadCount = group.workIds.size;
  const mergedHint = uploadCount > 1 ? ` · 업로드 ${uploadCount}개 통합` : '';

  // 헤더: 일반 모드 / 카드 삭제 모드에 따라 다른 컨트롤
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-2';

  if (isDeleteMode) {
    const selectedCount = cards.filter((c) => state.spineSelectedIds.has(c.card_id)).length;
    header.innerHTML = `
      <h3 class="text-lg font-bold text-error">${escapeHtml(displayTitle(work.title) || '제목 없음')} <span class="text-sm font-medium">— 삭제할 책을 선택하세요</span></h3>
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
      state.deleteModeGroupKey = null;
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
      <h3 class="text-lg font-bold text-on-surface">${escapeHtml(displayTitle(work.title) || '제목 없음')}</h3>
      <span class="text-xs text-on-surface-variant flex-1">${escapeHtml(`${cards.length}장 ${formatLabel} ${yearLabel} ${authorLabel}${mergedHint}`.trim())}</span>
      <button type="button" class="shelf-start-delete-btn p-1.5 rounded hover:bg-primary/10 text-primary transition-colors flex items-center gap-1 text-sm font-semibold" title="카드 골라 삭제">
        <span class="material-symbols-outlined text-base">checklist</span>
        카드 골라 삭제
      </button>
      <button type="button" class="shelf-delete-work-btn p-1.5 rounded hover:bg-error/10 text-error transition-colors flex items-center gap-1 text-sm font-semibold" title="작품 전체 삭제 (통합된 업로드 모두)">
        <span class="material-symbols-outlined text-base">delete_sweep</span>
        작품 삭제
      </button>
    `;
    header.querySelector('.shelf-start-delete-btn').addEventListener('click', () => {
      state.deleteModeGroupKey = group.key;
      state.spineSelectedIds.clear();
      renderLibrary();
    });
    header.querySelector('.shelf-delete-work-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const uploadInfo = uploadCount > 1 ? ` (${uploadCount}개 업로드 통합)` : '';
      showConfirmModal({
        title: '정말 삭제하시겠습니까?',
        message: `"${displayTitle(work.title) || '제목 없음'}" 작품${uploadInfo}과 카드 ${cards.length}장이 모두 영구 삭제됩니다.\n\n복구할 수 없습니다.`,
        onConfirm: () => deleteWorkGroup(group),
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
  // 같은 제목 그룹은 같은 색 — 제목 해시 기반
  const baseColor = colorForTitle(work.title || group.key);
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

// 작품 제목 기반 베이스 색상 — 같은 제목이면 항상 같은 색 (같은 work_id끼리도 동일)
function colorForTitle(title) {
  const s = String(title || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash * 67) % 360;
  return hslToHex(hue, 55, 38);
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
    const { data, error } = await sb.from('cards').delete().in('card_id', targetIds).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('DB에서 삭제되지 않음 — admin 권한 확인 필요.');
    }
    if (data.length < targetIds.length) {
      console.warn(`[library] 일부만 삭제됨: 요청 ${targetIds.length}장, 실제 ${data.length}장`);
    }

    // 로컬 캐시 정리 — 실제 삭제된 ID만 반영
    const actuallyDeletedIds = new Set(data.map((r) => r.card_id));
    state.rows = state.rows.filter((c) => !actuallyDeletedIds.has(c.card_id));
    actuallyDeletedIds.forEach((id) => {
      state.spineSelectedIds.delete(id);
      state.selectedIds.delete(id);
    });
    // 삭제 모드 종료
    state.deleteModeGroupKey = null;
    state.spineSelectedIds.clear();

    refreshWorkFilterOptions();
    renderLibrary();
    refreshPullout();
    toast(`${data.length}장 삭제 완료`, 'success');
  } catch (err) {
    console.error('[library] bulk delete cards failed:', err);
    toast(`삭제 실패: ${err.message || err}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// 작품 그룹 통째로 삭제 — 같은 제목 여러 업로드 모두 한 번에 정리
// (book_genres → cards → works 순서, FK 위반 방지)
// ---------------------------------------------------------------------------
async function deleteWorkGroup(group) {
  const workIds = [...group.workIds];
  const cards = group.cards;
  try {
    const sb = await getSupabase();
    // 1) work_genres (없을 수도 있어 행수 검증은 생략, 에러만 확인)
    const { error: wgErr } = await sb.from('work_genres').delete().in('work_id', workIds);
    if (wgErr) throw wgErr;
    // 2) cards — 실제 삭제 행수 확인 (RLS 차단 감지)
    const { data: deletedCards, error: cErr } = await sb.from('cards').delete().in('work_id', workIds).select('card_id');
    if (cErr) throw cErr;
    if (cards.length > 0 && (!deletedCards || deletedCards.length === 0)) {
      throw new Error('DB에서 삭제되지 않음 — admin 권한 확인 필요.');
    }
    // 3) works — 실제 삭제 행수 확인
    const { data: deletedWorks, error: wErr } = await sb.from('works').delete().in('work_id', workIds).select('work_id');
    if (wErr) throw wErr;
    if (!deletedWorks || deletedWorks.length === 0) {
      throw new Error('works 삭제 실패 — admin 권한 확인 필요.');
    }

    // 로컬 캐시 정리
    const workIdSet = new Set(workIds);
    state.rows = state.rows.filter((c) => !workIdSet.has(c.work_id));
    cards.forEach((c) => state.selectedIds.delete(c.card_id));
    if (state.deleteModeGroupKey === group.key) {
      state.deleteModeGroupKey = null;
      state.spineSelectedIds.clear();
    }

    refreshWorkFilterOptions();
    renderLibrary();
    refreshPullout();
    const uploadInfo = workIds.length > 1 ? ` (${workIds.length}개 업로드 통합)` : '';
    toast(`'${displayTitle(group.representative.title) || '제목 없음'}' 작품 삭제 완료${uploadInfo} (카드 ${cards.length}장)`, 'success');
  } catch (err) {
    console.error('[library] delete work group failed:', err);
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

  const workLine = [displayTitle(work.title) || `Work #${card.work_id}`, work.format, work.release_year, work.author]
    .filter(Boolean).join(' · ');
  node.querySelector('.lib-work-title').textContent = workLine;
  node.querySelector('.lib-tag').textContent = (card.keywords && card.keywords[0]) || `Card #${card.card_id}`;
  node.querySelector('.lib-quote').textContent = card.quote ? `"${breakQuoteByBreath(cleanForDisplay(card.quote))}"` : '';
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
      const { data, error } = await sb.from('cards').update(updates).eq('card_id', card.card_id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('DB에 저장되지 않음 — admin 권한이 없거나 카드가 이미 삭제됐을 수 있습니다.');
      }
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
    // .select() 를 붙여 실제 삭제된 행 반환 — RLS 가 차단하면 빈 배열
    const { data, error } = await sb.from('cards').delete().eq('card_id', card.card_id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('DB에서 삭제되지 않음 — admin 권한이 없거나 이미 삭제된 카드일 수 있습니다.');
    }
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
    const { data, error } = await sb.from('cards').delete().in('card_id', targetIds).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('DB에서 삭제되지 않음 — admin 권한 확인 필요.');
    }
    if (data.length < targetIds.length) {
      console.warn(`[library] 일부만 삭제됨: 요청 ${targetIds.length}장, 실제 ${data.length}장`);
    }
    // 로컬 캐시 정리
    const actuallyDeletedIds = new Set(data.map((r) => r.card_id));
    state.rows = state.rows.filter((c) => !actuallyDeletedIds.has(c.card_id));
    actuallyDeletedIds.forEach((id) => state.selectedIds.delete(id));
    renderLibrary();
    refreshPullout();
    toast(`${data.length}장 삭제 완료`, 'success');
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

// DB에 콜론·em-dash·libretto 스타일 카드도 화면에선 정리해 보여줌
// 처리하는 패턴:
//   1) "이름: 대사"      (콜론 형식)
//   2) "이름\n대사"      (이미 분리됨)
//   3) "이름 대사"        (콜론 없이 공백, libretto/한국 영화 대본)
//   4) "이름 (지문) 대사" (지문 포함)
// 결과 포맷 (공통):
//   화자A
//   대사A
//   (빈 줄)
//   화자B
//   대사B
function cleanForDisplay(s) {
  let text = String(s ?? '');

  // 1) em-dash 변형 일괄 제거
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');

  // 2) 화자 후보 수집
  const speakers = new Set();

  // (a) 콜론 형식: "이름:"
  const colonRegex = /^([^:：()\n]{1,14})[:：][ \t]*/gm;
  let m;
  while ((m = colonRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) speakers.add(name);
  }

  // (b) 줄 머리 첫 단어 빈도 — "이름" 단독 또는 "이름 + 공백 + 내용" 패턴
  //     2회 이상 등장하면 화자 후보
  //     단, 명사+조사로 끝나는 narrative 주어는 제외 (강재가/강재의/강재에게…)
  const PARTICLE_END = /(가|이|는|을|를|도|의|에|에게|에서|와|과|으로|로|만|보다|처럼|마저|조차|밖에)$/;
  const headCounts = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    // 줄 머리에서 첫 한글/영문 토큰 추출 (공백 또는 줄끝으로 종료)
    const headM = line.match(/^([가-힣A-Za-z]{2,7}[0-9]?)(?=\s|$)/);
    if (headM) {
      const word = headM[1];
      // 조사로 끝나는 단어는 narrative 주어로 보고 카운트 안 함
      if (word.length > 2 && PARTICLE_END.test(word)) continue;
      headCounts[word] = (headCounts[word] || 0) + 1;
    }
  }
  Object.entries(headCounts).forEach(([word, count]) => {
    if (count >= 2) speakers.add(word);
  });

  // 3) "이름:" → "이름\n" (콜론 제거)
  text = text.replace(/^([^:：()\n]{1,14})[:：][ \t]*\n?/gm, '$1\n');

  // 4) 라인별 재조립 — 긴 이름부터 매칭해 짧은 이름이 긴 이름의 접두어인 경우 회피
  const sortedSpeakers = [...speakers].sort((a, b) => b.length - a.length);
  const lines = text.split('\n');
  const out = [];
  let firstSpeakerSeen = false;
  const pushSpeakerBoundary = () => {
    if (firstSpeakerSeen && out.length > 0 && out[out.length - 1].trim() !== '') {
      out.push('');
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(''); continue; }

    // 4a) 줄 전체가 화자 이름
    if (speakers.has(line)) {
      pushSpeakerBoundary();
      out.push(line);
      firstSpeakerSeen = true;
      continue;
    }

    // 4b) "이름 + 공백 + 내용" 형태 — 화자명만 분리해 다음 줄로
    let matched = false;
    for (const name of sortedSpeakers) {
      if (line.length <= name.length + 1) continue;
      if (line.startsWith(name + ' ') || line.startsWith(name + '\t')) {
        const rest = line.slice(name.length).trim();
        if (rest) {
          pushSpeakerBoundary();
          out.push(name);
          out.push(rest);
          firstSpeakerSeen = true;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    // 4c) narrative 또는 기타 — 그대로
    out.push(raw);
  }

  // 5) 정리
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

// 명대사(quote)를 호흡 단위(쉼표·마침표·물음표·느낌표) 뒤에서 줄바꿈해 가독성을 높인다.
// 화면 표시용 — 저장된 데이터는 바뀌지 않음. (.lib-quote 는 whitespace-pre-wrap 필요)
function breakQuoteByBreath(text) {
  return String(text ?? '')
    .replace(/([,，.。?!？！…])[ \t]+/g, '$1\n')
    .replace(/\n+$/g, '')
    .trim();
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
  const workLine = [displayTitle(work.title) || `Work #${card.work_id}`, work.author, work.release_year]
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
