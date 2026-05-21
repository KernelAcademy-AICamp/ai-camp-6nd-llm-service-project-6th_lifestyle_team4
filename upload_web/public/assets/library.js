import { getSupabase, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const userEmailEl = $('#user-email');
const logoutBtn = $('#logout-btn');
const libraryGrid = $('#library-grid');
const libraryStatus = $('#library-status');
const libraryEmpty = $('#library-empty');
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
  selectedIds: new Set(), // 선택된 card_id Set
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
      .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, works(work_id, title, format, author, release_year)')
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
  const rows = filteredRows();

  // 선택 툴바 표시 여부
  if (rows.length === 0) {
    libraryEmpty.classList.remove('hidden');
    librarySelectionBar.classList.add('hidden');
    librarySelectionBar.classList.remove('flex');
    return;
  }
  libraryEmpty.classList.add('hidden');
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
}

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
  node.querySelector('.lib-excerpt').textContent = cleanForDisplay(card.script_excerpt || '');
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
      toast('DB 카드 수정 저장됨', 'success');
    } catch (err) {
      console.error('[library] update failed:', err);
      toast(`수정 실패: ${err.message || err}`, 'error');
    }
  });

  node.querySelector('.lib-cancel-edit-btn').addEventListener('click', () => {
    state.editing = null;
    renderLibrary();
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
        <div class="app-excerpt">${escapeHtml(cleanForDisplay(card.script_excerpt || ''))}</div>
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
