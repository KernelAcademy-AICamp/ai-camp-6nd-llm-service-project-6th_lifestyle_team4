// Daily Script — 사용자용 SPA
// Anonymous Auth → users 행 부트스트랩 → 홈/카드/북마크 SPA
import { getSupabase } from '/assets/supabase-client.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- DOM ----------
const pageTitle = $('#page-title');
const pageSub = $('#page-sub');
const toastEl = $('#toast');

const viewHome = $('#view-home');
const viewCards = $('#view-cards');
const viewBookmarks = $('#view-bookmarks');

const homeLoading = $('#home-loading');
const homeCard = $('#home-card');
const homeEmpty = $('#home-empty');
const homeQuote = $('#home-quote');
const homeWork = $('#home-work');
const homeBookmarkBtn = $('#home-bookmark');
const homeDetailBtn = $('#home-detail-btn');
const homeShuffleBtn = $('#home-shuffle');

const cardsSearch = $('#cards-search');
const cardsStatus = $('#cards-status');
const cardsList = $('#cards-list');

const bookmarksStatus = $('#bookmarks-status');
const bookmarksList = $('#bookmarks-list');
const bookmarksEmpty = $('#bookmarks-empty');

const modal = $('#card-modal');
const modalBody = $('#modal-body');
const modalClose = $('#modal-close');

// ---------- State ----------
const state = {
  userId: null,                  // public.users.user_id (bigint)
  authUid: null,                 // auth.uid()
  todayCard: null,               // CardDto-ish
  allCards: [],                  // [{ card_id, quote, works:{ title, ... }, ... }]
  bookmarkedIds: new Set(),      // Set of card_id (number)
  bookmarkRows: [],              // [{ bookmark_id, card_id, cards: {...} }] for bookmarks tab
  currentView: 'home',
  searchText: '',
};

// ---------- Title aliases (admin 쪽과 동일 동작) ----------
const TITLE_DISPLAY_ALIASES = { 'titanic': '타이타닉' };
const displayTitle = (s) => {
  const t = String(s || '').trim();
  return TITLE_DISPLAY_ALIASES[t.toLowerCase()] || t;
};

// ---------- Init ----------
(async () => {
  try {
    await bootstrapAuth();
    await Promise.all([loadAllCards(), loadBookmarks()]);
    renderHome();
    setView(getInitialView());
  } catch (err) {
    console.error('[m] bootstrap failed:', err);
    homeLoading.innerHTML = `<p class="text-sm text-error">초기화 실패: ${err.message || err}</p>`;
  }
})();

function getInitialView() {
  const hash = (location.hash || '').replace('#', '');
  if (hash === 'cards' || hash === 'bookmarks' || hash === 'home') return hash;
  return 'home';
}

window.addEventListener('hashchange', () => setView(getInitialView()));

// ---------- Auth: 익명 입장 + users 행 부트스트랩 ----------
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
  if (!state.authUid) throw new Error('인증 사용자 ID를 가져올 수 없습니다.');

  // users 행 조회 → 없으면 생성
  const { data: existingUser, error: selErr } = await sb
    .from('users')
    .select('user_id, anonymous_id, nickname')
    .eq('anonymous_id', state.authUid)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existingUser) {
    state.userId = existingUser.user_id;
    return;
  }

  const { data: inserted, error: insErr } = await sb
    .from('users')
    .insert({ anonymous_id: state.authUid })
    .select('user_id')
    .single();
  if (insErr) throw insErr;
  state.userId = inserted.user_id;
}

// ---------- Data: 카드/북마크 로드 ----------
async function loadAllCards() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('cards')
    .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, created_at, works(work_id, title, format, author, release_year)')
    .order('card_id', { ascending: false })
    .limit(500);
  if (error) throw error;
  state.allCards = Array.isArray(data) ? data : [];
}

async function loadBookmarks() {
  if (!state.userId) return;
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('user_bookmarks')
    .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, works(work_id, title, format, author, release_year))')
    .eq('user_id', state.userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[m] bookmarks load failed:', error);
    return;
  }
  state.bookmarkRows = Array.isArray(data) ? data : [];
  state.bookmarkedIds = new Set(state.bookmarkRows.map((b) => b.card_id));
}

// ---------- Today's card (날짜 시드 기반 고정 1장) ----------
function pickTodayCard() {
  if (state.allCards.length === 0) return null;
  // YYYY-MM-DD 시드로 카드 인덱스 결정 — 같은 날엔 같은 카드
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const idx = seed % state.allCards.length;
  return state.allCards[idx];
}

function pickRandomCard() {
  if (state.allCards.length === 0) return null;
  const idx = Math.floor(Math.random() * state.allCards.length);
  return state.allCards[idx];
}

// ---------- Bookmarks API ----------
async function toggleBookmark(cardId, btnElement) {
  if (!state.userId) {
    toast('로그인 정보가 아직 준비되지 않았습니다.');
    return;
  }
  const sb = await getSupabase();
  const wasBookmarked = state.bookmarkedIds.has(cardId);
  // 낙관적 업데이트
  if (wasBookmarked) {
    state.bookmarkedIds.delete(cardId);
  } else {
    state.bookmarkedIds.add(cardId);
  }
  paintBookmarkBtn(btnElement, !wasBookmarked);

  if (wasBookmarked) {
    const { error } = await sb
      .from('user_bookmarks')
      .delete()
      .eq('user_id', state.userId)
      .eq('card_id', cardId);
    if (error) {
      state.bookmarkedIds.add(cardId);
      paintBookmarkBtn(btnElement, true);
      toast('북마크 해제 실패');
      console.error('[m] delete bookmark:', error);
      return;
    }
    state.bookmarkRows = state.bookmarkRows.filter((b) => b.card_id !== cardId);
    toast('북마크 해제');
  } else {
    const { data, error } = await sb
      .from('user_bookmarks')
      .insert({ user_id: state.userId, card_id: cardId })
      .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, works(work_id, title, format, author, release_year))')
      .single();
    if (error) {
      state.bookmarkedIds.delete(cardId);
      paintBookmarkBtn(btnElement, false);
      toast('북마크 실패');
      console.error('[m] insert bookmark:', error);
      return;
    }
    state.bookmarkRows = [data, ...state.bookmarkRows];
    toast('북마크에 담았어요');
  }
  // 북마크 탭이 현재 열려있으면 갱신
  if (state.currentView === 'bookmarks') renderBookmarks();
}

function paintBookmarkBtn(btn, filled) {
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (!icon) return;
  if (filled) {
    icon.classList.add('icon-filled', 'text-love');
    icon.classList.remove('text-muted');
  } else {
    icon.classList.remove('icon-filled', 'text-love');
    icon.classList.add('text-muted');
  }
}

// ---------- Render: Home ----------
function renderHome() {
  homeLoading.classList.add('hidden');
  state.todayCard = pickTodayCard();
  if (!state.todayCard) {
    homeCard.classList.add('hidden');
    homeShuffleBtn.classList.add('hidden');
    homeEmpty.classList.remove('hidden');
    return;
  }
  applyHomeCard(state.todayCard);
  homeCard.classList.remove('hidden');
  homeShuffleBtn.classList.remove('hidden');
  homeEmpty.classList.add('hidden');
}

function applyHomeCard(card) {
  state.todayCard = card;
  homeQuote.textContent = cleanQuote(card.quote);
  const w = card.works || {};
  const parts = [
    displayTitle(w.title) || '',
    w.author || '',
    w.release_year ? String(w.release_year) : '',
  ].filter(Boolean);
  homeWork.innerHTML = parts.map((p, i) =>
    i === 0
      ? `<span class="font-semibold text-ink">${escapeHtml(p)}</span>`
      : `<span class="opacity-60">·</span><span>${escapeHtml(p)}</span>`
  ).join('');
  paintBookmarkBtn(homeBookmarkBtn, state.bookmarkedIds.has(card.card_id));
}

homeBookmarkBtn.addEventListener('click', () => {
  if (!state.todayCard) return;
  toggleBookmark(state.todayCard.card_id, homeBookmarkBtn);
});

homeDetailBtn.addEventListener('click', () => {
  if (state.todayCard) openCardModal(state.todayCard);
});

homeShuffleBtn.addEventListener('click', () => {
  applyHomeCard(pickRandomCard());
});

// ---------- Render: Cards list ----------
function renderCards() {
  const q = state.searchText.trim().toLowerCase();
  const filtered = !q ? state.allCards : state.allCards.filter((c) => {
    const title = displayTitle(c.works?.title || '').toLowerCase();
    const rawTitle = (c.works?.title || '').toLowerCase();
    const quote = (c.quote || '').toLowerCase();
    const author = (c.works?.author || '').toLowerCase();
    return title.includes(q) || rawTitle.includes(q) || quote.includes(q) || author.includes(q);
  });
  cardsStatus.textContent = `${filtered.length}장`;
  cardsList.innerHTML = '';
  filtered.forEach((c) => cardsList.appendChild(buildCardRow(c)));
  if (filtered.length === 0) {
    cardsList.innerHTML = '<p class="text-center text-sm text-muted py-12">검색 결과가 없습니다.</p>';
  }
}

cardsSearch.addEventListener('input', (e) => {
  state.searchText = e.target.value;
  renderCards();
});

// ---------- Render: Bookmarks ----------
function renderBookmarks() {
  bookmarksList.innerHTML = '';
  if (state.bookmarkRows.length === 0) {
    bookmarksStatus.textContent = '';
    bookmarksEmpty.classList.remove('hidden');
    return;
  }
  bookmarksEmpty.classList.add('hidden');
  bookmarksStatus.textContent = `${state.bookmarkRows.length}장 담음`;
  state.bookmarkRows.forEach((row) => {
    const card = row.cards;
    if (!card) return;
    bookmarksList.appendChild(buildCardRow(card));
  });
}

// ---------- Card row builder ----------
function buildCardRow(card) {
  const node = document.createElement('div');
  node.className = 'card-row cursor-pointer';
  const w = card.works || {};
  const title = displayTitle(w.title) || '제목 없음';
  const meta = [w.author, w.release_year].filter(Boolean).join(' · ');
  const isBookmarked = state.bookmarkedIds.has(card.card_id);
  node.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <p class="text-xs text-muted mb-1 truncate">${escapeHtml(title)}${meta ? ` <span class="opacity-50">· ${escapeHtml(meta)}</span>` : ''}</p>
        <p class="text-[15px] font-serif leading-snug text-ink line-clamp-3">"${escapeHtml(cleanQuote(card.quote))}"</p>
      </div>
      <button class="bookmark-btn p-1 -m-1 shrink-0" aria-label="북마크">
        <span class="material-symbols-outlined ${isBookmarked ? 'icon-filled text-love' : 'text-muted'}" style="font-size:22px;">${isBookmarked ? 'bookmark' : 'bookmark_border'}</span>
      </button>
    </div>
  `;
  const bmBtn = node.querySelector('.bookmark-btn');
  bmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(card.card_id, bmBtn);
  });
  node.addEventListener('click', () => openCardModal(card));
  return node;
}

// ---------- Detail modal ----------
function openCardModal(card) {
  const w = card.works || {};
  const title = displayTitle(w.title) || '제목 없음';
  const meta = [w.format, w.author, w.release_year].filter(Boolean).join(' · ');
  const kws = Array.isArray(card.keywords) ? card.keywords : [];
  modalBody.innerHTML = `
    <p class="text-xs text-muted mb-2">${escapeHtml(meta || '')}</p>
    <h2 class="text-xl font-extrabold mb-4">${escapeHtml(title)}</h2>
    <blockquote class="font-serif text-lg leading-relaxed border-l-4 border-accent pl-4 mb-6 text-ink">
      "${escapeHtml(cleanQuote(card.quote))}"
    </blockquote>
    ${card.excerpt_description ? `
      <section class="mb-6">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">맥락</h3>
        <p class="text-sm text-ink leading-relaxed whitespace-pre-wrap">${escapeHtml(card.excerpt_description)}</p>
      </section>
    ` : ''}
    ${card.script_excerpt ? `
      <section class="mb-6">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">대본 발췌</h3>
        <pre class="text-sm font-mono bg-card-bg p-4 rounded-xl whitespace-pre-wrap border border-border-soft text-ink leading-relaxed">${escapeHtml(card.script_excerpt)}</pre>
      </section>
    ` : ''}
    ${kws.length > 0 ? `
      <div class="flex flex-wrap gap-2 mb-2">
        ${kws.map((k) => `<span class="text-xs px-2 py-1 rounded-full bg-accent-soft text-accent font-semibold">#${escapeHtml(k)}</span>`).join('')}
      </div>
    ` : ''}
    <button id="modal-bookmark-btn"
            class="mt-4 w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${state.bookmarkedIds.has(card.card_id) ? 'bg-love/10 text-love border-2 border-love/30' : 'bg-ink text-paper'}">
      <span class="material-symbols-outlined ${state.bookmarkedIds.has(card.card_id) ? 'icon-filled' : ''}" style="font-size:18px;">${state.bookmarkedIds.has(card.card_id) ? 'bookmark' : 'bookmark_border'}</span>
      ${state.bookmarkedIds.has(card.card_id) ? '북마크 해제' : '북마크 담기'}
    </button>
  `;
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));

  const bmBtn = $('#modal-bookmark-btn');
  bmBtn.addEventListener('click', async () => {
    await toggleBookmark(card.card_id, null);
    // 모달 버튼 상태 재페인트
    const isMarked = state.bookmarkedIds.has(card.card_id);
    bmBtn.className = `mt-4 w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${isMarked ? 'bg-love/10 text-love border-2 border-love/30' : 'bg-ink text-paper'}`;
    bmBtn.innerHTML = `
      <span class="material-symbols-outlined ${isMarked ? 'icon-filled' : ''}" style="font-size:18px;">${isMarked ? 'bookmark' : 'bookmark_border'}</span>
      ${isMarked ? '북마크 해제' : '북마크 담기'}
    `;
    // 카드 리스트/홈도 갱신
    if (state.currentView === 'cards') renderCards();
    if (state.currentView === 'home' && state.todayCard?.card_id === card.card_id) {
      paintBookmarkBtn(homeBookmarkBtn, isMarked);
    }
  });
}

function closeModal() {
  modal.classList.remove('open');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// ---------- View switching ----------
function setView(view) {
  state.currentView = view;
  viewHome.classList.toggle('hidden', view !== 'home');
  viewCards.classList.toggle('hidden', view !== 'cards');
  viewBookmarks.classList.toggle('hidden', view !== 'bookmarks');
  $$('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));

  const titles = {
    home: { t: '오늘의 명대사', s: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
    cards: { t: '카드 둘러보기', s: `총 ${state.allCards.length}장의 명대사` },
    bookmarks: { t: '내 북마크', s: `${state.bookmarkRows.length}장 담음` },
  };
  pageTitle.textContent = titles[view].t;
  pageSub.textContent = titles[view].s;

  if (view === 'cards') renderCards();
  if (view === 'bookmarks') renderBookmarks();
  history.replaceState(null, '', `#${view}`);
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
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2000);
}
