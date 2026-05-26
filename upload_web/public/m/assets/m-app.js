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

// ---------- Init ----------
(async () => {
  try {
    state.pushEnabled = localStorage.getItem('ds.push') === '1';
    paintPushToggle();
    paintTasteToggle();
    await bootstrapAuth();
    paintAuthIdentity();
    await Promise.all([loadAllCards(), loadBookmarks()]);
    paintTasteProfile();
    renderHome();
    setView(getInitialView());
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
    ptrLabel.textContent = 'Refreshing…';
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
    return;
  }
  const { data: inserted, error: insErr } = await sb
    .from('users')
    .insert({
      anonymous_id: state.authUid,
      nickname: state.authName || null,
    })
    .select('user_id').single();
  if (insErr) throw insErr;
  state.userId = inserted.user_id;

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
    .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, works(work_id, title, format, author, release_year)')
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

// 셔플 시 최근 10개에 있는 카드는 제외
const RECENT_EXCLUDE_SIZE = 10;
function candidatesExcludingRecent() {
  const exclude = new Set(state.recentlyShownIds);
  const pool = state.allCards.filter((c) => !exclude.has(c.card_id));
  // 풀이 너무 작으면 (전체가 10개 이하) 폴백
  return pool.length > 0 ? pool : state.allCards;
}

function rememberShown(cardId) {
  if (cardId == null) return;
  state.recentlyShownIds.push(cardId);
  if (state.recentlyShownIds.length > RECENT_EXCLUDE_SIZE) {
    state.recentlyShownIds.shift();
  }
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
  // 최근 표시 목록에 추가 (셔플 시 중복 방지)
  if (!state.recentlyShownIds.includes(card.card_id)) {
    rememberShown(card.card_id);
  }

  // Quote with curly quotes (mirror Android: "“$it”")
  todayQuote.textContent = `“${cleanQuote(card.quote)}”`;

  // Chips: filled format + outlined first keyword
  todayChips.innerHTML = '';
  const format = card.works?.format;
  if (format) {
    const chip = document.createElement('span');
    chip.className = 'chip filled';
    chip.textContent = format;
    todayChips.appendChild(chip);
  }
  const kws = Array.isArray(card.keywords) ? card.keywords : [];
  if (kws[0]) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = kws[0];
    todayChips.appendChild(chip);
  }

  // Keyword list (hashtags)
  todayKeywords.innerHTML = '';
  kws.forEach((k) => {
    const span = document.createElement('span');
    span.className = 't-body-md c-walnut';
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
  play: '희곡 / 연극',
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

function groupBookmarksByWork() {
  const byWork = new Map();
  for (const b of state.bookmarks) {
    const card = b.cards;
    if (!card) continue;
    const work = card.works || {};
    const key = `${(work.title || '').trim()}__${(work.work_id || '')}`;
    if (!byWork.has(key)) {
      byWork.set(key, {
        key,
        title: work.title || '제목 없음',
        format: (work.format || '').toLowerCase(),
        author: work.author || null,
        year: work.release_year || null,
        cards: [],
      });
    }
    byWork.get(key).cards.push(card);
  }
  return Array.from(byWork.values());
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
      if (!title.includes(q)) return false;
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
    const height = 188 + Math.min(28, count * 4);
    const width = 44 + Math.min(16, count * 2);
    const spine = document.createElement('button');
    spine.type = 'button';
    spine.className = 'spine';
    spine.style.height = `${height}px`;
    spine.style.width = `${width}px`;
    spine.style.background = leatherColorFor(w.title);
    spine.innerHTML = `
      <span class="spine-count">${count}</span>
      <span class="spine-title">${escapeHtml(displayTitle(w.title))}</span>
      <span class="spine-genre">${escapeHtml(label)}</span>
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

  bookEyebrow.textContent = `Collected · Volume #${String(idx).padStart(2, '0')}`;
  bookTitleEl.textContent = displayTitle(work.title);
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

  bookModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBookModal() {
  bookModal.classList.remove('open');
  document.body.style.overflow = '';
}

function truncateText(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
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

signinGoogle.addEventListener('click', () => startOAuth('google'));
signinKakao.addEventListener('click', () => startOAuth('kakao'));

function paintAuthIdentity() {
  // 닉네임/이름 헤더
  const name = state.authName
    || state.authEmail
    || (state.isAnonymous ? 'Anonymous' : 'Signed In');
  settingsName.textContent = name;

  // bio 영역에 provider 뱃지 / 이메일
  if (state.isAnonymous) {
    settingsBio.textContent = '매일 한 장의 명대사로 하루를 시작합니다.';
    signinBlock.style.display = 'block';
    signOutBtn.textContent = 'Reset Anonymous';
  } else {
    const providerLabel = state.authProvider === 'google' ? 'Google'
      : state.authProvider === 'kakao' ? 'Kakao'
      : (state.authProvider || 'Account');
    const bio = state.authEmail
      ? `${providerLabel} · ${state.authEmail}`
      : `${providerLabel} 계정으로 로그인됨`;
    settingsBio.textContent = bio;
    signinBlock.style.display = 'none';
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

  // script_excerpt (left aligned, mono)
  detailScript.textContent = card.script_excerpt || '';

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

  // open the screen
  detailScreen.style.display = 'flex';
  requestAnimationFrame(() => detailScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function paintDetailCollectBtn(isBookmarked) {
  detailCollectBtn.textContent = isBookmarked ? 'Collected' : 'Collect Script Artifact';
}

function closeDetail() {
  detailScreen.classList.remove('open');
  setTimeout(() => {
    detailScreen.style.display = 'none';
    document.body.style.overflow = '';
    state.detailCardId = null;
  }, 250);
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

  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

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

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
