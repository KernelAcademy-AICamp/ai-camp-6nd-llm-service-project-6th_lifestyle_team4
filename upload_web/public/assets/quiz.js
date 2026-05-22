import { getSupabase, requireSessionOrRedirect } from './supabase-client.js';
import { emailToDisplayId } from './auth-utils.js';

const $ = (sel) => document.querySelector(sel);

// DOM refs
const userEmailEl = $('#user-email');
const logoutBtn = $('#logout-btn');
const toastEl = $('#toast');

// Phase sections
const phaseSetup = $('#phase-setup');
const phasePlay = $('#phase-play');
const phaseEnd = $('#phase-end');

// Setup elements
const playerNameInput = $('#player-name');
const roundButtons = document.querySelectorAll('.round-btn');
const cardPoolCount = $('#card-pool-count');
const startBtn = $('#start-btn');
const rankingSection = $('#ranking-section');
const rankingList = $('#ranking-list');

// Play elements
const roundCurrentEl = $('#round-current');
const roundTotalEl = $('#round-total');
const scoreCurrentEl = $('#score-current');
const progressBar = $('#progress-bar');
const quoteText = $('#quote-text');
const answerInput = $('#answer-input');
const submitBtn = $('#submit-btn');
const feedbackEl = $('#feedback');
const feedbackText = $('#feedback-text');
const feedbackDetail = $('#feedback-detail');
const quitBtn = $('#quit-btn');

// End elements
const endScoreEl = $('#end-score');
const endCorrectEl = $('#end-correct');
const endAccuracyEl = $('#end-accuracy');
const endResults = $('#end-results');
const endRankingList = $('#end-ranking-list');
const playAgainBtn = $('#play-again-btn');

// State
const state = {
  cards: [],          // [{ card_id, quote, title }]
  selectedRounds: 0,
  queue: [],          // shuffled card subset for this game
  index: 0,
  score: 0,
  correctCount: 0,
  results: [],        // [{ quote, title, userAnswer, correct }]
  awaitingNext: false,
};

let currentUserId = null;
let lastInsertedRankingId = null;

// Init
(async () => {
  const token = await requireSessionOrRedirect('/');
  if (!token) return;
  const sb = await getSupabase();
  const { data } = await sb.auth.getUser();
  currentUserId = data?.user?.id || null;
  userEmailEl.textContent = emailToDisplayId(data?.user?.email);

  await loadCards();
  await refreshSetupRanking();
})();

async function refreshSetupRanking() {
  const arr = await fetchRankings();
  await renderRanking(rankingList, arr, null);
  rankingSection.classList.toggle('hidden', arr.length === 0);
}

logoutBtn.addEventListener('click', async () => {
  const sb = await getSupabase();
  await sb.auth.signOut();
  location.href = '/';
});

async function loadCards() {
  cardPoolCount.textContent = '…';
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('cards')
      .select('card_id, quote, works(title)')
      .limit(2000);
    if (error) throw error;
    state.cards = (data || [])
      .map((c) => ({
        card_id: c.card_id,
        quote: String(c.quote || '').trim(),
        title: String(c.works?.title || '').trim(),
      }))
      .filter((c) => c.quote && c.title);
    cardPoolCount.textContent = state.cards.length;
    updateStartButton();
  } catch (err) {
    console.error('[quiz] load cards failed:', err);
    cardPoolCount.textContent = '0';
    showToast(`카드 불러오기 실패: ${err.message || err}`, true);
  }
}

// ---------- Setup phase ----------
roundButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    roundButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedRounds = Number(btn.dataset.rounds);
    updateStartButton();
  });
});

playerNameInput.addEventListener('input', updateStartButton);

function updateStartButton() {
  const name = playerNameInput.value.trim();
  const rounds = state.selectedRounds;
  const haveCards = state.cards.length >= 1;
  startBtn.disabled = !(name && rounds && haveCards);
}

startBtn.addEventListener('click', () => {
  if (startBtn.disabled) return;
  if (state.cards.length === 0) {
    showToast('카드가 없습니다. 먼저 카드를 추가해주세요.', true);
    return;
  }
  startGame();
});

function startGame() {
  // pick rounds — if cards < rounds, use available count
  const rounds = Math.min(state.selectedRounds, state.cards.length);
  state.queue = shuffle([...state.cards]).slice(0, rounds);
  state.index = 0;
  state.score = 0;
  state.correctCount = 0;
  state.results = [];
  state.awaitingNext = false;

  roundTotalEl.textContent = rounds;
  scoreCurrentEl.textContent = '0';

  phaseSetup.classList.add('hidden');
  phaseEnd.classList.add('hidden');
  phasePlay.classList.remove('hidden');

  showCurrentCard();
}

// ---------- Play phase ----------
function showCurrentCard() {
  const card = state.queue[state.index];
  if (!card) {
    endGame();
    return;
  }
  roundCurrentEl.textContent = state.index + 1;
  scoreCurrentEl.textContent = state.score;
  progressBar.style.width = `${(state.index / state.queue.length) * 100}%`;

  quoteText.textContent = cleanQuoteForDisplay(card.quote);
  answerInput.value = '';
  answerInput.disabled = false;
  submitBtn.disabled = false;
  submitBtn.innerHTML = '제출 <span class="material-symbols-outlined text-base">arrow_forward</span>';
  feedbackEl.classList.add('hidden');
  feedbackEl.classList.remove('feedback-correct', 'feedback-wrong');
  state.awaitingNext = false;
  answerInput.focus();
}

submitBtn.addEventListener('click', handleSubmit);
answerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
});

function handleSubmit() {
  if (state.awaitingNext) {
    // user pressed enter again — advance
    state.index += 1;
    showCurrentCard();
    return;
  }
  const card = state.queue[state.index];
  if (!card) return;
  const userAnswer = answerInput.value.trim();
  if (!userAnswer) {
    showToast('답을 입력해주세요.');
    return;
  }
  const correct = matchTitle(userAnswer, card.title);
  if (correct) {
    state.score += 10;
    state.correctCount += 1;
    feedbackEl.classList.remove('hidden');
    feedbackEl.classList.add('feedback-correct');
    feedbackText.textContent = '✅ 정답! +10점';
    feedbackDetail.textContent = `작품: ${displayTitle(card.title)}`;
  } else {
    state.score -= 10;
    feedbackEl.classList.remove('hidden');
    feedbackEl.classList.add('feedback-wrong');
    feedbackText.textContent = '❌ 오답 -10점';
    feedbackDetail.textContent = `정답은: ${displayTitle(card.title)}`;
  }
  state.results.push({
    quote: card.quote,
    title: card.title,
    userAnswer,
    correct,
  });
  scoreCurrentEl.textContent = state.score;
  answerInput.disabled = true;
  state.awaitingNext = true;
  submitBtn.innerHTML = '다음 <span class="material-symbols-outlined text-base">arrow_forward</span>';
  submitBtn.disabled = false;
  submitBtn.focus();
}

quitBtn.addEventListener('click', () => {
  if (!confirm('정말 포기하시겠습니까? 지금까지의 점수로 결과가 기록됩니다.')) return;
  endGame();
});

// ---------- End phase ----------
async function endGame() {
  phasePlay.classList.add('hidden');
  phaseEnd.classList.remove('hidden');

  const played = state.results.length;
  const accuracy = played === 0 ? 0 : Math.round((state.correctCount / played) * 100);
  endScoreEl.textContent = state.score;
  endCorrectEl.textContent = `${state.correctCount} / ${played}`;
  endAccuracyEl.textContent = `${accuracy}%`;

  renderResults();
  // 랭킹 저장 (Supabase)
  lastInsertedRankingId = null;
  if (played > 0) {
    lastInsertedRankingId = await saveRanking(
      playerNameInput.value.trim(),
      state.score,
      state.correctCount,
      played,
    );
  }
  const arr = await fetchRankings();
  await renderRanking(endRankingList, arr, lastInsertedRankingId);
}

function renderResults() {
  endResults.innerHTML = '';
  state.results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = `p-3 rounded-lg border ${r.correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`;
    row.innerHTML = `
      <div class="flex items-start gap-2 mb-1">
        <span class="text-xs font-bold ${r.correct ? 'text-green-700' : 'text-red-700'} shrink-0">#${i + 1} ${r.correct ? '✓' : '✗'}</span>
        <p class="text-sm font-semibold">${escapeHtml(displayTitle(r.title))}</p>
      </div>
      <p class="text-xs text-on-surface-variant pl-6 italic">"${escapeHtml(truncate(r.quote, 80))}"</p>
      ${!r.correct ? `<p class="text-xs text-red-600 pl-6 mt-1">내 답: ${escapeHtml(r.userAnswer)}</p>` : ''}
    `;
    endResults.appendChild(row);
  });
  if (state.results.length === 0) {
    endResults.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-4">기록된 결과가 없습니다.</p>';
  }
}

playAgainBtn.addEventListener('click', async () => {
  phaseEnd.classList.add('hidden');
  phaseSetup.classList.remove('hidden');
  await refreshSetupRanking();
});

// ---------- Ranking (Supabase shared) ----------
async function fetchRankings(limit = 10) {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('quiz_rankings')
      .select('id, name, score, correct, played, created_at, user_id')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[quiz] fetch rankings failed:', err);
    return [];
  }
}

async function saveRanking(name, score, correct, played) {
  if (!name || !currentUserId) return null;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('quiz_rankings')
      .insert({
        name,
        score,
        correct,
        played,
        user_id: currentUserId,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    console.error('[quiz] save ranking failed:', err);
    showToast(`랭킹 저장 실패: ${err.message || err}`, true);
    return null;
  }
}

async function renderRanking(container, rankings, highlightId) {
  const arr = Array.isArray(rankings) ? rankings : [];
  container.innerHTML = '';
  if (arr.length === 0) {
    container.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-3">아직 기록이 없습니다.</p>';
    return;
  }
  arr.forEach((entry, i) => {
    const isCurrent = highlightId != null && entry.id === highlightId;
    const row = document.createElement('div');
    row.className = `ranking-row flex items-center justify-between px-3 py-2 border-b border-outline-variant/30 last:border-b-0 ${isCurrent ? 'current' : ''}`;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="text-on-surface-variant text-xs font-mono">${String(i + 1).padStart(2, '0')}</span>`;
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-base w-6 text-center">${medal}</span>
        <span class="font-semibold">${escapeHtml(entry.name)}</span>
        <span class="text-xs text-on-surface-variant">${entry.correct}/${entry.played}</span>
      </div>
      <span class="font-bold ${entry.score >= 0 ? 'text-primary' : 'text-error'}">${entry.score}점</span>
    `;
    container.appendChild(row);
  });
}

// ---------- Utils ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Normalize title for comparison: lowercase, strip whitespace and most punctuation,
// keep Korean/letters/numbers only.
function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s ]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// 영문/한글 alias — DB 원본은 영문이지만 한글 입력도 정답 처리
const TITLE_DISPLAY_ALIASES = {
  'titanic': '타이타닉',
};
function displayTitle(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t) return t;
  return TITLE_DISPLAY_ALIASES[t.toLowerCase()] || t;
}
function aliasesFor(target) {
  const out = new Set();
  const t = String(target || '').trim();
  if (!t) return out;
  out.add(t);
  const lower = t.toLowerCase();
  if (TITLE_DISPLAY_ALIASES[lower]) out.add(TITLE_DISPLAY_ALIASES[lower]);
  Object.entries(TITLE_DISPLAY_ALIASES).forEach(([k, v]) => {
    if (v === t) out.add(k);
  });
  return out;
}

function matchTitle(userAnswer, target) {
  const u = normalizeTitle(userAnswer);
  if (!u) return false;
  for (const alias of aliasesFor(target)) {
    const t = normalizeTitle(alias);
    if (!t) continue;
    if (u === t) return true;
    if (u.length >= 2 && t.length >= 2 && (t.includes(u) || u.includes(t))) {
      const ratio = Math.min(u.length, t.length) / Math.max(u.length, t.length);
      if (ratio >= 0.5) return true;
    }
  }
  return false;
}

// Compact display of quote — strip em-dashes, collapse whitespace, limit length.
function cleanQuoteForDisplay(s) {
  let text = String(s ?? '');
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');
  // collapse multi-blank-lines but keep single newlines
  text = text.replace(/\n{2,}/g, '\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  return text.trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

let toastTimer = null;
function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.classList.toggle('bg-error', isError);
  toastEl.classList.toggle('bg-inverse-surface', !isError);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2400);
}
