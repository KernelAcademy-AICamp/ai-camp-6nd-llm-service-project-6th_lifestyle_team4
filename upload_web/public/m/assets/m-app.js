// Daily Script — 사용자용 SPA (Long Black editorial design)
import { getSupabase } from '/assets/supabase-client.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- DOM ----------
const toastEl = $('#toast');

const viewHome = $('#view-home');
const viewCards = $('#view-cards');
const viewBookmarks = $('#view-bookmarks');

const homeLoading = $('#home-loading');
const homeCard = $('#home-card');
const homeEmpty = $('#home-empty');
const homeQuote = $('#home-quote');
const homeWork = $('#home-work');
const homeChips = $('#home-chips');
const homeDate = $('#home-date');
const homeBookmarkBtn = $('#home-bookmark');
const homeDetailBtn = $('#home-detail-btn');
const homeShuffleBtn = $('#home-shuffle');
const homeRecentSection = $('#home-recent-section');
const homeRecentList = $('#home-recent-list');
const gotoBookmarksBtn = $('#goto-bookmarks');

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
  userId: null,
  authUid: null,
  todayCard: null,
  allCards: [],
  bookmarkedIds: new Set(),
  bookmarkRows: [],
  currentView: 'home',
  searchText: '',
};

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
    homeLoading.innerHTML = `<p class="serif italic text-cta text-center px-6">초기화 실패: ${err.message || err}</p>`;
  }
})();

function getInitialView() {
  const hash = (location.hash || '').replace('#', '');
  if (hash === 'cards' || hash === 'bookmarks' || hash === 'home') return hash;
  return 'home';
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
  if (!state.authUid) throw new Error('인증 사용자 ID를 가져올 수 없습니다.');

  const { data: existingUser, error: selErr } = await sb
    .from('users')
    .select('user_id')
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

// ---------- Data ----------
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

// ---------- Bookmarks API ----------
async function toggleBookmark(cardId, btnElement) {
  if (!state.userId) {
    toast('로그인 정보가 준비되지 않았습니다');
    return;
  }
  const sb = await getSupabase();
  const wasBookmarked = state.bookmarkedIds.has(cardId);
  if (wasBookmarked) state.bookmarkedIds.delete(cardId);
  else state.bookmarkedIds.add(cardId);
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
      toast('해제 실패');
      console.error(error);
      return;
    }
    state.bookmarkRows = state.bookmarkRows.filter((b) => b.card_id !== cardId);
    toast('Released');
  } else {
    const { data, error } = await sb
      .from('user_bookmarks')
      .insert({ user_id: state.userId, card_id: cardId })
      .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, works(work_id, title, format, author, release_year))')
      .single();
    if (error) {
      state.bookmarkedIds.delete(cardId);
      paintBookmarkBtn(btnElement, false);
      toast('담기 실패');
      console.error(error);
      return;
    }
    state.bookmarkRows = [data, ...state.bookmarkRows];
    toast('Collected');
  }
  if (state.currentView === 'bookmarks') renderBookmarks();
  if (state.currentView === 'home') renderRecent();
}

function paintBookmarkBtn(btn, filled) {
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (!icon) return;
  if (filled) {
    icon.classList.add('icon-filled');
    icon.classList.remove('text-walnut');
    icon.classList.add('text-cta');
  } else {
    icon.classList.remove('icon-filled');
    icon.classList.remove('text-cta');
    icon.classList.add('text-walnut');
  }
}

// ---------- Home ----------
function renderHome() {
  homeLoading.classList.add('hidden');
  state.todayCard = pickTodayCard();
  if (!state.todayCard) {
    homeCard.classList.add('hidden');
    homeRecentSection.classList.add('hidden');
    homeEmpty.classList.remove('hidden');
    return;
  }
  applyHomeCard(state.todayCard);
  homeCard.classList.remove('hidden');
  homeEmpty.classList.add('hidden');
  renderRecent();
}

function applyHomeCard(card) {
  state.todayCard = card;
  homeQuote.textContent = `"${cleanQuote(card.quote)}"`;

  // 날짜 라벨 (오늘 영어)
  const d = new Date();
  homeDate.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  // 작품 정보
  const w = card.works || {};
  const title = displayTitle(w.title);
  homeWork.innerHTML = `
    <p class="serif italic text-[18px] text-espresso mb-1">${escapeHtml(title || '제목 없음')}</p>
    <p class="label-eyebrow">${[w.format, w.author, w.release_year].filter(Boolean).map(escapeHtml).join(' · ')}</p>
  `;

  // chips
  const chips = [];
  if (w.format) chips.push(`<span class="chip chip-filled">${escapeHtml(w.format)}</span>`);
  const kws = Array.isArray(card.keywords) ? card.keywords : [];
  kws.slice(0, 2).forEach((k) => chips.push(`<span class="chip">${escapeHtml(k)}</span>`));
  homeChips.innerHTML = chips.join('');

  paintBookmarkBtn(homeBookmarkBtn, state.bookmarkedIds.has(card.card_id));
}

function renderRecent() {
  homeRecentList.innerHTML = '';
  const recent = state.bookmarkRows.slice(0, 3);
  if (recent.length === 0) {
    homeRecentSection.classList.add('hidden');
    return;
  }
  homeRecentSection.classList.remove('hidden');
  recent.forEach((row, i) => {
    const card = row.cards;
    if (!card) return;
    const node = document.createElement('div');
    node.className = 'flex items-start gap-4 py-4 cursor-pointer';
    if (i < recent.length - 1) node.style.borderBottom = '0.5px solid #E8E1D3';
    const w = card.works || {};
    node.innerHTML = `
      <div class="w-12 h-12 bg-espresso flex items-center justify-center shrink-0">
        <span class="serif italic text-paper text-[11px] uppercase tracking-widest">${escapeHtml((w.format || '?').slice(0, 3))}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="serif italic text-[15px] text-espresso clamp-2 leading-snug">"${escapeHtml(cleanQuote(card.quote).slice(0, 60))}${card.quote.length > 60 ? '…' : ''}"</p>
        <p class="label-eyebrow mt-1">${escapeHtml(displayTitle(w.title) || '제목 없음')}</p>
      </div>
    `;
    node.addEventListener('click', () => openCardModal(card));
    homeRecentList.appendChild(node);
  });
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
gotoBookmarksBtn.addEventListener('click', () => setView('bookmarks'));

// ---------- Cards ----------
function renderCards() {
  const q = state.searchText.trim().toLowerCase();
  const filtered = !q ? state.allCards : state.allCards.filter((c) => {
    const title = displayTitle(c.works?.title || '').toLowerCase();
    const rawTitle = (c.works?.title || '').toLowerCase();
    const quote = (c.quote || '').toLowerCase();
    const author = (c.works?.author || '').toLowerCase();
    return title.includes(q) || rawTitle.includes(q) || quote.includes(q) || author.includes(q);
  });
  cardsStatus.textContent = `${filtered.length} CARDS`;
  cardsList.innerHTML = '';
  filtered.forEach((c) => cardsList.appendChild(buildCardRow(c)));
  if (filtered.length === 0) {
    cardsList.innerHTML = '<p class="serif italic text-walnut text-center py-12">검색 결과가 없습니다.</p>';
  }
}

cardsSearch.addEventListener('input', (e) => {
  state.searchText = e.target.value;
  renderCards();
});

// ---------- Bookmarks ----------
function renderBookmarks() {
  bookmarksList.innerHTML = '';
  if (state.bookmarkRows.length === 0) {
    bookmarksStatus.textContent = '';
    bookmarksEmpty.classList.remove('hidden');
    return;
  }
  bookmarksEmpty.classList.add('hidden');
  bookmarksStatus.textContent = `${state.bookmarkRows.length} COLLECTED`;
  state.bookmarkRows.forEach((row) => {
    const card = row.cards;
    if (!card) return;
    bookmarksList.appendChild(buildCardRow(card));
  });
}

// ---------- Card row ----------
function buildCardRow(card) {
  const node = document.createElement('article');
  node.className = 'py-5 cursor-pointer';
  node.style.borderBottom = '0.5px solid #E8E1D3';
  const w = card.works || {};
  const title = displayTitle(w.title) || '제목 없음';
  const meta = [w.format, w.author, w.release_year].filter(Boolean).join(' · ');
  const isBookmarked = state.bookmarkedIds.has(card.card_id);
  node.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex-1 min-w-0">
        <p class="serif italic text-[18px] text-espresso truncate mb-1">${escapeHtml(title)}</p>
        <p class="label-eyebrow">${escapeHtml(meta)}</p>
      </div>
      <button class="bookmark-btn p-1 -m-1 shrink-0" aria-label="북마크">
        <span class="material-symbols-outlined ${isBookmarked ? 'icon-filled text-cta' : 'text-walnut'}" style="font-size:20px;">bookmark</span>
      </button>
    </div>
    <p class="serif italic text-[15px] text-roast leading-snug clamp-3">"${escapeHtml(cleanQuote(card.quote))}"</p>
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
  const isBookmarked = state.bookmarkedIds.has(card.card_id);
  const kws = Array.isArray(card.keywords) ? card.keywords : [];

  modalBody.innerHTML = `
    <p class="label-eyebrow mb-2">${[w.format, w.release_year].filter(Boolean).map(escapeHtml).join(' · ')}</p>
    <h2 class="display-text text-[36px] mb-2 leading-tight">${escapeHtml(title)}</h2>
    ${w.author ? `<p class="serif italic text-walnut mb-6">${escapeHtml(w.author)}</p>` : ''}

    <div class="divider mb-6"></div>

    <blockquote class="serif italic text-[20px] leading-[1.55] text-espresso mb-7">
      "${escapeHtml(cleanQuote(card.quote))}"
    </blockquote>

    ${card.excerpt_description ? `
      <section class="mb-7">
        <p class="label-eyebrow mb-2">Context</p>
        <p class="text-[14px] text-roast leading-relaxed whitespace-pre-wrap">${escapeHtml(card.excerpt_description)}</p>
      </section>
    ` : ''}

    ${card.script_excerpt ? `
      <section class="mb-7">
        <p class="label-eyebrow mb-2">Script Excerpt</p>
        <pre class="text-[13px] font-mono whitespace-pre-wrap text-roast leading-relaxed py-3" style="border-top:0.5px solid #C9B89A;border-bottom:0.5px solid #C9B89A;">${escapeHtml(card.script_excerpt)}</pre>
      </section>
    ` : ''}

    ${kws.length > 0 ? `
      <div class="flex flex-wrap gap-2 mb-7">
        ${kws.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('')}
      </div>
    ` : ''}

    <button id="modal-bookmark-btn" class="${isBookmarked ? 'cta-btn-ghost' : 'cta-btn'} w-full flex items-center justify-center gap-2">
      <span class="material-symbols-outlined ${isBookmarked ? 'icon-filled' : ''}" style="font-size:16px;">${isBookmarked ? 'bookmark' : 'bookmark_border'}</span>
      ${isBookmarked ? 'Collected' : 'Collect Script Artifact'}
    </button>
    <p class="text-center label-eyebrow mt-3" style="opacity:0.5">Limited Edition Digital Manuscript</p>
  `;

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));

  const bmBtn = $('#modal-bookmark-btn');
  bmBtn.addEventListener('click', async () => {
    await toggleBookmark(card.card_id, null);
    const isMarked = state.bookmarkedIds.has(card.card_id);
    bmBtn.className = `${isMarked ? 'cta-btn-ghost' : 'cta-btn'} w-full flex items-center justify-center gap-2`;
    bmBtn.innerHTML = `
      <span class="material-symbols-outlined ${isMarked ? 'icon-filled' : ''}" style="font-size:16px;">${isMarked ? 'bookmark' : 'bookmark_border'}</span>
      ${isMarked ? 'Collected' : 'Collect Script Artifact'}
    `;
    if (state.currentView === 'cards') renderCards();
    if (state.currentView === 'home' && state.todayCard?.card_id === card.card_id) {
      paintBookmarkBtn(homeBookmarkBtn, isMarked);
    }
  });
}

function closeModal() {
  modal.classList.remove('open');
  setTimeout(() => modal.classList.add('hidden'), 250);
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
  if (view === 'cards') renderCards();
  if (view === 'bookmarks') renderBookmarks();
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
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1800);
}
