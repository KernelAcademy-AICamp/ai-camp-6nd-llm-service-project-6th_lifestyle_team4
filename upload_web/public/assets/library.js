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
const toastEl = $('#toast');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  rows: [],           // 카드 + 작품 정보
  workFilter: '',
  searchText: '',
  editing: null,      // editing card_id
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
      .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, created_at, works(work_id, title, format, author, release_year)')
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

  if (rows.length === 0) {
    libraryEmpty.classList.remove('hidden');
    return;
  }
  libraryEmpty.classList.add('hidden');

  rows.forEach((card) => {
    if (state.editing === card.card_id) {
      libraryGrid.appendChild(buildEditNode(card));
    } else {
      libraryGrid.appendChild(buildViewNode(card));
    }
  });
}

function buildViewNode(card) {
  const node = libraryCardTemplate.content.firstElementChild.cloneNode(true);
  const work = card.works || {};

  const workLine = [work.title || `Work #${card.work_id}`, work.format, work.release_year, work.author]
    .filter(Boolean).join(' · ');
  node.querySelector('.lib-work-title').textContent = workLine;
  node.querySelector('.lib-tag').textContent = (card.keywords && card.keywords[0]) || `Card #${card.card_id}`;
  node.querySelector('.lib-quote').textContent = card.quote ? `"${card.quote}"` : '';
  node.querySelector('.lib-excerpt').textContent = card.script_excerpt || '';
  node.querySelector('.lib-description').textContent = card.excerpt_description || '';

  const kwEl = node.querySelector('.lib-keywords');
  (card.keywords || []).forEach((k) => {
    const chip = document.createElement('span');
    chip.className = 'px-2 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant';
    chip.textContent = `#${k}`;
    kwEl.appendChild(chip);
  });

  fillMeter(node.querySelector('.lib-temp-bar'), node.querySelector('.lib-temp-num'), card.temperature, 'bg-primary');
  fillMeter(node.querySelector('.lib-intensity-bar'), node.querySelector('.lib-intensity-num'), card.intensity, 'bg-secondary');

  const created = card.created_at ? new Date(card.created_at).toLocaleString('ko-KR') : '';
  node.querySelector('.lib-meta').textContent = `card_id: ${card.card_id}${created ? ' · 생성: ' + created : ''}`;

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
  const tempEl = node.querySelector('.lib-edit-temperature');
  const intensityEl = node.querySelector('.lib-edit-intensity');

  quoteEl.value = card.quote || '';
  excerptEl.value = card.script_excerpt || '';
  descEl.value = card.excerpt_description || '';
  kwEl.value = (card.keywords || []).join(', ');
  tempEl.value = card.temperature ?? 3;
  intensityEl.value = card.intensity ?? 3;

  node.querySelector('.lib-save-edit-btn').addEventListener('click', async () => {
    const updates = {
      quote: quoteEl.value.trim(),
      script_excerpt: excerptEl.value.trim(),
      excerpt_description: descEl.value.trim() || null,
      keywords: kwEl.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
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

function showMobilePreview(card) {
  const html = renderAppCardHtml(card);
  previewIosScreen.innerHTML = html;
  previewAndroidScreen.innerHTML = html;
  previewModal.classList.remove('hidden');
  previewModal.classList.add('flex');
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

  return `
    <div class="app-card">
      <p class="app-work-title">${escapeHtml(workLine)}</p>
      <p class="app-quote">${escapeHtml(card.quote || '')}</p>
      ${card.excerpt_description ? `<p class="app-desc">${escapeHtml(card.excerpt_description)}</p>` : ''}
      <div class="app-excerpt">${escapeHtml(card.script_excerpt || '')}</div>
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
