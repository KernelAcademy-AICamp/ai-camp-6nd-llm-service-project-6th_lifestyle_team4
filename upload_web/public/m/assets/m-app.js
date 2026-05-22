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
    await bootstrapAuth();
    await Promise.all([loadAllCards(), loadBookmarks()]);
    renderHome();
    setView(getInitialView());
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
