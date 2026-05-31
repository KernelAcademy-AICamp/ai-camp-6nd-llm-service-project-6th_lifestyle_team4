import { getSupabase, getAccessToken, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';
import { parseKeywords, validateKeywords, overLongKeywords, attachKeywordHint } from './keyword-utils.js';

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
  category: 'screen',   // 'screen' 영화/드라마, 'opera' 오페라/뮤지컬, 'play' 연극, 'novel' 소설, 'poem' 시, 'essay' 에세이, 'prose' 산문
  model: 'haiku',       // AI 모델: 'haiku' | 'sonnet' | 'opus' (extract 시 전송)
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
const selectAllBtn = $('#select-all-btn');
const selectAllLabel = $('#select-all-label');
const translateAllBtn = $('#translate-all-btn');

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

// 등장인물 목록(works.characters)이 비어 있는 기존 작품들을 일괄로 채운다.
// 한 번에 몇 개씩 처리하는 백필 API를, 남은 작품이 0이 될 때까지 반복 호출.
const backfillBtn = $('#backfill-btn');
backfillBtn?.addEventListener('click', async () => {
  if (!confirm('등장인물 목록이 비어 있는 작품들을 분석해서 채웁니다.\n작품 수에 따라 몇 분 걸릴 수 있어요. 진행할까요?')) return;
  backfillBtn.disabled = true;
  const orig = backfillBtn.innerHTML;
  let totalProcessed = 0;
  try {
    let remaining = Infinity;
    let guard = 0;
    while (remaining > 0 && guard < 300) {
      guard += 1;
      backfillBtn.innerHTML =
        `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>` +
        `<span class="text-sm">채우는 중⋯ (${totalProcessed})</span>`;
      const token = await getAccessToken();
      const json = await apiFetch('/api/backfill-characters?limit=3', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      totalProcessed += json.processed || 0;
      remaining = json.remaining ?? 0;
      // 더 처리할 게 없거나(0개) 남은 게 전부 에러면 무한루프 방지로 중단
      if ((json.processed || 0) === 0) break;
      toast(`인물 채우는 중 · 누적 ${totalProcessed}개 / 남음 ${remaining}`, 'info');
    }
    toast(`인물 목록 채우기 완료 (총 ${totalProcessed}개 작품)`, 'success');
  } catch (err) {
    toast(err.message || '인물 채우기 실패', 'error');
  } finally {
    backfillBtn.disabled = false;
    backfillBtn.innerHTML = orig;
  }
});

// ---------------------------------------------------------------------------
// Category toggle (영화/드라마 · 오페라/뮤지컬 · 연극 · 소설/시/에세이)
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
      screen: '기본 프롬프트로 분석됩니다 (영화·드라마용).',
      opera: '오페라·뮤지컬 전용 프롬프트로 분석됩니다 (libretto 화자 표기 보존).',
      play: '연극 전용 프롬프트로 분석됩니다 (speaker_label·상황 단서 포함).',
      novel: '소설 전용 프롬프트로 분석됩니다 (산문 단락·인물 보존).',
      poem: '시 전용 프롬프트로 분석됩니다 (행·연 구조 보존).',
      essay: '에세이 전용 프롬프트로 분석됩니다 (산문 논점·정조 보존).',
      prose: '산문 전용 프롬프트로 분석됩니다 (산문시·콩트·편지 등 일반 산문).',
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

// AI 모델 토글 (Haiku / Sonnet / Opus) — 카테고리 토글과 동일한 스타일
function paintModel() {
  $$('#model-toggle .model-btn').forEach((btn) => {
    const active = btn.dataset.model === state.model;
    btn.classList.toggle('bg-primary', active);
    btn.classList.toggle('text-on-primary', active);
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('shadow-md', active);
    btn.classList.toggle('bg-surface-container-lowest', !active);
    btn.classList.toggle('text-on-surface', !active);
    btn.classList.toggle('border-outline-variant', !active);
  });
  const hintEl = $('#model-hint');
  if (hintEl) {
    const hints = {
      haiku:  'Claude Haiku 4.5 — 빠르고 저렴. 대부분의 추출에 충분.',
      sonnet: 'Claude Sonnet 4.6 — 중간 속도, 더 정교한 판단.',
      opus:   'Claude Opus 4.7 — 가장 정교하지만 느리고 비용이 가장 큼.',
    };
    hintEl.textContent = hints[state.model] || '';
  }
}
$$('#model-toggle .model-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.model = btn.dataset.model;
    paintModel();
  });
});
paintModel();

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------
// 업로드 허용 형식
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx', 'hwp', 'hwpx'];

pdfInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
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
  if (file) handleFile(file);
});

async function handleFile(file) {
  const ext = (file.name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    toast('PDF · TXT · DOCX · HWP · HWPX 파일만 업로드할 수 있습니다.', 'error');
    return;
  }
  setDropzoneBusy(`업로드 중: ${file.name}`, '대본을 LLM이 분석하고 있습니다. 최대 1분 소요됩니다.');
  try {
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', state.category);
    fd.append('model', state.model);
    const titleHint = document.querySelector('#title-input')?.value?.trim();
    if (titleHint) fd.append('title', titleHint);
    const json = await apiFetch('/api/extract', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    applyExtraction(json);
    if (json?._truncated) {
      toast('추출 완료 — 단, 대본이 너무 길어 일부만(앞 400K글자) 분석했어요.', 'info');
    } else {
      toast('추출 완료', 'success');
    }
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
  dropzoneTitle.textContent = '대본 파일을 여기에 올리세요';
  dropzoneSub.textContent = '스크립트 파일을 여기에 드래그하거나 클릭하여 업로드하세요 (PDF · TXT · DOCX · HWP · HWPX)';
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

// 화자/대사 포맷 정상화 — 콜론 제거 + 화자 블록 사이 빈 줄
// (library.js 의 cleanForDisplay 와 동일 로직)
// 처리하는 패턴:
//   "이름: 대사"  /  "이름\n대사"  /  "이름 대사"  /  "이름 (지문) 대사"
function cleanForDisplay(s, characterNames) {
  let text = String(s ?? '');
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');

  const speakers = new Set();
  // (a) 콜론 형식
  const colonRegex = /^([^:：()\n]{1,14})[:：][ \t]*/gm;
  let m;
  while ((m = colonRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) speakers.add(name);
  }

  // (b) 줄 머리 첫 단어 빈도 (조사 끝 narrative 주어 제외). 께/께서는 존경형 격조사.
  const PARTICLE_END = /(가|이|은|는|을|를|도|의|에|에게|에서|와|과|으로|로|만|보다|처럼|마저|조차|밖에|께|께서|께선)$/;
  // 접속·시간·양태 부사 — 줄 첫 단어로 자주 등장하지만 화자가 아님.
  // characters 목록이 비어있을 때의 안전망으로만 사용한다.
  const CONNECTIVE_DENY = new Set([
    '그리고','그러나','그래서','하지만','그런데','그러면','그러니까','그러므로','따라서',
    '또한','또는','그래도','그럼에도','한편','결국','마침내','다만','물론','사실',
    '아무튼','그때','이때','이윽고','갑자기','천천히','잠시','다시','이미','이제',
    '지금','드디어','문득','잠깐','순간',
  ]);
  const characterSet = new Set(
    (Array.isArray(characterNames) ? characterNames : [])
      .map((n) => String(n).trim())
      .filter(Boolean)
  );
  const headCounts = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    const headM = line.match(/^([가-힣A-Za-z]{2,7}[0-9]?)(?=\s|$)/);
    if (headM) {
      const word = headM[1];
      // 2글자 대명사+조사 "나는/그는/너는" 등도 narrative 주어로 제외 (길이 제한 없음)
      if (PARTICLE_END.test(word)) continue;
      headCounts[word] = (headCounts[word] || 0) + 1;
    }
  }
  Object.entries(headCounts).forEach(([word, count]) => {
    if (count < 2) return;
    // 접속·부사는 인물 목록에 잘못 섞여 있어도 화자로 보지 않는다(인물 데이터 오염 방어).
    if (CONNECTIVE_DENY.has(word)) return;
    // 등장인물 목록이 있으면 실제 인물에 한해 화자로 승격.
    if (characterSet.size > 0 && !characterSet.has(word)) return;
    speakers.add(word);
  });

  // "이름:" → "이름\n"
  text = text.replace(/^([^:：()\n]{1,14})[:：][ \t]*\n?/gm, '$1\n');

  // 라인별 재조립
  const sortedSpeakers = [...speakers].sort((a, b) => b.length - a.length);
  const lines = text.split('\n');
  const out = [];
  let firstSpeakerSeen = false;
  const pushBoundary = () => {
    if (firstSpeakerSeen && out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(''); continue; }
    if (speakers.has(line)) {
      pushBoundary();
      out.push(line);
      firstSpeakerSeen = true;
      continue;
    }
    let matched = false;
    for (const name of sortedSpeakers) {
      if (line.length <= name.length + 1) continue;
      if (line.startsWith(name + ' ') || line.startsWith(name + '\t')) {
        const rest = line.slice(name.length).trim();
        if (rest) {
          pushBoundary();
          out.push(name);
          out.push(rest);
          firstSpeakerSeen = true;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;
    out.push(raw);
  }
  return out.join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  node.querySelector('.card-quote').textContent = quote ? `"${cleanForDisplay(quote)}"` : '';
  node.querySelector('.card-excerpt').textContent = cleanForDisplay(excerpt || '', state.work?.characters);
  node.querySelector('.card-description').textContent = cleanForDisplay(desc || '');

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

  attachKeywordHint(kwEl);

  node.querySelector('.save-edit-btn').addEventListener('click', () => {
    const kwList = parseKeywords(kwEl.value);
    const kwCheck = validateKeywords(kwList);
    if (!kwCheck.ok) { toast(kwCheck.message, 'error'); return; }
    const over = overLongKeywords(kwList);
    if (over.length) toast(`8자 초과 키워드: ${over.join(', ')} — 더 짧게 권장합니다.`, 'info');
    const updates = {
      quote: quoteEl.value.trim(),
      script_excerpt: excerptEl.value.trim(),
      excerpt_description: descEl.value.trim(),
      keywords: kwList,
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
  if (!confirm(`"${preview}${(card.quote || '').length > 30 ? '⋯' : ''}" 카드를 삭제할까요?`)) return;
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

  // 전체 선택 버튼 라벨 갱신 — 전체 선택 상태면 '전체 해제', 아니면 '전체 선택'
  if (selectAllBtn && selectAllLabel) {
    const total = state.cards.length;
    if (total === 0) {
      selectAllBtn.classList.add('hidden');
      translateAllBtn?.classList.add('hidden');
    } else {
      selectAllBtn.classList.remove('hidden');
      translateAllBtn?.classList.remove('hidden');
      selectAllLabel.textContent = (count === total) ? '전체 해제' : '전체 선택';
    }
  }
}

// 전체 선택 토글
if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    if (!state.cards.length) return;
    const total = state.cards.length;
    const selectedCount = state.cards.filter((c) => c.selected).length;
    const shouldSelectAll = selectedCount !== total;
    state.cards.forEach((c) => { c.selected = shouldSelectAll; });
    render();
  });
}

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------
// 단일 카드 번역 요청 (개별/전체 번역 공용)
async function requestTranslation(token, card) {
  return apiFetch('/api/translate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      work: state.work || null,
      card: {
        quote: card.quote,
        script_excerpt: card.script_excerpt,
        excerpt_description: card.excerpt_description,
      },
    }),
  });
}

async function onTranslateClick(idx) {
  const card = state.cards[idx];

  // Already translated -> toggle view
  if (card.translated) {
    card.showingTranslation = !card.showingTranslation;
    render();
    return;
  }

  try {
    toast('번역 중⋯', 'info');
    const token = await getAccessToken();
    const json = await requestTranslation(token, card);
    state.cards[idx].translated = json;
    state.cards[idx].showingTranslation = true;
    render();
    toast('번역 완료', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || '번역 실패', 'error');
  }
}

// 전체 번역하기 — 아직 번역 안 된 카드를 카드별로 순차 번역.
// (모든 카드를 한 번에 LLM에 보내면 응답 JSON이 너무 길어 잘리므로 카드별로 호출)
async function onTranslateAll() {
  if (!state.cards.length) return;

  const targets = state.cards
    .map((c, i) => i)
    .filter((i) => !state.cards[i].translated);

  // 이미 전부 번역돼 있으면 → 모두 번역본 보기로 전환
  if (!targets.length) {
    state.cards.forEach((c) => { if (c.translated) c.showingTranslation = true; });
    render();
    toast('이미 모든 카드가 번역되어 있습니다.', 'info');
    return;
  }

  translateAllBtn.disabled = true;
  const orig = translateAllBtn.innerHTML;
  let done = 0;
  let failed = 0;
  try {
    const token = await getAccessToken();
    for (const i of targets) {
      translateAllBtn.innerHTML =
        `<span class="material-symbols-outlined text-base animate-spin">progress_activity</span>` +
        `<span>번역 중⋯ (${done + failed}/${targets.length})</span>`;
      try {
        const json = await requestTranslation(token, state.cards[i]);
        state.cards[i].translated = json;
        state.cards[i].showingTranslation = true;
        done += 1;
      } catch (err) {
        console.error('[translate-all] card', i, err);
        failed += 1;
      }
      render(); // 진행 상황을 카드에 즉시 반영 (translate-all 버튼은 render가 건드리지 않음)
    }
    if (failed === 0) {
      toast(`전체 번역 완료 (${done}장)`, 'success');
    } else {
      toast(`전체 번역 종료 · 성공 ${done} / 실패 ${failed}`, done ? 'info' : 'error');
    }
  } catch (err) {
    console.error(err);
    toast(err.message || '전체 번역 실패', 'error');
  } finally {
    translateAllBtn.disabled = false;
    translateAllBtn.innerHTML = orig;
    render();
  }
}

translateAllBtn?.addEventListener('click', onTranslateAll);

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
saveBtn.addEventListener('click', async () => {
  const selected = state.cards.filter((c) => c.selected);
  if (!selected.length) return;

  saveBtn.disabled = true;
  const orig = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> 저장 중⋯';

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
      significance: c.significance || null,
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
