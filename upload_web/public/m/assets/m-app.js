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
const archiveList = $('#archive-list');
const archiveEmpty = $('#archive-empty');
const archiveCount = $('#archive-count');

const settingsName = $('#settings-name');
const pushToggle = $('#push-toggle');
const signOutBtn = $('#sign-out-btn');

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
  todayCard: null,
  todayBookmarked: false,
  allCards: [],
  bookmarks: [],            // raw bookmark rows
  bookmarkedIds: new Set(),
  currentView: 'home',
  detailCardId: null,
  pushEnabled: false,
  bookmarkActionInFlight: false,
};

const TITLE_DISPLAY_ALIASES = { 'titanic': '타이타닉' };
const displayTitle = (s) => TITLE_DISPLAY_ALIASES[String(s||'').trim().toLowerCase()] || String(s||'').trim();

// ---------- Init ----------
(async () => {
  try {
    state.pushEnabled = localStorage.getItem('ds.push') === '1';
    paintPushToggle();
    paintDailyNotifToggle();
    await bootstrapAuth();
    await Promise.all([loadAllCards(), loadBookmarks()]);
    renderHome();
    setView(getInitialView());
    scheduleDailyTick();
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
  } else if (state.currentView === 'settings') {
    renderWidgetPreview();
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
  state.authUid = session?.user?.id ?? null;
  if (!state.authUid) throw new Error('auth uid 없음');

  const { data: existingUser, error: selErr } = await sb
    .from('users').select('user_id, nickname')
    .eq('anonymous_id', state.authUid).maybeSingle();
  if (selErr) throw selErr;
  if (existingUser) {
    state.userId = existingUser.user_id;
    if (existingUser.nickname) settingsName.textContent = existingUser.nickname;
    return;
  }
  const { data: inserted, error: insErr } = await sb
    .from('users').insert({ anonymous_id: state.authUid })
    .select('user_id').single();
  if (insErr) throw insErr;
  state.userId = inserted.user_id;
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

// ---------- Today's card ----------
function pickTodayCard() {
  if (state.allCards.length === 0) return null;
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return state.allCards[seed % state.allCards.length];
}
function pickRandomCard() {
  if (state.allCards.length === 0) return null;
  return state.allCards[Math.floor(Math.random() * state.allCards.length)];
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
    if (state.currentView === 'archive') renderArchive();
    if (state.currentView === 'home') renderHomeBookmarks();
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
  state.todayCard = card;
  state.todayBookmarked = state.bookmarkedIds.has(card.card_id);

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

function renderHomeBookmarks() {
  homeBookmarksList.innerHTML = '';
  if (state.bookmarks.length === 0) {
    const p = document.createElement('p');
    p.className = 't-body-md c-walnut';
    p.style.padding = '16px 0';
    p.textContent = '아직 북마크한 카드가 없습니다.';
    homeBookmarksList.appendChild(p);
    return;
  }
  // Show all bookmarks (Android pattern)
  state.bookmarks.forEach((row) => {
    const card = row.cards;
    if (!card) return;
    homeBookmarksList.appendChild(buildBookmarkRow(row));
  });
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
});

// ---------- Archive ----------
function renderArchive() {
  archiveLoading.style.display = 'none';
  if (state.bookmarks.length === 0) {
    archiveList.style.display = 'none';
    archiveCount.style.display = 'none';
    archiveEmpty.style.display = 'block';
    return;
  }
  archiveEmpty.style.display = 'none';
  archiveList.style.display = 'block';
  archiveCount.style.display = 'block';
  archiveCount.textContent = `소장 ${state.bookmarks.length}권 · 명대사 ${state.bookmarks.length}편`;

  archiveList.innerHTML = '';
  state.bookmarks.forEach((row) => {
    archiveList.appendChild(buildBookmarkRow(row));
  });
}

// ---------- Widget preview + daily notification ----------
const widgetPreviewQuote = document.getElementById('widget-preview-quote');
const widgetPreviewTitle = document.getElementById('widget-preview-title');
const dailyNotifToggle = document.getElementById('daily-notif-toggle');
const testNotifRow = document.getElementById('test-notif-row');

function renderWidgetPreview() {
  // 가장 최신 카드 = state.allCards[0] (Android/iOS 위젯이 fetch하는 것과 동일)
  const card = state.allCards[0];
  if (!card) {
    widgetPreviewQuote.textContent = '오늘의 한 줄을 불러오는 중';
    widgetPreviewTitle.textContent = '';
    return;
  }
  widgetPreviewQuote.textContent = `"${cleanQuote(card.quote)}"`;
  const title = displayTitle(card.works?.title || '');
  widgetPreviewTitle.textContent = title ? title.toUpperCase() : '';
}

function paintDailyNotifToggle() {
  const enabled = localStorage.getItem('ds.dailyNotif') === '1';
  dailyNotifToggle.classList.toggle('on', enabled);
  dailyNotifToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
  return enabled;
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    toast('이 브라우저는 알림 미지원');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    toast('알림 차단됨 — 설정에서 권한 변경 필요');
    return false;
  }
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function sendQuoteNotification() {
  const card = state.allCards[0];
  if (!card) {
    toast('카드 없음');
    return;
  }
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const title = displayTitle(card.works?.title || '오늘의 명대사');
  const body = cleanQuote(card.quote).slice(0, 120);
  const opts = {
    body: `"${body}"`,
    icon: '/m/icons/icon-book-192.png',
    badge: '/m/icons/icon-book-192.png',
    tag: 'daily-script',
  };
  // SW가 있으면 SW를 통해 보냄 (백그라운드에서도 동작)
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
  } catch (err) {
    console.warn('[m] notification failed:', err);
    try { new Notification(title, opts); } catch {}
  }
}

dailyNotifToggle.addEventListener('click', async () => {
  const currentlyOn = localStorage.getItem('ds.dailyNotif') === '1';
  if (!currentlyOn) {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    localStorage.setItem('ds.dailyNotif', '1');
    paintDailyNotifToggle();
    toast('매일 알림 켜짐');
    // 첫 알림 한 번 발사 (확인용)
    await sendQuoteNotification();
    scheduleDailyTick();
  } else {
    localStorage.removeItem('ds.dailyNotif');
    paintDailyNotifToggle();
    toast('알림 꺼짐');
  }
});

testNotifRow.addEventListener('click', () => sendQuoteNotification());

// 하루에 한 번 — 앱 열렸을 때 오늘자 알림이 아직 안 갔으면 한 번 발사
function scheduleDailyTick() {
  if (localStorage.getItem('ds.dailyNotif') !== '1') return;
  const todayKey = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem('ds.dailyNotif.lastSent');
  if (last === todayKey) return;
  localStorage.setItem('ds.dailyNotif.lastSent', todayKey);
  sendQuoteNotification();
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

signOutBtn.addEventListener('click', async () => {
  if (!confirm('정말 로그아웃하시겠습니까? 익명 세션이 종료되고 북마크 접근이 끊깁니다.')) return;
  const sb = await getSupabase();
  await sb.auth.signOut();
  location.reload();
});

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

  if (view === 'archive') renderArchive();
  if (view === 'settings') renderWidgetPreview();

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
