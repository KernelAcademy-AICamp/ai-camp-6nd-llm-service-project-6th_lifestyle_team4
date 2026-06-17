import { getSupabase, getAccessToken, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';
import { parseKeywords, validateKeywords, overLongKeywords, attachKeywordHint } from './keyword-utils.js';

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
const libraryFormatFilter = $('#library-format-filter');
const librarySearchInput = $('#library-search');
const libraryMissingEnFilterBtn = $('#library-missing-en-filter');
const libraryRefreshBtn = $('#library-refresh');
const libraryBackfillEnBtn = $('#library-backfill-en-btn');
const libraryBackfillCommentaryBtn = $('#library-backfill-commentary-btn');
const libraryKeywordFreqBtn = $('#library-keyword-freq-btn');
const libraryKeywordFreq = $('#library-keyword-freq');
const libraryKeywordFreqClose = $('#library-keyword-freq-close');
const libraryKeywordFreqReclassify = $('#library-keyword-freq-reclassify');
const libraryKeywordFreqBody = $('#library-keyword-freq-body');
const libraryKeywordFreqSummary = $('#library-keyword-freq-summary');
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
  formatFilter: '',   // 작품 형식(works.format) — '' = 전체
  searchText: '',
  missingEnOnly: false,  // 영문 누락 카드만 표시 (제목/부제/작가/명대사/발췌/설명/의의/키워드 중 하나라도 빈 카드)
  editing: null,      // editing card_id
  selectedIds: new Set(), // 그리드 전체 선택용 card_id Set
  viewMode: 'shelf',  // 'shelf' (책꽂이) | 'grid' (격자)
  // 책꽂이 카드 골라 삭제 모드
  deleteModeGroupKey: null,       // 현재 삭제 모드인 작품 그룹 키 (제목+작가)
  spineSelectedIds: new Set(),    // 삭제 모드에서 선택한 card_id 들
};

// 작품 그룹 키 — 제목+작가가 같으면 같은 그룹
// 시리즈 패턴 감지 — 제목 키워드 OR 작가명으로 매칭.
// 코난 도일이 작가면 제목에 셜록/홈즈가 없어도 셜록홈즈 시리즈로 분류 (빨간 머리 연맹 등).
const SERIES_PATTERNS = [
  {
    name: '셜록홈즈',
    detect: /(?:셜록|홈즈|sherlock|holmes)/i,
    authorDetect: /(?:코난\s*도일|conan\s*doyle|아서\s*코난|arthur\s*conan)/i,
    strip: [
      /셜록\s*홈즈/gi, /sherlock\s*holmes/gi,
      /셜록/g, /홈즈/g, /sherlock/gi, /holmes/gi,
    ],
  },
];
function extractSeries(workOrTitle) {
  let title = '', author = '';
  if (workOrTitle && typeof workOrTitle === 'object') {
    title = workOrTitle.title || '';
    author = workOrTitle.author || '';
  } else {
    title = String(workOrTitle || '');
  }
  const t = title.trim();
  const a = author.trim();
  if (!t && !a) return { series: '', subtitle: '', full: '' };
  for (const sp of SERIES_PATTERNS) {
    const titleMatch = sp.detect && sp.detect.test(t);
    const authorMatch = sp.authorDetect && a && sp.authorDetect.test(a);
    if (titleMatch || authorMatch) {
      let subtitle = t;
      if (titleMatch) {
        for (const re of sp.strip) subtitle = subtitle.replace(re, '');
      }
      subtitle = subtitle
        .replace(/^[\s\-:·,—–의와과]+|[\s\-:·,—–의와과]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return { series: sp.name, subtitle, full: t };
    }
  }
  return { series: t, subtitle: '', full: t };
}

function makeGroupKey(work) {
  if (!work) return '__';
  // series 기반으로 그룹화 — 같은 시리즈는 1 section. 부제는 section 내부에서
  // 카드 색상으로 구분. 작가도 같이 넘겨 author 매칭(코난 도일 등)으로 시리즈 인식.
  const { series } = extractSeries(work);
  return `${series}__${(work.author || '').trim()}`;
}

// 표시용 제목 정규화 — DB 원본은 그대로 두고 화면에만 한글 표기 적용
// 키는 '구분자 제거 + lowercase' 정규화 형태로 매칭해 '아,저,씨' '아·저,씨' 등 모든 변형 처리.
const TITLE_DISPLAY_ALIASES = {
  'titanic': '타이타닉',
  '아저씨': '아저씨',
};
function displayTitle(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t) return t;
  const lc = t.toLowerCase();
  if (TITLE_DISPLAY_ALIASES[lc]) return TITLE_DISPLAY_ALIASES[lc];
  const stripped = lc.replace(/[^\p{L}\p{N}]/gu, '');
  if (stripped && TITLE_DISPLAY_ALIASES[stripped]) {
    return TITLE_DISPLAY_ALIASES[stripped];
  }
  return t;
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
  libraryStatus.textContent = '불러오는 중⋯';
  libraryStatus.classList.remove('text-error');

  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('cards')
      .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, works(work_id, title, subtitle, format, author, release_year, intro, characters, title_original, subtitle_original, author_original)')
      .order('card_id', { ascending: false })
      .limit(500);
    if (error) throw error;

    state.rows = Array.isArray(data) ? data : [];
    refreshWorkFilterOptions();
    refreshFormatFilterOptions();
    renderLibrary();
    if (libraryKeywordFreq && !libraryKeywordFreq.classList.contains('hidden')) renderKeywordFreq();
    // renderLibrary 가 총/현재 표시 카운트를 직접 갱신하므로 여기선 별도 메시지 안 씀.
    // 자동 백필은 비활성화 — '전체 영문 백필' 버튼으로만 수동 실행.
    // (이전엔 loadLibrary 마다 autoBackfillBilingual 가 백그라운드에서 돌아 API 비용·체감 부담)
  } catch (err) {
    console.error('[library] load error:', err);
    libraryStatus.textContent = `불러오기 실패: ${err.message || err}`;
    libraryStatus.classList.add('text-error');
  }
}

function refreshWorkFilterOptions() {
  // 시리즈 기준으로 중복 제거 — '셜록홈즈 - 주홍색 연구', '셜록홈즈 - 네 사람의 서명'은
  // 둘 다 '셜록홈즈' 한 옵션으로 통합됨
  const seriesSet = new Set();
  state.rows.forEach((c) => {
    const series = extractSeries(c.works || {}).series;
    if (series) seriesSet.add(series);
  });

  const current = libraryWorkFilter.value;
  libraryWorkFilter.innerHTML = '<option value="">모든 작품</option>';
  [...seriesSet]
    .sort((a, b) => a.localeCompare(b))
    .forEach((series) => {
      const opt = document.createElement('option');
      opt.value = series;
      opt.textContent = displayTitle(series);
      libraryWorkFilter.appendChild(opt);
    });
  if (current && seriesSet.has(current)) {
    libraryWorkFilter.value = current;
  } else {
    libraryWorkFilter.value = '';
    state.workFilter = '';
  }
}

// 형식(works.format) 한글 라벨 + 표시 순서 (모바일 m-app.js GENRE_LABEL 과 동일).
const FORMAT_ORDER = ['movie', 'drama', 'musical', 'opera', 'play', 'novel', 'poem', 'essay', 'prose'];
const FORMAT_LABEL = {
  movie: '영화', drama: '드라마', musical: '뮤지컬', opera: '오페라',
  play: '연극', novel: '소설', poem: '시', essay: '에세이', prose: '산문',
};

// 형식 필터 옵션을 현재 로드된 카드들의 distinct format 으로 채운다.
// 정해진 순서(FORMAT_ORDER) 우선, 목록에 없는 format 은 뒤에 그대로 덧붙인다.
function refreshFormatFilterOptions() {
  if (!libraryFormatFilter) return;
  const present = new Set();
  state.rows.forEach((c) => {
    const fmt = String(c.works?.format || '').toLowerCase();
    if (fmt) present.add(fmt);
  });

  const ordered = [
    ...FORMAT_ORDER.filter((f) => present.has(f)),
    ...[...present].filter((f) => !FORMAT_ORDER.includes(f)).sort(),
  ];

  const current = libraryFormatFilter.value;
  libraryFormatFilter.innerHTML = '<option value="">모든 형식</option>';
  ordered.forEach((fmt) => {
    const opt = document.createElement('option');
    opt.value = fmt;
    opt.textContent = FORMAT_LABEL[fmt] || fmt;
    libraryFormatFilter.appendChild(opt);
  });
  if (current && present.has(current)) {
    libraryFormatFilter.value = current;
  } else {
    libraryFormatFilter.value = '';
    state.formatFilter = '';
  }
}

// 카드의 영문 원본(*_original) 중 하나라도 빠진 게 있으면 true.
// 한국어 본은 있는데 영문이 없는 필드만 카운트 (KO 도 빈 필드는 백필 대상이 아니므로 제외).
function cardMissingEnOriginal(c) {
  const w = c.works || {};
  return (
    (!w.title_original    && w.title) ||
    (!w.subtitle_original && w.subtitle) ||
    (!w.author_original   && w.author) ||
    (!c.quote_original          && c.quote) ||
    (!c.script_excerpt_original && c.script_excerpt) ||
    (!c.excerpt_description_original && c.excerpt_description) ||
    (!c.significance_original   && c.significance) ||
    ((!Array.isArray(c.keywords_original) || !c.keywords_original.length) &&
     Array.isArray(c.keywords) && c.keywords.length)
  );
}

function filteredRows() {
  const q = state.searchText.trim().toLowerCase();
  return state.rows.filter((c) => {
    if (state.formatFilter) {
      if (String(c.works?.format || '').toLowerCase() !== state.formatFilter) return false;
    }
    if (state.workFilter) {
      const cSeries = extractSeries(c.works || {}).series;
      if (cSeries !== state.workFilter) return false;
    }
    if (q) {
      // 작품 제목/부제/작가/원제 도 검색 hay 에 포함 — 파우스트 등 본문 미언급 카드 누락 방지
      const w = c.works || {};
      const hay = [
        c.quote, c.excerpt_description, (c.keywords || []).join(' '),
        w.title, w.subtitle, w.author, w.title_original, w.subtitle_original, w.author_original,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.missingEnOnly && !cardMissingEnOriginal(c)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 키워드 빈도 집계 — 전체 카드(필터 무시)에서 각 키워드 사용 횟수 내림차순.
// 표기 흔들림("소유"/"소유물" 등)을 편집자가 눈으로 잡아 수렴시키는 용도.
// 행 클릭 시 해당 키워드로 검색되어 흔들리는 카드들을 바로 모아 볼 수 있다.
// ---------------------------------------------------------------------------
function computeKeywordFreq() {
  const counts = new Map();
  state.rows.forEach((c) => {
    (c.keywords || []).forEach((kRaw) => {
      const k = String(kRaw || '').trim();
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
  });
  // 횟수 내림차순, 동률이면 가나다순
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

// 10개 의미 범주 — 표시 순서. 분류에 없거나 애매한 키워드는 '미분류'로.
const KEYWORD_CATEGORIES = ['관계·사랑', '상실·애도', '자기·정체성', '결단·행동', '세계관·환멸', '욕망·집착', '시간·기억', '희망·구원', '삶·일상', '정서 상태'];
const KEYWORD_UNCLASSIFIED = '미분류';
// 범주 정의가 바뀌면 -v 숫자를 올려 옛 분류 캐시를 무효화한다. v2: 6→10 범주 확장.
const KW_CAT_CACHE_KEY = 'sq-keyword-categories-v2';

// distinct 키워드 집합의 서명 — 집합이 바뀌면 재분류가 트리거된다.
function keywordSignature(distinct) {
  return distinct.slice().sort().join('|');
}

let keywordCatCache = null; // { sig, map }

const KW_CHUNK_SIZE = 50;   // 한 LLM 호출당 키워드 수 (작게 나눠 진행률 표시)
const KW_CONCURRENCY = 3;   // 동시 호출 수

// 캐시(메모리·localStorage)에 현재 키워드 집합의 분류가 있으면 즉시 반환, 없으면 null.
function getCachedCategories(distinct) {
  const sig = keywordSignature(distinct);
  if (keywordCatCache && keywordCatCache.sig === sig) return keywordCatCache.map;
  try {
    const raw = localStorage.getItem(KW_CAT_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.sig === sig && parsed.map) {
        keywordCatCache = parsed;
        return parsed.map;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyChunk(keywords) {
  const token = await getAccessToken();
  const res = await fetch('/api/classify-keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ keywords }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail.slice(0, 200) || `분류 실패 (${res.status})`);
  }
  const json = await res.json();
  return (json && json.assignments) || {};
}

// distinct 키워드를 청크로 나눠 분류. onProgress(doneKw, totalKw, doneBatches, totalBatches) 호출.
// 결과 맵을 캐시에 저장하고 반환.
async function classifyKeywords(distinct, onProgress) {
  const batches = chunkArray(distinct, KW_CHUNK_SIZE);
  const map = {};
  let idx = 0;
  let doneBatches = 0;
  let doneKw = 0;

  async function worker() {
    while (idx < batches.length) {
      const my = idx++;
      const part = await classifyChunk(batches[my]);
      Object.assign(map, part);
      doneBatches += 1;
      doneKw += batches[my].length;
      if (onProgress) onProgress(doneKw, distinct.length, doneBatches, batches.length);
    }
  }

  const workers = Array.from({ length: Math.min(KW_CONCURRENCY, batches.length) }, worker);
  await Promise.all(workers);

  keywordCatCache = { sig: keywordSignature(distinct), map };
  try { localStorage.setItem(KW_CAT_CACHE_KEY, JSON.stringify(keywordCatCache)); } catch { /* ignore */ }
  return map;
}

// 분류 진행 UI — 스피너(텍스트, CSS 무관)·경과시간·진행 막대·배치/키워드 카운트.
// .update(...)로 진행률 갱신, .stop()으로 타이머 정리. 멈춘 듯 보이지 않게 항상 움직인다.
function showClassifyProgress(total) {
  const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  const startTs = Date.now();

  libraryKeywordFreqBody.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'py-6 flex flex-col items-center gap-3 text-sm';

  const line1 = document.createElement('div');
  line1.className = 'flex items-center gap-2 text-on-surface font-semibold';
  const spin = document.createElement('span');
  spin.className = 'font-mono text-primary';
  spin.textContent = FRAMES[0];
  const label = document.createElement('span');
  label.textContent = 'Claude로 키워드 분류 중…';
  line1.append(spin, label);

  const barWrap = document.createElement('div');
  barWrap.className = 'w-64 max-w-full h-2 rounded-full bg-surface-container-high overflow-hidden';
  const bar = document.createElement('div');
  bar.className = 'h-full bg-primary rounded-full';
  bar.style.width = '0%';
  bar.style.transition = 'width .3s';
  barWrap.appendChild(bar);

  const line2 = document.createElement('div');
  line2.className = 'text-xs text-on-surface-variant';
  line2.textContent = `키워드 0 / ${total}`;

  const line3 = document.createElement('div');
  line3.className = 'text-xs text-on-surface-variant';
  line3.textContent = '요청 준비 중… 경과 0.0s';

  box.append(line1, barWrap, line2, line3);
  libraryKeywordFreqBody.appendChild(box);

  let lastText = '요청 준비 중…';
  const timer = setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    spin.textContent = FRAMES[frame];
    const sec = ((Date.now() - startTs) / 1000).toFixed(1);
    line3.textContent = `${lastText} 경과 ${sec}s`;
  }, 120);

  return {
    update(done, totalKw, doneBatches, totalBatches) {
      const pct = totalKw ? Math.round((done / totalKw) * 100) : 0;
      bar.style.width = `${pct}%`;
      line2.textContent = `키워드 ${done} / ${totalKw} (${pct}%)`;
      lastText = `배치 ${doneBatches}/${totalBatches} 완료 ·`;
    },
    stop() { clearInterval(timer); },
  };
}

// [[kw, n], ...] → 빈도 테이블 (행 클릭 시 그 키워드로 검색). max는 막대 스케일 기준(전역 최대).
function buildFreqTable(rows, max) {
  const table = document.createElement('table');
  table.className = 'w-full text-sm border-collapse';

  const tbody = document.createElement('tbody');
  rows.forEach(([kw, n]) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-outline-variant/40 hover:bg-surface-container cursor-pointer';
    tr.title = `"${kw}" 로 검색`;

    const kwTd = document.createElement('td');
    kwTd.className = 'py-1.5 pr-2 text-on-surface';
    kwTd.textContent = kw; // textContent — XSS 방지
    tr.appendChild(kwTd);

    const nTd = document.createElement('td');
    nTd.className = 'py-1.5 px-2 text-right font-semibold text-on-surface tabular-nums w-14';
    nTd.textContent = String(n);
    tr.appendChild(nTd);

    const barTd = document.createElement('td');
    barTd.className = 'py-1.5 pl-2';
    const barWrap = document.createElement('div');
    barWrap.className = 'h-2 rounded-full bg-surface-container-high overflow-hidden';
    const bar = document.createElement('div');
    bar.className = 'h-full bg-primary rounded-full';
    bar.style.width = `${Math.max(4, Math.round((n / max) * 100))}%`;
    barWrap.appendChild(bar);
    barTd.appendChild(barWrap);
    tr.appendChild(barTd);

    tr.addEventListener('click', () => {
      librarySearchInput.value = kw;
      state.searchText = kw;
      renderLibrary();
      toggleKeywordFreq(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

// 범주 1개 → 접이식 <details> 섹션 (헤더에 종/횟수 소계)
function buildCategorySection(cat, rows, max) {
  const subtotal = rows.reduce((s, [, n]) => s + n, 0);
  const details = document.createElement('details');
  details.className = 'border border-outline-variant rounded-lg overflow-hidden';

  const summary = document.createElement('summary');
  summary.className =
    'cursor-pointer select-none px-3 py-2 bg-surface-container flex items-center justify-between text-sm font-semibold text-on-surface';
  const left = document.createElement('span');
  left.textContent = cat;
  const right = document.createElement('span');
  right.className = 'text-on-surface-variant font-normal';
  right.textContent = `${rows.length}종 · ${subtotal}회`;
  summary.appendChild(left);
  summary.appendChild(right);
  details.appendChild(summary);

  const wrap = document.createElement('div');
  wrap.className = 'px-3 pb-2';
  wrap.appendChild(buildFreqTable(rows, max));
  details.appendChild(wrap);
  return details;
}

async function renderKeywordFreq(force = false) {
  if (!libraryKeywordFreqBody) return;
  const freq = computeKeywordFreq(); // [[kw, n], ...]
  const distinct = freq.map(([k]) => k);
  const totalUses = freq.reduce((s, [, n]) => s + n, 0);
  if (libraryKeywordFreqSummary) {
    libraryKeywordFreqSummary.textContent = `· 고유 ${freq.length}종 / 총 ${totalUses}회`;
  }

  libraryKeywordFreqBody.innerHTML = '';
  if (!freq.length) {
    libraryKeywordFreqBody.innerHTML =
      '<p class="text-sm text-on-surface-variant py-4 text-center">집계할 키워드가 없습니다.</p>';
    return;
  }

  const max = freq[0][1] || 1;

  // 캐시에 있으면 즉시 표시(진행 UI 생략), 없으면 배치 분류 + 진행 표시
  let map = force ? null : getCachedCategories(distinct);
  if (!map) {
    const progress = showClassifyProgress(distinct.length);
    try {
      map = await classifyKeywords(distinct, (d, t, b, B) => progress.update(d, t, b, B));
    } catch (err) {
      // 분류 실패 — 전체 평면 목록으로 폴백
      console.error('[library] keyword classify failed:', err);
      progress.stop();
      libraryKeywordFreqBody.innerHTML = '';
      const note = document.createElement('p');
      note.className = 'text-xs text-error mb-2';
      note.textContent = `자동 분류 실패 (${err.message || err}). 전체 목록으로 표시합니다.`;
      libraryKeywordFreqBody.appendChild(note);
      libraryKeywordFreqBody.appendChild(buildFreqTable(freq, max));
      return;
    }
    progress.stop();
  }

  // 범주별 그룹핑 (분류 맵에 없는 키워드는 미분류)
  const groups = new Map();
  [...KEYWORD_CATEGORIES, KEYWORD_UNCLASSIFIED].forEach((c) => groups.set(c, []));
  freq.forEach(([kw, n]) => {
    let cat = map[kw];
    if (!groups.has(cat)) cat = KEYWORD_UNCLASSIFIED;
    groups.get(cat).push([kw, n]);
  });

  libraryKeywordFreqBody.innerHTML = '';
  const sections = document.createElement('div');
  sections.className = 'flex flex-col gap-2';
  [...KEYWORD_CATEGORIES, KEYWORD_UNCLASSIFIED].forEach((cat) => {
    const rows = groups.get(cat);
    if (!rows.length) return;
    sections.appendChild(buildCategorySection(cat, rows, max));
  });
  libraryKeywordFreqBody.appendChild(sections);
}

function toggleKeywordFreq(show) {
  if (!libraryKeywordFreq) return;
  const willShow =
    show === undefined ? libraryKeywordFreq.classList.contains('hidden') : show;
  if (willShow) {
    renderKeywordFreq();
    libraryKeywordFreq.classList.remove('hidden');
    libraryKeywordFreq.classList.add('flex');
  } else {
    libraryKeywordFreq.classList.add('hidden');
    libraryKeywordFreq.classList.remove('flex');
  }
}

if (libraryKeywordFreqBtn) libraryKeywordFreqBtn.addEventListener('click', () => toggleKeywordFreq());
if (libraryKeywordFreqClose) libraryKeywordFreqClose.addEventListener('click', () => toggleKeywordFreq(false));
if (libraryKeywordFreqReclassify) libraryKeywordFreqReclassify.addEventListener('click', () => renderKeywordFreq(true));

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderLibrary() {
  // 책꽂이 모드에서 스파인 클릭(골라 삭제 선택)으로 재렌더되면 DOM 전체가 새로 그려져
  // 브라우저가 스크롤 위치를 잃고 맨 위로 점프하는 문제가 있다. 미리 저장 후 복원.
  const prevScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  libraryGrid.innerHTML = '';
  libraryShelf.innerHTML = '';
  const rows = filteredRows();

  // 상태 표시 — 총 카드 / 현재 화면(필터 적용 후) 갯수.
  // 별도의 백필 진행 상태 표시 중에는 덮지 않음 (libraryStatus 에 '백필 중⋯' 가 떠 있으면 유지).
  if (libraryStatus && !/백필 중|채우는 중/.test(libraryStatus.textContent)) {
    const total = state.rows.length;
    const visible = rows.length;
    libraryStatus.textContent = (total === visible)
      ? `총 ${total}장`
      : `총 ${total}장 · 현재 ${visible}장 표시`;
  }

  if (rows.length === 0) {
    libraryEmpty.classList.remove('hidden');
    librarySelectionBar.classList.add('hidden');
    librarySelectionBar.classList.remove('flex');
    libraryGrid.classList.add('hidden');
    libraryShelf.classList.add('hidden');
    // 빈 결과 분기에서도 카운트는 위에서 갱신됨 (총 N장 · 현재 0장)
    window.scrollTo(0, prevScrollY);
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

  // 스크롤 복원 — DOM 재구성 직후 동기적 setter 가 가장 확실하다.
  // 일부 브라우저는 한 프레임 뒤에야 새 contentHeight 가 반영되므로 RAF 한 번 더.
  window.scrollTo(0, prevScrollY);
  requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
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
      <h3 class="text-lg font-bold text-on-surface">${escapeHtml(extractSeries(work).series || displayTitle(work.title) || '제목 없음')}</h3>
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
  // 같은 그룹(시리즈) 내에서도 부제(subtitle)별로 색상이 다름.
  // 정렬: subtitle → title 순 — 같은 부제 카드는 인접해서 묶여 보임.
  const sortedCards = [...cards].sort((a, b) => {
    const sa = (a.works?.subtitle || '').toLowerCase();
    const sb = (b.works?.subtitle || '').toLowerCase();
    if (sa !== sb) return sa.localeCompare(sb);
    const ta = a.works?.title || '';
    const tb = b.works?.title || '';
    return ta.localeCompare(tb);
  });
  sortedCards.forEach((card, idx) => {
    // 카드별 base color — subtitle(부제) 우선, 없으면 title.
    // 같은 부제 카드들은 동일 hue, 부제가 다르면 다른 hue.
    const colorKey = card.works?.subtitle || card.works?.title || group.key;
    const baseColor = colorForTitle(colorKey);
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
    refreshFormatFilterOptions();
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
    refreshFormatFilterOptions();
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

  // 토글 대상 7필드 — KO(기본) ↔ EN(*_original).
  // *_original 이 비어 있으면 첫 EN 클릭 때 KO→EN 번역해서 채워넣는 lazy 방식.
  // → 항상 EN 버튼을 노출하고, 빈 칸은 클릭 시 채운다.

  const renderWorkLine = (lang) => {
    const title    = lang === 'en' && work.title_original    ? work.title_original    : work.title;
    const subtitle = lang === 'en' && work.subtitle_original ? work.subtitle_original : work.subtitle;
    const author   = lang === 'en' && work.author_original   ? work.author_original   : work.author;
    return [
      displayTitle(title) || `Work #${card.work_id}`,
      subtitle || null,
      work.format,
      work.release_year,
      author,
    ].filter(Boolean).join(' · ');
  };

  node.querySelector('.lib-work-title').textContent = renderWorkLine('ko');
  node.querySelector('.lib-tag').textContent = (card.keywords && card.keywords[0]) || `Card #${card.card_id}`;

  const renderQuote = (lang) => {
    const text = lang === 'en' && card.quote_original ? card.quote_original : card.quote;
    return text ? `"${renderMarkdownBold(cleanForDisplay(text))}"` : '';
  };
  const renderExcerpt = (lang) => {
    const text = lang === 'en' && card.script_excerpt_original ? card.script_excerpt_original : (card.script_excerpt || '');
    const fmt = String(work.format || '').toLowerCase();
    const baseHtml = fmt === 'poem'
      ? escapeHtml(formatPoemScript(text))
      : isProseFormat(work.format)
        ? escapeHtml(flowProseScript(text))
        : boldSpeakerLines(cleanForDisplay(text, work.characters), work.characters);
    return applyMarkdownBoldOnHtml(baseHtml);
  };
  const renderDescription = (lang) => {
    const text = lang === 'en' && card.excerpt_description_original ? card.excerpt_description_original : (card.excerpt_description || '');
    return renderMarkdownBold(cleanForDisplay(text));
  };
  const renderSignificance = (lang) => {
    const text = lang === 'en' && card.significance_original ? card.significance_original : (card.significance || '');
    return renderMarkdownBold(cleanForDisplay(text));
  };

  node.querySelector('.lib-quote').innerHTML = renderQuote('ko');
  node.querySelector('.lib-excerpt').innerHTML = renderExcerpt('ko');
  node.querySelector('.lib-description').innerHTML = renderDescription('ko');

  // EN 토글 버튼 — 항상 노출 (빈 *_original 은 첫 클릭 때 KO→EN 번역으로 채움)
  const langToggleBtn = node.querySelector('.lib-lang-toggle');
  if (langToggleBtn) {
    langToggleBtn.classList.remove('hidden');
    let currentLang = 'ko';
    langToggleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      currentLang = currentLang === 'ko' ? 'en' : 'ko';

      // EN 으로 갈 때 누락된 *_original 을 lazy 번역
      if (currentLang === 'en') {
        const prevTxt = langToggleBtn.textContent;
        langToggleBtn.disabled = true;
        langToggleBtn.textContent = '⋯';
        try {
          await ensureEnglishOriginals(card, work);
        } catch (err) {
          console.error('[library] lazy translate failed:', err);
          toast(`영문 번역 실패: ${err.message || err}`, 'error');
        } finally {
          langToggleBtn.disabled = false;
          langToggleBtn.textContent = prevTxt;
        }
      }

      node.querySelector('.lib-work-title').textContent = renderWorkLine(currentLang);
      node.querySelector('.lib-quote').innerHTML = renderQuote(currentLang);
      node.querySelector('.lib-excerpt').innerHTML = renderExcerpt(currentLang);
      node.querySelector('.lib-description').innerHTML = renderDescription(currentLang);
      const sigEl = node.querySelector('.lib-significance');
      if (sigEl) sigEl.innerHTML = renderSignificance(currentLang);
      renderKeywordChips(currentLang);

      langToggleBtn.textContent = currentLang === 'ko' ? 'EN' : 'KO';
      langToggleBtn.title = currentLang === 'ko' ? '영문 원본으로 보기' : '한국어로 돌아가기';
      langToggleBtn.classList.toggle('bg-primary/10', currentLang === 'en');
    });
  }

  // 키워드 칩 렌더 — 토글 시 다시 그릴 수 있도록 함수화
  const kwEl = node.querySelector('.lib-keywords');
  function renderKeywordChips(lang) {
    if (!kwEl) return;
    kwEl.innerHTML = '';
    const list = (lang === 'en' && Array.isArray(card.keywords_original) && card.keywords_original.length)
      ? card.keywords_original
      : (card.keywords || []);
    list.forEach((k) => {
      const chip = document.createElement('span');
      chip.className = 'px-2 py-1 bg-surface-container rounded-full text-xs text-on-surface-variant';
      chip.textContent = `#${k}`;
      kwEl.appendChild(chip);
    });
  }
  renderKeywordChips('ko');

  fillMeter(node.querySelector('.lib-temp-bar'), node.querySelector('.lib-temp-num'), card.temperature, 'bg-primary');
  fillMeter(node.querySelector('.lib-intensity-bar'), node.querySelector('.lib-intensity-num'), card.intensity, 'bg-secondary');

  // significance — 있으면 표시
  const sigWrap = node.querySelector('.lib-significance-wrap');
  const sigEl = node.querySelector('.lib-significance');
  if (sigWrap && sigEl && card.significance && String(card.significance).trim()) {
    sigEl.innerHTML = renderMarkdownBold(cleanForDisplay(card.significance));
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
  const work = card.works || {};

  // 작품 메타 (좌/우)
  const titleEl       = node.querySelector('.lib-edit-title');
  const titleOrigEl   = node.querySelector('.lib-edit-title-original');
  const subtitleEl    = node.querySelector('.lib-edit-subtitle');
  const subtitleOrigEl= node.querySelector('.lib-edit-subtitle-original');
  const authorEl      = node.querySelector('.lib-edit-author');
  const authorOrigEl  = node.querySelector('.lib-edit-author-original');
  const introEl       = node.querySelector('.lib-edit-intro');
  const introCountEl  = node.querySelector('.lib-edit-intro-count');

  // 본문 (좌/우)
  const quoteEl       = node.querySelector('.lib-edit-quote');
  const quoteOrigEl   = node.querySelector('.lib-edit-quote-original');
  const excerptEl     = node.querySelector('.lib-edit-excerpt');
  const excerptOrigEl = node.querySelector('.lib-edit-excerpt-original');

  // 해설 (좌: KO / 우: EN)
  const descEl       = node.querySelector('.lib-edit-description');
  const descOrigEl   = node.querySelector('.lib-edit-description-original');
  const sigEl        = node.querySelector('.lib-edit-significance');
  const sigOrigEl    = node.querySelector('.lib-edit-significance-original');

  // 키워드 (좌: KO / 우: EN)
  const kwEl         = node.querySelector('.lib-edit-keywords');
  const kwOrigEl     = node.querySelector('.lib-edit-keywords-original');

  const tempEl       = node.querySelector('.lib-edit-temperature');
  const intensityEl  = node.querySelector('.lib-edit-intensity');

  // 초기값 — 작품
  if (titleEl)        titleEl.value        = work.title || '';
  if (titleOrigEl)    titleOrigEl.value    = work.title_original || '';
  if (subtitleEl)     subtitleEl.value     = work.subtitle || '';
  if (subtitleOrigEl) subtitleOrigEl.value = work.subtitle_original || '';
  if (authorEl)       authorEl.value       = work.author || '';
  if (authorOrigEl)   authorOrigEl.value   = work.author_original || '';
  if (introEl) {
    introEl.value = work.intro || '';
    const updateIntroCount = () => { if (introCountEl) introCountEl.textContent = `${introEl.value.trim().length}자`; };
    updateIntroCount();
    introEl.addEventListener('input', updateIntroCount);
  }

  // 초기값 — 카드
  quoteEl.value       = card.quote || '';
  quoteOrigEl.value   = card.quote_original || '';
  excerptEl.value     = card.script_excerpt || '';
  excerptOrigEl.value = card.script_excerpt_original || '';
  descEl.value        = card.excerpt_description || '';
  if (descOrigEl) descOrigEl.value = card.excerpt_description_original || '';
  kwEl.value          = (card.keywords || []).join(', ');
  if (kwOrigEl) kwOrigEl.value = (card.keywords_original || []).join(', ');
  if (sigEl) sigEl.value = card.significance || '';
  if (sigOrigEl) sigOrigEl.value = card.significance_original || '';
  tempEl.value        = card.temperature ?? 3;
  intensityEl.value   = card.intensity ?? 3;

  attachKeywordHint(kwEl);
  // B 버튼 + Ctrl/Cmd+B 단축키로 선택 영역에 **굵게** 마커 토글
  wireBoldButtons(node);
  // ↻ KO — 영문 칸의 텍스트를 한국어로 재번역해서 좌측에 채우기
  wireTranslateButtons(node, work);

  // ↻ 영문 일괄 채우기 — 이 카드의 빠진 *_original 필드만 KO→EN 번역해서 채움.
  // 전체 백필이 일부 실패한 카드를 admin 이 편집 화면에서 바로 보충하는 용도.
  const fillEnBtn = node.querySelector('.lib-fill-en-btn');
  if (fillEnBtn) {
    fillEnBtn.addEventListener('click', async () => {
      fillEnBtn.disabled = true;
      const origHtml = fillEnBtn.innerHTML;
      fillEnBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> 채우는 중⋯';
      try {
        await ensureEnglishOriginals(card, card.works || work || {});
        // 메모리에 채워진 *_original 을 빈 폼 칸에 다시 반영 (admin 이 이미 입력한 값은 보존)
        const w2 = card.works || work || {};
        if (titleOrigEl    && !titleOrigEl.value.trim()    && w2.title_original)    titleOrigEl.value    = w2.title_original;
        if (subtitleOrigEl && !subtitleOrigEl.value.trim() && w2.subtitle_original) subtitleOrigEl.value = w2.subtitle_original;
        if (authorOrigEl   && !authorOrigEl.value.trim()   && w2.author_original)   authorOrigEl.value   = w2.author_original;
        if (quoteOrigEl    && !quoteOrigEl.value.trim()    && card.quote_original)    quoteOrigEl.value    = card.quote_original;
        if (excerptOrigEl  && !excerptOrigEl.value.trim()  && card.script_excerpt_original) excerptOrigEl.value = card.script_excerpt_original;
        if (descOrigEl     && !descOrigEl.value.trim()     && card.excerpt_description_original) descOrigEl.value = card.excerpt_description_original;
        if (sigOrigEl      && !sigOrigEl.value.trim()      && card.significance_original)       sigOrigEl.value  = card.significance_original;
        if (kwOrigEl       && !kwOrigEl.value.trim()       && Array.isArray(card.keywords_original) && card.keywords_original.length) {
          kwOrigEl.value = card.keywords_original.join(', ');
        }
        toast('영문 일괄 채우기 완료 — 저장(✓) 누르면 DB 반영', 'success');
      } catch (e) {
        console.error('[library] fill EN failed:', e);
        toast(`영문 채우기 실패: ${e.message || e}`, 'error');
      } finally {
        fillEnBtn.disabled = false;
        fillEnBtn.innerHTML = origHtml;
      }
    });
  }

  node.querySelector('.lib-save-edit-btn').addEventListener('click', async () => {
    const kwList = parseKeywords(kwEl.value);
    const kwCheck = validateKeywords(kwList);
    if (!kwCheck.ok) { toast(kwCheck.message, 'error'); return; }
    const over = overLongKeywords(kwList);
    if (over.length) toast(`8자 초과 키워드: ${over.join(', ')} — 더 짧게 권장합니다.`, 'info');

    // 키워드 영문(쉼표 구분) → 배열
    const kwOrigList = kwOrigEl
      ? kwOrigEl.value.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean)
      : [];

    // 카드 단위 업데이트
    const cardUpdates = {
      quote: quoteEl.value.trim(),
      script_excerpt: excerptEl.value.trim(),
      excerpt_description: descEl.value.trim() || null,
      keywords: kwList,
      significance: (sigEl && sigEl.value.trim()) || null,
      temperature: Math.max(1, Math.min(5, Number(tempEl.value) || 3)),
      intensity: Math.max(1, Math.min(5, Number(intensityEl.value) || 3)),
      // 이중 언어 — 영문 원본 (NULL 허용)
      quote_original:                (quoteOrigEl.value.trim() || null),
      script_excerpt_original:       (excerptOrigEl.value.trim() || null),
      excerpt_description_original:  (descOrigEl && descOrigEl.value.trim()) || null,
      significance_original:         (sigOrigEl && sigOrigEl.value.trim()) || null,
      keywords_original:             kwOrigList.length ? kwOrigList : null,
    };

    // 작품 단위 업데이트 — 값이 실제로 바뀌었을 때만
    const workUpdates = {};
    if (titleEl && titleEl.value.trim() !== (work.title || ''))                   workUpdates.title             = titleEl.value.trim();
    if (titleOrigEl && titleOrigEl.value.trim() !== (work.title_original || '')) workUpdates.title_original    = titleOrigEl.value.trim() || null;
    if (subtitleEl && (subtitleEl.value.trim() || null) !== (work.subtitle || null))
                                                                                  workUpdates.subtitle          = subtitleEl.value.trim() || null;
    if (subtitleOrigEl && subtitleOrigEl.value.trim() !== (work.subtitle_original || ''))
                                                                                  workUpdates.subtitle_original = subtitleOrigEl.value.trim() || null;
    if (authorEl && authorEl.value.trim() !== (work.author || ''))                workUpdates.author            = authorEl.value.trim() || null;
    if (authorOrigEl && authorOrigEl.value.trim() !== (work.author_original || ''))
                                                                                  workUpdates.author_original   = authorOrigEl.value.trim() || null;
    if (introEl && (introEl.value.trim() || null) !== (work.intro || null))       workUpdates.intro             = introEl.value.trim() || null;

    try {
      const sb = await getSupabase();
      const { data, error } = await sb.from('cards').update(cardUpdates).eq('card_id', card.card_id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('DB에 저장되지 않음 — admin 권한이 없거나 카드가 이미 삭제됐을 수 있습니다.');
      }
      // 작품 변경분이 있으면 works 도 UPDATE — 같은 작품의 다른 카드에도 즉시 반영됨
      if (Object.keys(workUpdates).length > 0) {
        const { error: wErr } = await sb.from('works').update(workUpdates).eq('work_id', card.work_id);
        if (wErr) throw wErr;
        // 메모리상 동일 work_id 카드들의 works 필드도 동기화
        state.rows.forEach((r) => {
          if (r.work_id === card.work_id && r.works) Object.assign(r.works, workUpdates);
        });
      }
      Object.assign(card, cardUpdates);
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

// 의의/설명 영문이 한국어 원본 글자수의 2.0배를 초과하면 paraphrase·확장된 것으로 판단.
// 새 프롬프트(길이 제약)로 재번역하기 위해 NULL 처리 → autoBackfillBilingual 누락 필터가 잡음.
const STALE_EN_RATIO = 2.0;
async function clearStaleLongEnTranslations() {
  const sb = await getSupabase();
  let cleared = 0;
  for (const card of state.rows) {
    const updates = {};
    if (card.excerpt_description && card.excerpt_description_original
        && card.excerpt_description_original.length > card.excerpt_description.length * STALE_EN_RATIO) {
      card.excerpt_description_original = null;
      updates.excerpt_description_original = null;
    }
    if (card.significance && card.significance_original
        && card.significance_original.length > card.significance.length * STALE_EN_RATIO) {
      card.significance_original = null;
      updates.significance_original = null;
    }
    if (Object.keys(updates).length === 0) continue;
    try {
      await sb.from('cards').update(updates).eq('card_id', card.card_id);
      cleared++;
    } catch (e) {
      console.warn('[library] stale clear failed', card.card_id, e?.message);
    }
  }
  if (cleared) console.log(`[library] cleared ${cleared} over-long EN translations for re-translation`);
}

// 의의(significance) · 상황 설명(excerpt_description) 영문 누락 카드만 집중 백필.
// 일반 backfillAllCards 에서 자주 누락되는 두 필드를 더 공격적으로 처리:
//  · 재시도 5회 (기본 3회 대비 강화)
//  · 두 필드만 처리하므로 동시성 늘려도 안전 (작품 메타·다른 필드 안 건드림)
//  · 카드별 성공/실패를 상세 콘솔 로그 + 실패한 card_id 목록을 최종 토스트
async function backfillCommentary() {
  const sb = await getSupabase();
  const token = await getAccessToken();

  if (libraryStatus) libraryStatus.textContent = 'DB 카드 목록 조회 중⋯';

  // 1) 의의 또는 설명 영문이 비어 있는 카드만 직접 조회 — *_original 이 null 이면서 KO 가 있는 경우.
  const COLS = 'card_id, work_id, excerpt_description, significance, excerpt_description_original, significance_original, works(title, subtitle, author, format)';
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('cards')
      .select(COLS)
      .order('card_id', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
  }

  const candidates = all.filter((c) =>
    (!c.excerpt_description_original && c.excerpt_description) ||
    (!c.significance_original && c.significance)
  );

  if (!candidates.length) {
    if (libraryStatus) libraryStatus.textContent = `의의·설명 영문 모두 채워져 있음 (총 ${all.length}장 검사).`;
    toast('의의·설명 영문 누락 카드 없음', 'info');
    return { total: all.length, processed: 0 };
  }

  toast(`의의·설명 영문 누락 ${candidates.length}장 발견 — 채우기 시작`, 'info');
  console.log(`[library] backfill commentary candidates:`, candidates.map((c) => c.card_id));

  // 강화된 재시도 (5회 + 더 긴 백오프) — Anthropic 일시 과부하 더 끈질기게 통과
  async function callTranslate(text, field, workCtx) {
    if (!text || !String(text).trim()) return null;
    let lastErr;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch('/api/translate-field', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text, field, work: workCtx, direction: 'ko2en' }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return String(body?.translated || '').trim() || null;
        const retryable = [408, 429, 500, 502, 503, 504].includes(res.status);
        if (!retryable || attempt === 5) throw new Error(body?.error || `HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt + Math.random() * 500));
      } catch (e) {
        lastErr = e;
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt + Math.random() * 500));
      }
    }
    throw lastErr;
  }

  let done = 0, failedCards = [];
  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i];
    const w = card.works || {};
    const workCtx = { title: w.title || '', subtitle: w.subtitle || '', author: w.author || '', format: w.format || '' };
    if (libraryStatus) {
      libraryStatus.textContent =
        `의의·설명 채우는 중⋯ (${i + 1}/${candidates.length}) — 실패 ${failedCards.length}장`;
    }
    const update = {};
    const failures = [];
    if (!card.excerpt_description_original && card.excerpt_description) {
      try {
        const v = await callTranslate(card.excerpt_description, 'excerpt_description', workCtx);
        if (v) update.excerpt_description_original = v;
        else failures.push('desc:빈응답');
      } catch (e) { failures.push(`desc:${e.message || e}`); }
    }
    if (!card.significance_original && card.significance) {
      try {
        const v = await callTranslate(card.significance, 'significance', workCtx);
        if (v) update.significance_original = v;
        else failures.push('sig:빈응답');
      } catch (e) { failures.push(`sig:${e.message || e}`); }
    }
    if (Object.keys(update).length > 0) {
      try {
        await sb.from('cards').update(update).eq('card_id', card.card_id);
        done++;
      } catch (e) {
        failures.push(`db:${e.message || e}`);
      }
    }
    if (failures.length) {
      failedCards.push({ id: card.card_id, reasons: failures });
      console.warn(`[library] commentary backfill failed card_id=${card.card_id}:`, failures.join(' | '));
    }
  }

  if (libraryStatus) {
    libraryStatus.textContent =
      `의의·설명 백필 완료 — 성공 ${done} / 실패 ${failedCards.length} / 전체 ${candidates.length}장` +
      (failedCards.length ? ` (콘솔에 실패 ID 출력)` : '');
  }
  if (failedCards.length) {
    console.warn('[library] failed cards:', failedCards);
    toast(`백필 완료: 성공 ${done} · 실패 ${failedCards.length} (콘솔 확인)`, 'info');
  } else {
    toast(`의의·설명 영문 백필 완료: ${done}장`, 'success');
  }
  loadLibrary().catch((e) => console.warn('[library] reload failed:', e));
  return { total: all.length, candidates: candidates.length, done, failed: failedCards };
}

// 수동 트리거 — DB 의 모든 카드(500 한도 무시) 를 페이지네이션으로 가져와 영문 누락분 백필.
// admin 이 '전체 영문 백필' 버튼 클릭 시 호출. 진행률을 status 영역에 실시간 표시.
async function backfillAllCards() {
  const sb = await getSupabase();

  if (libraryStatus) libraryStatus.textContent = 'DB 카드 목록 조회 중⋯';

  // 1) 모든 카드를 페이지네이션으로 가져옴 (한 번에 1000장씩, *_original 컬럼 포함)
  const SELECT_COLS = 'card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, works(work_id, title, subtitle, format, author, release_year, intro, characters, title_original, subtitle_original, author_original)';
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('cards')
      .select(SELECT_COLS)
      .order('card_id', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  console.log(`[library] backfill all: fetched ${all.length} cards`);

  // 2) 영문 누락된 카드만 골라내기
  const candidates = all.filter((c) => {
    const w = c.works || {};
    return (
      (!w.title_original    && w.title) ||
      (!w.subtitle_original && w.subtitle) ||
      (!w.author_original   && w.author) ||
      (!c.quote_original          && c.quote) ||
      (!c.script_excerpt_original && c.script_excerpt) ||
      (!c.excerpt_description_original && c.excerpt_description) ||
      (!c.significance_original   && c.significance) ||
      ((!Array.isArray(c.keywords_original) || !c.keywords_original.length) &&
       Array.isArray(c.keywords) && c.keywords.length)
    );
  });

  if (!candidates.length) {
    if (libraryStatus) libraryStatus.textContent = `이미 모든 카드에 영문 원본이 채워져 있어요 (총 ${all.length}장).`;
    toast('백필할 카드가 없습니다 — 이미 모두 완료', 'info');
    return { total: all.length, processed: 0 };
  }

  toast(`${candidates.length}장 백필 시작 — 잠시만요`, 'info');

  // 3) 순차 처리 — 같은 작품 메타 중복 번역 회피 + 레이트 보호.
  //    카드 안의 8개 필드는 ensureEnglishOriginals 내부에서 동시 3개 처리되므로 충분히 빠름.
  let done = 0, failed = 0;
  for (const card of candidates) {
    if (libraryStatus) {
      libraryStatus.textContent =
        `전체 영문 백필 중⋯ (${done + 1}/${candidates.length}) — 실패 ${failed}장`;
    }
    try {
      await ensureEnglishOriginals(card, card.works || {});
      done++;
    } catch (e) {
      failed++;
      console.warn('[library] backfill all failed card', card.card_id, e?.message || e);
    }
  }
  if (libraryStatus) {
    libraryStatus.textContent = `전체 영문 백필 완료 — 성공 ${done} / 실패 ${failed} / 전체 ${candidates.length}장`;
  }
  toast(`백필 완료: 성공 ${done} · 실패 ${failed}`, failed ? 'info' : 'success');
  // 메모리 state 갱신을 위해 라이브러리 다시 로드
  loadLibrary().catch((e) => console.warn('[library] reload after backfill failed:', e));
  return { total: all.length, candidates: candidates.length, done, failed };
}

// 라이브러리 진입 시 누락된 *_original 을 자동으로 채워 admin 이 EN 클릭하지 않아도
// 토글이 즉시 동작하도록 한다. 순차 처리(동시 호출 1) — 같은 work 의 카드들이 work 메타를
// 중복 번역하는 걸 피하고, Anthropic API 레이트도 보호.
async function autoBackfillBilingual() {
  // ① paraphrase 된 과거 영문 번역(원본 대비 2배 초과)을 NULL 처리 →
  //    아래 누락 필터가 잡아 새 프롬프트(길이 제약)로 재번역.
  try { await clearStaleLongEnTranslations(); } catch (e) { console.warn('[library] stale clear error:', e); }

  const candidates = state.rows.filter((card) => {
    const w = card.works || {};
    return (
      (!w.title_original    && w.title) ||
      (!w.subtitle_original && w.subtitle) ||
      (!w.author_original   && w.author) ||
      (!card.quote_original          && card.quote) ||
      (!card.script_excerpt_original && card.script_excerpt) ||
      (!card.excerpt_description_original && card.excerpt_description) ||
      (!card.significance_original   && card.significance) ||
      ((!Array.isArray(card.keywords_original) || !card.keywords_original.length) &&
       Array.isArray(card.keywords) && card.keywords.length)
    );
  });
  if (!candidates.length) return;

  const origStatus = libraryStatus?.textContent || '';
  console.log(`[library] auto-backfill: ${candidates.length} cards`);

  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i];
    if (libraryStatus) {
      libraryStatus.textContent = `이중 언어 자동 백필 중⋯ (${i + 1}/${candidates.length}) · 백그라운드`;
    }
    try {
      await ensureEnglishOriginals(card, card.works || {});
    } catch (e) {
      console.warn('[library] backfill failed card', card.card_id, e?.message || e);
    }
  }
  if (libraryStatus) libraryStatus.textContent = origStatus;
  console.log('[library] auto-backfill complete');
}

// 보기 토글에서 영문 칸이 비어 있는 필드를 즉시 KO→EN 번역해서 채운다 (lazy).
// 카드(card) 와 작품(work) 메모리 객체에 결과를 즉시 반영하고, DB에도 백필 저장해 다음 진입부터는 캐시 히트.
//
// 한 번에 다 안 되고 두세 번씩 눌러야 했던 원인 (수정 완료):
//  ① 8개 동시 /api/translate-field 호출 → Anthropic 레이트 제한·일시 과부하로 일부 실패
//  ② Promise.all 이 첫 실패에서 전체 reject → 성공한 것까지 DB 저장이 안 됨
//  ③ 다음 클릭에서 다시 같은 일 반복 → 매번 일부만 채워짐
//
// 수정:
//  ① 동시 호출 제한 (concurrency 3) — 레이트 직격 방지
//  ② 재시도 + 지수 백오프 (429/503/504/5xx) — 일시 과부하 자동 복구
//  ③ Promise.allSettled — 한 필드 실패해도 나머지는 즉시 DB 저장 → 다음 클릭 필요 없음
const _inFlightOriginals = new Map(); // card_id → Promise (중복 호출 방지)

// 단순 동시성 제한 — N 개 worker 가 큐 공유. 모든 결과(성공/실패) 를 settled 형태로 반환.
async function _runWithConcurrency(jobs, concurrency) {
  const results = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      try {
        results[i] = { status: 'fulfilled', value: await jobs[i]() };
      } catch (e) {
        results[i] = { status: 'rejected', reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

async function ensureEnglishOriginals(card, work) {
  if (_inFlightOriginals.has(card.card_id)) return _inFlightOriginals.get(card.card_id);

  const promise = (async () => {
    const token = await getAccessToken();
    const sb = await getSupabase();

    // 작품 메타 — 한 작품에 카드가 여러 개면 한 번만 채우면 됨
    const workCtx = {
      title: work.title || '', subtitle: work.subtitle || '',
      author: work.author || '', format: work.format || '',
    };

    // 일시 오류(429/503/504/5xx) 는 백오프 후 최대 3회 재시도. 영구 오류(400/401/403) 는 즉시 throw.
    const callTranslate = async (text, field) => {
      if (!text || !String(text).trim()) return null;
      const MAX_ATTEMPTS = 3;
      let lastErr;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch('/api/translate-field', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ text, field, work: workCtx, direction: 'ko2en' }),
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok) return String(body?.translated || '').trim() || null;
          const isRetryable = [408, 429, 500, 502, 503, 504].includes(res.status);
          if (!isRetryable || attempt === MAX_ATTEMPTS) {
            throw new Error(body?.error || `HTTP ${res.status} (${field})`);
          }
          // 지수 백오프 + 약간의 jitter
          await new Promise((r) => setTimeout(r, 600 * attempt + Math.random() * 400));
        } catch (e) {
          lastErr = e;
          // 네트워크 에러(fetch 자체 실패) 도 재시도
          if (attempt === MAX_ATTEMPTS) throw e;
          await new Promise((r) => setTimeout(r, 600 * attempt + Math.random() * 400));
        }
      }
      throw lastErr;
    };

    // 작품 메타 — 비어 있는 *_original 만 채움 (썽크 함수로 감싸 동시성 제어에 넘김)
    const workJobs = [];
    if (!work.title_original    && work.title)    workJobs.push(() => callTranslate(work.title,    'title')   .then((v) => { if (v) work.title_original    = v; return ['title_original',    v]; }));
    if (!work.subtitle_original && work.subtitle) workJobs.push(() => callTranslate(work.subtitle, 'subtitle').then((v) => { if (v) work.subtitle_original = v; return ['subtitle_original', v]; }));
    if (!work.author_original   && work.author)   workJobs.push(() => callTranslate(work.author,   'author')  .then((v) => { if (v) work.author_original   = v; return ['author_original',   v]; }));

    // 카드 본문 — 비어 있는 *_original 만 채움
    const cardJobs = [];
    if (!card.quote_original          && card.quote)          cardJobs.push(() => callTranslate(card.quote,          'quote')         .then((v) => { if (v) card.quote_original          = v; return ['quote_original',          v]; }));
    if (!card.script_excerpt_original && card.script_excerpt) cardJobs.push(() => callTranslate(card.script_excerpt, 'script_excerpt').then((v) => { if (v) card.script_excerpt_original = v; return ['script_excerpt_original', v]; }));
    if (!card.excerpt_description_original && card.excerpt_description)
      cardJobs.push(() => callTranslate(card.excerpt_description, 'excerpt_description').then((v) => { if (v) card.excerpt_description_original = v; return ['excerpt_description_original', v]; }));
    if (!card.significance_original && card.significance)
      cardJobs.push(() => callTranslate(card.significance, 'significance').then((v) => { if (v) card.significance_original = v; return ['significance_original', v]; }));
    // 키워드 — 배열 → 쉼표 join → 번역 → 다시 split. 같은 개수·순서 가정.
    if ((!card.keywords_original || !card.keywords_original.length) && Array.isArray(card.keywords) && card.keywords.length) {
      cardJobs.push(() => callTranslate(card.keywords.join(', '), 'keywords').then((v) => {
        if (!v) return ['keywords_original', null];
        const arr = v.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
        if (arr.length) card.keywords_original = arr;
        return ['keywords_original', arr.length ? arr : null];
      }));
    }

    // 동시 3개씩 처리 (Anthropic 레이트 보호). 개별 실패해도 settled 로 결과 수집.
    const allJobs = [...workJobs, ...cardJobs];
    const settled = await _runWithConcurrency(allJobs, 3);
    const workCount = workJobs.length;

    // 성공한 것만 골라 DB 백필 (실패는 다음 클릭에서 다시 시도하면 됨)
    const fulfilled = (arr) => arr.filter((r) => r && r.status === 'fulfilled' && r.value && r.value[1]).map((r) => r.value);
    const workUpdate = Object.fromEntries(fulfilled(settled.slice(0, workCount)));
    const cardUpdate = Object.fromEntries(fulfilled(settled.slice(workCount)));

    if (Object.keys(workUpdate).length > 0) {
      try {
        await sb.from('works').update(workUpdate).eq('work_id', card.work_id);
        state.rows.forEach((r) => {
          if (r.work_id === card.work_id && r.works) Object.assign(r.works, workUpdate);
        });
      } catch (e) { console.warn('[library] works update failed:', e?.message); }
    }
    if (Object.keys(cardUpdate).length > 0) {
      try {
        await sb.from('cards').update(cardUpdate).eq('card_id', card.card_id);
      } catch (e) { console.warn('[library] cards update failed:', e?.message); }
    }

    // 실패한 필드는 콘솔에 남겨 디버깅 용이 (사용자에겐 노출 안 함 — 다음 클릭이나 다음 로드에 자연 보충)
    const failed = settled.filter((r) => r && r.status === 'rejected');
    if (failed.length) {
      console.warn(`[library] ${failed.length}/${settled.length} translations failed (will retry on next click/load):`,
        failed.map((r) => r.reason?.message || r.reason).join(' | '));
    }
  })();

  _inFlightOriginals.set(card.card_id, promise);
  try { await promise; } finally { _inFlightOriginals.delete(card.card_id); }
}

// ↻ KO 버튼: 영문 칸의 값을 한국어로 재번역해 좌측 짝꿍 input/textarea 에 채워준다.
// data-translate-for 속성으로 영문 칸 셀렉터를, data-field 로 백엔드 가이드(필드명)를 받는다.
function wireTranslateButtons(root, work) {
  root.querySelectorAll('.lib-translate-btn').forEach((btn) => {
    const enSelector = btn.dataset.translateFor;
    const field = btn.dataset.field;
    if (!enSelector || !field) return;
    btn.addEventListener('click', async () => {
      const enEl = root.querySelector(enSelector);
      if (!enEl) return;
      const enText = (enEl.value || '').trim();
      if (!enText) { toast('영문 칸이 비어 있어요.', 'info'); return; }

      // 좌측 짝꿍 — `.lib-edit-foo-original` 의 `-original` 을 떼면 한국어 칸
      const koSelector = enSelector.replace(/-original$/, '');
      const koEl = root.querySelector(koSelector);
      if (!koEl) return;

      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⋯';
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/translate-field', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text: enText, field, work }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        const translated = String(body?.translated || '').trim();
        if (!translated) throw new Error('번역 결과 비어 있음');
        koEl.value = translated;
        koEl.dispatchEvent(new Event('input', { bubbles: true }));
        toast('재번역 완료 ✓', 'success');
      } catch (err) {
        console.error('[library] translate-field failed:', err);
        toast(`재번역 실패: ${err.message || err}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  });
}

async function onDelete(card) {
  const preview = (card.quote || '').slice(0, 30) || `카드 ${card.card_id}`;
  if (!confirm(`"${preview}${(card.quote || '').length > 30 ? '⋯' : ''}" 카드를 DB에서 영구 삭제할까요?\n\n복구할 수 없습니다.`)) return;
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

libraryFormatFilter?.addEventListener('change', () => {
  state.formatFilter = libraryFormatFilter.value;
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

// '영문 없음' 필터 — 영문 원본이 하나라도 빠진 카드만 표시. 토글.
libraryMissingEnFilterBtn?.addEventListener('click', () => {
  state.missingEnOnly = !state.missingEnOnly;
  libraryMissingEnFilterBtn.setAttribute('aria-pressed', state.missingEnOnly ? 'true' : 'false');
  // 활성화 시 강조 (amber 톤 — 백필 버튼과 시각적으로 연관)
  libraryMissingEnFilterBtn.classList.toggle('bg-amber-100', state.missingEnOnly);
  libraryMissingEnFilterBtn.classList.toggle('border-amber-600', state.missingEnOnly);
  libraryMissingEnFilterBtn.classList.toggle('text-amber-800', state.missingEnOnly);
  libraryMissingEnFilterBtn.classList.toggle('font-semibold', state.missingEnOnly);
  renderLibrary();
});

// 의의·설명 영문만 집중 백필 — 강화된 재시도 + 상세 실패 로그
libraryBackfillCommentaryBtn?.addEventListener('click', async () => {
  if (!confirm('의의·설명 영문이 비어있는 카드를 모두 찾아 채웁니다.\n재시도 5회로 끈질기게 처리합니다. 진행하시겠어요?')) return;
  libraryBackfillCommentaryBtn.disabled = true;
  const prev = libraryBackfillCommentaryBtn.innerHTML;
  libraryBackfillCommentaryBtn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> 채우는 중⋯';
  try {
    await backfillCommentary();
  } catch (err) {
    console.error('[library] backfill commentary error:', err);
    toast(`의의·설명 백필 실패: ${err.message || err}`, 'error');
  } finally {
    libraryBackfillCommentaryBtn.disabled = false;
    libraryBackfillCommentaryBtn.innerHTML = prev;
  }
});

// 전체 영문 백필 — DB 의 모든 카드에서 *_original 빠진 곳 자동 번역.
libraryBackfillEnBtn?.addEventListener('click', async () => {
  if (!confirm('영문 원본이 빠진 모든 카드에 자동 번역을 추가합니다.\n\n시간이 오래 걸릴 수 있습니다 (카드당 ~5~10초). 진행하시겠어요?')) return;
  libraryBackfillEnBtn.disabled = true;
  const prev = libraryBackfillEnBtn.innerHTML;
  libraryBackfillEnBtn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> 백필 중⋯';
  try {
    await backfillAllCards();
  } catch (err) {
    console.error('[library] backfill all error:', err);
    toast(`전체 백필 실패: ${err.message || err}`, 'error');
  } finally {
    libraryBackfillEnBtn.disabled = false;
    libraryBackfillEnBtn.innerHTML = prev;
  }
});

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

// 카드 텍스트에 사용자 입력 굵게 마커(**...**) 를 <strong>...</strong> 로 렌더.
// HTML escape 후 처리하므로 임의 HTML 주입 안전.
function renderMarkdownBold(text) {
  return escapeHtml(text).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
}
// 이미 escape + 다른 변환(<strong>)이 끝난 HTML 문자열 위에 **...** 만 추가 변환.
// boldSpeakerLines / formatPoemScript 결과 위에 사용.
function applyMarkdownBoldOnHtml(html) {
  return String(html).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
}

// 편집 textarea 의 현재 선택 영역을 ** 로 토글 감싸기.
// - 선택 없으면 커서 위치에 **굵게** 삽입 후 안쪽 글자 선택.
// - 이미 양 끝이 ** 로 감싸졌으면 풀어줌(토글).
function toggleBoldOnTextarea(ta) {
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const value = ta.value;
  if (s === e) {
    const placeholder = '굵게';
    const next = value.slice(0, s) + '**' + placeholder + '**' + value.slice(e);
    ta.value = next;
    ta.focus();
    ta.setSelectionRange(s + 2, s + 2 + placeholder.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const selected = value.slice(s, e);
  // 토글: 이미 **...** 로 감싸졌으면 벗기기
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

// 편집 노드의 모든 .lib-bold-btn 과 대응 textarea 에 핸들러 + Ctrl/Cmd+B 단축키 부착.
function wireBoldButtons(root) {
  root.querySelectorAll('.lib-bold-btn').forEach((btn) => {
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
// 산문(novel/essay)은 추출 당시 절(쉼표)마다 줄바꿈이 들어가 토막나 보인다.
// 절 단위 줄바꿈은 공백으로 펴고, 따옴표로 감싸 문장부호(. ! ? …)로 끝나는 대사는
// 위·아래 빈 줄을 넣어 별도 단락으로 분리한다. 그 외 서술은 문장 끝(. ! ? …)마다
// 줄을 끊어 '한 문장 = 한 줄'로 만든다. (강조용 짧은 따옴표 "정의"처럼 끝에 문장부호가 없으면 분리 안 함.)
// 단락(빈 줄) 구분은 보존. (시/대본은 줄바꿈이 의미를 가지므로 제외 — 기존 cleanForDisplay 경로.)
const PROSE_FORMATS = new Set(['novel', 'essay', 'prose']);
function isProseFormat(fmt) {
  return PROSE_FORMATS.has(String(fmt || '').toLowerCase());
}
function flowProseScript(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    // 소설 대사 표기 「」 → 큰따옴표 “”. 아래 대사 단락 분리 로직이 “” 기준이라 변환 후 동일 처리됨.
    .replace(/「/g, '“').replace(/」/g, '”')
    // em-dash 변형·연속 하이픈(--)은 산문에서 끊김 표기 잔여물 → 공백으로
    .replace(/[—–―─━‐‑‒ㅡー﹘﹣－]+/g, ' ')
    .replace(/-{2,}/g, ' ')
    .split(/\n{2,}/)
    .map((p) => {
      // 절 줄바꿈을 공백으로 편 뒤, 따옴표 대사(문장부호로 끝남)를 별도 단락으로 분리.
      const flowed = p
        .replace(/[ \t]*\n[ \t]*/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
        .replace(/\s*([“"][^”"]*[.!?…][”"])\s*/g, '\n\n$1\n\n');
      // 각 조각(서술/대사)을 문장 끝마다 줄바꿈 → 한 문장 = 한 줄.
      return flowed
        .split('\n')
        .map((line) => line.trim().replace(/([.!?…])\s+/g, '$1\n'))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\n+$/g, '');
    })
    .filter(Boolean)
    .join('\n\n');
}

// 시(poem)는 행·연이 곧 의미다. 산문처럼 단락을 잇거나 화자를 굵게 만들지 않고,
// 줄바꿈만 정규화해(3줄 이상 빈 줄 → 연 구분 1줄) 행·연 구조를 그대로 보존한다.
function formatPoemScript(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

function cleanForDisplay(s, characterNames) {
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
  //     께/께서는 존경형 격조사.
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
    // 줄 머리에서 첫 한글/영문 토큰 추출 (공백 또는 줄끝으로 종료)
    const headM = line.match(/^([가-힣A-Za-z]{2,7}[0-9]?)(?=\s|$)/);
    if (headM) {
      const word = headM[1];
      // 조사로 끝나는 단어는 narrative 주어로 보고 카운트 안 함
      // (2글자 대명사+조사 "나는/그는/너는" 등도 제외해야 하므로 길이 제한 없음)
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
  // 화자명은 항상 "블록 첫 줄"(빈 줄 다음 또는 맨 첫 줄)에 온다 — 대사 중간에 인물
  // 이름이 한 줄로 나와도(부르거나 외치는 경우) 화자로 오인해 볼드하지 않도록 위치를 함께 본다.
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const safe = escapeHtml(line);
    const t = line.trim();
    if (!t) return safe;
    const isBlockStart = i === 0 || lines[i - 1].trim() === '';
    if (!isBlockStart) return safe;
    // 괄호 지문 단서가 붙은 경우 이름 부분만 떼서 비교 ("카르멘 (살짝)" → "카르멘")
    const namePart = t.split('(')[0].trim();
    const isSpeaker = nameSet.has(t) || nameSet.has(namePart);
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
        <div class="app-excerpt">${String(work.format || '').toLowerCase() === 'poem' ? escapeHtml(formatPoemScript(card.script_excerpt || '')) : isProseFormat(work.format) ? escapeHtml(flowProseScript(card.script_excerpt || '')) : boldSpeakerLines(cleanForDisplay(card.script_excerpt || '', work.characters), work.characters)}</div>
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
