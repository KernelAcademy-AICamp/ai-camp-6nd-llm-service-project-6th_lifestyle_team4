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
  // 어드민 인증 후 이전 작업 복원 안내
  maybeOfferRestore();
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
      screen: '영상 대본. 장면·대사가 있는 영상물. (예: 베테랑)',
      opera: '노래로 진행되는 무대극. (예: 카르멘)',
      play: '무대 상연용 희곡. 대사 중심. (예: 햄릿)',
      novel: '이야기로 굴러가는 글. 줄거리·인물이 핵심. (예: 셜록홈즈)',
      poem: '행을 나눠 쓴 운문. 압축·이미지·리듬. (예: 진달래꽃)',
      essay: "'나'가 직접 사유·설명하는 논증·회고. (예: 심연으로부터)",
      prose: '위 어디에도 안 맞는 산문. 산문시·편지·일기·콩트. (예: 차라투스트라)',
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

// works.format / cards.format DB enum → 화면 표시용 한국어 라벨.
// 정의되지 않은 값은 원본 그대로 표시 (graceful fallback).
const FORMAT_LABEL = {
  movie:   '영화',
  drama:   '드라마',
  play:    '연극',
  musical: '뮤지컬',
  opera:   '오페라',
  novel:   '소설',
  poem:    '시',
  essay:   '에세이',
  prose:   '산문',
};

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
  const signal = startProgress(`파일 업로드 중: ${file.name}`);
  try {
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', state.category);
    fd.append('model', state.model);
    const titleHint = document.querySelector('#title-input')?.value?.trim();
    if (titleHint) fd.append('title', titleHint);
    setProgressStage('LLM 으로 카드 추출 중 ⋯ (서버 진행 이벤트 스트리밍)');
    const json = await callExtractStreaming('/api/extract', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }, signal);
    applyExtraction(json);
    setProgressStage(`완료 — 카드 ${Array.isArray(json?.cards) ? json.cards.length : 0}장`);
    if (json?._truncated) {
      toast('추출 완료 — 단, 대본이 너무 길어 일부만(앞 400K글자) 분석했어요.', 'info');
    } else {
      toast('추출 완료', 'success');
    }
  } catch (err) {
    if (isAbortError(err)) {
      logProgress('중단됨');
      if (err.partial && Array.isArray(err.partial.cards) && err.partial.cards.length > 0) {
        applyExtraction(err.partial);
        toast(`중단됨 — 부분 결과 ${err.partial.cards.length}장 보존`, 'info');
      } else {
        toast('중단됨', 'info');
      }
    } else {
      console.error(err);
      toast(err.message || '추출 실패', 'error');
    }
  } finally {
    resetDropzone();
    endProgress();
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
// Extract progress + abort
//   - 현재 extract 작업의 AbortController 를 보관해서 사용자가 [중단] 버튼을
//     누르면 client fetch 를 즉시 끊는다.
//   - 단계별 메시지 + 경과 시간 + 로그 표시. 서버사이드 LLM 호출까지 멈추지는
//     않지만, UI 가 풀리고 새 시도가 가능해진다.
// ---------------------------------------------------------------------------
const progressPanel = $('#progress-panel');
const progressStageEl = $('#progress-stage');
const progressTimeEl = $('#progress-time');
const progressStopBtn = $('#progress-stop-btn');
const progressLogEl = $('#progress-log');

let currentExtractAbort = null;
let extractStartedAt = 0;
let extractTimerHandle = null;

function startProgress(initialStage) {
  // 이전 진행이 남아있으면 청소
  endProgress({ silent: true });
  currentExtractAbort = new AbortController();
  extractStartedAt = Date.now();
  progressPanel.classList.remove('hidden');
  progressLogEl.innerHTML = '';
  progressStageEl.textContent = initialStage;
  progressTimeEl.textContent = '(0초)';
  logProgress(initialStage);
  extractTimerHandle = setInterval(() => {
    const sec = Math.floor((Date.now() - extractStartedAt) / 1000);
    progressTimeEl.textContent = `(${sec}초 경과)`;
  }, 500);
  return currentExtractAbort.signal;
}

function setProgressStage(message) {
  if (!progressPanel || progressPanel.classList.contains('hidden')) return;
  progressStageEl.textContent = message;
  logProgress(message);
}

function logProgress(message) {
  if (!progressLogEl) return;
  const sec = Math.floor((Date.now() - extractStartedAt) / 1000);
  const line = document.createElement('div');
  line.textContent = `[${String(sec).padStart(2, ' ')}s]  ${message}`;
  progressLogEl.appendChild(line);
  progressLogEl.scrollTop = progressLogEl.scrollHeight;
}

function endProgress({ silent = false } = {}) {
  if (extractTimerHandle) { clearInterval(extractTimerHandle); extractTimerHandle = null; }
  if (progressPanel) progressPanel.classList.add('hidden');
  currentExtractAbort = null;
  extractStartedAt = 0;
  if (!silent && progressTimeEl) progressTimeEl.textContent = '';
}

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  // apiFetch 가 AbortError 를 일반 Error 로 wrapping 할 수도 있어 메시지로도 체크
  return /aborted|signal/i.test(String(err.message || ''));
}

progressStopBtn?.addEventListener('click', () => {
  if (currentExtractAbort) {
    logProgress('사용자가 중단함');
    currentExtractAbort.abort();
  }
});

// ---------------------------------------------------------------------------
// Leave-page guard
//   추출 진행 중이거나 저장하지 않은 카드가 있을 때 사이드바 클릭 / 새로고침 /
//   탭 닫기 → 확인 후 진행. 잃어버릴 게 없으면 (state.cards 비어있고 추출 중 아님)
//   확인 안내 안 함.
//   /api/save 가 의도적으로 location.href 를 바꿀 때는 intentionallyNavigating
//   플래그로 차단 해제.
// ---------------------------------------------------------------------------
let intentionallyNavigating = false;

function isExtracting() { return currentExtractAbort != null; }
function hasUnsavedCards() { return Array.isArray(state.cards) && state.cards.length > 0; }
function guardActive() { return isExtracting() || hasUnsavedCards(); }

function guardMessage() {
  if (isExtracting()) {
    return '추출이 진행 중입니다. 이동하면 작업이 취소됩니다. 계속하시겠어요?';
  }
  return '저장하지 않은 카드가 있습니다. 이동하면 잃어버립니다. 계속하시겠어요?';
}

// 1) Reload / 탭 닫기 / 주소창 직접 입력 — 브라우저 기본 confirm 다이얼로그
window.addEventListener('beforeunload', (e) => {
  if (intentionallyNavigating) return;
  if (!guardActive()) return;
  e.preventDefault();
  // 일부 브라우저는 returnValue 가 truthy 인지만 본다 (메시지 자체는 무시되고 기본 문구 표시)
  e.returnValue = '';
});

// 2) 사이드바 nav 링크 클릭 — 우리 confirm 다이얼로그
function wireNavGuard() {
  document.querySelectorAll('aside a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    // # 으로 시작하는 disabled 링크는 스킵 (히스토리 Coming soon 등)
    if (!href || href === '#') return;
    a.addEventListener('click', (e) => {
      if (!guardActive()) return; // 잃을 게 없으면 통과
      e.preventDefault();
      if (confirm(guardMessage())) {
        // 사용자가 확인 — 추출 중이면 abort 도 같이 해서 서버 부담 줄임
        if (currentExtractAbort) currentExtractAbort.abort();
        intentionallyNavigating = true;
        window.location.href = href;
      }
    });
  });
}
wireNavGuard();

// V2 NDJSON 스트리밍 호출 — /api/extract 가 진행 이벤트를 1줄 JSON 으로 흘려준다.
// 각 이벤트는 progress 패널의 stage/log 로 그대로 반영. 'result' 이벤트가 최종 응답.
// 사용자가 [중단] 누르면 fetch 가 abort → 서버 IncomingMessage 'close' 가 발화 →
// callClaude 에 전달된 signal 이 Anthropic SDK 호출까지 끊는다 (V1 의 한계 해결).
async function callExtractStreaming(url, fetchOptions, signal) {
  const headers = { ...(fetchOptions.headers || {}), Accept: 'application/x-ndjson' };
  const res = await fetch(url, { ...fetchOptions, headers, signal });
  // 서버가 스트리밍 헤더를 못 보냈으면(예: 401 / 404) 일반 JSON 경로로 처리
  const ct = String(res.headers.get('content-type') || '');
  if (!ct.includes('application/x-ndjson')) {
    const raw = await res.text();
    let json = null; try { json = JSON.parse(raw); } catch { /* not json */ }
    if (!res.ok) {
      const detail = json?.error || raw.slice(0, 300) || res.statusText;
      throw new Error(`HTTP ${res.status} · ${detail}`);
    }
    // (이론상 발생 안 함 — 스트리밍 요청에 일반 JSON 200 응답)
    return json;
  }
  if (!res.body) throw new Error('스트리밍 응답에 body 없음');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultPayload = null;
  let partialPayload = null;  // chunked 추출 중단 시 서버가 보내는 부분 결과
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      switch (event.t) {
        case 'stage':
          setProgressStage(event.m);
          break;
        case 'log':
          logProgress(event.m);
          break;
        case 'llm_call':
          logProgress(`LLM 호출 (${event.model}, 시도 ${event.attempt}, max=${event.max_tokens})`);
          break;
        case 'llm_done':
          logProgress(`LLM 응답 수신 (시도 ${event.attempt})`);
          break;
        case 'llm_retry':
          logProgress(`LLM 재시도 — ${event.delayMs}ms 후 (${event.model}, status=${event.status ?? '?'})`);
          break;
        case 'chunk_start':
          logProgress(`청크 ${event.index}/${event.total} 시작 (${event.chars.toLocaleString()}자)`);
          break;
        case 'chunk_done':
          logProgress(`청크 ${event.index}/${event.total} 완료 — 누적 ${event.completed}/${event.total}`);
          break;
        case 'partial_result':
          partialPayload = event.d;
          logProgress(`부분 결과 보존됨 — 카드 ${Array.isArray(event.d?.cards) ? event.d.cards.length : 0}장 (청크 ${event.d?.__chunked?.completed}/${event.d?.__chunked?.chunks} 완료)`);
          break;
        case 'aborted': {
          const a = new Error('aborted');
          a.name = 'AbortError';
          if (partialPayload) a.partial = partialPayload;
          throw a;
        }
        case 'error':
          throw new Error(event.m || 'extract error');
        case 'result':
          resultPayload = event.d;
          break;
        case 'ping':
          // 서버가 프록시 버퍼링 회피용으로 보낸 padding 이벤트 — 조용히 무시
          break;
        default:
          // 미지의 이벤트 — 디버깅용 raw 로그
          logProgress(`(unknown event: ${event.t})`);
      }
    }
  }
  if (!resultPayload) throw new Error('스트림이 result 없이 종료됨');
  return resultPayload;
}

// ---------------------------------------------------------------------------
// Wikisource KR — 위 #title-input 의 값으로 ko.wikisource.org 검색 → 본문 가져오기.
// 본문은 합성 .txt File 로 만들어 기존 handleFile() 에 흘려보낸다 — 파일 업로드와
// 동일 경로로 extract → render 가 진행된다.
// ---------------------------------------------------------------------------
const wsSearchBtn = document.querySelector('#ws-search-btn');
const wsResultsEl = document.querySelector('#ws-results');
const wsStatusEl  = document.querySelector('#ws-status');

function setWsStatus(message, kind = 'info') {
  if (!wsStatusEl) return;
  if (!message) {
    wsStatusEl.classList.add('hidden');
    wsStatusEl.textContent = '';
    return;
  }
  wsStatusEl.classList.remove('hidden');
  wsStatusEl.textContent = message;
  wsStatusEl.classList.remove('text-error', 'text-on-surface-variant', 'text-primary');
  if (kind === 'err') wsStatusEl.classList.add('text-error');
  else if (kind === 'ok') wsStatusEl.classList.add('text-primary');
  else wsStatusEl.classList.add('text-on-surface-variant');
}

function renderWsResults(results) {
  if (!wsResultsEl) return;
  wsResultsEl.innerHTML = '';
  if (!results || results.length === 0) {
    wsResultsEl.classList.add('hidden');
    return;
  }
  wsResultsEl.classList.remove('hidden');
  for (const r of results) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'text-left p-3 rounded-lg border border-outline-variant hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3';
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate">${escapeHtmlBasic(r.title)}</p>
        ${r.description ? `<p class="text-xs text-on-surface-variant truncate">${escapeHtmlBasic(r.description)}</p>` : ''}
        <a class="text-xs text-primary underline truncate inline-block max-w-full"
           href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer"
           onclick="event.stopPropagation()">${escapeHtmlBasic(r.url)}</a>
      </div>
      <span class="material-symbols-outlined text-on-surface-variant">download</span>
    `;
    row.addEventListener('click', () => onWsPickResult(r));
    wsResultsEl.appendChild(row);
  }
}

function escapeHtmlBasic(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtmlBasic(s); }

// 검색 중에는 같은 버튼이 "검색 중지" 로 변신. 다시 클릭하면 abort.
let currentWsSearchAbort = null;
function setWsSearchBtnBusy(busy) {
  if (!wsSearchBtn) return;
  if (busy) {
    wsSearchBtn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:18px;">stop</span>' +
      '<span>검색 중지</span>';
    wsSearchBtn.classList.remove('border-primary', 'text-primary');
    wsSearchBtn.classList.add('border-error', 'text-error');
  } else {
    wsSearchBtn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:18px;">search</span>' +
      '<span>위키문헌 검색</span>';
    wsSearchBtn.classList.remove('border-error', 'text-error');
    wsSearchBtn.classList.add('border-primary', 'text-primary');
  }
}

async function onWsSearch() {
  // 검색 진행 중이면 이 클릭은 "중지" — 진행 중인 fetch abort
  if (currentWsSearchAbort) {
    currentWsSearchAbort.abort();
    return;
  }
  const titleInput = document.querySelector('#title-input');
  const query = (titleInput?.value || '').trim();
  if (!query) {
    setWsStatus('위쪽 "작품명" 칸에 검색어를 입력하세요.', 'err');
    titleInput?.focus();
    return;
  }
  setWsStatus(`검색 중: "${query}"`, 'info');
  renderWsResults([]);
  currentWsSearchAbort = new AbortController();
  setWsSearchBtnBusy(true);
  try {
    const token = await getAccessToken();
    const j = await apiFetch('/api/fetch-source', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'wikisource_kr', op: 'search', query }),
      signal: currentWsSearchAbort.signal,
    });
    const results = Array.isArray(j.results) ? j.results : [];
    if (results.length === 0) {
      setWsStatus(`"${query}" 검색 결과가 없습니다.`, 'err');
      return;
    }
    setWsStatus(`${results.length}개 결과 — 가져올 항목을 클릭하세요.`, 'ok');
    renderWsResults(results);
  } catch (err) {
    if (isAbortError(err)) {
      // 사용자가 명시적으로 중지 — 깨끗하게 idle 로 복귀, 에러 토스트 없음
      setWsStatus('', 'info');
      renderWsResults([]);
      return;
    }
    console.error('[ws] search failed', err);
    setWsStatus(`검색 실패: ${err.message || err}`, 'err');
  } finally {
    currentWsSearchAbort = null;
    setWsSearchBtnBusy(false);
  }
}

async function onWsPickResult(item) {
  setWsStatus(`"${item.title}" 본문 가져오는 중⋯`, 'info');
  setDropzoneBusy('위키문헌 본문 추출 중⋯', '본문을 가져와 LLM이 분석하고 있습니다. 최대 1분 소요됩니다.');
  const signal = startProgress(`Wikisource KR: "${item.title}" 본문 가져오는 중 ⋯`);
  try {
    const token = await getAccessToken();
    const fetchJson = await apiFetch('/api/fetch-source', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'wikisource_kr', op: 'fetch', title: item.title }),
      signal,
    });
    const text = String(fetchJson.text || '');
    if (!text.trim()) {
      setWsStatus('본문이 비어있습니다.', 'err');
      return;
    }
    setWsStatus(`${text.length.toLocaleString()}자 가져옴 — 추출 시작합니다.`, 'ok');
    logProgress(`본문 ${text.length.toLocaleString()}자 받음`);
    // 위 #title-input 이 비어있다면 가져온 페이지명으로 채워준다 (extract 시드용).
    const titleInput = document.querySelector('#title-input');
    const finalTitle = (titleInput?.value.trim()) || fetchJson.title || item.title;
    if (titleInput && !titleInput.value.trim()) titleInput.value = finalTitle;

    setProgressStage(`LLM 으로 카드 추출 중 ⋯ (모델: ${state.model}, 서버 스트리밍)`);
    // 파일 업로드 경로 (multipart) 가 아닌 JSON 경로로 /api/extract 호출.
    // 외부 PD 소스에서 가져온 본문은 이미 텍스트라 multipart 래핑이 불필요 + Busboy
    // 가 합성 File 의 Korean 파일명에서 "Unexpected end of form" 으로 떨어지는 문제 회피.
    const extractJson = await callExtractStreaming('/api/extract', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        category: state.category,
        model: state.model,
        title: finalTitle,
      }),
    }, signal);
    applyExtraction(extractJson);
    setProgressStage(`완료 — 카드 ${Array.isArray(extractJson?.cards) ? extractJson.cards.length : 0}장`);
    if (extractJson?._truncated) {
      toast('추출 완료 — 단, 본문이 너무 길어 일부만(앞 400K글자) 분석했어요.', 'info');
    } else {
      toast('추출 완료', 'success');
    }
    setWsStatus('', 'info');
  } catch (err) {
    if (isAbortError(err)) {
      logProgress('중단됨');
      if (err.partial && Array.isArray(err.partial.cards) && err.partial.cards.length > 0) {
        applyExtraction(err.partial);
        setWsStatus(`중단됨 — 부분 결과 ${err.partial.cards.length}장 보존`, 'ok');
        toast(`중단됨 — 부분 결과 ${err.partial.cards.length}장 보존`, 'info');
      } else {
        setWsStatus('중단됨', 'err');
        toast('중단됨', 'info');
      }
      return;
    }
    console.error('[ws] fetch failed', err);
    setWsStatus(`실패: ${err.message || err}`, 'err');
    toast(err.message || '추출 실패', 'error');
  } finally {
    resetDropzone();
    endProgress();
  }
}

if (wsSearchBtn) wsSearchBtn.addEventListener('click', onWsSearch);
// 작품명 입력칸에서 Enter 키도 위키문헌 검색을 트리거 (이미 검색 결과를 가지고 있지 않을 때만).
document.querySelector('#title-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); onWsSearch(); }
});
// 작품명을 사용자가 직접 수정하면 카테고리 피커에서 채워둔 책 ID 는 무효화
// (다른 작품을 의미할 수 있어 검색 로직이 다시 작동해야 함)
document.querySelector('#title-input')?.addEventListener('input', () => {
  const bookIdInput = document.querySelector('#title-book-id');
  const urlInput = document.querySelector('#title-plain-text-url');
  if (bookIdInput?.value) {
    bookIdInput.value = '';
    if (urlInput) urlInput.value = '';
    const hint = document.getElementById('gb-cat-picked-hint');
    if (hint) hint.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// 작품명 자동완성 — title-input 에 2자 이상 타이핑하면 300ms 디바운스 후
// /api/gutenberg-list?q=... 호출 → Gutenberg 책 12건 dropdown 표시.
// 클릭 시 title-input(영문 정식 제목) + title-book-id(bookId) 자동 채움.
// ---------------------------------------------------------------------------
(() => {
  const inputEl = document.querySelector('#title-input');
  const suggestEl = document.querySelector('#title-suggest');
  const bookIdInput = document.querySelector('#title-book-id');
  if (!inputEl || !suggestEl) return;

  let timer = null;
  let lastQuery = '';
  let abortCtrl = null;

  function hideSuggest() {
    suggestEl.classList.add('hidden');
    suggestEl.innerHTML = '';
  }

  function renderSuggest(works) {
    if (!works || works.length === 0) {
      hideSuggest();
      return;
    }
    suggestEl.innerHTML = works.map((w) => {
      const title = escapeHtmlBasic(w.title || '');
      const author = w.author ? escapeHtmlBasic(w.author) : '<span class="text-on-surface-variant">작가 미상</span>';
      const year = w.year ? `<span class="text-xs text-on-surface-variant ml-2">${w.year}</span>` : '';
      const dl = w.downloadCount != null
        ? `<span class="text-[10px] text-on-surface-variant ml-2">↓${w.downloadCount.toLocaleString()}</span>`
        : '';
      const sc = w.suggestedCategory || '';
      return `
        <button type="button"
                data-book-id="${w.bookId}"
                data-title="${title}"
                data-suggest-cat="${escapeHtmlBasic(sc)}"
                class="title-suggest-row w-full text-left px-3 py-2 hover:bg-surface-container-low border-b border-outline-variant/30 last:border-b-0">
          <div class="text-sm font-medium text-on-surface truncate">${title}${year}</div>
          <div class="text-xs text-on-surface-variant truncate">${author}${dl}</div>
        </button>
      `;
    }).join('');
    suggestEl.classList.remove('hidden');

    // 행 클릭 → 작품명/bookId 자동 입력 + 카테고리 dropdown 자동 설정 +
    // 결과 목록에서 그 작품 강조/스크롤 + plainTextUrl 저장 (gutendex 호출 우회)
    suggestEl.querySelectorAll('.title-suggest-row').forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const bid = btn.getAttribute('data-book-id');
        const ttl = btn.getAttribute('data-title');
        const suggestCat = btn.getAttribute('data-suggest-cat') || '';
        const pickedWork = (works || [])[idx] || (bid && ttl ? { bookId: Number(bid), title: ttl } : null);
        if (ttl) inputEl.value = ttl;
        if (bookIdInput && bid) bookIdInput.value = bid;
        // 본문 URL 도 함께 저장 — gbFetchAndExtract 가 gutendex 호출 우회하고 직접 fetch
        const urlInput = document.querySelector('#title-plain-text-url');
        if (urlInput) urlInput.value = pickedWork?.plainTextUrl || '';
        window.__pickedFromSuggest = pickedWork;
        if (suggestCat) applySuggestedCategory(suggestCat);
        hideSuggest();
      });
    });
  }

  // 자동완성 선택된 작품의 suggestedCategory 를 보고 카테고리 dropdown 두 단계 자동 설정.
  // case-insensitive 매칭 — CATEGORY_TOPIC 키(소문자) vs GB_CATEGORY_TREE cats(Title Case) 호환.
  function applySuggestedCategory(catName) {
    if (!catName || !Array.isArray(GB_CATEGORY_TREE)) return;
    const lower = String(catName).toLowerCase();
    let section = null;
    let exactCat = null;
    for (const sec of GB_CATEGORY_TREE) {
      const hit = sec.cats?.find((c) => String(c).toLowerCase() === lower);
      if (hit) { section = sec; exactCat = hit; break; }
    }
    if (!section || !exactCat) {
      console.warn('[title-suggest] no GB_CATEGORY_TREE match for', catName);
      return;
    }
    const secSel = document.querySelector('#gb-section-select');
    const subSel = document.querySelector('#gb-subcat-select');
    if (!secSel || !subSel) {
      console.warn('[title-suggest] section/subcat select not found');
      return;
    }
    // 상위 카테고리 + change 이벤트 → 하위 옵션 채워짐
    secSel.value = section.section;
    secSel.dispatchEvent(new Event('change', { bubbles: true }));
    // 다음 tick — 하위 옵션 준비 후 적용
    setTimeout(() => {
      subSel.value = exactCat;
      subSel.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0);
  }

  async function fetchSuggest(query) {
    try {
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      const token = await getAccessToken();
      const json = await apiFetch(
        `/api/gutenberg-list?q=${encodeURIComponent(query)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: abortCtrl.signal },
      );
      if (lastQuery !== query) return; // 이미 새 입력 들어옴 — 무시
      renderSuggest(Array.isArray(json?.works) ? json.works : []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.warn('[title-suggest] fetch failed:', e?.message || e);
      hideSuggest();
    }
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    lastQuery = q;
    if (timer) clearTimeout(timer);
    if (q.length < 2) { hideSuggest(); return; }
    timer = setTimeout(() => {
      if (lastQuery === q) fetchSuggest(q);
    }, 300);
  });

  // 포커스 잃으면 dropdown 닫기 (단, 클릭 이벤트 처리되도록 약간 지연)
  inputEl.addEventListener('blur', () => {
    setTimeout(hideSuggest, 150);
  });
  // ESC 로도 닫기
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSuggest();
  });
})();

// ---------------------------------------------------------------------------
// Project Gutenberg — Wikisource KR 과 동일한 패턴. 다만 작품명이 숫자만이면
// 검색을 건너뛰고 해당 책 ID 로 바로 fetch (Gutendex 카탈로그 search 가 종종
// 느리거나 502 라 ID-direct 경로가 안전).
// ---------------------------------------------------------------------------
const gbSearchBtn = document.querySelector('#gb-search-btn');
const gbResultsEl = document.querySelector('#gb-results');
const gbStatusEl  = document.querySelector('#gb-status');

function setGbStatus(message, kind = 'info') {
  if (!gbStatusEl) return;
  if (!message) {
    gbStatusEl.classList.add('hidden');
    gbStatusEl.textContent = '';
    return;
  }
  gbStatusEl.classList.remove('hidden');
  gbStatusEl.textContent = message;
  gbStatusEl.classList.remove('text-error', 'text-on-surface-variant', 'text-primary');
  if (kind === 'err') gbStatusEl.classList.add('text-error');
  else if (kind === 'ok') gbStatusEl.classList.add('text-primary');
  else gbStatusEl.classList.add('text-on-surface-variant');
}

function renderGbResults(results) {
  if (!gbResultsEl) return;
  gbResultsEl.innerHTML = '';
  if (!results || results.length === 0) {
    gbResultsEl.classList.add('hidden');
    return;
  }
  gbResultsEl.classList.remove('hidden');
  for (const r of results) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'text-left p-3 rounded-lg border border-outline-variant hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3';
    const authors = (r.authors || []).join(', ');
    const langs = (r.languages || []).join(', ');
    const hasPlain = !!r.plainTextUrl;
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate">${escapeHtmlBasic(r.title)}</p>
        <p class="text-xs text-on-surface-variant truncate">
          ${authors ? escapeHtmlBasic(authors) + ' · ' : ''}#${r.bookId}${langs ? ' · ' + escapeHtmlBasic(langs) : ''}${hasPlain ? '' : ' · (no plain text)'}
        </p>
        <a class="text-xs text-primary underline truncate inline-block max-w-full"
           href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer"
           onclick="event.stopPropagation()">${escapeHtmlBasic(r.url)}</a>
      </div>
      <span class="material-symbols-outlined text-on-surface-variant">${hasPlain ? 'download' : 'block'}</span>
    `;
    if (hasPlain) row.addEventListener('click', () => onGbPickResult(r));
    else { row.disabled = true; row.classList.add('opacity-50', 'cursor-not-allowed'); }
    gbResultsEl.appendChild(row);
  }
}

// 검색 중에는 같은 버튼이 "검색 중지" 로 변신. 다시 클릭하면 abort.
// Gutendex /books?search 가 30~60초 걸릴 수 있어 특히 유용.
let currentGbSearchAbort = null;
function setGbSearchBtnBusy(busy) {
  if (!gbSearchBtn) return;
  if (busy) {
    gbSearchBtn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:18px;">stop</span>' +
      '<span>검색 중지</span>';
    gbSearchBtn.classList.remove('border-primary', 'text-primary');
    gbSearchBtn.classList.add('border-error', 'text-error');
  } else {
    gbSearchBtn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:18px;">search</span>' +
      '<span>Gutenberg 검색</span>';
    gbSearchBtn.classList.remove('border-error', 'text-error');
    gbSearchBtn.classList.add('border-primary', 'text-primary');
  }
}

async function onGbSearch() {
  // 검색 진행 중이면 이 클릭은 "중지" — 진행 중인 fetch abort
  if (currentGbSearchAbort) {
    currentGbSearchAbort.abort();
    return;
  }
  const titleInput = document.querySelector('#title-input');
  const bookIdInput = document.querySelector('#title-book-id');
  const query = (titleInput?.value || '').trim();
  if (!query) {
    setGbStatus('위쪽 "작품명" 칸에 검색어를 입력하세요 (제목 또는 Gutenberg 책 ID).', 'err');
    titleInput?.focus();
    return;
  }
  // 카테고리 피커/자동완성에서 골랐으면 hidden #title-book-id 에 책 ID 가 있음 → 검색 생략하고 바로 fetch
  // 더불어 hidden #title-plain-text-url 에 본문 URL 도 있으면 함께 전달 → gutendex 호출 우회
  const pickedBookId = (bookIdInput?.value || '').trim();
  const pickedUrl = (document.querySelector('#title-plain-text-url')?.value || '').trim();
  if (pickedBookId && /^\d+$/.test(pickedBookId)) {
    const bookId = Number.parseInt(pickedBookId, 10);
    setGbStatus(`Gutenberg #${bookId} 로 바로 가져옵니다 (카테고리에서 선택)…`, 'info');
    renderGbResults([]);
    await gbFetchAndExtract({ bookId, plainTextUrl: pickedUrl || undefined, title: query });
    return;
  }
  // 숫자만 입력했으면 책 ID 로 바로 fetch (검색 endpoint 가 느릴 때 유용).
  // 직접 fetch 경로는 자체적인 progress 패널 [중단] 버튼으로 abort 가능 — 별도 처리 X.
  if (/^#?\d+$/.test(query)) {
    const bookId = Number.parseInt(query.replace(/^#/, ''), 10);
    setGbStatus(`Gutenberg #${bookId} 로 바로 가져옵니다…`, 'info');
    renderGbResults([]);
    await gbFetchAndExtract({ bookId, title: null });
    return;
  }
  setGbStatus(`Gutendex 카탈로그 검색 중: "${query}" (느릴 수 있음, 최대 60초)`, 'info');
  renderGbResults([]);
  currentGbSearchAbort = new AbortController();
  setGbSearchBtnBusy(true);
  try {
    const token = await getAccessToken();
    const j = await apiFetch('/api/fetch-source', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'gutenberg', op: 'search', query }),
      signal: currentGbSearchAbort.signal,
    });
    const results = Array.isArray(j.results) ? j.results : [];
    const transBadge = (j.translatedFrom && j.effectiveQuery && j.effectiveQuery !== j.translatedFrom)
      ? ` (검색어 변환: "${j.translatedFrom}" → "${j.effectiveQuery}")`
      : '';
    if (results.length === 0) {
      setGbStatus(`"${query}" 검색 결과 없음${transBadge}. (Gutenberg 책 ID 를 직접 입력해도 됨)`, 'err');
      return;
    }
    setGbStatus(`${results.length}개 결과${transBadge} — 가져올 항목 클릭.`, 'ok');
    renderGbResults(results);
  } catch (err) {
    if (isAbortError(err)) {
      // 사용자가 명시적으로 중지 — 깨끗하게 idle 로 복귀, 에러 토스트 없음
      setGbStatus('', 'info');
      renderGbResults([]);
      return;
    }
    console.error('[gb] search failed', err);
    setGbStatus(`검색 실패: ${err.message || err}. 책 ID 를 직접 입력해 보세요.`, 'err');
  } finally {
    currentGbSearchAbort = null;
    setGbSearchBtnBusy(false);
  }
}

async function onGbPickResult(item) {
  await gbFetchAndExtract({ bookId: item.bookId, plainTextUrl: item.plainTextUrl, title: item.title });
}

async function gbFetchAndExtract({ bookId, plainTextUrl, title }) {
  setGbStatus(`#${bookId} 본문 가져오는 중⋯`, 'info');
  setDropzoneBusy('Gutenberg 본문 추출 중⋯', '본문을 가져와 LLM이 분석하고 있습니다. 최대 1분 소요됩니다.');
  const signal = startProgress(`Gutenberg #${bookId} 본문 가져오는 중 ⋯`);
  try {
    const token = await getAccessToken();
    const fetchJson = await apiFetch('/api/fetch-source', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'gutenberg', op: 'fetch', bookId, plainTextUrl }),
      signal,
    });
    const text = String(fetchJson.text || '');
    if (!text.trim()) {
      setGbStatus('본문이 비어있습니다.', 'err');
      return;
    }
    const truncMsg = fetchJson.truncated ? ' (1MB 한계로 잘림)' : '';
    setGbStatus(`${text.length.toLocaleString()}자 가져옴${truncMsg} — 추출 시작.`, 'ok');
    logProgress(`본문 ${text.length.toLocaleString()}자 받음${truncMsg}`);

    const titleInput = document.querySelector('#title-input');
    const finalTitle = (titleInput?.value.trim() && !/^#?\d+$/.test(titleInput.value.trim()))
      ? titleInput.value.trim()
      : (fetchJson.title || title || `Gutenberg #${bookId}`);
    if (titleInput) titleInput.value = finalTitle;

    setProgressStage(`LLM 으로 카드 추출 중 ⋯ (모델: ${state.model}, 서버 스트리밍)`);
    const extractJson = await callExtractStreaming('/api/extract', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        category: state.category,
        model: state.model,
        title: finalTitle,
      }),
    }, signal);
    applyExtraction(extractJson);
    setProgressStage(`완료 — 카드 ${Array.isArray(extractJson?.cards) ? extractJson.cards.length : 0}장`);
    toast('추출 완료 — 영문 카드. 카드별 번역 버튼으로 한국어 변환 가능.', 'success');
    setGbStatus('', 'info');
  } catch (err) {
    if (isAbortError(err)) {
      logProgress('중단됨');
      if (err.partial && Array.isArray(err.partial.cards) && err.partial.cards.length > 0) {
        applyExtraction(err.partial);
        setGbStatus(`중단됨 — 부분 결과 ${err.partial.cards.length}장 보존`, 'ok');
        toast(`중단됨 — 부분 결과 ${err.partial.cards.length}장 보존`, 'info');
      } else {
        setGbStatus('중단됨', 'err');
        toast('중단됨', 'info');
      }
      return;
    }
    console.error('[gb] fetch/extract failed', err);
    setGbStatus(`실패: ${err.message || err}`, 'err');
    toast(err.message || '추출 실패', 'error');
  } finally {
    resetDropzone();
    endProgress();
  }
}

if (gbSearchBtn) gbSearchBtn.addEventListener('click', onGbSearch);

// ---------------------------------------------------------------------------
// State -> View
// ---------------------------------------------------------------------------
function applyExtraction(payload) {
  state.work = payload?.work || null;
  state.fullScriptText = payload?.full_script_text || '';
  state.cards = Array.isArray(payload?.cards)
    ? payload.cards.map((c) => ({ ...c, selected: false, translated: null, translated_commentary: null, showingTranslation: false, editing: false }))
    : [];
  render();
  // 추출 결과를 localStorage 에 백업 — 새로고침/탭 닫힘 사고 보호. /api/save 성공시 정리.
  saveDraft();
}

// ---------------------------------------------------------------------------
// Autosave — 추출 결과(work + full_script_text + cards)를 localStorage 에 보관해서
// 사용자가 새로고침/탭 닫음/실수 시 잃지 않도록. 5MB 한도가 있어 큰 본문은 실패할 수
// 있고, 실패 시 조용히 넘긴다 (사용자 흐름을 막지 않음).
// ---------------------------------------------------------------------------
const AUTOSAVE_KEY = 'ds.admin.extract.draft';
const AUTOSAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간 — 오래된 초안은 자동 폐기

function saveDraft() {
  if (!state.work && (!state.cards || state.cards.length === 0)) return; // 의미 있는 내용 없음
  const draft = {
    v: 1,
    savedAt: new Date().toISOString(),
    category: state.category,
    model: state.model,
    work: state.work,
    fullScriptText: state.fullScriptText,
    cards: state.cards,
  };
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
  } catch (e) {
    // QuotaExceededError 등 — 본문이 너무 크면 cards 만 저장 시도
    try {
      const lighter = { ...draft, fullScriptText: '' };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(lighter));
      console.warn('[autosave] fullScriptText 가 너무 커서 비우고 저장 — 복원시 본문 재추출 필요');
    } catch (e2) {
      console.warn('[autosave] localStorage 저장 실패:', e2?.message || e2);
    }
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || draft.v !== 1) return null;
    const age = Date.now() - Date.parse(draft.savedAt || 0);
    if (!Number.isFinite(age) || age > AUTOSAVE_MAX_AGE_MS) {
      localStorage.removeItem(AUTOSAVE_KEY);
      return null;
    }
    return draft;
  } catch (e) {
    console.warn('[autosave] localStorage 읽기 실패:', e?.message || e);
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* noop */ }
}

function maybeOfferRestore() {
  const draft = loadDraft();
  if (!draft) return;
  const cardCount = Array.isArray(draft.cards) ? draft.cards.length : 0;
  const title = draft.work?.title || '(제목 없음)';
  const ageMin = Math.floor((Date.now() - Date.parse(draft.savedAt)) / 60000);
  const ageLabel = ageMin < 60 ? `${ageMin}분 전` : `${Math.floor(ageMin / 60)}시간 전`;
  const ok = confirm(
    `이전 추출 작업이 남아 있어요 (${ageLabel}, "${title}", 카드 ${cardCount}장).\n` +
    '복원할까요?\n\n' +
    '(취소하면 폐기합니다.)'
  );
  if (ok) {
    state.category = draft.category || state.category;
    state.model = draft.model || state.model;
    paintCategory();
    paintModel();
    applyExtraction({
      work: draft.work,
      full_script_text: draft.fullScriptText,
      cards: draft.cards,
    });
    toast(`복원됨 — 카드 ${cardCount}장`, 'success');
  } else {
    clearDraft();
  }
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
  $('#work-format').textContent = FORMAT_LABEL[state.work.format] || state.work.format || '';

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

// 편집 textarea 의 현재 선택을 ** 로 토글 감싸기 (library.js 패턴 차용).
// - 선택 없으면 커서 위치에 **굵게** 삽입 후 안쪽 글자 자동 선택
// - 이미 양 끝이 ** 면 풀어줌 (토글)
function toggleBoldOnTextarea(ta) {
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const value = ta.value;
  if (s === e) {
    const placeholder = '굵게';
    ta.value = value.slice(0, s) + '**' + placeholder + '**' + value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + 2, s + 2 + placeholder.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const selected = value.slice(s, e);
  if (/^\*\*[\s\S]+\*\*$/.test(selected)) {
    const unwrapped = selected.slice(2, -2);
    ta.value = value.slice(0, s) + unwrapped + value.slice(e);
    ta.focus();
    ta.setSelectionRange(s, s + unwrapped.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const wrapped = '**' + selected + '**';
  ta.value = value.slice(0, s) + wrapped + value.slice(e);
  ta.focus();
  ta.setSelectionRange(s, s + wrapped.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// 카드 편집 노드 안의 모든 .dash-bold-btn + 대응 textarea 에 클릭/단축키(Ctrl/Cmd+B) 부착.
function wireBoldButtons(root) {
  root.querySelectorAll('.dash-bold-btn').forEach((btn) => {
    const sel = btn.dataset.boldFor;
    const ta = sel ? root.querySelector(sel) : null;
    if (!ta) return;
    btn.addEventListener('click', (ev) => { ev.preventDefault(); toggleBoldOnTextarea(ta); });
  });
  root.querySelectorAll('textarea').forEach((ta) => {
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleBoldOnTextarea(ta);
      }
    });
  });
}

function buildCardEditNode(card, idx) {
  const node = cardEditTemplate.content.firstElementChild.cloneNode(true);

  const quoteEl = node.querySelector('.edit-quote');
  const excerptEl = node.querySelector('.edit-excerpt');
  const descEl = node.querySelector('.edit-description');
  const sigEl = node.querySelector('.edit-significance');
  const kwEl = node.querySelector('.edit-keywords');
  const tempEl = node.querySelector('.edit-temperature');
  const intensityEl = node.querySelector('.edit-intensity');

  // 볼드 버튼 / 단축키 부착 (선택 → B 클릭 또는 Ctrl/Cmd+B → **굵게**)
  wireBoldButtons(node);

  // 표시할 텍스트 선택 — 사용자가 KO 토글 상태면 번역본 우선, 아니면 source.
  // 또한 한쪽이 비었으면 다른 쪽으로 fallback (편집기에서 빈 칸 방지).
  const useKo = !!(card.showingTranslation && card.translated);
  quoteEl.value = (useKo ? card.translated?.quote_translated : card.quote)
                  || card.quote
                  || card.translated?.quote_translated
                  || '';
  excerptEl.value = (useKo ? card.translated?.script_excerpt_translated : card.script_excerpt)
                    || card.script_excerpt
                    || card.translated?.script_excerpt_translated
                    || '';
  descEl.value = card.excerpt_description || '';
  if (sigEl) sigEl.value = card.significance || '';
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
      significance: sigEl ? (sigEl.value.trim() || null) : (card.significance ?? null),
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
// 단일 카드 번역 요청 — translate-card-batch 에 1장짜리 배열로 보내고 응답을 기존 형태로 변환.
// (v89: Vercel Hobby 함수 12개 한도 때문에 /api/translate 제거 → translate-card-batch 로 통합)
async function requestTranslation(token, card) {
  const res = await apiFetch('/api/translate-card-batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      work: state.work || null,
      cards: [{
        id: 0,
        quote: card.quote || '',
        script_excerpt: card.script_excerpt || '',
        excerpt_description: card.excerpt_description || '',
        significance: card.significance || '',
        keywords: Array.isArray(card.keywords) ? card.keywords : [],
      }],
    }),
  });
  const r = (res?.results || [])[0];
  if (!r) throw new Error('번역 응답 없음');
  // EN 원본이면 ko 가 KO 번역, KO 원본이면 ko 는 source echo (둘 다 한국어 자리에 맞음).
  const ko = r.ko || {};
  return {
    quote_translated: ko.quote || null,
    script_excerpt_translated: ko.script_excerpt || null,
    confidence: 'high',
    note: '',
  };
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

// 전체 번역하기 — 모든 미번역 카드를 5장씩 묶어 통합 endpoint 1번 호출로 양방향 일괄 처리.
// 이전 흐름:
//   카드별 /api/translate (N회) + /api/translate-commentary-batch (N/5회)  →  ≈ N + N/5 호출
// 새 흐름:
//   /api/translate-card-batch (N/5회)  →  ≈ N/5 호출   (5분의 1로 절감)
async function onTranslateAll() {
  if (!state.cards.length) return;

  const targetIdxs = state.cards
    .map((c, i) => i)
    .filter((i) => !state.cards[i].translated || !state.cards[i].translated_commentary);

  if (!targetIdxs.length) {
    state.cards.forEach((c) => { if (c.translated) c.showingTranslation = true; });
    render();
    toast('이미 모든 카드가 번역되어 있습니다.', 'info');
    return;
  }

  translateAllBtn.disabled = true;
  const orig = translateAllBtn.innerHTML;
  // CHUNK 3 — 한 호출이 카드 3장 × 5필드 = 15 OUT 섹션. LLM 이 빠뜨릴 가능성 낮음.
  // 5장이면 25 섹션이라 가끔 누락 발생 → 3장이 품질·안정성 균형점.
  // 31장 작품: 11 batch × 1 LLM 호출 = 11회. 이전 흐름의 38회 대비 71% 절감.
  const CHUNK = 3;
  const CONCURRENCY = 2;
  const chunks = [];
  for (let i = 0; i < targetIdxs.length; i += CHUNK) chunks.push(targetIdxs.slice(i, i + CHUNK));

  let done = 0;
  let failed = 0;
  const errors = [];

  try {
    const token = await getAccessToken();

    async function processChunk(chunkIdxs) {
      const cardsPayload = chunkIdxs.map((idx) => {
        const c = state.cards[idx];
        return {
          id: idx,
          quote: c.quote || '',
          script_excerpt: c.script_excerpt || '',
          excerpt_description: c.excerpt_description || '',
          significance: c.significance || '',
          keywords: Array.isArray(c.keywords) ? c.keywords : [],
        };
      });
      const res = await fetch('/api/translate-card-batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cards: cardsPayload, work: state.work || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(body?.error || `HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
      const results = Array.isArray(body?.results) ? body.results : [];
      // 작품 메타 번역 결과 (있을 때만) — state.work 의 한·영 양쪽 채움.
      const workMeta = body?.work;
      if (workMeta && state.work) {
        const wko = workMeta.ko || {};
        const wen = workMeta.en || {};
        const workSourceIsEN = workMeta.source_lang === 'en';
        if (workSourceIsEN) {
          // EN 원문 — 추출된 primary (EN) 를 _original 로 이동, KO 번역을 primary 로.
          //   기존 primary 가 EN 이면 그 자체가 _original 값이어야 함.
          if (state.work.title    && !state.work.title_original)    state.work.title_original    = state.work.title;
          if (state.work.subtitle && !state.work.subtitle_original) state.work.subtitle_original = state.work.subtitle;
          if (state.work.author   && !state.work.author_original)   state.work.author_original   = state.work.author;
          // KO 번역으로 primary 덮어쓰기 (LLM 응답 우선)
          if (wko.title)    state.work.title    = wko.title;
          if (wko.subtitle) state.work.subtitle = wko.subtitle;
          if (wko.author)   state.work.author   = wko.author;
          // _original 빈 자리는 응답 en (source echo) 으로
          if (wen.title    && !state.work.title_original)    state.work.title_original    = wen.title;
          if (wen.subtitle && !state.work.subtitle_original) state.work.subtitle_original = wen.subtitle;
          if (wen.author   && !state.work.author_original)   state.work.author_original   = wen.author;
        } else {
          // KO 원문 — primary 이미 KO, _original EN 만 채움
          if (wen.title    && !state.work.title_original)     state.work.title_original    = wen.title;
          if (wen.subtitle && !state.work.subtitle_original)  state.work.subtitle_original = wen.subtitle;
          if (wen.author   && !state.work.author_original)    state.work.author_original   = wen.author;
        }
      }
      results.forEach((r) => {
        const idx = Number(r?.id);
        if (Number.isNaN(idx) || !state.cards[idx]) return;
        const card = state.cards[idx];
        const ko = r.ko || {};
        const en = r.en || {};
        const sourceIsEN = r.source_lang === 'en';

        if (sourceIsEN) {
          // ── EN 원문 케이스 ──────────────────────────────────────
          // 1) translated — quote/script 의 KO 버전 (UI 토글로 표시)
          if (ko.quote || ko.script_excerpt) {
            card.translated = {
              quote_translated: ko.quote || null,
              script_excerpt_translated: ko.script_excerpt || null,
              confidence: 'high',
              note: '',
            };
            card.showingTranslation = true;
          }
          // 2) translated_commentary — EN *_original (save.js 가 _original 컬럼에 저장)
          if (en.excerpt_description || en.significance || (Array.isArray(en.keywords) && en.keywords.length)) {
            card.translated_commentary = {
              excerpt_description_original: en.excerpt_description || null,
              significance_original:        en.significance || null,
              keywords_original: Array.isArray(en.keywords) ? en.keywords : null,
            };
          }
          // 3) primary 필드(desc/sig/kw)를 KO 로 교체 — 추출 시 EN 으로 들어왔으니 한국어 새로 필요.
          //    save.js 가 card.excerpt_description / significance / keywords 를 primary 로 INSERT.
          if (ko.excerpt_description) card.excerpt_description = ko.excerpt_description;
          if (ko.significance)        card.significance        = ko.significance;
          if (Array.isArray(ko.keywords) && ko.keywords.length) card.keywords = ko.keywords;
        } else {
          // ── KO 원문 케이스 ──────────────────────────────────────
          // primary 필드는 이미 한국어 (그대로 둠). *_original 영문만 채움.
          // showingTranslation 설정 X — UI 가 KO 를 그대로 보여줌. save.js 가
          // useTranslation=false 분기로 card.quote_original / script_excerpt_original 사용.
          if (en.quote)          card.quote_original = en.quote;
          if (en.script_excerpt) card.script_excerpt_original = en.script_excerpt;
          if (en.excerpt_description || en.significance || (Array.isArray(en.keywords) && en.keywords.length)) {
            card.translated_commentary = {
              excerpt_description_original: en.excerpt_description || null,
              significance_original:        en.significance || null,
              keywords_original: Array.isArray(en.keywords) ? en.keywords : null,
            };
          }
        }
        done++;
      });
    }

    // 동시성 워커
    let cursor = 0;
    async function worker() {
      while (cursor < chunks.length) {
        const idx = cursor++;
        const chunk = chunks[idx];
        translateAllBtn.innerHTML =
          `<span class="material-symbols-outlined text-base animate-spin">progress_activity</span>` +
          `<span>번역 중⋯ (청크 ${idx + 1}/${chunks.length})</span>`;
        try {
          await processChunk(chunk);
        } catch (e) {
          // 청크 실패 — 절반으로 쪼개 1회 재시도 (응답 잘림 / 일시 오류 대응)
          console.warn(`[translate-all] chunk ${idx + 1}/${chunks.length} failed (${e.message}) — 절반 크기로 재시도`);
          if (chunk.length > 1) {
            const half = Math.ceil(chunk.length / 2);
            try { await processChunk(chunk.slice(0, half)); } catch (e2) { failed += half; errors.push(e2.message || String(e2)); }
            try { await processChunk(chunk.slice(half));   } catch (e3) { failed += (chunk.length - half); errors.push(e3.message || String(e3)); }
          } else {
            failed += chunk.length;
            errors.push(e?.message || String(e));
          }
        }
        render();
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

    if (failed === 0) {
      toast(`전체 번역 완료 (${done}장)`, 'success');
    } else {
      const firstErr = errors[0] || '알 수 없음';
      toast(`전체 번역 종료 · 성공 ${done} / 실패 ${failed} — 예: ${firstErr}`, done ? 'info' : 'error');
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

// (이전 fillCommentaryEn 함수는 제거됨 — 새 onTranslateAll 이 /api/translate-card-batch 하나로
//  양방향 번역을 모두 처리하므로 별도 호출 불필요. 검토 큐의 "영문 일괄 채우기" 는 review.js 가
//  /api/translate-fields 를 사용해 카드별 1회 호출로 처리.)

translateAllBtn?.addEventListener('click', onTranslateAll);

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
// 저장 가능 여부 — A1 흐름에서는 EN 원문 카드가 번역 안 되어 있으면 primary 가 EN 으로
// 저장되어 라이브러리에서 영문이 한국어 자리에 표시됨. 이를 방지하기 위해 저장 전 검사.
function hasKoreanChars(s) {
  return /[가-힯]/.test(String(s || ''));
}
function needsTranslation(card) {
  // quote 에 한국어가 전혀 없으면 EN 원문 → 번역 필수.
  // card.translated 가 있으면 (translate-all 클릭됨) → OK.
  if (card.translated && card.showingTranslation) return false;
  return !hasKoreanChars(card.quote);
}

saveBtn.addEventListener('click', async () => {
  const selected = state.cards.filter((c) => c.selected);
  if (!selected.length) return;

  // 안전망 — EN 원문 카드 중 번역 안 된 것이 있으면 차단.
  const untranslated = selected.filter(needsTranslation);
  if (untranslated.length > 0) {
    toast(`영문 원문 카드 ${untranslated.length}장에 번역이 필요합니다. "전체 번역" 을 먼저 눌러주세요.`, 'error');
    return;
  }

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
      // KO 원문 케이스 — onTranslateAll 이 채운 영문 _original (save.js useTranslation=false 분기에서 사용)
      quote_original: c.quote_original || null,
      script_excerpt_original: c.script_excerpt_original || null,
      // 번역 단계에서 채운 해설 영문 — save.js 가 *_original 컬럼에 INSERT
      translated_commentary: c.translated_commentary || null,
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
    // 검토 게이트 도입: 카드는 cards 에 바로 들어가지 않고 card_candidates 에 쌓인다.
    // 어드민이 review.html 에서 승인해야 cards 로 promote 된다.
    const n = json.candidate_count ?? json.inserted_count ?? 0;
    const verified = json.verbatim_verified_count;
    const verifiedMsg = verified != null ? ` · 원문 검증 ${verified}/${n}` : '';
    toast(`후보 ${n}건 저장됨 — 검토 큐로 이동${verifiedMsg}`, 'success');

    // 저장 성공 — 더 이상 복원할 필요 없음, autosave 초안 정리.
    clearDraft();

    // 검토 페이지로 자동 이동 — guard 가 막지 않도록 의도적 이동 플래그 + cards 비움.
    intentionallyNavigating = true;
    state.cards = [];
    render();
    setTimeout(() => { location.href = '/review.html'; }, 1500);
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

// ---------------------------------------------------------------------------
// Gutenberg 카테고리 피커 — 작품명 아래 노출.
// 2단계 드롭다운(상위 → 하위) → 작품 목록 → 작품 클릭 시 #title-input + #title-book-id 채움.
// 작품 목록은 서버 프록시 /api/gutenberg-list?category=<id> 가 가져옴 (라이브 fetch + 캐싱).
// ---------------------------------------------------------------------------
const GB_CATEGORY_TREE = [
  { section: 'Literature', cats: [
    'Adventure', 'American Literature', 'British Literature',
    'French Literature', 'German Literature', 'Russian Literature',
    'Classics of Literature', 'Biographies', 'Novels',
    'Short Stories', 'Poetry', 'Plays/Films/Dramas',
    'Romance', 'Science-Fiction & Fantasy', 'Crime, Thrillers & Mystery',
    'Mythology, Legends & Folklore', 'Humour',
    'Children & Young Adult Reading', 'Literature - Other',
  ]},
  { section: 'Science & Technology', cats: [
    'Engineering & Technology', 'Mathematics', 'Science - Physics',
    'Science - Chemistry/Biochemistry', 'Science - Biology',
    'Science - Earth/Agricultural/Farming',
    'Research Methods/Statistics/Information Sys', 'Environmental Issues',
  ]},
  { section: 'History', cats: [
    'History - American', 'History - British', 'History - European',
    'History - Ancient', 'History - Medieval/Middle Ages',
    'History - Early Modern (c. 1450-1750)', 'History - Modern (1750+)',
    'History - Religious', 'History - Royalty', 'History - Warfare',
    'History - Schools & Universities', 'History - Other',
    'Archaeology & Anthropology',
  ]},
  { section: 'Social Sciences & Society', cats: [
    'Business/Management', 'Economics', 'Law & Criminology',
    'Gender & Sexuality Studies', 'Psychiatry/Psychology',
    'Sociology', 'Politics', 'Parenthood & Family Relations',
    'Old Age & the Elderly',
  ]},
  { section: 'Arts & Culture', cats: [
    'Art', 'Architecture', 'Music', 'Fashion',
    'Journalism/Media/Writing', 'Language & Communication',
    'Essays, Letters & Speeches',
  ]},
  { section: 'Religion & Philosophy', cats: [
    'Religion/Spirituality', 'Philosophy & Ethics',
  ]},
  { section: 'Lifestyle & Hobbies', cats: [
    'Cooking & Drinking', 'Sports/Hobbies', 'How To ...',
    'Travel Writing', 'Nature/Gardening/Animals', 'Sexuality & Erotica',
  ]},
  { section: 'Health & Medicine', cats: [
    'Health & Medicine', 'Drugs/Alcohol/Pharmacology', 'Nutrition',
  ]},
  { section: 'Education & Reference', cats: [
    'Encyclopedias/Dictionaries/Reference', 'Teaching & Education',
    'Reports & Conference Proceedings', 'Journals',
  ]},
];

function gbCatIdOf(name) {
  return String(name).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s*-\s*/g, '-')
    .replace(/[\/,()+]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

(function initGutenbergCategoryPicker() {
  const sectionSel  = document.getElementById('gb-section-select');
  const subcatRow   = document.getElementById('gb-subcat-row');
  const subcatSel   = document.getElementById('gb-subcat-select');
  const subcatMeta  = document.getElementById('gb-subcat-meta');
  const worksPanel  = document.getElementById('gb-cat-works-panel');
  const worksList   = document.getElementById('gb-cat-works-list');
  const worksCount  = document.getElementById('gb-cat-works-count');
  const worksLabel  = document.getElementById('gb-cat-works-label');
  const pickedHint  = document.getElementById('gb-cat-picked-hint');
  if (!sectionSel || !subcatSel) return;

  // 1단계 옵션 채우기
  GB_CATEGORY_TREE.forEach((sec) => {
    const opt = document.createElement('option');
    opt.value = sec.section;
    opt.textContent = `${sec.section} (${sec.cats.length}개)`;
    sectionSel.appendChild(opt);
  });

  function setPickedHighlight(el, on) {
    if (!el) return;
    if (on) {
      el.classList.add('border-primary', 'bg-primary/5', 'font-semibold', 'text-on-primary-container');
    } else {
      el.classList.remove('border-primary', 'bg-primary/5', 'font-semibold', 'text-on-primary-container');
    }
  }

  let activeSection = null;
  let activeCatId = null;
  // 카테고리별 작품 응답 캐시 (같은 카테고리 다시 선택 시 재호출 안 함)
  const worksCache = new Map();

  sectionSel.addEventListener('change', () => {
    const name = sectionSel.value;
    if (!name) {
      setPickedHighlight(sectionSel, false);
      subcatRow.classList.add('hidden');
      subcatRow.style.display = 'none';
      worksPanel.classList.add('hidden');
      worksPanel.style.display = 'none';
      activeSection = null;
      activeCatId = null;
      return;
    }
    activeSection = GB_CATEGORY_TREE.find((s) => s.section === name);
    if (!activeSection) return;
    setPickedHighlight(sectionSel, true);

    // 2단계 옵션 재구성
    subcatSel.innerHTML = '<option value="">— 하위 카테고리 선택 —</option>';
    activeSection.cats.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      subcatSel.appendChild(opt);
    });
    setPickedHighlight(subcatSel, false);
    subcatMeta.textContent = `${activeSection.section} 의 ${activeSection.cats.length}개`;
    subcatRow.classList.remove('hidden');
    subcatRow.style.display = '';
    worksPanel.classList.add('hidden');
    worksPanel.style.display = 'none';
    activeCatId = null;
  });

  subcatSel.addEventListener('change', async () => {
    const catName = subcatSel.value;
    if (!catName || !activeSection) {
      setPickedHighlight(subcatSel, false);
      worksPanel.classList.add('hidden');
      worksPanel.style.display = 'none';
      activeCatId = null;
      return;
    }
    setPickedHighlight(subcatSel, true);
    activeCatId = gbCatIdOf(catName);
    worksLabel.textContent = `${activeSection.section} · ${catName}`;
    worksCount.textContent = '⋯';
    worksList.innerHTML =
      '<div class="px-3 py-4 text-center text-sm text-on-surface-variant">작품 목록 불러오는 중⋯</div>';
    worksPanel.classList.remove('hidden');
    worksPanel.style.display = '';
    pickedHint.classList.add('hidden');

    // 캐시 우선
    let works = worksCache.get(activeCatId);
    if (!works) {
      try {
        const token = await getAccessToken();
        const json = await apiFetch(
          `/api/gutenberg-list?category=${encodeURIComponent(catName)}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        works = Array.isArray(json?.works) ? json.works : [];
        worksCache.set(activeCatId, works);
      } catch (e) {
        console.warn('[gb-picker] fetch failed:', e);
        worksList.innerHTML =
          `<div class="px-3 py-4 text-center text-sm text-error">작품 목록 불러오기 실패: ${escapeForToast(e.message || String(e))}</div>`;
        worksCount.textContent = '0';
        return;
      }
    }

    // 자동완성으로 픽한 작품이 있으면 — 결과에 있는지 검사
    //  · 있으면 그 작품이 있는 페이지를 시작 페이지로
    //  · 없으면 맨 위에 강제 삽입 (사용자가 본 그 작품을 반드시 표시)
    const pickedFromSuggest = window.__pickedFromSuggest;
    window.__pickedFromSuggest = null; // 1회용
    let pickedBookId = null;
    if (pickedFromSuggest?.bookId) {
      pickedBookId = Number(pickedFromSuggest.bookId);
      const exists = works.some((w) => Number(w.bookId) === pickedBookId);
      if (!exists) {
        // 결과에 없음 — 맨 위에 삽입 (자동완성 응답이 작품 객체 그대로)
        works = [pickedFromSuggest, ...works];
      }
    }

    worksList.innerHTML = '';
    worksCount.textContent = String(works.length);
    if (!works.length) {
      worksList.innerHTML =
        '<div class="px-3 py-4 text-center text-sm text-on-surface-variant">이 카테고리 작품을 찾지 못했습니다.</div>';
      return;
    }

    // 페이지네이션 — 페이지당 30개. 200개면 7페이지.
    const PAGE_SIZE = 30;
    const totalPages = Math.max(1, Math.ceil(works.length / PAGE_SIZE));
    let currentPage = 1;
    // 픽한 작품이 있으면 그 작품이 있는 페이지로 시작
    if (pickedBookId) {
      const idx = works.findIndex((w) => Number(w.bookId) === pickedBookId);
      if (idx >= 0) currentPage = Math.floor(idx / PAGE_SIZE) + 1;
    }

    function buildWorkRow(w) {
      const row = document.createElement('button');
      row.type = 'button';
      const isPicked = pickedBookId && Number(w.bookId) === pickedBookId;
      row.className = `w-full text-left px-3 py-2 text-sm transition-colors ${
        isPicked ? 'bg-primary/20 ring-2 ring-primary/40' : 'hover:bg-primary/5'
      }`;
      if (isPicked) row.dataset.picked = '1';
      row.innerHTML = `
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-semibold text-on-surface truncate">${escapeForToast(w.title || '')}</span>
          <span class="text-xs text-on-surface-variant shrink-0">${w.year ? String(w.year) : ''}</span>
        </div>
        <div class="text-xs text-on-surface-variant mt-0.5">${escapeForToast(w.author || '')}${w.bookId ? ` · Gutenberg #${w.bookId}` : ''}</div>
      `;
      row.addEventListener('click', () => {
        const titleInput = document.querySelector('#title-input');
        const bookIdInput = document.querySelector('#title-book-id');
        const urlInput = document.querySelector('#title-plain-text-url');
        if (titleInput) titleInput.value = w.title || '';
        if (bookIdInput) bookIdInput.value = w.bookId ? String(w.bookId) : '';
        if (urlInput) urlInput.value = w.plainTextUrl || '';
        worksList.querySelectorAll('button.work-row').forEach((b) => b.classList.remove('bg-primary/20'));
        row.classList.add('bg-primary/20');
        pickedHint.textContent = `✓ 선택됨: ${w.title}${w.bookId ? ' · Gutenberg #' + w.bookId + ' · 검색 없이 바로 가져오기' : ''}`;
        pickedHint.classList.remove('hidden');
        const gbBtn = document.getElementById('gb-search-btn');
        if (gbBtn) {
          gbBtn.classList.add('ring-2', 'ring-primary');
          setTimeout(() => gbBtn.classList.remove('ring-2', 'ring-primary'), 1200);
          gbBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      row.classList.add('work-row');
      return row;
    }

    function buildPaginationNav() {
      const nav = document.createElement('div');
      nav.className = 'flex items-center justify-center gap-1 py-2 border-t border-outline-variant/30 flex-wrap';
      // 이전 버튼
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '‹';
      prev.disabled = currentPage <= 1;
      prev.className = 'px-2.5 py-1 text-xs rounded hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed';
      prev.addEventListener('click', () => renderPage(currentPage - 1));
      nav.appendChild(prev);
      // 페이지 버튼들 — 한 화면에 모든 페이지 (7페이지 정도라 무리 없음)
      for (let p = 1; p <= totalPages; p++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = String(p);
        btn.className = p === currentPage
          ? 'px-2.5 py-1 text-xs rounded bg-primary text-on-primary font-semibold'
          : 'px-2.5 py-1 text-xs rounded hover:bg-surface-container-low';
        btn.addEventListener('click', () => renderPage(p));
        nav.appendChild(btn);
      }
      // 다음 버튼
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '›';
      next.disabled = currentPage >= totalPages;
      next.className = 'px-2.5 py-1 text-xs rounded hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed';
      next.addEventListener('click', () => renderPage(currentPage + 1));
      nav.appendChild(next);
      return nav;
    }

    function renderPage(page) {
      currentPage = Math.max(1, Math.min(page, totalPages));
      worksList.innerHTML = '';
      const start = (currentPage - 1) * PAGE_SIZE;
      works.slice(start, start + PAGE_SIZE).forEach((w) => worksList.appendChild(buildWorkRow(w)));
      worksList.appendChild(buildPaginationNav());
      worksCount.textContent = `${works.length} (${currentPage}/${totalPages}p)`;
      // 픽한 작품이 이 페이지에 있으면 그 행으로 스크롤, 아니면 최상단
      const picked = worksList.querySelector('button[data-picked="1"]');
      if (picked) picked.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else worksList.scrollTop = 0;
    }

    renderPage(currentPage);
  });
})();

function escapeForToast(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}
