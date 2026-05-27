// Daily Script SPA — Android HomeScreen/ArchiveScreen/SettingsScreen/DetailScreen port
import { getSupabase } from '/assets/supabase-client.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- DOM ----------
const topBarHome = $('#top-bar-home');
const topBarSettings = $('#top-bar-settings');

const viewHome = $('#view-home');
const viewArchive = $('#view-archive');
const viewSettings = $('#view-settings');

const homeLoading = $('#home-loading');
const homeContent = $('#home-content');
const homeDate = $('#home-date');
const homeRefresh = $('#home-refresh');
const homeError = $('#home-error');
const todayCard = $('#today-card');
const todayChips = $('#today-chips');
const todaySpeaker = $('#today-speaker');
const todaySpeakerSpacer = $('#today-speaker-spacer');
const todayWork = $('#today-work');
const todayWorkSpacer = $('#today-work-spacer');
const todayQuote = $('#today-quote');
const todayKeywords = $('#today-keywords');
const todayBookmark = $('#today-bookmark');
const todayRead = $('#today-read');
const homeBookmarksList = $('#home-bookmarks-list');

const archiveLoading = $('#archive-loading');
const archiveShelves = $('#archive-shelves');
const archiveEmpty = $('#archive-empty');
const archiveNoResult = $('#archive-no-result');
const archiveCount = $('#archive-count');
const archiveSearchInput = $('#archive-search-input');
const archiveChips = $('#archive-chips');
const bookModal = $('#book-modal');
const bookEyebrow = $('#book-eyebrow');
const bookTitleEl = $('#book-title');
const bookMetaEl = $('#book-meta');
const bookList = $('#book-list');
const bookClose = $('#book-close');

const settingsName = $('#settings-name');
const settingsBio = $('#settings-bio');
const pushToggle = $('#push-toggle');
const signOutBtn = $('#sign-out-btn');
const signinBlock = $('#signin-block');
const signinGoogle = $('#signin-google');
const signinKakao = $('#signin-kakao');
const tasteToggle = $('#taste-toggle');
const tasteProfileEl = $('#taste-profile');
const themeToggle = $('#theme-toggle');
const themeSubtitle = $('#theme-subtitle');
const editNicknameBtn = $('#edit-nickname-btn');
const nicknameModal = $('#nickname-modal');
const nicknameInput = $('#nickname-input');
const nicknameSaveBtn = $('#nickname-save');
const nicknameCancelBtn = $('#nickname-cancel');
const nicknameRandomizeBtn = $('#nickname-randomize');

const detailScreen = $('#detail-screen');
const detailBack = $('#detail-back');
const detailWorkTitle = $('#detail-work-title');
const detailBookmark = $('#detail-bookmark');
const detailMeta = $('#detail-meta');
const detailDescription = $('#detail-description');
const detailDescSpacer = $('#detail-desc-spacer');
const detailScript = $('#detail-script');
const detailSignificanceBlock = $('#detail-significance-block');
const detailSignificance = $('#detail-significance');
const detailCollectBtn = $('#detail-collect-btn');
const detailEdition = $('#detail-edition');

const toastEl = $('#toast');

// ---------- State ----------
const state = {
  userId: null,
  authUid: null,
  isAnonymous: true,        // 익명 세션인지
  authProvider: null,       // 'google' | 'kakao' | null
  authEmail: null,
  authName: null,
  authAvatarUrl: null,
  userNickname: '',         // public.users.nickname — 사용자가 수정 가능한 표시 이름
  todayCard: null,
  todayBookmarked: false,
  allCards: [],
  bookmarks: [],            // raw bookmark rows
  bookmarkedIds: new Set(),
  currentView: 'home',
  detailCardId: null,
  pushEnabled: false,
  bookmarkActionInFlight: false,
  archiveSearch: '',
  archiveGenre: '',        // '' = all, or 'movie'|'drama'|'musical'|'opera'|'play'
  recentlyShownIds: [],    // 오늘의 명대사 셔플 시 최근 10개 제외용 큐
};

// 표시용 제목 정규화 — DB 원본은 그대로 두고 화면에만 적용.
// 키는 '구분자 제거 + lowercase' 형태로 보관해서 '아,저,씨' '아·저·씨' '아 . 저 . 씨' 등 모든 변형 매칭.
// ===== 귀여운 익명 닉네임 생성기 =====
// 형용사구 + 동물/별명 조합. 예: '책 읽는 토끼', '서점에 간 안경잡이'
const NICKNAME_ADJECTIVES = [
  '서점에 간', '책 좋아하는', '연극에 빠진', '희곡에 매료된', '책 읽는',
  '도서관 가는', '글 쓰는', '시 쓰는', '각본 쓰는', '무대 위의',
  '책장 사이의', '독서하는', '대본 외우는', '극장 가는', '명대사 모으는',
  '소설 좋아하는', '문장 모으는', '활자에 빠진', '책 향기 맡는', '편지 쓰는',
];
const NICKNAME_NOUNS = [
  '안경잡이', '부끄럼쟁이', '매력쟁이', '호랑이', '토끼',
  '여우', '고양이', '기린', '곰', '사슴',
  '두루미', '독수리', '늑대', '판다', '코알라',
  '돌고래', '학자', '낭만가', '몽상가', '여행자',
];
function randomCuteNickname() {
  const adj = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
  const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
  return `${adj} ${noun}`;
}

const TITLE_DISPLAY_ALIASES = {
  'titanic': '타이타닉',
  '아저씨': '아저씨',
};
function displayTitle(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t) return t;
  const lc = t.toLowerCase();
  if (TITLE_DISPLAY_ALIASES[lc]) return TITLE_DISPLAY_ALIASES[lc];
  // 구두점/공백 제거 후 다시 매칭 (아,저,씨 / 아·저·씨 / 아 . 저 . 씨 등 모두 정규화)
  const stripped = lc.replace(/[^\p{L}\p{N}]/gu, '');
  if (stripped && TITLE_DISPLAY_ALIASES[stripped]) {
    return TITLE_DISPLAY_ALIASES[stripped];
  }
  return t;
}

// script_excerpt 첫 부분에서 화자명 추출.
// 1순위: works.characters 배열과 라인 시작 매칭 (가장 정확)
// 2순위: "이름: 대사" / "이름 - 대사" 콜론·대시 패턴 — 콜론 앞 20자 미만
function extractSpeaker(scriptExcerpt, characters) {
  if (!scriptExcerpt) return '';
  const lines = String(scriptExcerpt).split('\n');
  // 긴 이름 우선 정렬 — "줄리엣의 유모"가 "줄리엣"보다 먼저 매칭되도록
  const names = (Array.isArray(characters) ? characters : [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 1) characters 매칭 — 라인 시작이 등장인물 이름 + 비-식별자 문자
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 한글에는 \b가 동작 안 함 → lookahead로 다음 문자가 한글/영문/숫자가 아닌지 확인
      const re = new RegExp(`^${escaped}(?![가-힣A-Za-z0-9])`);
      if (re.test(line)) return name;
    }
    // 2) 콜론·세미콜론·대시 패턴 폴백
    const m = line.match(/^([^\n:：—\-]{1,20})\s*[:：]\s*\S/);
    if (m) {
      return m[1].replace(/\s*[(（].*?[)）]\s*$/, '').trim();
    }
    // 첫 비어있지 않은 줄에서 매칭 실패 시 지문일 가능성이 높음 — 종료
    break;
  }
  return '';
}

// ---------- Init ----------
(async () => {
  try {
    state.pushEnabled = localStorage.getItem('ds.push') === '1';
    paintPushToggle();
    paintTasteToggle();
    paintThemeToggle();
    loadRecentlyShownFromStorage();
    await bootstrapAuth();
    paintAuthIdentity();
    await Promise.all([loadAllCards(), loadBookmarks()]);
    paintTasteProfile();
    renderHome();
    // 초기 setView — history에 중복 entry 안 쌓이게 suppress 후 replaceState로 마무리
    suppressPushState = true;
    setView(getInitialView());
    suppressPushState = false;
    history.replaceState({ tab: state.currentView }, '', '#' + state.currentView);
    // 데이터 변경을 실시간으로 받아 즉시 반영
    subscribeToChanges();
    // 앱이 포그라운드로 돌아올 때마다 최신화 (실시간 누락 안전망)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshAll();
    });
  } catch (err) {
    console.error('[m] bootstrap failed:', err);
    homeLoading.innerHTML = `<p class="t-body-md c-cta">초기화 실패: ${escapeHtml(err.message || String(err))}</p>`;
  }
})();

function getInitialView() {
  const hash = (location.hash || '').replace('#', '');
  return ['home','archive','settings'].includes(hash) ? hash : 'home';
}
window.addEventListener('hashchange', () => setView(getInitialView()));

// ===== Hardware/swipe back (Android edge swipe, iOS swipe-from-edge) =====
// 우선순위: detail screen 닫기 → book modal 닫기 → tab 이동
window.addEventListener('popstate', () => {
  if (detailScreen && detailScreen.classList.contains('open')) {
    closeDetailInternal();
    return;
  }
  if (bookModal && bookModal.classList.contains('open')) {
    closeBookModalInternal();
    return;
  }
  // tab 이동 — pushState 중복 방지
  suppressPushState = true;
  setView(getInitialView());
  suppressPushState = false;
});

// ---------- Realtime ----------
// Supabase Postgres Changes — cards/works/user_bookmarks 변경을 실시간으로 듣고
// 영향받는 데이터를 다시 불러와 화면을 갱신한다.
// iOS PWA 환경에서 WebSocket이 끊기는 경우가 있어 30초 폴링 폴백도 둠.
let realtimeChannel = null;
let pollingTimer = null;
let lastCardCount = 0;
let lastBookmarkCount = 0;
let realtimeIsHealthy = false;

function startPollingFallback() {
  if (pollingTimer) return;
  console.log('[m] starting polling fallback (30s)');
  pollingTimer = setInterval(async () => {
    if (document.hidden) return;
    if (realtimeIsHealthy) return; // realtime이 살아있으면 폴링 스킵
    try {
      const sb = await getSupabase();
      const { count: cardCount } = await sb.from('cards').select('*', { count: 'exact', head: true });
      let bookmarkCount = lastBookmarkCount;
      if (state.userId) {
        const { count: bc } = await sb.from('user_bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', state.userId);
        bookmarkCount = bc || 0;
      }
      if (cardCount !== lastCardCount || bookmarkCount !== lastBookmarkCount) {
        console.log('[m] polling detected change — reloading');
        lastCardCount = cardCount;
        lastBookmarkCount = bookmarkCount;
        await Promise.all([loadAllCards(), loadBookmarks()]);
        rerenderActiveView();
        toast('데이터 갱신됨');
      }
    } catch (err) {
      console.warn('[m] polling check failed:', err);
    }
  }, 30000);
}
async function subscribeToChanges() {
  try {
    const sb = await getSupabase();
    if (realtimeChannel) {
      try { await sb.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
    console.log('[m] realtime: subscribing… userId=', state.userId);
    let ch = sb
      .channel('ds-public-changes-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, async (payload) => {
        console.log('[m] realtime cards event:', payload.eventType);
        await loadAllCards();
        rerenderActiveView();
        toast('데이터 갱신됨');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'works' }, async (payload) => {
        console.log('[m] realtime works event:', payload.eventType);
        await loadAllCards();
        rerenderActiveView();
      });
    if (state.userId != null) {
      ch = ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_bookmarks', filter: `user_id=eq.${state.userId}` },
        async (payload) => {
          console.log('[m] realtime user_bookmarks event:', payload.eventType);
          await loadBookmarks();
          rerenderActiveView();
        }
      );
    }
    realtimeChannel = ch;
    ch.subscribe((status, err) => {
      console.log('[m] realtime subscription status:', status, err || '');
      setRealtimeStatus(status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // 5초 후 재구독 시도
        setTimeout(() => {
          if (state.currentView) subscribeToChanges();
        }, 5000);
      }
    });
  } catch (err) {
    console.warn('[m] subscribeToChanges failed (계속 진행):', err);
    setRealtimeStatus('FAILED');
  }
}

function setRealtimeStatus(status) {
  const dot = document.getElementById('rt-status-dot');
  const label = document.getElementById('rt-status-label');
  if (!dot || !label) return;
  if (status === 'SUBSCRIBED') {
    dot.style.background = '#1a7f37';  // green
    label.textContent = 'LIVE';
    label.title = '실시간 동기화 활성';
    realtimeIsHealthy = true;
  } else if (status === 'CONNECTING' || status === 'JOINING') {
    dot.style.background = '#F4C20D';  // yellow
    label.textContent = 'CONNECTING';
    realtimeIsHealthy = false;
  } else {
    dot.style.background = '#D85A30';  // orange/red
    label.textContent = 'SYNC';
    label.title = '폴링 모드 (30초 주기) — 실시간 비활성. 006_enable_realtime.sql 실행 권장';
    realtimeIsHealthy = false;
    startPollingFallback();
  }
}

function rerenderActiveView() {
  if (state.currentView === 'home') {
    // 오늘의 카드 다시 뽑되, 사용자가 셔플 중이면 그대로 두기 — 단순화: 항상 today 재계산
    renderHome();
  } else if (state.currentView === 'archive') {
    renderArchive();
  }
}

async function refreshAll() {
  try {
    await Promise.all([loadAllCards(), loadBookmarks()]);
    rerenderActiveView();
  } catch (err) {
    console.warn('[m] refreshAll failed:', err);
  }
}

// ---------- Pull-to-refresh ----------
(function setupPullToRefresh() {
  const ptr = document.getElementById('ptr');
  const ptrCircle = ptr?.querySelector('.ptr-circle');
  const ptrLabel = document.getElementById('ptr-label');
  if (!ptr || !ptrCircle || !ptrLabel) return;

  const THRESHOLD = 70;       // 이만큼 당기면 트리거
  const MAX_PULL = 140;       // 시각적으로 더는 늘어나지 않음
  let startY = 0;
  let pulling = false;
  let pulledBy = 0;
  let refreshing = false;
  // 모달이 열려있을 땐 PTR 비활성
  function isLocked() {
    return refreshing
      || document.getElementById('detail-screen')?.classList.contains('open');
  }

  document.addEventListener('touchstart', (e) => {
    if (isLocked()) return;
    if (window.scrollY > 0) return;        // 페이지 최상단일 때만
    startY = e.touches[0].clientY;
    pulling = true;
    pulledBy = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling || isLocked()) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { resetPtr(); return; }
    // 끌어내리는 거리 계산 (점점 둔감해지게)
    pulledBy = Math.min(MAX_PULL, dy * 0.55);
    paintPtr(pulledBy);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (pulledBy >= THRESHOLD) {
      triggerRefresh();
    } else {
      resetPtr();
    }
  }, { passive: true });

  function paintPtr(distance) {
    ptr.style.transform = `translateY(${Math.max(0, distance - 12)}px)`;
    ptr.classList.add('visible');
    const progress = Math.min(1, distance / THRESHOLD);
    ptrCircle.style.transform = `rotate(${progress * 360}deg)`;
    ptrLabel.textContent = progress >= 1 ? 'Release to refresh' : 'Pull to refresh';
  }
  function resetPtr() {
    ptr.classList.remove('visible', 'refreshing');
    ptr.style.transform = '';
    pulledBy = 0;
  }
  async function triggerRefresh() {
    refreshing = true;
    ptr.classList.add('refreshing');
    ptrLabel.textContent = 'Refreshing⋯';
    ptr.style.transform = `translateY(${THRESHOLD - 12}px)`;
    try {
      await refreshAll();
      toast('갱신됨');
    } catch (err) {
      console.warn('[m] PTR refresh failed:', err);
      toast('갱신 실패');
    } finally {
      // 짧게 보여주고 닫기
      setTimeout(() => {
        refreshing = false;
        resetPtr();
      }, 350);
    }
  }
})();

// ---------- Auth ----------
async function bootstrapAuth() {
  const sb = await getSupabase();
  const { data: { session: existing } } = await sb.auth.getSession();
  let session = existing;
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw new Error(`익명 로그인 실패: ${error.message}`);
    session = data?.session ?? null;
  }
  const user = session?.user;
  state.authUid = user?.id ?? null;
  if (!state.authUid) throw new Error('auth uid 없음');

  // 소셜 인증 정보 추출 (provider, identity 데이터)
  state.isAnonymous = !!user.is_anonymous;
  state.authProvider = user.app_metadata?.provider ?? null;
  state.authEmail = user.email ?? null;
  const meta = user.user_metadata || {};
  state.authName = meta.full_name || meta.name || meta.nickname || meta.user_name || null;
  state.authAvatarUrl = meta.avatar_url || meta.picture || null;

  // users 행 조회/생성
  const { data: existingUser, error: selErr } = await sb
    .from('users').select('user_id, nickname')
    .eq('anonymous_id', state.authUid).maybeSingle();
  if (selErr) throw selErr;
  if (existingUser) {
    state.userId = existingUser.user_id;
    state.userNickname = existingUser.nickname || '';
    // 닉네임이 비어있는 익명 유저는 backfill — 귀여운 이름 자동 부여
    if (!state.userNickname && state.isAnonymous) {
      const generated = randomCuteNickname();
      const { data: upd } = await sb.from('users')
        .update({ nickname: generated })
        .eq('user_id', state.userId)
        .select('nickname').single();
      state.userNickname = upd?.nickname || generated;
    }
    return;
  }
  // 신규 user — 이전 익명 닉네임(있다면) 또는 OAuth 이름 또는 자동 닉네임
  const carriedNickname = localStorage.getItem('ds.carryNickname') || '';
  const startingNickname = carriedNickname || state.authName || randomCuteNickname();
  const { data: inserted, error: insErr } = await sb
    .from('users')
    .insert({
      anonymous_id: state.authUid,
      nickname: startingNickname,
    })
    .select('user_id, nickname').single();
  if (insErr) throw insErr;
  state.userId = inserted.user_id;
  state.userNickname = inserted.nickname || startingNickname;
  // 이전 닉네임 carry over 완료 → 정리
  if (carriedNickname) localStorage.removeItem('ds.carryNickname');

  // 소셜 로그인 직후라면 이전 익명 user_id의 북마크를 옮긴다
  if (!state.isAnonymous) {
    const prevAnonUserId = localStorage.getItem('ds.prevAnonUserId');
    if (prevAnonUserId && prevAnonUserId !== String(state.userId)) {
      await migrateAnonymousBookmarks(parseInt(prevAnonUserId, 10), state.userId);
      localStorage.removeItem('ds.prevAnonUserId');
    }
  } else {
    // 익명 user_id 기억 — 나중에 소셜 로그인 시 이전 익명 데이터 이전용
    localStorage.setItem('ds.prevAnonUserId', String(state.userId));
  }
}

async function migrateAnonymousBookmarks(oldUserId, newUserId) {
  if (!oldUserId || oldUserId === newUserId) return;
  try {
    const sb = await getSupabase();
    const { data: oldBookmarks } = await sb
      .from('user_bookmarks').select('card_id').eq('user_id', oldUserId);
    if (oldBookmarks && oldBookmarks.length > 0) {
      const rows = oldBookmarks.map((b) => ({ user_id: newUserId, card_id: b.card_id }));
      await sb.from('user_bookmarks')
        .upsert(rows, { onConflict: 'user_id,card_id', ignoreDuplicates: true });
      // 옛 익명 row + 북마크 정리 (RLS가 anonymous_id 매칭만 허용해 실패할 수 있음 — 무시)
      await sb.from('user_bookmarks').delete().eq('user_id', oldUserId);
      await sb.from('users').delete().eq('user_id', oldUserId);
      toast(`북마크 ${oldBookmarks.length}개 이전됨`);
    }
  } catch (err) {
    console.warn('[m] migration failed:', err);
  }
}

// ---------- Data ----------
async function loadAllCards() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('cards')
    .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, works(work_id, title, format, author, release_year, characters)')
    .order('card_id', { ascending: false }).limit(500);
  if (error) throw error;
  state.allCards = Array.isArray(data) ? data : [];
}

async function loadBookmarks() {
  if (!state.userId) return;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('user_bookmarks')
    .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, significance, works(work_id, title, format, author, release_year))')
    .eq('user_id', state.userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[m] bookmarks load failed:', error); return; }
  state.bookmarks = Array.isArray(data) ? data : [];
  state.bookmarkedIds = new Set(state.bookmarks.map((b) => b.card_id));
}

// ---------- Today's card / 추천 ----------
function getTodaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function isTasteEnabled() {
  return localStorage.getItem('ds.taste') === '1';
}

/**
 * 북마크 카드들의 온도/강도 평균으로 사용자 취향 프로파일을 구성.
 * 카드의 temperature/intensity 가 숫자가 아니면 무시.
 */
function computeTasteProfile() {
  const bookmarkedCards = (state.bookmarks || [])
    .map((b) => b.cards)
    .filter(Boolean);
  if (bookmarkedCards.length === 0) return null;
  let sumT = 0, sumI = 0, nT = 0, nI = 0;
  for (const c of bookmarkedCards) {
    if (typeof c.temperature === 'number') { sumT += c.temperature; nT++; }
    if (typeof c.intensity === 'number')   { sumI += c.intensity;   nI++; }
  }
  if (nT === 0 && nI === 0) return null;
  return {
    avgTemperature: nT > 0 ? sumT / nT : null,
    avgIntensity:   nI > 0 ? sumI / nI : null,
    count: bookmarkedCards.length,
  };
}

/** taste 프로파일과 카드 간 거리 (작을수록 비슷). */
function tasteDistance(card, taste) {
  let sum = 0, dims = 0;
  if (taste.avgTemperature != null && typeof card.temperature === 'number') {
    const d = card.temperature - taste.avgTemperature;
    sum += d * d; dims++;
  }
  if (taste.avgIntensity != null && typeof card.intensity === 'number') {
    const d = card.intensity - taste.avgIntensity;
    sum += d * d; dims++;
  }
  if (dims === 0) return Infinity;
  return Math.sqrt(sum);
}

/**
 * 시드 기반 결정론적 + taste 가중 선택.
 *  - taste 프로파일 없거나 candidate 없으면 시드 모듈로 폴백
 *  - seed % 10 === 0 인 날(10%)엔 variety로 먼 카드도 허용
 *  - 그 외 90% 는 상위 30% 유사 카드 풀에서 시드 모듈로 선택
 */
function pickByTasteSeeded(seed) {
  if (state.allCards.length === 0) return null;
  const taste = computeTasteProfile();
  if (!taste) return state.allCards[Math.abs(seed) % state.allCards.length];

  const candidates = state.allCards.filter(
    (c) => typeof c.temperature === 'number' || typeof c.intensity === 'number'
  );
  if (candidates.length === 0) return state.allCards[Math.abs(seed) % state.allCards.length];

  const sorted = candidates.slice().sort((a, b) => tasteDistance(a, taste) - tasteDistance(b, taste));
  const variety = (Math.abs(seed) % 10) === 0;
  const pool = variety
    ? sorted.slice(Math.floor(sorted.length * 0.3))   // 멀리 있는 70%에서 (가끔 변형)
    : sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.3)));  // 가까운 30%만
  return pool[Math.abs(seed) % pool.length];
}

/**
 * 비시드 (refresh) — 매번 다른 카드를 보여주되 taste 가중.
 *  - 10% 확률로 pure random (variety)
 *  - 그 외 90%는 거리 역수로 가중 랜덤
 */
function pickByTasteRandom() {
  if (state.allCards.length === 0) return null;
  const taste = computeTasteProfile();
  const exclude = new Set(state.recentlyShownIds);

  // taste 프로파일 없을 때 — 단순 랜덤 + 최근 제외
  if (!taste) {
    const pool = candidatesExcludingRecent();
    const p = pool[Math.floor(Math.random() * pool.length)];
    rememberShown(p?.card_id);
    return p;
  }

  // 10% variety — pure random (단, 최근 제외)
  if (Math.random() < 0.1) {
    const pool = candidatesExcludingRecent();
    const p = pool[Math.floor(Math.random() * pool.length)];
    rememberShown(p?.card_id);
    return p;
  }

  // 거리 역수 가중 — 최근 제외
  let candidates = state.allCards.filter(
    (c) => (typeof c.temperature === 'number' || typeof c.intensity === 'number') && !exclude.has(c.card_id)
  );
  if (candidates.length === 0) {
    // 폴백 — 전체에서 가중 랜덤
    candidates = state.allCards.filter(
      (c) => typeof c.temperature === 'number' || typeof c.intensity === 'number'
    );
  }
  if (candidates.length === 0) {
    const pool = candidatesExcludingRecent();
    const p = pool[Math.floor(Math.random() * pool.length)];
    rememberShown(p?.card_id);
    return p;
  }

  const weights = candidates.map((c) => 1 / (1 + tasteDistance(c, taste)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let picked = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) { picked = candidates[i]; break; }
  }
  rememberShown(picked?.card_id);
  return picked;
}

function pickTodayCard() {
  if (state.allCards.length === 0) return null;
  const seed = getTodaySeed();
  if (isTasteEnabled()) return pickByTasteSeeded(seed);
  return state.allCards[seed % state.allCards.length];
}

// 셔플 시 최근 10개에 있는 카드는 제외 + localStorage 영구 저장
const RECENT_EXCLUDE_SIZE = 10;
const RECENT_STORAGE_KEY = 'ds.recentlyShownIds';

function loadRecentlyShownFromStorage() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) {
      console.log('[m] recent storage empty — fresh start');
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[m] recent storage was not array:', parsed);
      return;
    }
    state.recentlyShownIds = parsed
      .filter((v) => typeof v === 'number')
      .slice(-RECENT_EXCLUDE_SIZE);
    console.log(`[m] recent restored: ${state.recentlyShownIds.length} ids`, state.recentlyShownIds);
  } catch (err) {
    console.warn('[m] loadRecentlyShown failed:', err);
  }
}

function saveRecentlyShownToStorage() {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(state.recentlyShownIds));
  } catch (err) {
    console.warn('[m] saveRecentlyShown failed:', err);
  }
}

// 페이지가 백그라운드/언로드로 갈 때도 한 번 더 저장 (안전망)
window.addEventListener('pagehide', saveRecentlyShownToStorage);
window.addEventListener('beforeunload', saveRecentlyShownToStorage);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveRecentlyShownToStorage();
});

function candidatesExcludingRecent() {
  const exclude = new Set(state.recentlyShownIds);
  const pool = state.allCards.filter((c) => !exclude.has(c.card_id));
  // 풀이 너무 작으면 (전체가 10개 이하) 폴백
  return pool.length > 0 ? pool : state.allCards;
}

function rememberShown(cardId) {
  if (cardId == null) return;
  // dedupe: 이미 큐에 있으면 제거 후 맨 뒤에 다시 추가 (가장 최근 위치)
  const idx = state.recentlyShownIds.indexOf(cardId);
  if (idx >= 0) state.recentlyShownIds.splice(idx, 1);
  state.recentlyShownIds.push(cardId);
  if (state.recentlyShownIds.length > RECENT_EXCLUDE_SIZE) {
    state.recentlyShownIds.shift();
  }
  saveRecentlyShownToStorage();
}

function pickRandomCard() {
  if (state.allCards.length === 0) return null;
  if (isTasteEnabled()) return pickByTasteRandom();
  const pool = candidatesExcludingRecent();
  const picked = pool[Math.floor(Math.random() * pool.length)];
  rememberShown(picked?.card_id);
  return picked;
}

// ---------- Bookmark API ----------
async function toggleBookmark(cardId) {
  if (!state.userId || state.bookmarkActionInFlight) return;
  state.bookmarkActionInFlight = true;
  const sb = await getSupabase();
  const wasBookmarked = state.bookmarkedIds.has(cardId);
  if (wasBookmarked) state.bookmarkedIds.delete(cardId);
  else state.bookmarkedIds.add(cardId);
  paintAllBookmarkButtons(cardId);

  try {
    if (wasBookmarked) {
      const { error } = await sb.from('user_bookmarks').delete()
        .eq('user_id', state.userId).eq('card_id', cardId);
      if (error) throw error;
      state.bookmarks = state.bookmarks.filter((b) => b.card_id !== cardId);
      toast('해제됨');
    } else {
      const { data, error } = await sb.from('user_bookmarks')
        .insert({ user_id: state.userId, card_id: cardId })
        .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, significance, works(work_id, title, format, author, release_year))')
        .single();
      if (error) throw error;
      state.bookmarks = [data, ...state.bookmarks];
      toast('수집됨');
    }
  } catch (err) {
    // revert
    if (wasBookmarked) state.bookmarkedIds.add(cardId);
    else state.bookmarkedIds.delete(cardId);
    paintAllBookmarkButtons(cardId);
    console.error('[m] bookmark error:', err);
    toast('저장 실패');
  } finally {
    state.bookmarkActionInFlight = false;
    if (state.currentView === 'archive') {
      renderArchiveChips();
      renderArchive();
    }
    if (state.currentView === 'home') renderHomeBookmarks();
    if (state.currentView === 'settings') paintTasteProfile();
  }
}

function paintAllBookmarkButtons(cardId) {
  const isBookmarked = state.bookmarkedIds.has(cardId);
  if (state.todayCard?.card_id === cardId) {
    paintBookmarkBtn(todayBookmark, isBookmarked);
    state.todayBookmarked = isBookmarked;
  }
  if (state.detailCardId === cardId) {
    paintBookmarkBtn(detailBookmark, isBookmarked);
    paintDetailCollectBtn(isBookmarked);
  }
}

function paintBookmarkBtn(btn, filled) {
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (!icon) return;
  if (filled) {
    icon.classList.add('icon-filled');
    icon.classList.remove('c-walnut');
    icon.classList.add('c-cta');
  } else {
    icon.classList.remove('icon-filled', 'c-cta');
    icon.classList.add('c-walnut');
  }
}

// ---------- Home ----------
function renderHome() {
  homeLoading.style.display = 'none';
  homeContent.style.display = 'block';

  const d = new Date();
  homeDate.textContent = d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).toUpperCase();

  state.todayCard = pickTodayCard();
  if (!state.todayCard) {
    todayCard.style.display = 'none';
    return;
  }
  applyTodayCard(state.todayCard);
  renderHomeBookmarks();
}

function applyTodayCard(card) {
  if (!card) return;
  state.todayCard = card;
  state.todayBookmarked = state.bookmarkedIds.has(card.card_id);
  // 최근 표시 큐에 추가 (rememberShown이 dedupe + localStorage 저장 처리)
  rememberShown(card.card_id);

  // Quote with curly quotes (mirror Android: "“$it”")
  todayQuote.textContent = `“${cleanQuote(card.quote)}”`;

  // Chips: filled format only
  todayChips.innerHTML = '';
  const format = card.works?.format;
  if (format) {
    const chip = document.createElement('span');
    chip.className = 'chip filled';
    chip.textContent = format;
    todayChips.appendChild(chip);
  }
  const kws = Array.isArray(card.keywords) ? card.keywords : [];

  // Speaker (인용문 위, 볼드) + Work (인용문 아래, "- 작품명")
  const workTitle = displayTitle(card.works?.title || '');
  const speaker = extractSpeaker(card.script_excerpt, card.works?.characters);
  if (speaker) {
    todaySpeaker.textContent = speaker;
    todaySpeaker.style.display = 'block';
    todaySpeakerSpacer.style.height = '12px';
  } else {
    todaySpeaker.style.display = 'none';
    todaySpeakerSpacer.style.height = '0';
  }
  if (workTitle) {
    const fmt = card.works?.format || '';
    const genreLabel = GENRE_LABEL[fmt] || '';
    todayWork.textContent = genreLabel ? `— ${genreLabel} <${workTitle}>` : `— <${workTitle}>`;
    todayWork.style.display = 'block';
    todayWorkSpacer.style.height = '20px';
  } else {
    todayWork.style.display = 'none';
    todayWorkSpacer.style.height = '0';
  }

  // Keyword list (hashtags)
  todayKeywords.innerHTML = '';
  kws.forEach((k) => {
    const span = document.createElement('span');
    span.className = 't-label-sm c-sand';
    span.textContent = `#${k}`;
    todayKeywords.appendChild(span);
  });

  paintBookmarkBtn(todayBookmark, state.todayBookmarked);
}

// '지난 기록' — 새로고침 전 표시됐던 카드 최대 3개
// state.recentlyShownIds 큐에서 현재(맨 뒤)를 제외한 직전 카드들을 가져와 가장 최근 순으로 노출
function renderHomeBookmarks() {
  homeBookmarksList.innerHTML = '';
  const ids = state.recentlyShownIds;
  if (!ids || ids.length <= 1) {
    const p = document.createElement('p');
    p.className = 't-body-md c-walnut';
    p.style.padding = '16px 0';
    p.textContent = '새로고침하면 이전 카드가 여기에 쌓입니다.';
    homeBookmarksList.appendChild(p);
    return;
  }
  // 마지막 = 현재 카드. 그 직전 카드들을 최근 → 과거 순으로.
  const prev = ids.slice(0, -1).reverse().slice(0, 3);
  prev.forEach((id) => {
    const card = state.allCards.find((c) => c.card_id === id);
    if (!card) return;
    homeBookmarksList.appendChild(buildRecentRow(card));
  });
}

function buildRecentRow(card) {
  const wrap = document.createElement('div');
  const node = document.createElement('div');
  node.className = 'bookmark-row';
  const w = card?.works || {};
  const meta = (w.format || '').toUpperCase();
  node.innerHTML = `
    <div style="flex:1;min-width:0;">
      ${meta ? `<p class="t-label-sm c-walnut">${escapeHtml(meta)}</p><div style="height:6px;"></div>` : ''}
      <p class="t-title-lg c-espresso single-line">${escapeHtml(displayTitle(w.title) || '—')}</p>
      <div style="height:4px;"></div>
      <p class="t-body-md c-walnut single-line">${escapeHtml(cleanQuote(card.quote))}</p>
    </div>
    <span class="material-symbols-outlined arrow">arrow_forward_ios</span>
  `;
  node.addEventListener('click', () => openDetail(card));
  wrap.appendChild(node);
  const hr = document.createElement('div');
  hr.className = 'hairline';
  wrap.appendChild(hr);
  return wrap;
}

function buildBookmarkRow(row) {
  const wrap = document.createElement('div');
  const node = document.createElement('div');
  node.className = 'bookmark-row';

  const card = row.cards;
  const w = card?.works || {};
  const metaParts = [formatBookmarkDate(row.created_at), w.format].filter(Boolean);
  const meta = metaParts.join('  —  ').toUpperCase();

  node.innerHTML = `
    <div style="flex:1;min-width:0;">
      ${meta ? `<p class="t-label-sm c-walnut">${escapeHtml(meta)}</p><div style="height:6px;"></div>` : ''}
      <p class="t-title-lg c-espresso single-line">${escapeHtml(displayTitle(w.title) || '—')}</p>
      <div style="height:4px;"></div>
      <p class="t-body-md c-walnut single-line">${escapeHtml(cleanQuote(card.quote))}</p>
    </div>
    <span class="material-symbols-outlined arrow">arrow_forward_ios</span>
  `;
  node.addEventListener('click', () => openDetail(card));
  wrap.appendChild(node);
  const hr = document.createElement('div');
  hr.className = 'hairline';
  wrap.appendChild(hr);
  return wrap;
}

function formatBookmarkDate(iso) {
  if (!iso) return '';
  try {
    const datePart = String(iso).slice(0, 10);
    const [, m, d] = datePart.split('-');
    return `${parseInt(m, 10)}. ${parseInt(d, 10)}`;
  } catch { return ''; }
}

todayBookmark.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!state.todayCard) return;
  toggleBookmark(state.todayCard.card_id);
});
todayCard.addEventListener('click', () => {
  if (state.todayCard) openDetail(state.todayCard);
});
todayRead.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.todayCard) openDetail(state.todayCard);
});
homeRefresh.addEventListener('click', () => {
  applyTodayCard(pickRandomCard());
  renderHomeBookmarks();  // '지난 기록' 갱신 (직전 카드가 추가됨)
});

// ---------- Archive ----------
// ---------- Archive: bookshelf grouped by genre ----------
const GENRE_ORDER = ['movie', 'drama', 'musical', 'opera', 'play'];
const GENRE_LABEL = {
  movie: '영화',
  drama: '드라마',
  musical: '뮤지컬',
  opera: '오페라',
  play: '연극',
};
// 작품 제목 해시 → 고정 가죽 색상 (같은 작품엔 항상 같은 책등 색)
const LEATHER_PALETTE = [
  '#0E0C0A', '#5A2A24', '#2F3A30', '#293541',
  '#6A4A30', '#40303B', '#3A463F', '#1F2A3A',
  '#4A2B1A', '#3D2E22', '#26393B', '#2E2538',
];
function leatherColorFor(title) {
  const t = String(title || '');
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return LEATHER_PALETTE[Math.abs(h) % LEATHER_PALETTE.length];
}

// 시리즈 패턴 감지 — 제목 키워드 또는 작가 매칭.
// 작가가 '코난 도일' 이면 제목에 '셜록/홈즈' 없어도 셜록홈즈 시리즈로 분류.
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

// displayTitle alias 적용 후 series + subtitle + author 로 그룹 키 생성.
// 같은 series지만 subtitle이 다르면 별도 책으로 유지 (책꽂이에 시리즈가 여러 권으로 늘어섬).
function workGroupKey(work) {
  // displayTitle 적용된 title + author 로 시리즈 감지
  const ext = extractSeries({ title: displayTitle(work?.title || ''), author: work?.author || '' });
  const a = (work?.author || '').toLowerCase().trim();
  return `${ext.series.toLowerCase()}__${ext.subtitle.toLowerCase()}__${a}`;
}

function groupBookmarksByWork() {
  const byWork = new Map();
  for (const b of state.bookmarks) {
    const card = b.cards;
    if (!card) continue;
    const work = card.works || {};
    const key = workGroupKey(work);
    if (!byWork.has(key)) {
      const { series, subtitle } = extractSeries({
        title: displayTitle(work.title || ''),
        author: work.author || '',
      });
      byWork.set(key, {
        key,
        series,
        subtitle,
        // spine 표시용 — subtitle 있으면 부제, 없으면 시리즈명
        title: subtitle || series || displayTitle(work.title) || '제목 없음',
        rawTitle: work.title || '',
        format: (work.format || '').toLowerCase(),
        author: work.author || null,
        year: work.release_year || null,
        cards: [],
      });
    }
    byWork.get(key).cards.push(card);
  }
  // series 가 같은 책들은 책꽂이에서 인접해서 표시되도록 정렬
  return Array.from(byWork.values()).sort((a, b) => {
    const s = a.series.localeCompare(b.series);
    if (s !== 0) return s;
    return a.subtitle.localeCompare(b.subtitle);
  });
}

function renderArchive() {
  archiveLoading.style.display = 'none';

  if (state.bookmarks.length === 0) {
    archiveShelves.style.display = 'none';
    archiveNoResult.style.display = 'none';
    archiveEmpty.style.display = 'block';
    archiveCount.textContent = '';
    return;
  }

  archiveEmpty.style.display = 'none';
  const allWorks = groupBookmarksByWork();
  archiveCount.textContent = `소장 ${allWorks.length}권 · 명대사 ${state.bookmarks.length}편`;

  const q = (state.archiveSearch || '').trim().toLowerCase();
  const genre = state.archiveGenre || '';
  const works = allWorks.filter((w) => {
    if (genre && w.format !== genre) return false;
    if (q) {
      const title = displayTitle(w.title).toLowerCase();
      const series = (w.series || '').toLowerCase();
      const sub = (w.subtitle || '').toLowerCase();
      // 시리즈명, 부제, 합쳐진 title 어느 하나로도 검색 매칭
      if (!title.includes(q) && !series.includes(q) && !sub.includes(q)) return false;
    }
    return true;
  });

  if (works.length === 0) {
    archiveShelves.style.display = 'none';
    archiveNoResult.style.display = 'block';
    return;
  }
  archiveNoResult.style.display = 'none';
  archiveShelves.style.display = 'block';
  archiveShelves.innerHTML = '';

  for (const genre of GENRE_ORDER) {
    const items = works.filter((w) => w.format === genre);
    if (items.length === 0) continue;
    archiveShelves.appendChild(buildGenreShelf(genre, items));
  }
  const otherItems = works.filter((w) => !GENRE_ORDER.includes(w.format));
  if (otherItems.length > 0) {
    archiveShelves.appendChild(buildGenreShelf('other', otherItems));
  }
}

function buildGenreShelf(genre, items) {
  const section = document.createElement('section');
  section.className = 'genre-section';
  const label = GENRE_LABEL[genre] || '기타';
  const shelfClass = GENRE_ORDER.includes(genre) ? `g-${genre}` : 'g-movie';

  const header = document.createElement('div');
  header.className = 'genre-header';
  header.innerHTML = `
    <span class="genre-name">${escapeHtml(label)}</span>
    <span class="genre-count">${items.length} ${items.length === 1 ? 'BOOK' : 'BOOKS'}</span>
  `;
  section.appendChild(header);

  const shelf = document.createElement('div');
  shelf.className = `bookshelf ${shelfClass}`;
  const row = document.createElement('div');
  row.className = 'shelf-row';

  items.forEach((w) => {
    const count = w.cards.length;
    const displayName = displayTitle(w.title);
    // series 라벨 표시 여부 — subtitle이 있으면 (시리즈 안의 한 권) series 라벨 위에 표시
    const showSeries = !!w.subtitle && w.subtitle !== w.series && w.series !== displayName;
    const seriesLabel = showSeries ? w.series : '';
    // 제목 길이에 따라 폰트·높이 동적 조정 — 풀텍스트 보장
    const titleLen = displayName.length;
    const fontSize = titleLen <= 5 ? 16 : titleLen <= 8 ? 14 : titleLen <= 12 ? 12 : 11;
    const perChar = fontSize + 4;
    const reserved = 110;  // 상하 가죽 밴드 + count + genre + padding
    const seriesReserve = showSeries ? (seriesLabel.length * 12 + 8) : 0;  // 시리즈 라벨 자리
    const height = Math.max(200, reserved + titleLen * perChar + seriesReserve);
    const width = 44 + Math.min(20, count * 3);

    const spine = document.createElement('button');
    spine.type = 'button';
    spine.className = 'spine';
    spine.style.height = `${height}px`;
    spine.style.width = `${width}px`;
    spine.style.backgroundColor = leatherColorFor(w.title);
    spine.innerHTML = `
      <div class="spine-inner">
        <span class="spine-count">${count}</span>
        ${showSeries ? `<span class="spine-series">${escapeHtml(seriesLabel)}</span>` : ''}
        <span class="spine-title" style="font-size:${fontSize}px;">${escapeHtml(displayName)}</span>
        <span class="spine-genre">${escapeHtml(label)}</span>
      </div>
    `;
    spine.addEventListener('click', () => openBookModal(w));
    row.appendChild(spine);
  });

  shelf.appendChild(row);
  section.appendChild(shelf);
  return section;
}

// Book opening modal
function openBookModal(work) {
  const label = GENRE_LABEL[work.format] || '기타';
  const allWorks = groupBookmarksByWork();
  const idx = allWorks.findIndex((w) => w.key === work.key) + 1;

  bookEyebrow.textContent = work.subtitle
    ? `${work.series.toUpperCase()} · VOLUME #${String(idx).padStart(2, '0')}`
    : `Collected · Volume #${String(idx).padStart(2, '0')}`;
  // 부제가 있으면 부제를 메인 타이틀로, 없으면 시리즈명/원제목
  bookTitleEl.textContent = work.subtitle || displayTitle(work.title);
  bookMetaEl.textContent = [label.toUpperCase(), work.author, work.year]
    .filter(Boolean).join(' · ');

  const book = bookModal.querySelector('.book');
  book.style.borderLeftColor = leatherColorFor(work.title);

  bookList.innerHTML = '';
  work.cards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'book-quote-item';
    const meta = card.excerpt_description
      ? truncateText(cleanQuote(card.excerpt_description), 60)
      : '';
    item.innerHTML = `
      <p class="book-quote-text">"${escapeHtml(cleanQuote(card.quote))}"</p>
      ${meta ? `<p class="book-quote-meta">${escapeHtml(meta)}</p>` : ''}
    `;
    item.addEventListener('click', () => {
      closeBookModal();
      setTimeout(() => openDetail(card), 280);
    });
    bookList.appendChild(item);
  });

  // history에 overlay 상태 push — swipe-back / 시스템 back으로 닫히게
  history.pushState({ overlay: 'book', key: work.key }, '');
  bookModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// 실제 DOM 닫기 — popstate 콜백에서 호출
function closeBookModalInternal() {
  bookModal.classList.remove('open');
  document.body.style.overflow = '';
}
// 사용자 의도(X 버튼 / 백드롭 / Esc / quote 클릭) → history.back() 으로 통일
function closeBookModal() {
  if (history.state && history.state.overlay === 'book') {
    history.back();
  } else {
    closeBookModalInternal();
  }
}

function truncateText(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '⋯' : t;
}

bookClose.addEventListener('click', closeBookModal);
bookModal.addEventListener('click', (e) => { if (e.target === bookModal) closeBookModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bookModal.classList.contains('open')) closeBookModal();
});

archiveSearchInput.addEventListener('input', (e) => {
  state.archiveSearch = e.target.value;
  renderArchive();
});

// ===== Genre chips =====
function renderArchiveChips() {
  if (!archiveChips) return;
  const allWorks = groupBookmarksByWork();
  // 사용자가 가진 장르만 표시 (사용 안 한 장르 칩 노출 안 함)
  const availableGenres = new Set(allWorks.map((w) => w.format).filter(Boolean));
  archiveChips.innerHTML = '';
  // All 칩
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'a-chip' + (state.archiveGenre === '' ? ' active' : '');
  allChip.dataset.genre = '';
  allChip.textContent = `All · ${allWorks.length}`;
  archiveChips.appendChild(allChip);
  // 장르별
  for (const g of GENRE_ORDER) {
    if (!availableGenres.has(g)) continue;
    const count = allWorks.filter((w) => w.format === g).length;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'a-chip' + (state.archiveGenre === g ? ' active' : '');
    chip.dataset.genre = g;
    chip.textContent = `${GENRE_LABEL[g]} · ${count}`;
    archiveChips.appendChild(chip);
  }
  // 클릭 위임
  archiveChips.querySelectorAll('.a-chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.archiveGenre = c.dataset.genre;
      renderArchiveChips();
      renderArchive();
    });
  });
}

// ---------- Settings ----------
function paintPushToggle() {
  pushToggle.classList.toggle('on', !!state.pushEnabled);
  pushToggle.setAttribute('aria-checked', state.pushEnabled ? 'true' : 'false');
}
pushToggle.addEventListener('click', () => {
  state.pushEnabled = !state.pushEnabled;
  localStorage.setItem('ds.push', state.pushEnabled ? '1' : '0');
  paintPushToggle();
});
pushToggle.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    pushToggle.click();
  }
});

// ---------- Taste toggle (취향 기반 추천) ----------
function paintTasteToggle() {
  const enabled = isTasteEnabled();
  tasteToggle.classList.toggle('on', enabled);
  tasteToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
  paintTasteProfile();
}

function paintTasteProfile() {
  if (!tasteProfileEl) return;
  if (!isTasteEnabled()) {
    tasteProfileEl.style.display = 'none';
    return;
  }
  const taste = computeTasteProfile();
  if (!taste) {
    tasteProfileEl.style.display = 'block';
    tasteProfileEl.textContent = 'No bookmarks yet — collect cards to start analysis';
    return;
  }
  const t = taste.avgTemperature?.toFixed(1) ?? '—';
  const i = taste.avgIntensity?.toFixed(1) ?? '—';
  tasteProfileEl.style.display = 'block';
  tasteProfileEl.textContent = `Based on: temperature ${t} · intensity ${i} (from ${taste.count} bookmark${taste.count === 1 ? '' : 's'})`;
}

tasteToggle.addEventListener('click', () => {
  const newEnabled = !isTasteEnabled();
  localStorage.setItem('ds.taste', newEnabled ? '1' : '0');
  paintTasteToggle();
  // 즉시 효과 — 오늘의 카드 다시 뽑기
  if (state.currentView === 'home') {
    state.todayCard = pickTodayCard();
    if (state.todayCard) applyTodayCard(state.todayCard);
  }
  toast(newEnabled ? 'Personalized recommendations on' : 'Switched to fully random');
});

tasteToggle.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    tasteToggle.click();
  }
});

// ---------- Theme (Light / Dark) ----------
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('ds.theme', theme);
  // theme-color meta 태그도 동기화 — iOS status bar 영역 색
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'dark' ? '#0E0C0A' : '#FAF8F2';
  paintThemeToggle();
}

function paintThemeToggle() {
  if (!themeToggle) return;
  const isDark = getCurrentTheme() === 'dark';
  themeToggle.classList.toggle('on', isDark);
  themeToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
  if (themeSubtitle) {
    themeSubtitle.textContent = isDark ? 'Dark · espresso night' : 'Light · cream paper';
  }
}

themeToggle.addEventListener('click', () => {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast(next === 'dark' ? 'Dark mode' : 'Light mode');
});

themeToggle.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    themeToggle.click();
  }
});

// ---------- Nickname edit ----------
function openNicknameModal() {
  if (!nicknameModal) return;
  nicknameInput.value = state.userNickname || '';
  nicknameModal.style.display = 'flex';
  setTimeout(() => nicknameInput.focus(), 50);
}
function closeNicknameModal() {
  nicknameModal.style.display = 'none';
}
async function saveNickname() {
  const newName = (nicknameInput.value || '').trim();
  if (!newName) { toast('이름을 입력해주세요'); return; }
  if (newName.length > 24) { toast('24자 이하로 입력해주세요'); return; }
  if (!state.userId) { toast('사용자 정보 없음'); return; }
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('users')
      .update({ nickname: newName })
      .eq('user_id', state.userId);
    if (error) throw error;
    state.userNickname = newName;
    paintAuthIdentity();
    closeNicknameModal();
    toast('이름이 변경됐어요');
  } catch (err) {
    console.error('[m] save nickname failed:', err);
    toast(`저장 실패: ${err.message || err}`);
  }
}

editNicknameBtn?.addEventListener('click', openNicknameModal);
nicknameCancelBtn?.addEventListener('click', closeNicknameModal);
nicknameModal?.addEventListener('click', (e) => { if (e.target === nicknameModal) closeNicknameModal(); });
nicknameRandomizeBtn?.addEventListener('click', () => {
  nicknameInput.value = randomCuteNickname();
  nicknameInput.focus();
});
nicknameSaveBtn?.addEventListener('click', saveNickname);
nicknameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveNickname(); }
  if (e.key === 'Escape') closeNicknameModal();
});

signOutBtn.addEventListener('click', async () => {
  const msg = state.isAnonymous
    ? '익명 세션을 종료할까요? 다시 입장하면 새 익명 ID가 생성됩니다.'
    : '로그아웃할까요? 다음 로그인 전까지 익명 세션으로 동작합니다.';
  if (!confirm(msg)) return;
  const sb = await getSupabase();
  await sb.auth.signOut();
  localStorage.removeItem('ds.prevAnonUserId');
  location.reload();
});

// ---------- Social Login ----------
async function startOAuth(provider) {
  try {
    const sb = await getSupabase();
    // 현재 익명 user_id를 마이그레이션용으로 백업
    if (state.userId) localStorage.setItem('ds.prevAnonUserId', String(state.userId));
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/m/`,
      },
    });
    if (error) throw error;
    // 성공 시 브라우저가 OAuth 제공자로 리디렉트됨 — 돌아오면 자동 세션 복원
  } catch (err) {
    console.error('[m] oauth failed:', err);
    toast(`${provider} 로그인 실패: ${err.message || err}`);
  }
}

// OAuth 버튼은 현재 HTML에서 제거됨 — 추후 사용시 다시 활성화
signinGoogle?.addEventListener('click', () => startOAuth('google'));
signinKakao?.addEventListener('click', () => startOAuth('kakao'));

// ---------- ID + Password 로그인 ----------
const openSigninModalBtn = $('#open-signin-modal');
const signinModal = $('#signin-modal');
const signinModalTitle = $('#signin-modal-title');
const signinModalSub = $('#signin-modal-sub');
const signinIdInput = $('#signin-id');
const signinPasswordInput = $('#signin-password');
const signinSubmitBtn = $('#signin-submit');
const signinToggleModeBtn = $('#signin-toggle-mode');
const signinCancelBtn = $('#signin-cancel');
const signinErrorEl = $('#signin-error');
let signinMode = 'signin';  // 'signin' | 'signup'

function setSigninMode(mode) {
  signinMode = mode;
  if (mode === 'signup') {
    signinModalTitle.textContent = '회원가입';
    signinModalSub.textContent = '아이디와 비밀번호를 정해주세요. 다른 기기에서도 같은 계정으로 로그인 가능합니다.';
    signinSubmitBtn.textContent = '가입';
    signinToggleModeBtn.textContent = '이미 계정이 있나요? 로그인';
  } else {
    signinModalTitle.textContent = '로그인';
    signinModalSub.textContent = '아이디와 비밀번호를 입력하세요.';
    signinSubmitBtn.textContent = '로그인';
    signinToggleModeBtn.textContent = '계정이 없으신가요? 회원가입';
  }
  signinErrorEl.style.display = 'none';
}

function openSigninModal() {
  if (!signinModal) return;
  setSigninMode('signin');
  signinIdInput.value = '';
  signinPasswordInput.value = '';
  signinErrorEl.style.display = 'none';
  signinModal.style.display = 'flex';
  setTimeout(() => signinIdInput.focus(), 50);
}
function closeSigninModal() {
  signinModal.style.display = 'none';
}

function showSigninError(msg) {
  signinErrorEl.textContent = msg;
  signinErrorEl.style.display = 'block';
}

function idToEmail(id) {
  // 어떤 입력이든 안정적인 이메일로 매핑.
  //  - ASCII-safe (a-z 0-9 . _ - +) 이면 그대로 사용 — Supabase 패널에서 읽기 좋음
  //  - 한글/공백/특수문자가 있으면 FNV-1a 해시 → 'u_xxxxxxxx@user.local'
  //  - 같은 입력은 항상 같은 이메일로 매핑되어 재로그인 가능
  const raw = String(id || '').trim();
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/\s+/g, '');
  if (/^[a-z0-9._+-]+$/.test(cleaned) && cleaned.length >= 1 && cleaned.length <= 50) {
    return `${cleaned}@user.local`;
  }
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const slug = ('00000000' + (hash >>> 0).toString(36)).slice(-8);
  return `u_${slug}@user.local`;
}

async function submitSignin() {
  const id = (signinIdInput.value || '').trim();
  const password = signinPasswordInput.value || '';
  const email = idToEmail(id);
  if (!email) {
    showSigninError('아이디를 입력해주세요.');
    return;
  }
  if (!password) {
    showSigninError('비밀번호를 입력해주세요.');
    return;
  }
  signinErrorEl.style.display = 'none';
  signinSubmitBtn.disabled = true;
  signinSubmitBtn.textContent = '⋯';
  try {
    const sb = await getSupabase();
    // 익명 사용자의 user_id 백업 (가입/로그인 직후 북마크 이전용)
    if (state.userId) localStorage.setItem('ds.prevAnonUserId', String(state.userId));
    // 현재 익명 닉네임도 보존
    const carryNickname = state.userNickname || '';
    localStorage.setItem('ds.carryNickname', carryNickname);

    if (signinMode === 'signup') {
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      // 이메일 확인 비활성이면 signUp이 session도 반환. 활성이면 session=null.
      // 어느 경우든 즉시 signInWithPassword 시도해 자동 로그인.
      if (!signUpData?.session) {
        const { error: autoSignInError } = await sb.auth.signInWithPassword({ email, password });
        if (autoSignInError) {
          throw new Error('가입은 됐으나 자동 로그인 실패. 다시 로그인 모드로 시도해주세요.');
        }
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    toast(signinMode === 'signup' ? '가입 완료' : '로그인 됨');
    closeSigninModal();
    // 세션이 바뀌었으므로 reload — bootstrapAuth가 새 user 행 만들고 마이그레이션 진행
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    console.error('[m] signin/up failed:', err);
    const msg = String(err?.message || err);
    // 흔한 에러 한글화
    let friendly = msg;
    if (/Invalid login credentials/i.test(msg)) friendly = '아이디 또는 비밀번호가 맞지 않습니다.';
    else if (/User already registered/i.test(msg)) friendly = '이미 가입된 아이디입니다. 로그인해주세요.';
    else if (/Password should be/i.test(msg)) friendly = '비밀번호가 너무 짧거나 약합니다.';
    else if (/rate limit/i.test(msg)) friendly = '잠시 후 다시 시도해주세요.';
    showSigninError(friendly);
  } finally {
    signinSubmitBtn.disabled = false;
    signinSubmitBtn.textContent = signinMode === 'signup' ? '가입' : '로그인';
  }
}

openSigninModalBtn?.addEventListener('click', openSigninModal);
signinCancelBtn?.addEventListener('click', closeSigninModal);
signinModal?.addEventListener('click', (e) => { if (e.target === signinModal) closeSigninModal(); });
signinToggleModeBtn?.addEventListener('click', () => {
  setSigninMode(signinMode === 'signin' ? 'signup' : 'signin');
  signinIdInput.focus();
});
signinSubmitBtn?.addEventListener('click', submitSignin);
signinPasswordInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitSignin(); }
});
signinIdInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); signinPasswordInput.focus(); }
});

function paintAuthIdentity() {
  // 닉네임/이름 헤더 — users.nickname(사용자 수정 가능) 우선
  const name = state.userNickname
    || state.authName
    || state.authEmail
    || (state.isAnonymous ? 'Anonymous' : 'Signed In');
  settingsName.textContent = name;

  // bio 영역에 provider 뱃지 / 이메일
  // 익명일 때만 SIGN IN 섹션 (ID + 비밀번호 모달 열기) 노출
  if (state.isAnonymous) {
    settingsBio.textContent = '매일 한 장의 명대사로 하루를 시작합니다.';
    if (signinBlock) signinBlock.style.display = 'block';
    signOutBtn.textContent = 'Reset Anonymous';
  } else {
    if (signinBlock) signinBlock.style.display = 'none';
    const providerLabel = state.authProvider === 'google' ? 'Google'
      : state.authProvider === 'kakao' ? 'Kakao'
      : (state.authProvider || 'Account');
    const bio = state.authEmail
      ? `${providerLabel} · ${state.authEmail}`
      : `${providerLabel} 계정으로 로그인됨`;
    settingsBio.textContent = bio;
    signOutBtn.textContent = 'Sign Out';
  }
}

// ---------- Detail (full-screen) ----------
function openDetail(card) {
  if (!card) return;
  state.detailCardId = card.card_id;
  const w = card.works || {};
  const title = displayTitle(w.title) || '';

  detailWorkTitle.textContent = title;

  // metadata chips row (FORMAT / AUTHOR / YEAR — uppercase labels)
  const items = [
    w.format ? w.format.toUpperCase() : null,
    w.author ? w.author.toUpperCase() : null,
    w.release_year ? String(w.release_year) : null,
  ].filter(Boolean);
  detailMeta.innerHTML = items.map((v) => `<span class="t-label-sm c-walnut">${escapeHtml(v)}</span>`).join('');

  // excerpt description (centered)
  if (card.excerpt_description) {
    detailDescription.textContent = card.excerpt_description;
    detailDescription.style.display = 'block';
    detailDescSpacer.style.height = '24px';
  } else {
    detailDescription.style.display = 'none';
    detailDescSpacer.style.height = '0';
  }

  // script_excerpt (left aligned, mono) — 화자 라인 볼드 (admin library.js와 동일 처리)
  detailScript.innerHTML = boldSpeakerLines(
    cleanForDisplay(card.script_excerpt || ''),
    w.characters
  );

  // significance — only for opera/play
  const fmt = String(w.format || '').toLowerCase();
  if (card.significance && (fmt === 'opera' || fmt === 'play')) {
    detailSignificance.textContent = card.significance;
    detailSignificanceBlock.style.display = 'block';
  } else {
    detailSignificanceBlock.style.display = 'none';
  }

  // Collect button + bookmark icon
  const isBookmarked = state.bookmarkedIds.has(card.card_id);
  paintBookmarkBtn(detailBookmark, isBookmarked);
  paintDetailCollectBtn(isBookmarked);

  // Edition note
  const idStr = String(card.card_id).padStart(4, '0');
  detailEdition.textContent = `LIMITED EDITION DIGITAL MANUSCRIPT #${idStr}`;

  // open the screen — history 에 overlay 상태 push (swipe-back으로 닫히도록)
  history.pushState({ overlay: 'detail', cardId: card.card_id }, '');
  detailScreen.style.display = 'flex';
  requestAnimationFrame(() => detailScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function paintDetailCollectBtn(isBookmarked) {
  detailCollectBtn.textContent = isBookmarked ? 'Collected' : 'Collect Script Artifact';
}

function closeDetailInternal() {
  detailScreen.classList.remove('open');
  setTimeout(() => {
    detailScreen.style.display = 'none';
    document.body.style.overflow = '';
    state.detailCardId = null;
  }, 250);
}
function closeDetail() {
  if (history.state && history.state.overlay === 'detail') {
    history.back();
  } else {
    closeDetailInternal();
  }
}

detailBack.addEventListener('click', closeDetail);
detailBookmark.addEventListener('click', () => {
  if (state.detailCardId != null) toggleBookmark(state.detailCardId);
});
detailCollectBtn.addEventListener('click', () => {
  if (state.detailCardId != null) toggleBookmark(state.detailCardId);
});

// ---------- View switching ----------
function setView(view) {
  state.currentView = view;
  viewHome.style.display = (view === 'home') ? 'block' : 'none';
  viewArchive.style.display = (view === 'archive') ? 'block' : 'none';
  viewSettings.style.display = (view === 'settings') ? 'block' : 'none';

  // Top bar — Settings has its own
  topBarHome.style.display = (view === 'settings') ? 'none' : 'flex';
  topBarSettings.style.display = (view === 'settings') ? 'flex' : 'none';

  $$('.bottom-nav .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === view);
  });

  if (view === 'archive') { renderArchiveChips(); renderArchive(); }
  if (view === 'settings') paintTasteProfile();

  // tab 전환을 history stack에 쌓음 (back으로 이전 탭 복귀 가능)
  if (!suppressPushState) {
    const newHash = `#${view}`;
    if (location.hash !== newHash) {
      history.pushState({ tab: view }, '', newHash);
    } else {
      history.replaceState({ tab: view }, '', newHash);
    }
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// popstate로 setView 호출 시 다시 push되지 않도록 가드
let suppressPushState = false;

$$('[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.nav));
});

// ---------- Utils ----------
function cleanQuote(s) {
  return String(s ?? '')
    .replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 발췌문 표시용 정리. admin library.js와 동일 로직 — 화자/대사 라인 재조립.
function cleanForDisplay(s) {
  let text = String(s ?? '');
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');
  const speakers = new Set();
  const colonRegex = /^([^:：()\n]{1,14})[:：][ \t]*/gm;
  let m;
  while ((m = colonRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) speakers.add(name);
  }
  const PARTICLE_END = /(가|이|는|을|를|도|의|에|에게|에서|와|과|으로|로|만|보다|처럼|마저|조차|밖에)$/;
  const headCounts = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    const headM = line.match(/^([가-힣A-Za-z]{2,7}[0-9]?)(?=\s|$)/);
    if (headM) {
      const word = headM[1];
      if (word.length > 2 && PARTICLE_END.test(word)) continue;
      headCounts[word] = (headCounts[word] || 0) + 1;
    }
  }
  Object.entries(headCounts).forEach(([word, count]) => {
    if (count >= 2) speakers.add(word);
  });
  text = text.replace(/^([^:：()\n]{1,14})[:：][ \t]*\n?/gm, '$1\n');
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
    if (speakers.has(line)) {
      pushSpeakerBoundary();
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
    out.push(raw);
  }
  return out.join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// works.characters에 있는 이름과 정확히 일치하는 라인만 <strong>으로 감싸 볼드.
// 목록 없으면 볼드 없이 escape만.
function boldSpeakerLines(cleanedText, characterNames) {
  const text = String(cleanedText ?? '');
  const names = Array.isArray(characterNames) ? characterNames : [];
  if (names.length === 0) return escapeHtml(text);
  const nameSet = new Set(names.map((n) => String(n).trim()).filter(Boolean));
  return text.split('\n').map((line) => {
    const safe = escapeHtml(line);
    const t = line.trim();
    const namePart = t.split('(')[0].trim();
    const isSpeaker = !!t && (nameSet.has(t) || nameSet.has(namePart));
    return isSpeaker ? `<strong>${safe}</strong>` : safe;
  }).join('\n');
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
