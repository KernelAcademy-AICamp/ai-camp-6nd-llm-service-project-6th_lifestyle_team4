import { getSupabase, getAccessToken, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';

// Vercel이 함수 크래시 시 plain-text 페이지("A server error...")를 돌려보내는데
// 그대로 res.json()을 부르면 SyntaxError가 나서 진짜 에러가 가려집니다.
// 본문을 먼저 text로 받아서 JSON 파싱을 시도하고, 실패하면 raw text를 보여줍니다.
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const raw = await res.text();
  let json = null;
  if (raw) {
    try { json = JSON.parse(raw); } catch { /* not JSON */ }
  }
  if (!res.ok) {
    const detail = json?.error || raw.slice(0, 300) || res.statusText;
    throw new Error(`HTTP ${res.status} · ${detail}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  work: null,
  fullScriptText: '',   // works.full_script_text 컬럼이 NOT NULL이라 저장 시 함께 전송
  category: 'screen',   // 'screen' = 영화/드라마, 'stage' = 연극/뮤지컬
  // each card: { ...llmCard, selected, translated?: { quote_translated, ... }, showingTranslation }
  cards: [],
};

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const dropzone = $('#dropzone');
const pdfInput = $('#pdf-input');
const dropzoneTitle = $('#dropzone-title');
const dropzoneSub = $('#dropzone-sub');
const categoryHint = $('#category-hint');
const summary = $('#summary');
const cardGrid = $('#card-grid');
const emptyMsg = $('#empty-msg');
const saveBar = $('#save-bar');
const saveBarCount = $('#save-bar-count');
const saveBtn = $('#save-btn');
const toastEl = $('#toast');
const userEmailEl = $('#user-email');
const logoutBtn = $('#logout-btn');
const cardTemplate = $('#card-template');
const cardEditTemplate = $('#card-edit-template');

// ---------------------------------------------------------------------------
// Init: auth gate
// ---------------------------------------------------------------------------
(async () => {
  const token = await requireSessionOrRedirect('/');
  if (!token) return;
  const sb = await getSupabase();
  const { data } = await sb.auth.getUser();
  userEmailEl.textContent = emailToDisplayId(data?.user?.email);
})();

logoutBtn.addEventListener('click', async () => {
  const sb = await getSupabase();
  await sb.auth.signOut();
  location.href = '/';
});

// ---------------------------------------------------------------------------
// Category toggle (영화/드라마 ↔ 연극/뮤지컬)
// ---------------------------------------------------------------------------
function paintCategory() {
  $$('#category-toggle .cat-btn').forEach((btn) => {
    const active = btn.dataset.category === state.category;
    // Active: 진한 primary 배경 + 글자 색 변경 + 굵은 보더
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('shadow-md', active);
    // Inactive: 기본 흰 배경 + 회색 보더
    btn.classList.toggle('bg-surface-container-lowest', !active);
    btn.classList.toggle('text-on-surface', !active);
    btn.classList.toggle('border-outline-variant', !active);
  });
  if (categoryHint) {
    const hints = {
      screen: '기존 프롬프트로 분석됩니다 (영화·드라마·연극·뮤지컬 공용).',
      stage: '기존 프롬프트로 분석됩니다 (영화·드라마·연극·뮤지컬 공용).',
      opera: '오페라/희곡 전용 프롬프트로 분석됩니다 (libretto 화자 표기 보존).',
      playscript: '오페라/희곡 전용 프롬프트로 분석됩니다 (오페라와 동일 규칙).',
    };
    categoryHint.textContent = hints[state.category] || '';
  }
}
$$('#category-toggle .cat-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.category = btn.dataset.category;
    paintCategory();
  });
});
paintCategory();

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------
pdfInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handlePdf(file);
});

['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('bg-primary/10', 'border-primary');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('bg-primary/10', 'border-primary');
  });
});
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handlePdf(file);
});

async function handlePdf(file) {
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('PDF 파일만 업로드할 수 있습니다.', 'error');
    return;
  }
  setDropzoneBusy(`업로드 중: ${file.name}`, '대본을 LLM이 분석하고 있습니다. 최대 1분 소요됩니다.');
  try {
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append('pdf', file);
    fd.append('category', state.category);
    const json = await apiFetch('/api/extract', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    applyExtraction(json);
    toast('추출 완료', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || '추출 실패', 'error');
  } finally {
    resetDropzone();
  }
}

function setDropzoneBusy(title, sub) {
  dropzoneTitle.textContent = title;
  dropzoneSub.textContent = sub;
  dropzone.classList.add('pointer-events-none', 'opacity-70');
}
function resetDropzone() {
  dropzoneTitle.textContent = 'Drop your PDF here';
  dropzoneSub.textContent = '스크립트 파일을 여기에 드래그하거나 클릭하여 업로드하세요 (PDF)';
  dropzone.classList.remove('pointer-events-none', 'opacity-70');
  pdfInput.value = '';
}

// ---------------------------------------------------------------------------
// State -> View
// ---------------------------------------------------------------------------
function applyExtraction(payload) {
  state.work = payload?.work || null;
  state.fullScriptText = payload?.full_script_text || '';
  state.cards = Array.isArray(payload?.cards)
    ? payload.cards.map((c) => ({ ...c, selected: false, translated: null, showingTranslation: false, editing: false }))
    : [];
  render();
}

function render() {
  renderSummary();
  renderCards();
  renderSaveBar();
}

function renderSummary() {
  if (!state.work) {
    summary.classList.add('hidden');
    summary.classList.remove('flex');
    return;
  }
  summary.classList.remove('hidden');
  summary.classList.add('flex');

  $('#work-title').textContent = state.work.title || '(제목 없음)';
  $('#work-format').textContent = state.work.format || '';

  const authorWrap = $('#work-author-wrap');
  if (state.work.author) {
    $('#work-author').textContent = state.work.author;
    authorWrap.classList.remove('hidden');
    authorWrap.classList.add('flex');
  } else {
    authorWrap.classList.add('hidden');
    authorWrap.classList.remove('flex');
  }

  const yearWrap = $('#work-year-wrap');
  if (state.work.release_year) {
    $('#work-year').textContent = state.work.release_year;
    yearWrap.classList.remove('hidden');
    yearWrap.classList.add('flex');
  } else {
    yearWrap.classList.add('hidden');
    yearWrap.classList.remove('flex');
  }

  const genresEl = $('#work-genres');
  genresEl.innerHTML = '';
  (state.work.genres || []).forEach((g) => {
    const chip = document.createElement('span');
    chip.className = 'px-2 py-0.5 bg-surface-container rounded-full text-xs';
    chip.textContent = g;
    genresEl.appendChild(chip);
  });

  $('#found-count').textContent = state.cards.length;
  $('#selected-count').textContent = state.cards.filter((c) => c.selected).length;
}

function renderCards() {
  cardGrid.innerHTML = '';
  if (!state.cards.length) {
    emptyMsg.classList.toggle('hidden', !state.work);
    return;
  }
  emptyMsg.classList.add('hidden');
  state.cards.forEach((card, idx) => cardGrid.appendChild(buildCardNode(card, idx)));
}

function buildCardNode(card, idx) {
  if (card.editing) return buildCardEditNode(card, idx);
  return buildCardViewNode(card, idx);
}

function buildCardViewNode(card, idx) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);

  const useTranslation = card.showingTranslation && card.translated;
  const quote = useTranslation ? card.translated.quote_translated : card.quote;
  const excerpt = useTranslation ? card.translated.script_excerpt_translated : card.script_excerpt;
  // 상황 설명(excerpt_description)은 번역하지 않음 — 항상 원본 표시.
  const desc = card.excerpt_description;

  node.querySelector('.card-tag').textContent =
    (card.keywords && card.keywords[0]) || `Card #${idx + 1}`;
  node.querySelector('.card-quote').textContent = quote ? `"${quote}"` : '';
  node.querySelector('.card-excerpt').textContent = excerpt || '';
  node.querySelector('.card-description').textContent = desc || '';

  // significance — 있으면 표시, 없으면 안내 문구
  const sigWrap = node.querySelector('.card-significance-wrap');
  const sigEl = node.querySelector('.card-significance');
  if (sigWrap && sigEl) {
    if (card.significance && String(card.significance).trim()) {
      sigEl.textContent = card.significance;
      sigWrap.classList.remove('hidden');
      sigWrap.classList.add('flex');
    } else {
      // LLM이 누락한 경우 시각적으로 알림
      sigEl.textContent = '(LLM이 의의 필드를 생성하지 않았습니다)';
      sigEl.classList.add('text-error');
      sigWrap.classList.remove('hidden');
      sigWrap.classList.add('flex');
    }
  }

  const kwEl = node.querySelector('.card-keywords');
  (card.keywords || []).forEach((k) => {
    const chip = document.createElement('span');
    chip.className = 'px-2 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant';
    chip.textContent = `#${k}`;
    kwEl.appendChild(chip);
  });

  fillMeter(node.querySelector('.card-temp-bar'), node.querySelector('.card-temp-num'), card.temperature, 'bg-primary');
  fillMeter(node.querySelector('.card-intensity-bar'), node.querySelector('.card-intensity-num'), card.intensity, 'bg-secondary');

  // Selected styling
  if (card.selected) {
    node.classList.add('card-selected', 'border-primary');
  }

  // Translated badge + button label
  const badge = node.querySelector('.translated-badge');
  const translateBtn = node.querySelector('.translate-btn');
  const translateLabel = node.querySelector('.translate-label');
  if (card.translated) {
    badge.classList.remove('hidden');
    translateLabel.textContent = useTranslation ? '원문 보기' : '번역본 보기';
  } else {
    badge.classList.add('hidden');
    translateLabel.textContent = '번역하기';
  }

  translateBtn.addEventListener('click', () => onTranslateClick(idx));

  // Select toggle
  const selectBtn = node.querySelector('.select-btn');
  const selectIcon = node.querySelector('.select-icon');
  const selectLabel = node.querySelector('.select-label');
  if (card.selected) {
    selectIcon.textContent = 'check_box';
    selectLabel.textContent = '선택됨';
    selectBtn.classList.add('bg-primary', 'text-on-primary', 'border-primary');
  }
  selectBtn.addEventListener('click', () => {
    state.cards[idx].selected = !state.cards[idx].selected;
    render();
  });

  // Edit/Delete buttons (top right)
  node.querySelector('.edit-btn').addEventListener('click', () => onEditClick(idx));
  node.querySelector('.delete-btn').addEventListener('click', () => onDeleteClick(idx));

  return node;
}

function buildCardEditNode(card, idx) {
  const node = cardEditTemplate.content.firstElementChild.cloneNode(true);

  const quoteEl = node.querySelector('.edit-quote');
  const excerptEl = node.querySelector('.edit-excerpt');
  const descEl = node.querySelector('.edit-description');
  const kwEl = node.querySelector('.edit-keywords');
  const tempEl = node.querySelector('.edit-temperature');
  const intensityEl = node.querySelector('.edit-intensity');

  quoteEl.value = card.quote || '';
  excerptEl.value = card.script_excerpt || '';
  descEl.value = card.excerpt_description || '';
  kwEl.value = (card.keywords || []).join(', ');
  tempEl.value = card.temperature ?? 3;
  intensityEl.value = card.intensity ?? 3;

  node.querySelector('.save-edit-btn').addEventListener('click', () => {
    const updates = {
      quote: quoteEl.value.trim(),
      script_excerpt: excerptEl.value.trim(),
      excerpt_description: descEl.value.trim(),
      keywords: kwEl.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
      temperature: Math.max(1, Math.min(5, Number(tempEl.value) || 3)),
      intensity: Math.max(1, Math.min(5, Number(intensityEl.value) || 3)),
      editing: false,
      // 텍스트가 바뀌었으니 기존 번역은 무효화
      translated: null,
      showingTranslation: false,
    };
    Object.assign(state.cards[idx], updates);
    render();
    toast('카드 수정 저장됨', 'success');
  });

  node.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    state.cards[idx].editing = false;
    render();
  });

  return node;
}

function onEditClick(idx) {
  // 다른 카드가 편집 중이면 자동 취소(불완전 편집 폐기)
  state.cards.forEach((c, i) => { if (i !== idx) c.editing = false; });
  state.cards[idx].editing = true;
  render();
}

function onDeleteClick(idx) {
  const card = state.cards[idx];
  const preview = (card.quote || '').slice(0, 30) || `카드 ${idx + 1}`;
  if (!confirm(`"${preview}${(card.quote || '').length > 30 ? '…' : ''}" 카드를 삭제할까요?`)) return;
  state.cards.splice(idx, 1);
  render();
  toast('카드 삭제됨', 'success');
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

function renderSaveBar() {
  const count = state.cards.filter((c) => c.selected).length;
  saveBarCount.textContent = count;
  if (state.cards.length === 0) {
    saveBar.classList.add('hidden');
    saveBar.classList.remove('flex');
  } else {
    saveBar.classList.remove('hidden');
    saveBar.classList.add('flex');
  }
  saveBtn.disabled = count === 0;
}

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------
async function onTranslateClick(idx) {
  const card = state.cards[idx];

  // Already translated -> toggle view
  if (card.translated) {
    card.showingTranslation = !card.showingTranslation;
    render();
    return;
  }

  try {
    toast('번역 중...', 'info');
    const token = await getAccessToken();
    const json = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card: {
          quote: card.quote,
          script_excerpt: card.script_excerpt,
          excerpt_description: card.excerpt_description,
        },
      }),
    });
    state.cards[idx].translated = json;
    state.cards[idx].showingTranslation = true;
    render();
    toast('번역 완료', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || '번역 실패', 'error');
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
saveBtn.addEventListener('click', async () => {
  const selected = state.cards.filter((c) => c.selected);
  if (!selected.length) return;

  saveBtn.disabled = true;
  const orig = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> 저장 중...';

  try {
    const token = await getAccessToken();
    // 서버는 card.showingTranslation/translated를 보고 어느 텍스트를 저장할지 결정.
    const cardsPayload = selected.map((c) => ({
      quote: c.quote,
      script_excerpt: c.script_excerpt,
      excerpt_description: c.excerpt_description,
      keywords: c.keywords,
      temperature: c.temperature,
      intensity: c.intensity,
      translated: c.translated || null,
      showingTranslation: !!c.showingTranslation,
    }));

    const json = await apiFetch('/api/save', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        work: state.work,
        full_script_text: state.fullScriptText,
        cards: cardsPayload,
      }),
    });
    toast(`저장 완료 (work_id=${json.work_id}, ${json.inserted_count}장)`, 'success');

    // Reset selection so user can re-curate or upload a new file
    state.cards.forEach((c) => (c.selected = false));
    render();
  } catch (err) {
    console.error(err);
    toast(err.message || '저장 실패', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = orig;
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
