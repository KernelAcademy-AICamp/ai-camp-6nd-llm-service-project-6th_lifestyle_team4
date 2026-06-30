// Daily Script SPA — Android HomeScreen/ArchiveScreen/SettingsScreen/DetailScreen port
import { getSupabase } from '/assets/supabase-client.js';
/* OZ's house iframe 이 부모의 Supabase 클라이언트에 접근하기 위해 window 에 노출 */
window.getSupabase = getSupabase;
/* 이미지 다운로드 방지 — 우클릭(contextmenu) + 드래그 차단. 완벽한 보호는 아님(DevTools/네트워크 캐시로는 추출 가능) */
document.addEventListener('contextmenu', (e) => {
  if (e.target && (e.target.tagName === 'IMG' || (e.target.closest && e.target.closest('img')))) e.preventDefault();
}, true);
document.addEventListener('dragstart', (e) => {
  if (e.target && e.target.tagName === 'IMG') e.preventDefault();
}, true);
/* OZ's house 시트 항목(북마크/댓글/감상평/하이라이트) 클릭 시 부모의 카드 상세로 이동 */
window.openCardById = (cardId) => {
  const cid = Number(cardId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  const card = (state.allCards || []).find((c) => c && Number(c.card_id) === cid);
  if (!card) return;
  if (typeof closeOzHouseInternal === 'function') {
    try { closeOzHouseInternal(); } catch {}
  }
  try { openDetail(card); } catch (e) { console.warn('[m] openCardById failed:', e); }
};
import { initAnalytics, track, identify, setUserProps, resetUser } from '/assets/analytics.js';
// onboarding.js는 선택적 기능 — 정적 import면 파일 누락/404 시 m-app.js 전체가
// 로드 실패해 "무한 스피너"가 된다. 동적 import + 무해한 폴백으로 부팅을 막지 않게 한다.
// (현재 리포지토리에 onboarding.js가 없어도 앱은 정상 부팅, 코치마크 투어만 비활성)
let startCoachmarkTour = () => false;
// 첫 진입 온보딩을 확실히 띄우려면 이 로드 완료를 기다려야 한다(onboardingReady).
const onboardingReady = import('./onboarding.js')
  .then((m) => { if (m && typeof m.startCoachmarkTour === 'function') startCoachmarkTour = m.startCoachmarkTour; })
  .catch((e) => console.warn('[m] onboarding 모듈 없음 — 코치마크 투어 비활성:', e));

// preferences.js — 선호도 온보딩(사용법 투어 직전 1회). onboarding 과 같은 동적 import 패턴.
let startPreferenceFlow = () => Promise.resolve(null);
const preferencesReady = import('./preferences.js')
  .then((m) => { if (m && typeof m.startPreferenceFlow === 'function') startPreferenceFlow = m.startPreferenceFlow; })
  .catch((e) => console.warn('[m] preferences 모듈 없음 — 선호도 온보딩 비활성:', e));

// card-theme.js — 키워드→주제 분류기. 추천 themeMatch 가중에 사용(없으면 주제 가중만 중립).
let cardThemeSet = null;
import('./card-theme.js')
  .then((m) => { if (m && typeof m.cardThemeSet === 'function') cardThemeSet = m.cardThemeSet; })
  .catch((e) => console.warn('[m] card-theme 모듈 없음 — 주제 가중 비활성:', e));

// companion.js — 명대사 동무(대화 동무 + 큐레이션 챗봇). 동적 import 라 파일 누락 시에도 부팅 안전.
let openCompanion = () => {};
let isCompanionOpen = () => false;
let closeCompanionInternal = () => {};
import('./companion.js')
  .then((m) => {
    if (m && typeof m.openCompanion === 'function') openCompanion = m.openCompanion;
    if (m && typeof m.isCompanionOpen === 'function') isCompanionOpen = m.isCompanionOpen;
    if (m && typeof m.closeCompanionInternal === 'function') closeCompanionInternal = m.closeCompanionInternal;
  })
  .catch((e) => console.warn('[m] companion 모듈 없음 — 명대사 동무 비활성:', e));

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function safeStorageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// ---------- DOM ----------
const topBarHome = $('#top-bar-home');
const topBarSettings = $('#top-bar-settings');
const headerHairline = $('#header-hairline');

const viewDaily = $('#view-daily');
const viewHome = $('#view-home');
const viewArchive = $('#view-archive');
const viewFeed = $('#view-feed');
const viewNotice = $('#view-notice');
const viewSettings = $('#view-settings');

const homeLoading = $('#home-loading');
const homeContent = $('#home-content');
const homeDate = $('#home-date');
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
const todayLangToggle = $('#today-lang-toggle');
const todayRead = $('#today-read');
const todayCompanion = $('#today-companion');
const homeBookmarksList = $('#home-bookmarks-list');

const archiveLoading = $('#archive-loading');
const archiveShelves = $('#archive-shelves');
const archiveEmpty = $('#archive-empty');
const archiveNoResult = $('#archive-no-result');
const archiveCount = $('#archive-count');
const archiveSearchInput = $('#archive-search-input');
const archiveChips = $('#archive-chips');
const archiveCat = $('#archive-cat');

// MY>북마크 화면 (책꽂이 — 기존 archive UI 를 북마크 데이터로 재사용)
const bookmarksScreen = $('#bookmarks-screen');
const bookmarksBody = $('#bookmarks-body');
const bookmarksBack = $('#bookmarks-back');
const bmCount = $('#bm-count');
const bmChips = $('#bm-chips');
const bmSearchInput = $('#bm-search-input');
const bmShelves = $('#bm-shelves');
const bmEmpty = $('#bm-empty');
const bmNoResult = $('#bm-no-result');
const mypageBookmarksBlock = $('#mypage-bookmarks-block');
const mypageBookmarksEntry = $('#mypage-bookmarks-entry');

// 실타래(yarn)
const yarnChip = $('#yarn-chip');
const yarnScreen = $('#yarn-screen');
const yarnBack = $('#yarn-back');
const yarnTiersEl = $('#yarn-tiers');
const yarnBalanceNum = $('#yarn-balance-num');
const yarnTabCharge = $('#yarn-tab-charge');
const yarnTabAbout = $('#yarn-tab-about');
const yarnChargeTab = $('#yarn-charge-tab');
const yarnAboutTab = $('#yarn-about-tab');
const bookModal = $('#book-modal');
const bookEyebrow = $('#book-eyebrow');
const bookTitleEl = $('#book-title');
const bookMetaEl = $('#book-meta');
const bookIntroEl = $('#book-intro');
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
const mypageActivityLabel = $('#mypage-activity-label');
const mypageChatsBlock = $('#mypage-chats-block');
const mypageChatsEntry = $('#mypage-chats-entry');
const chatsScreen = $('#chats-screen');
const chatsBack = $('#chats-back');
const chatsList = $('#chats-list');
const chatsEmpty = $('#chats-empty');
const chatsBody = $('#chats-body');
// MY FEED
const mypageFeedBlock = $('#mypage-feed-block');
const mypageFeedEntry = $('#mypage-feed-entry');
const myfeedScreen = $('#myfeed-screen');
const myfeedBack = $('#myfeed-back');
const myfeedList = $('#myfeed-list');
const myfeedEmpty = $('#myfeed-empty');
const myfeedEmptyIcon = $('#myfeed-empty-icon');
const myfeedEmptyTitle = $('#myfeed-empty-title');
const myfeedEmptySub = $('#myfeed-empty-sub');
// Highlight 기능
const hlAddBtn = $('#hl-add-btn');
const hlComposeScreen = $('#hl-compose-screen');
const hlComposeBack = $('#hl-compose-back');
const hlComposeSave = $('#hl-compose-save');
const hlCoverFallback = $('#hl-cover-fallback');
const hlTitleEl = $('#hl-title');
const hlSubtitleEl = $('#hl-subtitle');
const hlAuthorYearEl = $('#hl-author-year');
const hlCardIdEl = $('#hl-card-id');
const hlSelectedTextEl = $('#hl-selected-text');
const highlightsList = $('#highlights-list');
const highlightsEmpty = $('#highlights-empty');
const themeToggle = $('#theme-toggle');
const themeSubtitle = $('#theme-subtitle');
const editNicknameBtn = $('#edit-nickname-btn');
const nicknameModal = $('#nickname-modal');
const nicknameInput = $('#nickname-input');
const nicknameSaveBtn = $('#nickname-save');
const nicknameCancelBtn = $('#nickname-cancel');
const nicknameRandomizeBtn = $('#nickname-randomize');
const profileGender = $('#profile-gender');
const profileAge = $('#profile-age');

const feedbackScreen = $('#feedback-screen');
const feedbackEntry = $('#feedback-entry');

const detailScreen = $('#detail-screen');
const detailBody = detailScreen?.querySelector('.detail-body');
/* 카드 상세 — 스크롤 80% 이상이면 왼쪽 하단 '맨 위로' fab 노출. 클릭 시 최상단.
   추가로 90% 이상 스크롤 시 카드 첫 열람 실타래 보상 트리거 (카드당 1회, 세션 dedup). */
(function () {
  const fab = document.getElementById('detail-scroll-top-fab');
  if (!detailBody) return;
  function onScroll() {
    const max = detailBody.scrollHeight - detailBody.clientHeight;
    if (max <= 0) { hide(); return; }
    const ratio = detailBody.scrollTop / max;
    if (fab) (ratio >= 0.8 ? show : hide)();
    /* '작품의 의의' 블록이 viewport 중앙쯤 도달 → 실타래 보상. 같은 카드 세션 1회. 서버 RPC 영구 dedup.
       의의 element 없으면 95% 스크롤로 폴백. */
    const sigEl = document.getElementById('detail-significance-block');
    const vh = detailBody.clientHeight || window.innerHeight;
    const sigCenterPassed = sigEl && sigEl.offsetParent !== null && (() => {
      const r = sigEl.getBoundingClientRect();
      const bodyR = detailBody.getBoundingClientRect();
      /* 의의 top 이 detailBody 상단으로부터 viewport 절반 이하 (= 화면 가운데 위쪽 통과) */
      return (r.top - bodyR.top) <= (vh * 0.5);
    })();
    if (sigCenterPassed || ratio >= 0.95) {
      const cid = state.detailCardId;
      if (cid && state._rewardTriggeredCardId !== cid) {
        state._rewardTriggeredCardId = cid;
        try { rewardYarnForFirstView(cid); } catch (e) { console.warn('[m] reward trigger failed:', e); }
      }
      /* 공유 링크로 진입한 익명 사용자가 그 카드를 끝까지 읽었으면 회원가입 유도 (세션당 1회) */
      if (state.isAnonymous && cid && cid === state._sharedCardOpenedId && !state._sharedSignupShown) {
        state._sharedSignupShown = true;
        try {
          openPromptModal({
            title: '더 많은 명작을 만나보세요',
            message: '회원가입하고 매일 새로운 명대사를 받아보세요.\n친구가 보낸 카드 덕분에 가입하면 실타래 600개 보너스!',
            confirmLabel: '회원가입',
            dismissLabel: '닫기',
            openSigninOnConfirm: true,
          });
        } catch (e) { console.warn('[m] shared signup prompt failed:', e); }
      }
    }
  }
  function show() {
    fab.style.display = 'flex';
    requestAnimationFrame(() => { fab.style.opacity = '1'; fab.style.transform = 'translateY(0)'; });
  }
  function hide() {
    if (!fab) return;
    fab.style.opacity = '0'; fab.style.transform = 'translateY(8px)';
    setTimeout(() => { if (fab.style.opacity === '0') fab.style.display = 'none'; }, 220);
  }
  detailBody.addEventListener('scroll', onScroll, { passive: true });
  fab?.addEventListener('click', () => {
    detailBody.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
const detailBack = $('#detail-back');
const detailWorkTitle = $('#detail-work-title');
const detailBookmark = $('#detail-bookmark');
const detailMeta = $('#detail-meta');
const detailDescription = $('#detail-description');
const detailDescriptionBlock = $('#detail-description-block');
const detailDescSpacer = $('#detail-desc-spacer');
const detailScript = $('#detail-script');
const detailSignificanceBlock = $('#detail-significance-block');
const detailSignificance = $('#detail-significance');
const detailCollectBtn = $('#detail-collect-btn');
const detailEdition = $('#detail-edition');
const detailCommentsList = $('#detail-comments-list');
const detailCommentsEmpty = $('#detail-comments-empty');
const detailCommentLogin = $('#detail-comment-login');
const detailCommentForm = $('#detail-comment-form');
const detailCommentInput = $('#detail-comment-input');
const detailCommentCounter = $('#detail-comment-counter');
const detailCommentSubmit = $('#detail-comment-submit');
const detailReplyTarget = $('#detail-reply-target');
const detailReplyTargetName = $('#detail-reply-target-name');
const detailReplyCancel = $('#detail-reply-cancel');

const feedList = $('#feed-list');
const feedFab = $('#feed-fab');
const archiveFab = $('#archive-fab');
const feedPickerModal = $('#feed-picker-modal');
const feedPickerList = $('#feed-picker-list');
const feedPickerClose = $('#feed-picker-close');
const feedComposeModal = $('#feed-compose-modal');
const fcTitle = $('#fc-title');
const fcMeta = $('#fc-meta');
const fcEdition = $('#fc-edition');
const fcInput = $('#fc-input');
const fcCounter = $('#fc-counter');
const fcSubmit = $('#fc-submit');
const feedComposeClose = $('#feed-compose-close');
const feedQuoteModal = $('#feed-quote-modal');
const fqQuote = $('#fq-quote');
const fqSource = $('#fq-source');

// 피드 글 상세 + 댓글 (FeedPostDetailSheet 미러)
const feedpostScreen = $('#feedpost-screen');

// 글쓰기 펜 fab (feed) + 북마크 fab (archive) — 각자 main view 에서만, 오버레이 열려있으면 hide.
// 모든 show/hide 시점에서 이 함수만 호출하면 일관 처리.
function syncFeedFab() {
  const overlayOpen = (detailScreen && detailScreen.classList.contains('open'))
    || (feedpostScreen && feedpostScreen.classList.contains('open'))
    || (hlComposeScreen && hlComposeScreen.classList.contains('open'));
  if (feedFab) {
    const onFeedMain = state.currentView === 'feed' && !overlayOpen;
    feedFab.style.display = onFeedMain ? 'inline-flex' : 'none';
  }
  if (archiveFab) {
    const bmOpen = bookmarksScreen && bookmarksScreen.classList.contains('open');
    const onArchiveMain = state.currentView === 'archive' && !overlayOpen && !bmOpen;
    archiveFab.style.display = onArchiveMain ? 'inline-flex' : 'none';
  }
}
const feedpostBody = $('#feedpost-body');
const feedpostBack = $('#feedpost-back');
const fpQuote = $('#fp-quote');
const fpSource = $('#fp-source');
const fpOpenCard = $('#fp-open-card');
const fpAuthor = $('#fp-author');
const fpDate = $('#fp-date');
const fpBody = $('#fp-body');
const fpCommentsHeader = $('#fp-comments-header');
const fpCommentLogin = $('#fp-comment-login');
const fpCommentForm = $('#fp-comment-form');
const fpCommentInput = $('#fp-comment-input');
const fpCommentCounter = $('#fp-comment-counter');
const fpCommentSubmit = $('#fp-comment-submit');
const fpCommentsEmpty = $('#fp-comments-empty');
const fpCommentsList = $('#fp-comments-list');

const toastEl = $('#toast');

// ---------- State ----------
// m-app.js 는 ES module — state/getSupabase 가 자동으로 window 에 노출되지 않는다.
// OZ's house iframe(oz-house.html) 이 부모의 데이터에 접근하기 위해 명시적으로 window 에 게시.
const state = {
  userId: null,
  authUid: null,
  isAnonymous: true,        // 익명 세션인지
  authProvider: null,       // 'google' | 'kakao' | null
  authEmail: null,
  authName: null,
  authAvatarUrl: null,
  userNickname: '',         // public.users.nickname — 사용자가 수정 가능한 표시 이름
  userLoginId: '',          // public.users.login_id — 로그인 아이디 (이메일 대신 표시)
  userGender: '',           // public.users.gender — '' | male | female | other
  userAgeGroup: '',         // public.users.age_group — '' | 10s..90s
  todayCard: null,
  todayBookmarked: false,
  allCards: [],
  bookmarks: [],            // raw bookmark rows
  bookmarkedIds: new Set(),
  bookmarkCounts: new Map(),  // card_id → bookmark_count (from card_bookmark_counts view)
  currentView: 'daily',
  detailCardId: null,
  pushEnabled: false,
  bookmarkActionInFlight: false,
  yarnPurchased: 0,        // 충전(구매) 잔액 — 서버 users.yarn_balance 시드 (무료 5/일은 localStorage)
  archiveSearch: '',       // LIBRARY 탭(전체 도서 카탈로그) 검색
  archiveGenre: '',        // '' = all, or 'movie'|'drama'|'musical'|'opera'|'play'
  archiveSort: (typeof localStorage !== 'undefined' && localStorage.getItem('ds.archiveSort')) || 'alpha',  // 'alpha' | 'latest'
  bmSearch: '',            // MY>북마크 화면 검색 (카탈로그와 독립)
  bmGenre: '',             // MY>북마크 화면 장르 필터
  recentlyShownIds: [],    // 오늘의 명대사 셔플 시 최근 10개 제외용 큐
  detailComments: [],      // 현재 열린 카드의 댓글 목록 (top-level + 답글 섞임)
  detailLikes: new Map(),  // comment_id → Set<user_id>
  detailCommentSubmitting: false,
  replyingToCommentId: null,   // 현재 답글 작성 대상 comment_id (null = 최상위 댓글)
  replyingToNickname: '',
  editingCommentId: null,      // 현재 인라인 수정 중인 comment_id (null = 수정 모드 아님)
  feedCategory: (() => {
    const v = safeStorageGet('ds.feedCategory', 'today');
    return v === 'highlight' ? 'highlight' : 'today';
  })(),                          // 피드 내부 카테고리 (새로고침에도 유지): 'today' | 'highlight'
  feedPosts: [],               // (오늘의 한줄) feed_posts 조인 rows. 없으면 FEED_SAMPLES 폴백.
  feedLoaded: false,           // loadFeedPosts 1회 호출 여부
  composeCard: null,           // 오늘의 한줄 작성 모달 대상 카드
  feedSubmitting: false,
  currentFeedPost: null,       // 피드 글 상세에 열린 post
  feedPostComments: [],        // 현재 피드 글의 댓글 (feed_post_comments, 평면)
  feedCommentSubmitting: false,
  draftHighlight: null,        // (하이라이트) { card, selectedText } — compose 화면 채움용
  highlights: [],              // (하이라이트) card_highlights 조회 rows (cards/works join)
  myfeedCategory: 'comment',   // MY FEED 내부 카테고리: 'comment' | 'highlight'
  // MY CHATS / MY FEED 인라인 편집 상태
  myChats: [],                 // card_comments WHERE user_id=me
  editingMyChatId: null,
  myFeedComments: [],          // feed_posts WHERE user_id=me
  myFeedHighlights: [],        // card_highlights WHERE user_id=me
  editingMyFeedId: null,
  editingMyFeedKind: null,     // 'comment' | 'highlight'
  notices: [],                 // 공지사항 (Supabase notices 테이블)
  noticesLoaded: false,
};
window.state = state;   // OZ's house iframe 에서 parent.state 로 접근
let detailCommentsChannel = null;

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

// script_excerpt에서 'quote를 말한 화자'를 추출.
// 발췌문을 화자 블록으로 나눈 뒤, quote가 들어있는 블록의 화자를 반환한다.
// (예전엔 발췌문 '첫 화자'만 봐서, 발췌문이 다른 인물 대사로 시작하면 화자가 틀어졌다)
//   화자 줄 판별 1순위: works.characters 배열과 라인 시작 매칭
//                2순위: "이름: 대사" 콜론 패턴 (콜론 앞 20자 미만)
// quote를 못 찾으면: 화자가 한 명뿐인 발췌문이면 그 화자, 여럿이면 ''(틀린 추측 대신 미표시).
function extractSpeaker(scriptExcerpt, characters, quote, opts = {}) {
  if (!scriptExcerpt) return opts.returnBlocks ? { speaker: '', blocks: [], foundIdx: -1 } : '';
  // 긴 이름 우선 정렬 — "줄리엣의 유모"가 "줄리엣"보다 먼저 매칭되도록
  const rawNames = (Array.isArray(characters) ? characters : [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  // 영문 희곡 대비 — full name 외에도 first name 단독, 모두 후보로 추가
  //   ["Huck Finn"] → ["Huck Finn", "Huck"]
  const expanded = new Set();
  for (const n of rawNames) {
    expanded.add(n);
    const parts = n.split(/\s+/);
    if (parts.length > 1) expanded.add(parts[0]); // first name
  }
  const names = [...expanded].sort((a, b) => b.length - a.length);

  // 영문 대문자 표기 동의어용 — 모든 비교는 case-insensitive
  function startsWithName(line, name) {
    // 정확/대소문자무시 prefix 매칭. 단, 이름 직후가 단어 경계여야 함 (이름이 다른 단어 prefix 가 아님)
    if (line.length < name.length) return false;
    if (line.slice(0, name.length).toLowerCase() !== name.toLowerCase()) return false;
    const next = line[name.length];
    if (!next) return true;                             // 라인 끝
    if (/[A-Za-z0-9가-힯]/.test(next)) return false;   // 단어 계속 (다른 사람)
    return true;
  }

  // 한 줄이 화자 줄이면 { name, rest(같은 줄에 붙은 대사) } 반환, 아니면 null
  function speakerOf(rawIn) {
    let raw = rawIn;
    // (전처리) 줄 앞 마커/번호 무시 — "- ANTIGONE" / "• Antigone" / "1. ANTIGONE" / "1) Antigone"
    raw = String(raw).replace(/^[\s]*(?:[\-•·*]\s+|\d{1,3}[.)]\s+)/, '');
    const t = raw.trim();
    if (!t) return null;
    // 0) **볼드 라인** 폴백 — 라인 시작이 **이름** (닫는 ** 또는 라인 끝) + 종결자/지문
    //    매칭:
    //      "**LYSANDER**" / "**Antigone**." / "**Poet**:" / "**Knight of the Mirror**;"
    //      "**Hamlet** (지문)" / "**Poet:**" (콜론이 별표 안쪽) / "**Antigone—**"
    //      "**CORDELIA"  — 한쪽만 (LLM 출력 깨진 볼드, 닫는 ** 없음. 라인 끝까지)
    //      "POET**"      — 시작 ** 없음, 끝만 (드물지만 안전)
    //    제외: dialogue 한가운데 부분 볼드 (`**emphasis** said something`),
    //          라인 시작 ** 뒤 종결자 없는 일반 텍스트
    {
      const bm = t.match(/^\s*\*+([^*\n]+?)(?:\*+|$)\s*(?:[:.,;—–]|$|\()(.*)$/);
      if (bm) {
        let nm = bm[1].trim().replace(/^[\s.,:：;—–]+|[\s.,:：;—–]+$/g, '').trim();
        if (nm && nm.length <= 40) {
          const restRaw = (bm[2] || '').trim();
          const rest = restRaw.replace(/^[:.,;—–]\s*/, '');
          return { name: nm, rest };
        }
      }
    }
    // 1) characters 매칭 — case-insensitive prefix + 이름 뒤가 콜론/마침표/괄호/줄끝
    //    영문 추가: 마침표 "HUCK." / 콤마 "HUCK," 등 흔한 희곡 표기
    for (const name of names) {
      if (!startsWithName(t, name)) continue;
      const tail = t.slice(name.length);
      const tt = tail.trim();
      if (tt === '') return { name, rest: '' };                                        // 이름만
      if (tt[0] === ':' || tt[0] === '：') return { name, rest: tt.slice(1).trim() };  // 이름: 대사
      if (tt[0] === '(' || tt[0] === '（') return { name, rest: tt };                  // 이름 (지문)
      if (tt[0] === '.' || tt[0] === ',') return { name, rest: tt.slice(1).trim() };   // 이름. / 이름,
      if (tt[0] === '—' || tt[0] === '–') return { name, rest: tt.slice(1).trim() };   // 이름— / 이름–
      if (tt[0] === ';') return { name, rest: tt.slice(1).trim() };                    // 이름;
    }
    // 1.5) 대괄호 화자 — "[ANTIGONE]" / "[Antigone]" / "[안티고네] 대사"
    {
      const bk = t.match(/^[\[【]([^\]】\n]{1,30})[\]】]\s*[:：.,—–]?\s*(.*)$/);
      if (bk) {
        const nm = bk[1].trim();
        if (nm) return { name: nm, rest: (bk[2] || '').trim() };
      }
    }
    // 2) 콜론 패턴 폴백 — "이름: 대사"
    let m = t.match(/^([^\n:：—\-]{1,30})[:：]\s*(.*)$/);
    if (m) {
      const nm = m[1].replace(/\s*[(（].*?[)）]\s*$/, '').trim();
      if (nm) return { name: nm, rest: m[2] || '' };
    }
    // 2.5) em-dash 종결자 — 영문 화자만 ("ANTIGONE—대사" / "Antigone—대사")
    //      한글은 characters 매칭(폴백 1)으로만 — "청하건대—후하게…—" 같은
    //      대사 안 강조 표현이 화자로 오인되는 케이스 방지.
    //      em-dash 2개 이상이면 dialogue 강조로 판정해 매칭 skip.
    if ((t.match(/[—–]/g) || []).length < 2) {
      // 영문 시작 + em-dash 1개만
      const dm = t.match(/^([A-Za-z][A-Za-z .'\-]{1,29})\s*[—–]\s*(.*)$/);
      if (dm) {
        const nm = dm[1].trim();
        const rest = (dm[2] || '').trim();
        // nm 이 너무 짧거나 dialogue 안의 em-dash 인 경우 제외 — nm 에 알파벳/한글이 있어야
        // + 화자 라벨엔 절/문장 구두점(쉼표·느낌표·물음표·말줄임표)이 없다. 줄표를 극적
        //   호흡으로 쓰는 대사("아니, 나는 알아—끝났어")를 화자명으로 오인하지 않게 차단.
        if (nm.length >= 2 && /[A-Za-z가-힯]/.test(nm) && !/[,，!！?？…‥。]/.test(nm)) {
          return { name: nm, rest };
        }
      }
    }
    // 3) 영문 희곡 ALL-CAPS 라벨 폴백 — 라인 전체가 라벨일 때만 (종결자 후 라인 끝)
    //    "HUCK." / "HUCK" / "ANTIGONE—" / "ANTIGONE;"
    //    (콜론/em-dash + 같은 줄 대사는 이미 위 2/2.5번이 처리)
    m = t.match(/^([A-Z][A-Z .'\-]{0,28})\s*[.,—–;]?\s*$/);
    if (m) {
      const nm = m[1].replace(/[.,]/g, '').trim();
      if (nm.length >= 2 && nm.length <= 30 && /^[A-Z][A-Z .'\-]*$/.test(nm)) {
        return { name: nm, rest: '' };
      }
    }
    // 4) Title Case 라벨 폴백 — 라인 전체가 라벨일 때만
    //    "Antigone." / "Antigone—" / "Tom Sawyer." / "Lady Macbeth"
    //    "I think." 같은 짧은 문장 오인 방지: 마지막 단어가 흔한 verb/접속사면 제외
    if (t.length <= 30) {
      const tm = t.match(/^([A-Z][a-zA-Z]{1,}(?:\s[A-Z][a-zA-Z]+){0,3})\s*[.,—–;]?\s*$/);
      if (tm) {
        const candidate = tm[1].trim();
        // verb/접속사 제외 — 일반 영문 문장 첫 단어로 자주 등장하는 것
        const lower = candidate.toLowerCase();
        const FALSE_POS = new Set([
          'i', 'then', 'but', 'and', 'or', 'so', 'now', 'yet', 'thus', 'still',
          'said', 'replied', 'cried', 'asked', 'whispered', 'shouted',
          'mr', 'mrs', 'ms', 'dr', 'sir', 'madam', 'lord', 'lady',
          'chapter', 'scene', 'act', 'prologue', 'epilogue',
        ]);
        if (!FALSE_POS.has(lower) && candidate.length >= 3) {
          return { name: candidate, rest: '' };
        }
      }
    }
    return null;
  }

  // 공백·따옴표 차이를 무시하고 비교 — quote의 \n 위치와 발췌문의 \n 위치가 달라도 매칭
  const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/["“”'`']/g, '');

  // 발췌문을 화자 블록으로 분할
  const blocks = [];
  let cur = null;
  for (const raw of String(scriptExcerpt).split('\n')) {
    const sp = speakerOf(raw);
    if (sp) {
      cur = { speaker: sp.name, text: sp.rest };
      blocks.push(cur);
    } else if (cur) {
      cur.text += '\n' + raw;
    }
  }

  // 블록이 없으면 — 소설/내러티브: "said X" / "X said" dialogue tag 폴백
  // quote 주변 ±200자에서 등장인물 이름과 said/replied/answered 결합 찾기
  if (blocks.length === 0) {
    const finalize = (sp) => opts.returnBlocks ? { speaker: sp, blocks: [], foundIdx: -1 } : sp;
    if (!names.length) return finalize('');
    const fullText = String(scriptExcerpt);
    const qn = norm(quote);
    if (!qn) return finalize('');
    const firstWord = String(quote).split(/\s+/).find((w) => w.length >= 3) || '';
    const idx = firstWord ? fullText.indexOf(firstWord) : -1;
    const window = idx >= 0 ? fullText.slice(Math.max(0, idx - 200), idx + (quote.length || 0) + 200) : fullText;
    const verbs = 'said|replied|answered|asked|exclaimed|cried|whispered|shouted|murmured|added|continued|remarked|observed|declared|muttered|interrupted';
    for (const name of names) {
      const nameEsc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const a = new RegExp(`\\b${nameEsc}\\s+(?:${verbs})\\b`, 'i');
      if (a.test(window)) return finalize(name);
      const b = new RegExp(`\\b(?:${verbs})\\s+${nameEsc}\\b`, 'i');
      if (b.test(window)) return finalize(name);
    }
    return finalize('');
  }

  // quote가 들어있는 블록 찾기 — foundIdx 추적 (cross-lang 매칭용)
  let foundIdx = -1;
  const qn = norm(quote);
  if (qn) {
    foundIdx = blocks.findIndex((b) => norm(b.text).includes(qn));
    if (foundIdx < 0) {
      // quote 첫 문장만으로 재시도 (발췌문엔 quote 일부만 있을 때)
      const firstLine = String(quote).split('\n').map((s) => s.trim()).find(Boolean) || '';
      const fln = norm(firstLine);
      if (fln.length >= 4) {
        foundIdx = blocks.findIndex((b) => norm(b.text).includes(fln));
      }
    }
  }
  let speaker = foundIdx >= 0 ? blocks[foundIdx].speaker : '';

  // 못 찾음 — 화자 한 명뿐(독백 등)이면 그 화자, 여럿이면 틀린 추측 대신 미표시
  if (!speaker) {
    const distinct = new Set(blocks.map((b) => b.speaker));
    if (distinct.size === 1) {
      speaker = blocks[0].speaker;
      foundIdx = 0;
    }
  }

  return opts.returnBlocks ? { speaker, blocks, foundIdx } : speaker;
}

// EN 모드 화자 추출 — 영문 script 에서 직접 추출 시도, 실패 시 한글 quote → 한글 블록
// 인덱스 → 영문 블록 같은 인덱스의 영문 라벨을 가져온다. 영문/한글 발췌문이 같은 순서의
// 같은 인물 대사를 담는다는 가정 (LLM 번역으로 보장됨). 영문 추출이 안 잡히는 카드에서도
// 영문 이름을 보장하면서 한글 이름이 영문 모드에 섞이지 않게 한다.
// 추출된 화자 라벨의 별표/콜론/공백 등 잡티 정리 + 한글 차단.
function cleanSpeakerLabel(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  // 양쪽 별표/마침표/콜론/세미콜론/콤마/em-dash 반복 제거
  t = t.replace(/^[\*\s.,:：;—–]+|[\*\s.,:：;—–]+$/g, '').trim();
  if (!t) return '';
  // 한글 음절이 있으면 영문 모드 노출 차단
  if (/[가-힯]/.test(t)) return '';
  return t;
}

// 영문 블록의 텍스트가 quoteEn 과 실제로 관련 있는지 검증 (cross-lang 오매칭 방어).
function blockMatchesQuote(blockText, quote) {
  if (!quote) return true; // quote 없으면 검증 skip
  const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/["“”'`']/g, '');
  const bn = norm(blockText);
  const qn = norm(quote);
  if (!bn || !qn) return false;
  if (bn.includes(qn)) return true;
  // 첫 의미 단어 substring 검증 (LLM 번역 차이 흡수)
  const firstWord = String(quote).split(/\s+/).find((w) => w.length >= 5) || '';
  return !!(firstWord && bn.includes(norm(firstWord)));
}

function extractSpeakerEn(scriptEn, scriptKo, characters, quoteEn, quoteKo) {
  if (!scriptEn) return '';
  // 1) 영문 script 직접 추출
  //    - 영문 블록 1개 (단일 화자 monologue) → 검증 skip, 그 화자 그대로 사용 ("시인", "거울의 기사" 같은 단독 화자 카드 보장)
  //    - 영문 블록 여러 개 → quote 매칭 블록 검증 통과해야 신뢰 (오매칭 방어)
  const enResult = extractSpeaker(scriptEn, characters, quoteEn, { returnBlocks: true });
  if (enResult.speaker) {
    const isSingleBlock = enResult.blocks.length === 1;
    const blk = enResult.blocks[enResult.foundIdx];
    if (isSingleBlock || (blk && blockMatchesQuote(blk.text, quoteEn))) {
      const cleaned = cleanSpeakerLabel(enResult.speaker);
      if (cleaned) return cleaned;
    }
  }
  // 2) 한글 quote → 한글 블록 인덱스 → 영문 블록 같은 인덱스 라벨
  if (!scriptKo) return '';
  const koResult = extractSpeaker(scriptKo, characters, quoteKo, { returnBlocks: true });
  const i = koResult.foundIdx;
  if (i < 0 || i >= enResult.blocks.length) return '';
  const enBlk = enResult.blocks[i];
  if (!enBlk) return '';
  // 영문 블록 1개면 검증 skip — 한글 인덱스 0 → 영문 0 = single speaker 매칭
  if (enResult.blocks.length > 1 && !blockMatchesQuote(enBlk.text, quoteEn)) return '';
  return cleanSpeakerLabel(enBlk.speaker);
}

// ---------- 추천 관련 상수 ----------
// IIFE Init 안에서 paintTasteToggle → paintTasteProfile 가 즉시 이 상수를
// 참조하기 때문에, 선언이 그보다 뒤에 있으면 TDZ 에러('Cannot access ... before
// initialization')로 부팅이 실패한다. 그래서 init 이전 module-top 에 둔다.
const MIN_BOOKMARKS_FOR_TASTE = 10;
const RECENT_EXCLUDE_SIZE = 10;
const RECENT_STORAGE_KEY = 'ds.recentlyShownIds';

// ---------- Init ----------
(async () => {
  try {
    initAnalytics();  // 설정 fetch + SDK 로드를 백그라운드로 시작 (앱 부팅 막지 않음)
    state.pushEnabled = safeStorageGet('ds.push') === '1';
    paintPushToggle();
    paintTasteToggle();
    paintThemeToggle();
    loadRecentlyShownFromStorage();
    await bootstrapAuth();
    // Amplitude 사용자 ID: 회원이면 실제 아이디(login_id), 없으면(익명·구계정) 내부 숫자 user_id
    // 비로그인 게스트(userId 없음)는 Amplitude user_id 를 설정하지 않는다 →
    // Amplitude 자체 디바이스ID 로 "방문자"로만 집계되어 유령 user 가 생기지 않는다.
    if (state.userId != null) {
      const amplitudeUserId = (!state.isAnonymous && state.userLoginId)
        ? state.userLoginId
        : String(state.userId);
      identify(amplitudeUserId);
    }
    // 회원/익명 구분 + (회원이면) 성별·나이대를 Amplitude User Property로 전송 (타겟층 분석용)
    // user_pk: login_id로 식별해도 DB 내부 user_id로 역추적할 수 있게 보존
    setUserProps({
      accountType: state.isAnonymous ? 'anonymous' : 'member',
      gender: state.isAnonymous ? null : state.userGender,
      ageGroup: state.isAnonymous ? null : state.userAgeGroup,
      userPk: state.userId != null ? String(state.userId) : null,
    });
    paintAuthIdentity();
    await Promise.all([loadAllCards(), loadBookmarks(), loadBookmarkCounts(), loadCommentCounts(), loadContentLikes()]);
    paintTasteProfile();
    renderHome();
    // 초기 setView — history에 중복 entry 안 쌓이게 suppress 후 replaceState로 마무리
    suppressPushState = true;
    setView(getInitialView());
    suppressPushState = false;
    history.replaceState({ tab: state.currentView }, '', '#' + state.currentView);
    // 사용법 투어보다 먼저, 선호도(장르·주제) 1회 확인 — 신규/기존 공통.
    await maybeShowPreferences();
    // 첫 접속/첫 로그인 시 사용법 안내 1회. 안내가 떴으면 로그인 유도는 다음 기회로 미룬다.
    if (!(await maybeShowGuide())) maybeShowLanding();
    // 출석체크 — 00시 기준 오늘 첫 진입이면 1회 모달 + 실타래 +5
    maybeShowAttendance().catch((e) => console.warn('[m] attendance failed:', e));
    // 소셜 첫 가입 직후 1회: 성별·나이 입력 프롬프트(프로필 편집기, 건너뛰기 가능)
    if (state.justSocialSignup) { state.justSocialSignup = false; openNicknameModal(); }
    // 공지를 불러와 새 공지가 있으면 NOTICE 탭에 안 읽음 점 표시 (부팅을 막지 않게 백그라운드)
    loadNotices().then(paintNoticeBadge);
    // 데이터 변경을 실시간으로 받아 즉시 반영
    subscribeToChanges();
    // 앱이 포그라운드로 돌아올 때마다 최신화 (실시간 누락 안전망)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshAll();
    });
  } catch (err) {
    console.error('[m] bootstrap failed:', err);
    // 부팅이 에러로 종결됨 — 워치독 해제(에러 메시지를 워치독 UI가 덮어쓰지 않게)
    if (window.__bootWatchdog) { clearTimeout(window.__bootWatchdog); window.__bootWatchdog = null; }
    if (homeLoading) {
      homeLoading.innerHTML = `<p class="t-body-md c-cta">초기화 실패: ${escapeHtml(err.message || String(err))}</p>`;
    } else {
      alert('초기화 실패: ' + (err.message || String(err)));
    }
  }
})();

function getInitialView() {
  const hash = (location.hash || '').replace('#', '');
  return ['daily','home','archive','feed','notice','settings'].includes(hash) ? hash : 'daily';
}
window.addEventListener('hashchange', () => setView(getInitialView()));

// ===== Hardware/swipe back (Android edge swipe, iOS swipe-from-edge) =====
// 우선순위: 가장 안쪽(스택 최상단) 오버레이부터 닫고, 아무것도 없으면 tab 이동.
// feed 모달(quote/compose/picker) 도 포함해야 feed 탭에서 back 시 메인 화면이 뒤로 가는 버그 방지.
window.addEventListener('popstate', () => {
  if (isCompanionOpen()) {
    closeCompanionInternal();
    return;
  }
  if (hlComposeScreen && hlComposeScreen.classList.contains('open')) {
    closeHlComposeInternal();
    return;
  }
  if (feedbackScreen && feedbackScreen.classList.contains('open')) {
    closeFeedbackScreenInternal();
    return;
  }
  if (detailScreen && detailScreen.classList.contains('open')) {
    closeDetailInternal();
    return;
  }
  if (myfeedScreen && myfeedScreen.classList.contains('open')) {
    closeMyFeedScreenInternal();
    return;
  }
  if (chatsScreen && chatsScreen.classList.contains('open')) {
    closeChatsScreenInternal();
    return;
  }
  if (feedpostScreen && feedpostScreen.classList.contains('open')) {
    closeFeedPostDetailInternal();
    return;
  }
  if (bookModal && bookModal.classList.contains('open')) {
    closeBookModalInternal();
    return;
  }
  if (bookmarksScreen && bookmarksScreen.classList.contains('open')) {
    closeBookmarksScreenInternal();
    return;
  }
  if (yarnScreen && yarnScreen.classList.contains('open')) {
    closeYarnScreenInternal();
    return;
  }
  if (ozHouseScreen && ozHouseScreen.classList.contains('open')) {
    closeOzHouseInternal();
    return;
  }
  // 피드 모달들 (오늘의 한줄 카드 탭 / 작성 플로우 / 북마크 피커)
  if (typeof feedQuoteModal !== 'undefined' && feedQuoteModal && feedQuoteModal.style.display === 'flex') {
    closeFeedQuoteInternal();
    return;
  }
  if (typeof feedComposeModal !== 'undefined' && feedComposeModal && feedComposeModal.style.display === 'flex') {
    closeFeedComposeInternal();
    return;
  }
  if (typeof feedPickerModal !== 'undefined' && feedPickerModal && feedPickerModal.style.display === 'flex') {
    closeFeedPickerInternal();
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
// 재구독 폭주 방지: 세대 토큰으로 '최신 구독'만 유효하게 두고, 재구독 타이머는 1개만.
let subscribeGeneration = 0;
let resubscribeTimer = null;

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
      }
    } catch (err) {
      console.warn('[m] polling check failed:', err);
    }
  }, 30000);
}
async function subscribeToChanges() {
  const myGen = ++subscribeGeneration;  // 이 호출이 최신임을 표시 (이전 채널 콜백은 모두 무효화)
  if (resubscribeTimer) { clearTimeout(resubscribeTimer); resubscribeTimer = null; }
  try {
    const sb = await getSupabase();
    if (realtimeChannel) {
      try { await sb.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
    // removeChannel 대기 중 더 최신 구독이 시작됐으면 이 호출은 포기 (중복 채널 방지)
    if (myGen !== subscribeGeneration) return;
    console.log('[m] realtime: subscribing… userId=', state.userId);
    let ch = sb
      .channel('ds-public-changes-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
        console.log('[m] realtime cards event:', payload.eventType);
        scheduleRealtimeRefresh('cards');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'works' }, (payload) => {
        console.log('[m] realtime works event:', payload.eventType);
        scheduleRealtimeRefresh('cards');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, (payload) => {
        console.log('[m] realtime notices event:', payload.eventType);
        scheduleRealtimeRefresh('notices');
      });
    if (state.userId != null) {
      ch = ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_bookmarks', filter: `user_id=eq.${state.userId}` },
        (payload) => {
          console.log('[m] realtime user_bookmarks event:', payload.eventType);
          scheduleRealtimeRefresh('bookmarks');
        }
      );
    }
    realtimeChannel = ch;
    ch.subscribe((status, err) => {
      // 오래된 채널의 콜백이면 무시 (재구독 폭주·중복 폴링 방지)
      if (myGen !== subscribeGeneration) return;
      console.log('[m] realtime subscription status:', status, err || '');
      setRealtimeStatus(status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // 5초 후 재구독 — 동시에 1개만 예약
        if (resubscribeTimer) return;
        resubscribeTimer = setTimeout(() => {
          resubscribeTimer = null;
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
    // renderHome 이 state.todayCard 를 유지하므로 재렌더해도 보던 카드가 바뀌지 않음
    renderHome();
  } else if (state.currentView === 'archive') {
    renderArchive();
  }
  // 북마크 오버레이가 열려 있으면 realtime/폴링 변경을 반영
  if (bookmarksScreen && bookmarksScreen.classList.contains('open')) {
    renderBookmarksChips();
    renderBookmarksShelf();
  }
}

// refreshAll 스로틀: 포그라운드 복귀 등으로 너무 자주 전체 재조회되는 것을 막는다.
// force=true(당겨서 새로고침 등 명시적 요청)면 무시하고 즉시 실행.
let lastRefreshAt = 0;
const REFRESH_MIN_INTERVAL_MS = 10000;
async function refreshAll({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) {
    console.log('[m] refreshAll skipped (throttled, ' + Math.round((now - lastRefreshAt) / 1000) + 's ago)');
    return;
  }
  lastRefreshAt = now;
  try {
    await Promise.all([loadAllCards(), loadBookmarks()]);
    rerenderActiveView();
  } catch (err) {
    console.warn('[m] refreshAll failed:', err);
  }
}

// realtime 이벤트 디바운스: 짧은 시간에 여러 변경이 와도 한 번만 재조회·재렌더.
// (대량 insert 같은 burst 가 N번의 풀로드로 번지는 것을 방지)
let realtimeDebounceTimer = null;
const realtimePending = { cards: false, bookmarks: false, notices: false };
function scheduleRealtimeRefresh(kind) {
  realtimePending[kind] = true;
  if (realtimeDebounceTimer) return;
  realtimeDebounceTimer = setTimeout(async () => {
    realtimeDebounceTimer = null;
    const pending = { ...realtimePending };
    realtimePending.cards = realtimePending.bookmarks = realtimePending.notices = false;
    try {
      const tasks = [];
      if (pending.cards) tasks.push(loadAllCards());
      if (pending.bookmarks) tasks.push(loadBookmarks());
      if (pending.notices) tasks.push(loadNotices());
      await Promise.all(tasks);
      if (pending.notices) {
        if (state.currentView === 'notice') renderNotice();
        paintNoticeBadge();
      }
      if (pending.cards || pending.bookmarks) rerenderActiveView();
    } catch (err) {
      console.warn('[m] realtime refresh failed:', err);
    }
  }, 350);
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
    if (refreshing) return true;
    // 풀스크린 오버레이(detail·feedback·myfeed·chats·hl-compose)가 하나라도 열려 있으면 PTR 비활성.
    // 모두 .detail-screen '클래스'를 공유하므로 클래스로 잡는다.
    // (기존 버그: id로만('detail-screen') 검사해 의견 남기기 등 다른 오버레이에서 PTR이 오발동 → 작성 중 로딩·튕김)
    if (document.querySelector('.detail-screen.open')) return true;
    // 백드롭으로 화면을 덮는 모달이 body 스크롤을 잠근 동안에도 비활성
    if (document.body.style.overflow === 'hidden') return true;
    return false;
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
      await refreshAll({ force: true });
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
/**
 * 봇·크롤러·헤드리스(검색 인덱서, 링크 미리보기, 성능 스캐너, 자동화) 판별.
 * 이런 클라이언트가 로드 즉시 signInAnonymously() 로 "유령 익명 유저"를 매일
 * 양산해 Amplitude 지표와 public.users 수를 오염시켰다 → 이들에겐 익명 계정을
 * 만들지 않는다. 실제 브라우저(Chrome/Safari/Firefox/Edge/Samsung/카카오·네이버
 * 인앱)는 아래 토큰을 UA 에 담지 않으므로 false positive 가 없다(=실유저 영향 0).
 */
function isLikelyBot() {
  try {
    if (navigator.webdriver === true) return true;           // Selenium/Puppeteer/Playwright 등
    const ua = (navigator.userAgent || '').toLowerCase();
    if (!ua) return true;                                     // UA 없는 비정상 클라이언트
    return /bot|crawler|crawl|spider|slurp|mediapartners|facebookexternalhit|kakaotalk-scrap|yeti|daumoa|twitterbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|embedly|redditbot|applebot|bingpreview|googlebot|baiduspider|yandexbot|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|phantomjs|puppeteer|playwright|selenium|prerender|python-requests|axios|curl|wget|go-http|java\/|okhttp/i.test(ua);
  } catch { return false; }
}

async function bootstrapAuth() {
  const sb = await getSupabase();
  const { data: { session: existing } } = await sb.auth.getSession();
  const user = existing?.user;
  state.authUid = user?.id ?? null;

  // 세션 없음 = 비로그인 게스트. 익명 계정을 만들지 않고 카탈로그/피드를 읽기 전용으로 둘러본다.
  // (예전엔 여기서 signInAnonymously() 로 매일 유령 익명 유저를 양산했다 → 분석/users 오염.)
  // 로그인(Google/Kakao/ID·PW)할 때만 세션과 users 행이 생긴다. 게스트는 isAnonymous=true 로
  // 두어 기존 "로그인 필요" 가드(북마크·댓글·출석 등)를 그대로 재사용하고, userId 는 null 이다.
  // 기존 세션(예전에 만들어진 익명 세션 포함)은 아래 경로로 그대로 동작한다.
  if (!state.authUid) {
    state.isAnonymous = true;
    state.userId = null;
    state.isBot = isLikelyBot();   // 봇 표시(분석 제외용) — 동작은 게스트와 동일
    return;
  }

  // 소셜 로그인은 "인증 수단"으로만 사용한다 — provider(로그인 방법)만 기록하고
  // 제공자의 이름·프로필 사진 등 개인정보는 받지/쓰지 않는다. (닉네임은 항상 랜덤 부여)
  state.isAnonymous = !!user.is_anonymous;
  state.authProvider = user.app_metadata?.provider ?? null;
  state.authEmail = user.email ?? null;

  // users 행 조회/생성
  // login_id/gender/age_group는 마이그레이션(015) 후에 생기는 컬럼 — 없으면 기본 컬럼만으로 폴백
  let existingUser = null;
  {
    const ext = await sb.from('users')
      .select('user_id, nickname, login_id, gender, age_group, pref_genres, pref_themes, pref_any, yarn_balance')
      .eq('anonymous_id', state.authUid).maybeSingle();
    if (ext.error) {
      console.warn('[m] users extended select failed, fallback to basic:', ext.error.message);
      const basic = await sb.from('users').select('user_id, nickname')
        .eq('anonymous_id', state.authUid).maybeSingle();
      if (basic.error) throw basic.error;
      existingUser = basic.data;
    } else {
      existingUser = ext.data;
    }
  }
  if (existingUser) {
    state.userId = existingUser.user_id;
    state.userNickname = existingUser.nickname || '';
    state.userLoginId = existingUser.login_id || '';
    state.userGender = existingUser.gender || '';
    state.userAgeGroup = existingUser.age_group || '';
    state.yarnPurchased = existingUser.yarn_balance || 0;   // 충전 잔액 시드 (06_yarn.sql)
    syncPrefsFromDb(existingUser);  // DB 선호도 → localStorage (기기 간 동기화)
    return;
  }
  state.yarnPurchased = 0;   // 신규 user — 충전 잔액 0
  // 신규 user — 익명은 닉네임 없이, 가입(비익명) 시점에만 닉네임을 부여한다.
  // 소셜 로그인이라도 제공자 이름을 쓰지 않고 ID/PW 가입과 동일하게 랜덤 닉네임을 부여한다.
  const startingNickname = state.isAnonymous ? '' : randomCuteNickname();
  // 원자적 get-or-create — 같은 auth.uid 로 두 기기가 동시에 첫 로그인해도 users 행은 하나로 수렴.
  // 예전 "조회→없으면 insert" 는 anonymous_id 에 UNIQUE 가 없어 동시 insert 가 둘 다 성공 →
  // user_id 가 갈라져 출석 +100 을 이중 수령하는 버그가 있었다 (서버: 14_fix_duplicate_users.sql).
  // ensure_user_row RPC 미배포 환경에서는 기존 insert→재조회 경로로 폴백한다.
  let newUserId = null;
  const ens = await sb.rpc('ensure_user_row', { p_nickname: startingNickname });
  if (!ens.error && ens.data != null) {
    newUserId = ens.data;
  } else {
    const ins = await sb.from('users')
      .insert({ anonymous_id: state.authUid, nickname: startingNickname })
      .select('user_id').single();
    if (ins.error) {
      // UNIQUE(anonymous_id) 위반 = 다른 기기가 막 만든 행 — 재조회로 수렴.
      const re = await sb.from('users').select('user_id')
        .eq('anonymous_id', state.authUid).maybeSingle();
      if (re.error || !re.data) throw ins.error;
      newUserId = re.data.user_id;
    } else {
      newUserId = ins.data.user_id;
    }
  }
  state.userId = newUserId;
  state.userNickname = startingNickname;

  // 소셜 로그인 직후라면 이전 익명 user_id의 북마크를 옮긴다
  if (!state.isAnonymous) {
    // 회원가입 직후라면 저장해둔 프로필(로그인 ID·성별·나이대)을 새 행에 기록
    await applySignupProfile(sb, state.userId);
    // 친구 초대 referral — URL 의 ?ref=<referrer_id> 가 있으면 양쪽 +600 정산
    await redeemPendingReferral(sb, state.userId);
    // 소셜 첫 가입(이메일 가입은 폼에서 이미 받음) → 직후 1회 성별·나이 입력 프롬프트
    if ((state.authProvider === 'google' || state.authProvider === 'kakao')
        && !state.userGender && !state.userAgeGroup) {
      state.justSocialSignup = true;
    }
    const prevAnonUserId = safeStorageGet('ds.prevAnonUserId');
    if (prevAnonUserId && prevAnonUserId !== String(state.userId)) {
      await migrateAnonymousBookmarks(parseInt(prevAnonUserId, 10), state.userId);
      safeStorageRemove('ds.prevAnonUserId');
    }
    // === 중복 로그인 감지/방지 (last-login-wins) ===
    await enforceSingleSession(sb);
  } else {
    // 익명 user_id 기억 — 나중에 소셜 로그인 시 이전 익명 데이터 이전용
    safeStorageSet('ds.prevAnonUserId', String(state.userId));
  }
}

/**
 * (비활성화 — 다중 기기 동시 로그인 허용)
 * 사용자 명세: PWA·Android·iOS 가 같은 계정으로 동시 로그인 가능해야 함.
 * 기존엔 새 로그인 시 server session_id 가 바뀌어 옛 기기가 자동 로그아웃됐음.
 * 함수 본체는 안 건드리고 시작에 early return 만 추가 — 호출처 영향 X.
 */
async function enforceSingleSession(sb) {
  return;   // ← single-session 정책 비활성화 (다중 기기 동시 로그인 허용)
  if (state.isAnonymous || !state.userId) return;
  const localSid = safeStorageGet(SESSION_KEY);
  try {
    const { data, error } = await sb.from('users')
      .select('session_id')
      .eq('user_id', state.userId)
      .maybeSingle();
    if (error) {
      // session_id 컬럼이 아직 마이그레이션 안 됐을 수도 — 무시하고 진행
      console.warn('[m] session check skipped:', error.message);
      return;
    }
    const dbSid = data?.session_id || null;
    if (!localSid) {
      // 방금 로그인 — 새 sessionId 발급해서 DB와 local 동기화
      const newSid = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      await sb.from('users').update({ session_id: newSid }).eq('user_id', state.userId);
      safeStorageSet(SESSION_KEY, newSid);
      return;
    }
    if (dbSid && dbSid !== localSid) {
      // 다른 기기에서 새 로그인 발생 — 이쪽 세션 종료
      console.warn('[m] another device took over the session');
      toast('다른 기기에서 로그인됨. 자동 로그아웃합니다.');
      safeStorageRemove(SESSION_KEY);
      clearRememberedCreds();
      await sb.auth.signOut();
      setTimeout(() => location.reload(), 2000);
    }
  } catch (err) {
    console.warn('[m] enforceSingleSession failed:', err);
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

// 회원가입 시 보존해둔 프로필(로그인 ID·성별·나이대)을 users 행에 기록.
// 핵심 행 생성과 분리해 별도 update — 실패해도 앱 동작에는 지장 없게 처리.
// Referral / Shared card — URL 의 ?ref=<user_id>&card=<id>&bg=<bgId>&q=<encoded> 캡처.
//   ref:  가입까지 살아남아 redeem (이미 있으면 덮어쓰지 않음)
//   card: 페이지 로드 후 1회만 미리보기/자동 open — 사용 후 즉시 제거
//   bg:   공유자가 선택한 카드지 id (SHARE_BACKGROUNDS) — 미리보기 캔버스 렌더용
//   q:    공유자가 하이라이트한 텍스트 (encodeURIComponent) — 미리보기 본문
(function _captureReferralFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search);
    /* short URL: ?s=<6자> — share_links 테이블에서 lookup 후 ref/card/bg/q 채움.
       longer URL: ?r=&c=&b=&q= 또는 옛 ?ref=&card=&bg= 형식 호환. */
    const shortId = sp.get('s');
    if (shortId) {
      /* lookup 은 async — 우선 share-entry 클래스로 메인 가린 후 비동기 채움 */
      document.documentElement.classList.add('share-entry');
      if (!document.getElementById('share-entry-css')) {
        const s = document.createElement('style');
        s.id = 'share-entry-css';
        s.textContent = `html.share-entry body > main, html.share-entry .bottom-nav, html.share-entry .bottom-nav-cat { visibility:hidden !important; }
                         html.share-entry body { background:#0E0C0A !important; }`;
        document.head.appendChild(s);
      }
      window._pendingShortShareLookup = shortId;
      return;
    }
    const ref  = sp.get('r')    || sp.get('ref');
    const card = sp.get('c')    || sp.get('card');
    const bg   = sp.get('b')    || sp.get('bg');
    const q    = sp.get('q');
    if (ref && /^\d+$/.test(ref) && !safeStorageGet('ds.pendingReferrerId')) {
      safeStorageSet('ds.pendingReferrerId', ref);
    }
    if (card && /^\d+$/.test(card)) {
      safeStorageSet('ds.pendingShareCardId', card);
    }
    if (bg) safeStorageSet('ds.pendingShareBgId', bg);
    if (q)  safeStorageSet('ds.pendingShareQuote', q);
    /* 공유 진입(card+bg 있으면) — 메인 홈화면이 잠깐 보이는 것조차 차단.
       q 는 옵션(생략 시 받는 쪽에서 card.quote 사용). body 에 클래스 부여 → CSS 로 main/탭 등 즉시 숨김. */
    if (card && bg) {
      document.documentElement.classList.add('share-entry');
      /* 메인 콘텐츠/하단바를 즉시 가리는 인라인 CSS 1회 주입 */
      if (!document.getElementById('share-entry-css')) {
        const s = document.createElement('style');
        s.id = 'share-entry-css';
        s.textContent = `html.share-entry body > main, html.share-entry .bottom-nav, html.share-entry .bottom-nav-cat { visibility:hidden !important; }
                         html.share-entry body { background:#0E0C0A !important; }`;
        document.head.appendChild(s);
      }
    }
  } catch {}
})();

// 회원가입 완료 직후 referral 정산.
async function redeemPendingReferral(sb, newUserId) {
  const ref = safeStorageGet('ds.pendingReferrerId');
  if (!ref || !/^\d+$/.test(ref)) return;
  const referrerId = parseInt(ref, 10);
  if (!Number.isFinite(referrerId) || referrerId === Number(newUserId)) {
    safeStorageRemove('ds.pendingReferrerId');
    return;
  }
  try {
    const { data, error } = await sb.rpc('redeem_referral', {
      p_referrer_id: referrerId,
      p_referee_id: newUserId,
    });
    if (error) throw error;
    const newBalance = typeof data === 'number' ? data : parseInt(data, 10);
    if (Number.isFinite(newBalance) && newBalance >= 0) {
      state.yarnPurchased = newBalance;
      try { renderYarnChip(); } catch {}
      try { toast('친구 초대 보상 +600 실타래'); } catch {}
    }
  } catch (e) {
    console.warn('[m] redeem_referral failed:', e);
  } finally {
    safeStorageRemove('ds.pendingReferrerId');
  }
}

async function applySignupProfile(sb, userId) {
  let profile = null;
  try { profile = JSON.parse(safeStorageGet('ds.signupProfile', 'null') || 'null'); } catch {}
  if (!profile) return;
  try {
    await sb.from('users').update({
      login_id: profile.login_id || null,
      gender: profile.gender || null,
      age_group: profile.age_group || null,
    }).eq('user_id', userId);
    state.userLoginId = profile.login_id || '';
    state.userGender = profile.gender || '';
    state.userAgeGroup = profile.age_group || '';
  } catch (e) {
    console.warn('[m] signup profile write failed:', e);
  }
  safeStorageRemove('ds.signupProfile');
}

// ---------- Data ----------
// 동시 호출 코얼레싱: 같은 쿼리가 여러 트리거(포그라운드·realtime·폴링)에서 겹쳐도
// 진행 중인 1개를 공유한다. (중복 500행 조회·재렌더 stacking 방지)
let loadAllCardsInFlight = null;
function loadAllCards() {
  if (loadAllCardsInFlight) return loadAllCardsInFlight;
  loadAllCardsInFlight = (async () => {
    const sb = await getSupabase();
    // 전체 카드를 페이지네이션으로 끝까지 가져온다 (예전 .limit(500) 캡 때문에
    // 카드가 500장을 넘으면 '명대사 N편' 이 500 에서 멈추고, 초과분 카드가
    // 카탈로그·추천 등에서 아예 누락되던 문제 수정). PostgREST 기본 최대 행수(1000)도
    // range 페이지네이션으로 우회.
    const PAGE = 1000;
    const COLS = 'card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, created_at, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, text_align, text_align_original, works(work_id, title, subtitle, format, author, release_year, intro, characters, title_original, subtitle_original, author_original, cover_url)';
    const all = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb
        .from('cards')
        .select(COLS)
        .order('card_id', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const batch = Array.isArray(data) ? data : [];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    state.allCards = all;
    /* 공유받은 카드 자동 열기 — short URL lookup 먼저, 그 후 미리보기 모달 */
    try { await maybeResolveShortShareLink(); } catch (e) { console.warn('[m] short share resolve failed:', e); }
    try { maybeOpenSharedCard(); } catch (e) { console.warn('[m] maybeOpenSharedCard failed:', e); }
  })().finally(() => { loadAllCardsInFlight = null; });
  return loadAllCardsInFlight;
}

/* URL ?card=<id> 로 진입한 사용자에게 그 카드 자동 표시.
   localStorage 의 ds.pendingShareCardId 1회 사용 후 즉시 제거. */
async function maybeResolveShortShareLink() {
  const shortId = window._pendingShortShareLookup;
  if (!shortId) return;
  window._pendingShortShareLookup = null;
  /* stale 차단 — 직전 공유 진입의 잔재 (ds.pendingShareBgId='beige' 등) 가 남아있으면
     lookup 실패 시 maybeOpenSharedCard 가 그 stale 값으로 엉뚱한 모달을 띄움.
     try 진입 시 무조건 clear 후 lookup 결과로만 set 한다. */
  safeStorageRemove('ds.pendingShareCardId');
  safeStorageRemove('ds.pendingShareBgId');
  safeStorageRemove('ds.pendingShareQuote');
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('share_links')
      .select('referrer_id, card_id, bg_id, quote_b64')
      .eq('short_id', shortId)
      .single();
    if (error || !data) throw error || new Error('share_link not found');
    console.log('[m] short share lookup ok:', { short_id: shortId, bg_id: data.bg_id, card_id: data.card_id });
    if (data.referrer_id && !safeStorageGet('ds.pendingReferrerId')) {
      safeStorageSet('ds.pendingReferrerId', String(data.referrer_id));
    }
    if (data.card_id)   safeStorageSet('ds.pendingShareCardId', String(data.card_id));
    if (data.bg_id)     safeStorageSet('ds.pendingShareBgId', data.bg_id);
    if (data.quote_b64) safeStorageSet('ds.pendingShareQuote', data.quote_b64);
  } catch (e) {
    console.warn('[m] short share link lookup failed:', e);
    document.documentElement.classList.remove('share-entry');
  }
}

function maybeOpenSharedCard() {
  const cid = safeStorageGet('ds.pendingShareCardId');
  if (!cid) return;
  const card = (state.allCards || []).find((c) => c && String(c.card_id) === String(cid));
  if (!card) return;   /* allCards 에 없으면 retry 위해 키 유지 */
  safeStorageRemove('ds.pendingShareCardId');
  state._sharedCardOpenedId = card.card_id;
  /* 카드지(bg) 만 있어도 미리보기 모달. q 가 있으면 그걸 사용, 없으면 card.quote 로 채움 (URL 단축 케이스). */
  const bgId = safeStorageGet('ds.pendingShareBgId');
  const qRaw = safeStorageGet('ds.pendingShareQuote');
  /* 새 형식: URL-safe base64. 옛 형식: percent-encoding. 둘 다 호환. */
  const qDecoded = qRaw ? (() => {
    if (/^[A-Za-z0-9_\-]+$/.test(qRaw)) {
      const b64 = urlSafeB64Decode(qRaw);
      if (b64) return b64;
    }
    try { return decodeURIComponent(qRaw); } catch { return qRaw; }
  })() : '';
  if (bgId) {
    safeStorageRemove('ds.pendingShareBgId');
    safeStorageRemove('ds.pendingShareQuote');
    const previewQuote = qDecoded || card.quote || '';
    setTimeout(() => {
      /* openSharedPreview 는 async — 동기 try/catch 가 못 잡으므로 .catch 로 폴백 */
      Promise.resolve(openSharedPreview(card, bgId, previewQuote)).catch((e) => {
        console.warn('[m] openSharedPreview failed:', e);
        document.documentElement.classList.remove('share-entry');
        openDetail(card);
      });
    }, 80);
    return;
  }
  document.documentElement.classList.remove('share-entry');
  setTimeout(() => { try { openDetail(card); } catch {} }, 300);
}

/* 공유자가 만든 카드 미리보기 풀스크린 모달 — 캔버스 + CTA.
   페이지 진입 시 메인 홈화면 대신 이 모달이 먼저 등장. */
async function openSharedPreview(card, bgId, quote) {
  const w = card.works || {};
  await loadShareBackgrounds();   // 친구가 보낸 카드지가 premium/royal 이면 원격 목록이 있어야 찾힘
  const bg = allShareBackgrounds().find((b) => b.id === bgId) || SHARE_BACKGROUNDS[0];
  if (bg.id !== bgId) {
    /* 조용한 beige 폴백 차단 — bgId 가 통합 목록에도 없으면 (옛 캐시·신규 ID·삭제된 카드지)
       콘솔에 명시. 사용자가 "왜 beige 만 떠?" 진단 가능. */
    console.warn('[m] openSharedPreview: bgId not in SHARE_BACKGROUNDS, falling back to', bg.id, '— received:', bgId);
  }
  const isAnon = state.isAnonymous;
  /* 1회용 모달 DOM 생성 */
  let modal = document.getElementById('shared-preview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shared-preview-modal';
    modal.style.cssText = `position:fixed;inset:0;background:#0E0C0A;z-index:160;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px 16px;overflow-y:auto;`;
    modal.innerHTML = `
      <div style="text-align:center;color:#FAF8F2;margin:6px 0 14px;letter-spacing:.18em;font-size:11px;opacity:.7;">A FRIEND SENT YOU</div>
      <canvas id="shared-preview-canvas" width="540" height="960" style="width:auto;max-width:100%;max-height:64vh;aspect-ratio:9/16;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.5);"></canvas>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:380px;margin-top:24px;">
        <button id="shared-preview-signup" class="sharp-btn" style="width:100%;background:var(--cta);color:#fff;display:${isAnon ? 'inline-flex' : 'none'};align-items:center;justify-content:center;text-align:center;">회원가입하고 600 실타래 받기</button>
        <button id="shared-preview-open"   class="sharp-btn outline" style="width:100%;color:#FAF8F2;border-color:rgba(255,255,255,.35);display:inline-flex;align-items:center;justify-content:center;text-align:center;">카드 자세히 보기</button>
        <button id="shared-preview-close"  style="background:transparent;border:none;color:#FAF8F2;opacity:.6;font-size:12px;letter-spacing:.12em;padding:8px;cursor:pointer;">닫기</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }
  /* 캔버스에 공유자가 만든 카드 그리기 */
  const canvas = modal.querySelector('#shared-preview-canvas');
  try {
    const { metaKo, metaEn } = shareMetaLinesFromWork(w);
    renderShareCard(canvas, bg, {
      quote, speaker: card.speaker || '',
      work: w.title || '', author: w.author || '',
      metaKo, metaEn,
    });
  } catch (e) { console.warn('[m] renderShareCard for preview failed:', e); }
  /* 액션 */
  modal.querySelector('#shared-preview-signup')?.addEventListener('click', () => {
    closeSharedPreview();
    try { openSigninModal(); } catch {}
  }, { once: true });
  modal.querySelector('#shared-preview-open')?.addEventListener('click', () => {
    closeSharedPreview();
    setTimeout(() => { try { openDetail(card); } catch {} }, 200);
  }, { once: true });
  modal.querySelector('#shared-preview-close')?.addEventListener('click', closeSharedPreview, { once: true });
}
function closeSharedPreview() {
  const m = document.getElementById('shared-preview-modal');
  if (m) m.style.display = 'none';
  /* 메인 컨텐츠 다시 노출 */
  document.documentElement.classList.remove('share-entry');
}

let loadBookmarksInFlight = null;
function loadBookmarks() {
  if (loadBookmarksInFlight) return loadBookmarksInFlight;
  loadBookmarksInFlight = (async () => {
    if (!state.userId) return;
    const sb = await getSupabase();
    // ★ *_original 컬럼 포함 — 영문 토글 동작에 필요. loadAllCards SELECT 와 동일.
    const { data, error } = await sb
      .from('user_bookmarks')
      .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, works(work_id, title, subtitle, format, author, release_year, intro, characters, title_original, subtitle_original, author_original, cover_url))')
      .eq('user_id', state.userId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('[m] bookmarks load failed:', error); return; }
    state.bookmarks = Array.isArray(data) ? data : [];
    state.bookmarkedIds = new Set(state.bookmarks.map((b) => b.card_id));
  })().finally(() => { loadBookmarksInFlight = null; });
  return loadBookmarksInFlight;
}

async function loadBookmarkCounts() {
  state.bookmarkCounts = new Map();
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('card_bookmark_counts')
      .select('card_id, bookmark_count');
    if (error) { console.warn('[m] bookmark counts load failed:', error.message); return; }
    (data || []).forEach((r) => state.bookmarkCounts.set(r.card_id, r.bookmark_count));
  } catch (e) {
    console.warn('[m] loadBookmarkCounts error:', e);
  }
}

// 카드별 댓글 수 — card_comments 전체 fetch 후 JS 에서 집계.
// 인기 대사 점수 + 카드 메타(댓글 수) 표시에 사용.
async function loadCommentCounts() {
  state.commentCounts = new Map();
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('card_comments').select('card_id');
    if (error) { console.warn('[m] comment counts load failed:', error.message); return; }
    for (const c of (data || [])) {
      state.commentCounts.set(c.card_id, (state.commentCounts.get(c.card_id) || 0) + 1);
    }
  } catch (e) {
    console.warn('[m] loadCommentCounts error:', e);
  }
}

/* ===== 피드/하이라이트 좋아요 (migration 043 content_likes) =====
   state.likes.{feed_post|highlight} = Map<target_id, { count, liked }>.
   loadContentLikes() — 전체 카운트 1회 + 내 좋아요 1회. paint 위치에서 makeLikeHTML 호출. */
state.likes = { feed_post: new Map(), highlight: new Map() };
async function loadContentLikes() {
  state.likes.feed_post.clear();
  state.likes.highlight.clear();
  try {
    const sb = await getSupabase();
    const { data: counts } = await sb.from('content_like_counts').select('target_type, target_id, like_count');
    for (const r of counts || []) {
      const m = state.likes[r.target_type];
      if (m) m.set(Number(r.target_id), { count: Number(r.like_count) || 0, liked: false });
    }
    if (state.userId) {
      const { data: mine } = await sb.from('content_likes')
        .select('target_type, target_id')
        .eq('user_id', state.userId);
      for (const r of mine || []) {
        const m = state.likes[r.target_type];
        if (!m) continue;
        const id = Number(r.target_id);
        const cur = m.get(id) || { count: 0, liked: false };
        cur.liked = true;
        m.set(id, cur);
      }
    }
  } catch (e) { console.warn('[m] loadContentLikes failed:', e); }
}
function getLikeState(type, id) {
  return state.likes[type]?.get(Number(id)) || { count: 0, liked: false };
}
function makeLikeHTML(type, id) {
  const { count, liked } = getLikeState(type, id);
  const countPart = count > 0 ? `<span class="like-count">${count}</span>` : '';
  /* 댓글 하트와 동일 — material-symbols favorite + FILL 0/1 토글 */
  return `<button type="button" class="like-btn ${liked ? 'liked' : ''}" data-like-type="${type}" data-like-id="${id}" aria-label="좋아요"><span class="material-symbols-outlined like-icon" style="font-size:18px;font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>${countPart}</button>`;
}
/* 본문 텍스트를 4줄 clamp + '더 보기' 토글 가능한 div 로. 짧으면 fold-btn 자체가 숨겨짐. */
function makeFoldHTML(rawText) {
  const text = String(rawText || '');
  const needFold = text.length > 100 || (text.match(/\n/g) || []).length >= 3;
  const safeHtml = renderMarkdownBold(text);
  if (!needFold) return `<div class="fold-wrap"><div class="fold-text expanded">${safeHtml}</div></div>`;
  return `<div class="fold-wrap"><div class="fold-text">${safeHtml}</div><button type="button" class="fold-btn visible">더 보기</button></div>`;
}
/* 글로벌 위임 — fold-btn 토글 + like-btn 토글. 새로 그려진 DOM 도 자동 대응.
   capture: true — 카드 wrapper 의 click 핸들러(상세 열기)가 발화하기 전에 가로채서
   stopPropagation 으로 차단. (bubbling 단계 등록 시엔 카드 핸들러가 먼저 실행돼 상세가 열림) */
document.addEventListener('click', async (e) => {
  const foldBtn = e.target.closest && e.target.closest('.fold-btn');
  if (foldBtn) {
    e.stopPropagation();
    const text = foldBtn.parentElement.querySelector('.fold-text');
    if (text) {
      const expanded = text.classList.toggle('expanded');
      foldBtn.textContent = expanded ? '접기' : '더 보기';
    }
    return;
  }
  const likeBtn = e.target.closest && e.target.closest('.like-btn');
  if (likeBtn) {
    e.stopPropagation(); e.preventDefault();
    const type = likeBtn.dataset.likeType;
    const id = Number(likeBtn.dataset.likeId);
    if (!type || !id) return;
    if (!state.userId) { try { openSigninModal(); } catch {} return; }
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.rpc('toggle_content_like', {
        p_user_id: state.userId, p_target_type: type, p_target_id: id,
      });
      if (error) throw error;
      state.likes[type]?.set(id, { count: Number(data.count) || 0, liked: !!data.liked });
      document.querySelectorAll(`.like-btn[data-like-type="${type}"][data-like-id="${id}"]`).forEach((b) => {
        b.classList.toggle('liked', data.liked);
        const icon = b.querySelector('.like-icon');
        if (icon) icon.style.fontVariationSettings = `'FILL' ${data.liked ? 1 : 0}`;
        let cnt = b.querySelector('.like-count');
        if (data.count > 0) {
          if (!cnt) { cnt = document.createElement('span'); cnt.className = 'like-count'; b.appendChild(cnt); }
          cnt.textContent = data.count;
        } else if (cnt) { cnt.remove(); }
      });
    } catch (err) { console.warn('[m] toggle like failed:', err); try { toast('좋아요 실패'); } catch {} }
  }
}, true);

// ---------- Today's card / 추천 ----------

function isTasteEnabled() {
  return safeStorageGet('ds.taste') === '1';
}

// MIN_BOOKMARKS_FOR_TASTE 는 IIFE Init 보다 앞쪽 module-top 에 선언돼 있음 (TDZ 회피).

/**
 * 북마크 카드들의 온도/강도 평균으로 사용자 취향 프로파일을 구성.
 * 카드의 temperature/intensity 가 숫자가 아니면 무시.
 * 임계치 판정은 '북마크 행 수' 기준 — 조인이 일부 실패해 cards 가 null
 * 이어도 사용자 입장의 북마크 개수와 일치하도록.
 */
function computeTasteProfile() {
  const totalBookmarks = (state.bookmarks || []).length;
  if (totalBookmarks < MIN_BOOKMARKS_FOR_TASTE) return null;
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

// ---------- 온보딩 선호(장르·주제) + 행동(온도·강도) 통합 추천 (설계문서 P1) ----------
// 저장된 선호도 읽기. { genres:[format..], themes:[ko..], any:bool } | null
function getPrefs() {
  try { return JSON.parse(safeStorageGet('ds.pref', 'null') || 'null'); } catch { return null; }
}
// 실제로 추천을 좁히는 선호가 있나? (장르 선택 or "상관없음" 아닌 주제 선택)
function hasActivePrefs(p) {
  if (!p) return false;
  const g = Array.isArray(p.genres) ? p.genres.length : 0;
  const t = (!p.any && Array.isArray(p.themes)) ? p.themes.length : 0;
  return g > 0 || t > 0;
}
// DB users 행의 선호도 → localStorage. 기기 간 동기화 + 온보딩 재노출 방지.
function syncPrefsFromDb(u) {
  if (!u) return;
  const hasPref = Array.isArray(u.pref_genres) || Array.isArray(u.pref_themes) || typeof u.pref_any === 'boolean';
  if (!hasPref) return;
  try {
    safeStorageSet('ds.pref', JSON.stringify({
      genres: u.pref_genres || [], themes: u.pref_themes || [], any: !!u.pref_any, ts: Date.now(),
    }));
    safeStorageSet('ds.prefSelected', '1');
  } catch (e) { console.warn('[m] pref sync failed:', e); }
}
// 선호도를 DB users 행에 저장(기기 간 동기화·서버측 활용). 실패해도 로컬은 이미 저장됨.
async function savePreferencesToDb(pref) {
  if (!state.userId) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('users').update({
      pref_genres: pref.genres || [], pref_themes: pref.themes || [],
      pref_any: !!pref.any, pref_updated_at: new Date().toISOString(),
    }).eq('user_id', state.userId);
    if (error) console.warn('[m] pref DB save failed:', error.message);
  } catch (e) { console.warn('[m] pref DB save error:', e); }
}
function cardThemesOf(card) {
  try { return cardThemeSet ? cardThemeSet(card.keywords || []) : null; } catch { return null; }
}
// KPI용 — 이 카드가 사용자의 선호(장르/주제)와 맞는지. 선호 없으면 빈 객체.
function cardMatchProps(card) {
  const p = getPrefs();
  if (!card || !hasActivePrefs(p)) return {};
  const out = {};
  const genres = new Set(p.genres || []);
  if (genres.size) out.prefGenreMatch = genres.has(card.works && card.works.format);
  const themes = new Set(p.themes || []);
  if (!p.any && themes.size) {
    const set = cardThemesOf(card);
    if (set) out.prefThemeMatch = [...set].some((t) => themes.has(t));
  }
  return out;
}

const TASTE_DMAX = Math.sqrt(32);   // 2D(1~5) 최대 거리
const SCORE_TAU = 0.5;              // softmax 탐험온도 (작을수록 정확↑)

// score(c) = w_g·장르 + w_t·주제 + w_b·온도강도 + w_p·인기  →  P(c) ∝ exp(score/τ)
//  - α = min(북마크/10, 1): 가입 직후 온보딩 100%, 쌓일수록 행동 비중 ↑
function pickByScore() {
  if (state.allCards.length === 0) return null;
  const exclude = new Set(state.recentlyShownIds);
  const bookmarked = state.bookmarkedIds || new Set();

  // 8% variety — pure random (최근 제외)
  if (Math.random() < 0.08) {
    const pool = candidatesExcludingRecent();
    const p = pool[Math.floor(Math.random() * pool.length)];
    state.lastPickSource = 'random';
    rememberShown(p?.card_id);
    return p;
  }

  let candidates = state.allCards.filter((c) => !exclude.has(c.card_id) && !bookmarked.has(c.card_id));
  if (candidates.length === 0) candidates = state.allCards.filter((c) => !bookmarked.has(c.card_id));
  if (candidates.length === 0) {
    const pool = candidatesExcludingRecent();
    const p = pool[Math.floor(Math.random() * pool.length)];
    state.lastPickSource = 'random';
    rememberShown(p?.card_id);
    return p;
  }

  const prefs = getPrefs();
  const genreSet = new Set((prefs && prefs.genres) || []);
  const themeSet = new Set((prefs && prefs.themes) || []);
  const anyTheme = !prefs || prefs.any || themeSet.size === 0;
  const taste = computeTasteProfile();          // 북마크 10개 이상일 때만 non-null
  const bm = (state.bookmarks || []).length;
  const a = Math.min(bm / MIN_BOOKMARKS_FOR_TASTE, 1);
  const wg = 0.55 + (0.30 - 0.55) * a;          // lerp(0.55→0.30)
  const wt = 0.45 + (0.30 - 0.45) * a;          // lerp(0.45→0.30)
  const wb = taste ? 0.35 * a : 0;
  const wp = 0.05;

  let maxBm = 1;
  if (state.bookmarkCounts) for (const c of candidates) maxBm = Math.max(maxBm, state.bookmarkCounts.get(c.card_id) || 0);
  const logMax = Math.log1p(maxBm);

  const scores = candidates.map((c) => {
    const gm = genreSet.size === 0 ? 1 : (genreSet.has(c.works && c.works.format) ? 1 : 0.15);
    let tm = 1;
    if (!anyTheme) {
      const set = cardThemesOf(c);
      // 분류기 미로딩(set=null)이면 중립(1) — 상수라 상대확률에 영향 없음
      tm = set ? ([...set].some((t) => themeSet.has(t)) ? 1 : 0.2) : 1;
    }
    const ts = taste ? Math.max(0, 1 - tasteDistance(c, taste) / TASTE_DMAX) : 0;
    const pop = logMax > 0 ? Math.log1p((state.bookmarkCounts && state.bookmarkCounts.get(c.card_id)) || 0) / logMax : 0;
    return wg * gm + wt * tm + wb * ts + wp * pop;
  });

  const exps = scores.map((s) => Math.exp(s / SCORE_TAU));
  const total = exps.reduce((acc, v) => acc + v, 0);
  let r = Math.random() * total;
  let picked = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= exps[i];
    if (r <= 0) { picked = candidates[i]; break; }
  }
  state.lastPickSource = 'score';
  rememberShown(picked?.card_id);
  return picked;
}

// 명대사 동무 큐레이션 — '현재 카드와 비슷한 결의 다른 작품' 추천.
// pickByScore(전반 취향)와 달리, baseCard 와의 유사도(키워드·주제·장르 겹침)로 점수를 매긴다.
// 같은 작품의 다른 카드는 '다른 작품'이 아니므로 제외하고, 작품당 1장만.
function recommendSimilarCards(baseCard, limit = 3) {
  if (!baseCard || !Array.isArray(state.allCards) || state.allCards.length === 0) return [];
  const baseKw = new Set((baseCard.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  const baseThemes = cardThemesOf(baseCard);             // Set | null
  const baseFormat = baseCard.works && baseCard.works.format;
  const baseTitle = baseCard.works && baseCard.works.title;

  const scored = [];
  for (const c of state.allCards) {
    if (!c || c.card_id === baseCard.card_id) continue;
    if (baseTitle && c.works && c.works.title === baseTitle) continue;   // 같은 작품 제외
    let score = 0;
    const kw = (c.keywords || []).map((k) => String(k).trim().toLowerCase());
    for (const k of kw) if (baseKw.has(k)) score += 3;                   // 키워드 일치(강)
    if (baseThemes) {
      const set = cardThemesOf(c);
      if (set) for (const t of set) if (baseThemes.has(t)) score += 2;   // 주제 일치(중)
    }
    if (baseFormat && c.works && c.works.format === baseFormat) score += 1; // 같은 형식(약)
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // 작품당 1장만 추려 상위 limit
  const seenTitle = new Set();
  const out = [];
  for (const { c } of scored) {
    const t = (c.works && c.works.title) || `id:${c.card_id}`;
    if (seenTitle.has(t)) continue;
    seenTitle.add(t);
    out.push(c);
    if (out.length >= limit) break;
  }

  // 매칭이 부족하면(키워드/주제 겹침이 적은 작품) 다른 작품 카드로 빈자리를 채워 빈손 방지.
  if (out.length < limit) {
    for (const c of candidatesExcludingRecent()) {
      if (out.length >= limit) break;
      if (!c || c.card_id === baseCard.card_id) continue;
      const t = (c.works && c.works.title) || `id:${c.card_id}`;
      if (seenTitle.has(t)) continue;
      if (baseTitle && c.works && c.works.title === baseTitle) continue;
      seenTitle.add(t);
      out.push(c);
    }
  }
  return out;
}

// 추천 카드 탭 → 그 카드를 홈 '오늘의 명대사'로 띄우고 홈으로 이동.
function openRecommendedCard(card) {
  if (!card) return;
  const full = (state.allCards || []).find((c) => c.card_id === card.card_id) || card;
  if (state.currentView !== 'home') setView('home');
  applyTodayCard(full);
  window.scrollTo({ top: 0 });
  track('companion_recommend_open', { card_id: full.card_id, ...cardMatchProps(full) });
}

// 셔플 시 최근 10개에 있는 카드는 제외 + localStorage 영구 저장
function loadRecentlyShownFromStorage() {
  try {
    const raw = safeStorageGet(RECENT_STORAGE_KEY);
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
    safeStorageSet(RECENT_STORAGE_KEY, JSON.stringify(state.recentlyShownIds));
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
  const bookmarked = state.bookmarkedIds || new Set();
  // 1차: 최근 본 것 + 북마크된 것 모두 제외 (정상 동작 — 새로고침 시 북마크는 안 떠야 함)
  let pool = state.allCards.filter((c) => !exclude.has(c.card_id) && !bookmarked.has(c.card_id));
  if (pool.length > 0) return pool;
  // 2차 폴백: 북마크만 빼고 최근 본 것은 다시 허용 (북마크 안 한 카드 우선)
  pool = state.allCards.filter((c) => !bookmarked.has(c.card_id));
  if (pool.length > 0) return pool;
  // 3차 폴백: 전체가 북마크된 상황 — 최근만 빼서라도 보여줌
  pool = state.allCards.filter((c) => !exclude.has(c.card_id));
  return pool.length > 0 ? pool : state.allCards;
}

// 직전에 보던 카드(큐의 마지막) 복원 — 없거나 카드가 삭제·북마크됐으면 건너뜀
function restoreLastShownCard() {
  const ids = state.recentlyShownIds;
  if (!ids || ids.length === 0) return null;
  const bookmarked = state.bookmarkedIds || new Set();
  // 가장 최근부터 거꾸로 — 북마크된 카드는 새로고침 시 부활시키지 않음
  for (let i = ids.length - 1; i >= 0; i--) {
    const card = state.allCards.find((c) => c.card_id === ids[i]);
    if (card && !bookmarked.has(card.card_id)) { state.lastPickSource = 'restore'; return card; }
  }
  return null;
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
  // 온보딩 선호(장르·주제)가 있거나 취향 토글이 켜져 있으면 통합 점수 추천.
  if (hasActivePrefs(getPrefs()) || isTasteEnabled()) return pickByScore();
  const pool = candidatesExcludingRecent();
  const picked = pool[Math.floor(Math.random() * pool.length)];
  state.lastPickSource = 'random';
  rememberShown(picked?.card_id);
  return picked;
}

// ---------- Bookmark API ----------
async function toggleBookmark(cardId) {
  if (state.isAnonymous) {
    openPromptModal({
      title: '북마크는 회원 전용',
      message: '마음에 든 명대사를 보관하려면 로그인이 필요해요.',
    });
    return;
  }
  if (!state.userId || state.bookmarkActionInFlight) return;
  state.bookmarkActionInFlight = true;
  const sb = await getSupabase();
  const wasBookmarked = state.bookmarkedIds.has(cardId);
  if (wasBookmarked) state.bookmarkedIds.delete(cardId);
  else state.bookmarkedIds.add(cardId);
  /* 사용자 명세: 북마크 수 카운트도 즉시 +1/-1 반영(서버 응답 기다리지 않고) */
  if (state.bookmarkCounts instanceof Map) {
    const cur = state.bookmarkCounts.get(cardId) || 0;
    state.bookmarkCounts.set(cardId, wasBookmarked ? Math.max(0, cur - 1) : cur + 1);
  }
  paintAllBookmarkButtons(cardId);

  try {
    if (wasBookmarked) {
      const { error } = await sb.from('user_bookmarks').delete()
        .eq('user_id', state.userId).eq('card_id', cardId);
      if (error) throw error;
      state.bookmarks = state.bookmarks.filter((b) => b.card_id !== cardId);
      track('bookmark_removed', { card_id: cardId });
      toast('해제됨');
    } else {
      const { data, error } = await sb.from('user_bookmarks')
        .insert({ user_id: state.userId, card_id: cardId })
        .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, works(work_id, title, subtitle, format, author, release_year, intro, characters, cover_url))')
        .single();
      if (error) throw error;
      state.bookmarks = [data, ...state.bookmarks];
      track('bookmark_added', { card_id: cardId, work_title: data?.cards?.works?.title || null, format: data?.cards?.works?.format || null, ...cardMatchProps(data?.cards) });
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
    // LIBRARY(카탈로그)는 북마크와 무관하지만, 열린 북마크 오버레이는 즉시 갱신
    if (bookmarksScreen && bookmarksScreen.classList.contains('open')) {
      renderBookmarksChips();
      renderBookmarksShelf();
    }
    if (state.currentView === 'home') renderHomeBookmarks();
    if (state.currentView === 'settings') paintTasteProfile();
  }
}

function paintAllBookmarkButtons(cardId) {
  const isBookmarked = state.bookmarkedIds.has(cardId);
  const count = (state.bookmarkCounts instanceof Map ? state.bookmarkCounts.get(cardId) : null) || 0;
  if (state.todayCard?.card_id === cardId) {
    paintBookmarkBtn(todayBookmark, isBookmarked);
    state.todayBookmarked = isBookmarked;
    const c = document.getElementById('today-bookmark-count');
    if (c) c.textContent = String(count);
  }
  if (state.detailCardId === cardId) {
    paintBookmarkBtn(detailBookmark, isBookmarked);
    paintDetailCollectBtn(isBookmarked);
    const c = document.getElementById('detail-bookmark-count');
    if (c) c.textContent = String(count);
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
  if (!homeLoading || !homeContent || !todayCard) return;
  // 부팅 성공 — 인라인 워치독(index.html) 해제
  if (window.__bootWatchdog) { clearTimeout(window.__bootWatchdog); window.__bootWatchdog = null; }
  homeLoading.style.display = 'none';
  homeContent.style.display = 'block';

  const d = new Date();
  homeDate.textContent = d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).toUpperCase();

  // 표시 카드 결정:
  //  1) 세션 중 이미 보던 카드가 있으면 유지 (realtime/폴링/포그라운드 재렌더 시 카드 고정)
  //  2) 부팅 직후엔 직전에 보던 카드를 복원
  //  3) 둘 다 없으면 새 랜덤 카드
  const card = state.todayCard || restoreLastShownCard() || pickRandomCard();
  state.todayCard = card;
  if (!card) {
    todayCard.style.display = 'none';
    if (homeError) {
      homeError.textContent = '표시할 명대사를 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
      homeError.style.display = 'block';
    }
    return;
  }
  if (homeError) homeError.style.display = 'none';
  todayCard.style.display = '';
  applyTodayCard(card);
  renderHomeBookmarks();
}

function applyTodayCard(card) {
  if (!card) return;
  // 같은 카드 재렌더(예: 북마크 카운트 realtime 갱신) 시 todayLang 을 유지해
  // 사용자가 EN 으로 토글했는데 KO 로 되돌아가는 버그 방지.
  const prevCardId = state.todayCard?.card_id;
  const isNewCard = prevCardId !== card.card_id;
  state.todayCard = card;
  state.todayBookmarked = state.bookmarkedIds.has(card.card_id);
  // 최근 표시 큐에 추가 (rememberShown이 dedupe + localStorage 저장 처리)
  rememberShown(card.card_id);

  // EN 토글 — 새 카드일 때만 한국어로 리셋. 같은 카드 재렌더는 lang 유지.
  if (isNewCard) state.todayLang = 'ko';

  // KPI — 새 카드가 홈에 노출된 순간. (코치마크 투어 중 데모 카드는 제외)
  if (isNewCard && !state.suppressShownTrack) {
    track('card_shown', { card_id: card.card_id, source: state.lastPickSource || 'unknown', ...cardMatchProps(card) });
  }

  // Quote with curly quotes (mirror Android: "“$it”").
  // 관리자가 ** 로 굵게 표시한 부분도 함께 렌더.
  todayQuote.innerHTML = `“${renderMarkdownBold(cleanQuote(card.quote))}”`;

  // Chips: filled format only
  todayChips.innerHTML = '';
  const format = card.works?.format;
  if (format) {
    const chip = document.createElement('span');
    chip.className = `chip filled g-${String(format).toLowerCase()}`;
    chip.textContent = format;
    todayChips.appendChild(chip);
  }
  // TODAY 카드 메타 — 사용자 명세: 북마크 위치(우상단)는 댓글 수, 북마크 수는 북마크 아이콘 아래.
  todayChips.insertAdjacentHTML('beforeend', `<span style="margin-left:10px;">${renderCountsForToday(card)}</span>`);
  // 북마크 버튼 아래 카운트 갱신
  const bmCountEl = document.getElementById('today-bookmark-count');
  if (bmCountEl) bmCountEl.textContent = formatCount(state.bookmarkCounts?.get(card?.card_id) || 0);
  // 공유 버튼 아래 카운트 갱신 — cards.share_count
  const shCountEl = document.getElementById('today-share-count');
  if (shCountEl) shCountEl.textContent = formatCount(card?.share_count || 0);
  const kws = Array.isArray(card.keywords) ? card.keywords : [];

  // Speaker (인용문 위, 볼드) + Work (인용문 아래, "- 작품명")
  const workTitle = displayTitle(card.works?.title || '');
  // 산문(novel/essay/prose)은 화자 개념이 없어 머리말을 숨긴다 (대본/오페라 등만 화자 표시).
  const speaker = isProseFormat(card.works?.format)
    ? ''
    : extractSpeaker(card.script_excerpt, card.works?.characters, card.quote);
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
    // 시리즈물(예: 셜록홈즈 — 보헤미아 왕국의 스캔들)이면 subtitle을 제목 뒤에 붙임.
    const subtitle = card.works?.subtitle ? String(card.works.subtitle).trim() : '';
    const titleBlock = subtitle ? `<${workTitle}> ${subtitle}` : `<${workTitle}>`;
    todayWork.textContent = genreLabel ? `— ${genreLabel} ${titleBlock}` : `— ${titleBlock}`;
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

  // ENG 토글 표시/숨김 — 영문 원본이 있을 때만 노출.
  // 새 카드면 KR(off) 로 리셋. 같은 카드 재렌더는 현재 state.todayLang 따름.
  if (todayLangToggle) {
    const hasEn = !!(card.quote_original || card.works?.title_original ||
                     card.works?.subtitle_original || card.works?.author_original);
    todayLangToggle.style.display = hasEn ? '' : 'none';
    const isEn = state.todayLang === 'en';
    todayLangToggle.classList.toggle('on', isEn);
    todayLangToggle.setAttribute('aria-checked', isEn ? 'true' : 'false');
    const lbl = document.getElementById('today-lang-label');
    if (lbl) lbl.style.display = hasEn ? '' : 'none';
  }
  // 같은 카드 재렌더인데 EN 모드였다면, 본문도 EN 로 다시 적용
  // (위에서 todayQuote/todayWork 등이 KO 텍스트로 덮어쓰였으므로)
  if (!isNewCard && state.todayLang === 'en') {
    applyTodayLang('en');
  }
}

// 홈 오늘의 한줄 — 언어 토글 시 명대사·작품 라인·키워드를 한 번에 스왑
function applyTodayLang(lang) {
  const card = state.todayCard;
  if (!card) return;
  const w = card.works || {};
  const useEn = lang === 'en';

  const quoteSrc    = useEn && card.quote_original          ? card.quote_original          : card.quote;
  const scriptSrc   = useEn && card.script_excerpt_original ? card.script_excerpt_original : card.script_excerpt;
  const titleSrc    = useEn && w.title_original             ? w.title_original             : w.title;
  const subtitleSrc = useEn && w.subtitle_original          ? w.subtitle_original          : w.subtitle;

  todayQuote.innerHTML = `“${renderMarkdownBold(cleanQuote(quoteSrc))}”`;

  // 화자(speaker) — EN 모드면 영문 script 직접 추출 → 실패 시 한글 블록 인덱스로
  // 영문 같은 인덱스 라벨 매칭 (cross-lang). 한글 이름이 영문 모드에 섞이지 않게
  // extractSpeakerEn 내부에서 가드. KO 모드면 평소대로 한글 script 추출.
  if (todaySpeaker) {
    const speaker = isProseFormat(w.format)
      ? ''
      : (useEn
        ? extractSpeakerEn(scriptSrc, card.script_excerpt, w.characters, quoteSrc, card.quote)
        : extractSpeaker(scriptSrc, w.characters, quoteSrc));
    if (speaker) {
      todaySpeaker.textContent = speaker;
      todaySpeaker.style.display = 'block';
      if (todaySpeakerSpacer) todaySpeakerSpacer.style.height = '12px';
    } else {
      todaySpeaker.style.display = 'none';
      if (todaySpeakerSpacer) todaySpeakerSpacer.style.height = '0';
    }
  }

  const workTitle = displayTitle(titleSrc || '');
  if (workTitle) {
    const fmt = w.format || '';
    // EN 모드면 영문 라벨(Novel, Movie...) — 한국어 모드면 기존 라벨(소설, 영화...)
    const genreLabel = useEn ? (GENRE_LABEL_EN[fmt] || fmt) : (GENRE_LABEL[fmt] || '');
    const sub = subtitleSrc ? String(subtitleSrc).trim() : '';
    const titleBlock = sub ? `<${workTitle}> ${sub}` : `<${workTitle}>`;
    todayWork.textContent = genreLabel ? `— ${genreLabel} ${titleBlock}` : `— ${titleBlock}`;
  }

  // 키워드 칩 — 토글에 따라 KO/EN 배열 선택
  if (todayKeywords) {
    const kws = (useEn && Array.isArray(card.keywords_original) && card.keywords_original.length)
      ? card.keywords_original
      : (Array.isArray(card.keywords) ? card.keywords : []);
    todayKeywords.innerHTML = '';
    kws.forEach((k) => {
      const span = document.createElement('span');
      span.className = 't-label-sm c-sand';
      span.textContent = `#${k}`;
      todayKeywords.appendChild(span);
    });
  }
}

// '지난 기록' — 새로고침 전 표시됐던 카드 최대 3개
// state.recentlyShownIds 큐에서 현재(맨 뒤)를 제외한 직전 카드들을 가져와 가장 최근 순으로 노출
function renderHomeBookmarks() {
  if (!homeBookmarksList) return;
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
      <div style="height:6px;"></div>
      ${renderCounts(card)}
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

function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
}

function renderCounts(card) {
  const views = formatCount(card?.view_count || 0);
  const bookmarks = formatCount(state.bookmarkCounts?.get(card?.card_id) || 0);
  return `<span class="t-label-sm c-walnut" style="display:inline-flex;align-items:center;gap:6px;">`
    + `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">visibility</span>${views}</span>`
    + `<span>·</span>`
    + `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">bookmark</span>${bookmarks}</span>`
    + `</span>`;
}

// TODAY 카드 전용 — 북마크 수 자리에 댓글 수 (북마크 수는 우상단 북마크 아이콘 아래로 이동, 사용자 명세).
function renderCountsForToday(card) {
  const views = formatCount(card?.view_count || 0);
  const comments = formatCount(state.commentCounts?.get(card?.card_id) || 0);
  return `<span class="t-label-sm c-walnut" style="display:inline-flex;align-items:center;gap:6px;">`
    + `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">visibility</span>${views}</span>`
    + `<span>·</span>`
    + `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">chat_bubble</span>${comments}</span>`
    + `</span>`;
}

// 상세 메타의 댓글 수 칩 (· 💬 N) — CardCounts.kt 미러. 현재 열린 카드의 detailComments 길이.
// renderCounts(공유 5곳)는 건드리지 않고 #detail-meta 에서만 별도 렌더.
function renderDetailCommentCount() {
  const el = document.getElementById('detail-comment-count');
  if (!el) return;
  const n = (state.detailComments && state.detailComments.length) || 0;
  el.innerHTML = `<span>·</span>`
    + `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">chat_bubble</span>${formatCount(n)}</span>`;
}

function formatBookmarkDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mo = parseInt(String(d.getMonth() + 1), 10);
    const day = parseInt(String(d.getDate()), 10);
    let h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = h < 12 ? '오전' : '오후';
    h = h % 12;
    if (h === 0) h = 12;
    return `${mo}. ${day}  ${ampm} ${h}:${min}`;
  } catch { return ''; }
}

todayBookmark.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!state.todayCard) return;
  toggleBookmark(state.todayCard.card_id);
});
// ENG 토글 — 오늘의 한줄 (editorial-toggle 스타일: 활성/비활성)
todayLangToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  state.todayLang = state.todayLang === 'ko' ? 'en' : 'ko';
  applyTodayLang(state.todayLang);
  const isEn = state.todayLang === 'en';
  todayLangToggle.classList.toggle('on', isEn);
  todayLangToggle.setAttribute('aria-checked', isEn ? 'true' : 'false');
});
todayCard.addEventListener('click', () => {
  if (state.todayCard) openDetail(state.todayCard);
});
todayRead.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.todayCard) openDetail(state.todayCard);
});
todayCompanion?.addEventListener('click', (e) => {
  e.stopPropagation();
  const card = state.todayCard;
  if (!card) return;
  // 백엔드(/api/chat)가 기대하는 카드 맥락 형태로 정리해 넘긴다 (work 단수, speaker 포함).
  openCompanion({
    card_id: card.card_id,
    quote: card.quote,
    script_excerpt: card.script_excerpt,
    keywords: card.keywords,
    speaker: isProseFormat(card.works?.format)
      ? ''
      : extractSpeaker(card.script_excerpt, card.works?.characters, card.quote),
    work: {
      title: card.works?.title,
      subtitle: card.works?.subtitle,
      author: card.works?.author,
      format: card.works?.format,
      release_year: card.works?.release_year,
      characters: card.works?.characters,
    },
    // 큐레이션 — '비슷한 작품 추천' 시 실제 카탈로그에서 유사 카드를 뽑아 보여주고,
    // 탭하면 그 카드로 이동.
    recommend: (limit) => recommendSimilarCards(state.todayCard, limit),
    onOpenCard: openRecommendedCard,
  });
});
/* today 화면 pull-to-refresh — 위에서 아래로 당기면 refreshTodayCard 호출.
   threshold(80px) 넘기면 새 카드 + 실타래 spin(spinYarn) 자동. */
(function initTodayPullToRefresh() {
  if (!viewDaily) return;
  let startY = 0;
  let pulled = 0;
  let active = false;
  const THRESHOLD = 80;
  const MAX_PULL = 100;
  viewDaily.addEventListener('touchstart', (e) => {
    if (state.currentView !== 'daily') return;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) return;
    if (!e.touches || !e.touches[0]) return;
    startY = e.touches[0].clientY;
    pulled = 0;
    active = true;
  }, { passive: true });
  viewDaily.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pulled = 0; viewDaily.style.transform = ''; return; }
    pulled = dy;
    /* 저항감 — 0.5 배율 + 상한 100px */
    const visual = Math.min(dy * 0.5, MAX_PULL);
    viewDaily.style.transform = `translateY(${visual}px)`;
  }, { passive: true });
  viewDaily.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    const fired = pulled > THRESHOLD;
    viewDaily.style.transition = 'transform .25s ease';
    viewDaily.style.transform = '';
    setTimeout(() => { viewDaily.style.transition = ''; }, 280);
    if (fired) {
      try { refreshTodayCard(); } catch (e) { console.warn('[m] pull-to-refresh failed:', e); }
    }
    startY = 0; pulled = 0;
  });
})();

// '다른 명대사' 새로고침 — 카드 위 버튼을 제거하고 하단 HOME 탭 재탭으로 대체(BottomNavBar 미러).
function refreshTodayCard() {
  if (state.isAnonymous) {
    if (getRefreshState().count >= REFRESH_LIMIT) {
      openPromptModal({
        title: '새로운 명대사는 3번까지',
        message: '오늘 명대사를 3번 받아보셨어요.\n로그인하면 무제한으로 고전 명대사를 즐길 수 있어요.',
      });
      return;
    }
    bumpRefreshCount();
  }
  track('today_refreshed');
  try { localStorage.setItem('today_yarn_hinted', '1'); } catch { /* noop */ }  // 새 명대사 받아봄 = 제스처 익힘 → 흔들림 영구 정지
  spinYarn();             // 실뭉치 한 바퀴 굴리기
  applyTodayCard(pickRandomCard());
  renderHomeBookmarks();  // '지난 기록' 갱신 (직전 카드가 추가됨)
}

// ---------- Archive ----------
// ---------- Archive: bookshelf grouped by genre ----------
const GENRE_ORDER = ['movie', 'drama', 'musical', 'opera', 'play', 'novel', 'poem', 'essay', 'prose'];
const GENRE_LABEL = {
  movie: '영화',
  drama: '드라마',
  musical: '뮤지컬',
  opera: '오페라',
  play: '연극',
  novel: '소설',
  poem: '시',
  essay: '에세이',
  prose: '산문',
};
// 영문 보기 시 형식 라벨 — 한국어 GENRE_LABEL 과 1:1 대응.
const GENRE_LABEL_EN = {
  movie: 'Movie',
  drama: 'Drama',
  musical: 'Musical',
  opera: 'Opera',
  play: 'Play',
  novel: 'Novel',
  poem: 'Poem',
  essay: 'Essay',
  prose: 'Prose',
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

// works.subtitle (DB) 우선, 없으면 extractSeries 휴리스틱 fallback.
// 같은 series지만 subtitle이 다르면 별도 책으로 유지 (책꽂이에 시리즈가 여러 권으로 늘어섬).
function resolveSeriesSubtitle(work) {
  const dbSubtitle = work?.subtitle ? String(work.subtitle).trim() : '';
  if (dbSubtitle) {
    return {
      series: displayTitle(work?.title || ''),
      subtitle: dbSubtitle,
    };
  }
  // legacy: 부제가 분리되지 않은 채 title에 통째로 들어있는 경우 — 패턴으로 추출 시도
  const ext = extractSeries({
    title: displayTitle(work?.title || ''),
    author: work?.author || '',
  });
  return { series: ext.series, subtitle: ext.subtitle };
}

function workGroupKey(work) {
  const { series, subtitle } = resolveSeriesSubtitle(work);
  const a = (work?.author || '').toLowerCase().trim();
  return `${series.toLowerCase()}__${subtitle.toLowerCase()}__${a}`;
}

function groupBookmarksByWork() {
  const byWork = new Map();
  for (const b of state.bookmarks) {
    const card = b.cards;
    if (!card) continue;
    const work = card.works || {};
    const key = workGroupKey(work);
    if (!byWork.has(key)) {
      const { series, subtitle } = resolveSeriesSubtitle(work);
      byWork.set(key, {
        key,
        series,
        subtitle,
        // spine 표시용 — subtitle 있으면 부제(개별 편), 없으면 시리즈명
        title: subtitle || series || displayTitle(work.title) || '제목 없음',
        rawTitle: work.title || '',
        format: (work.format || '').toLowerCase(),
        author: work.author || null,
        year: work.release_year || null,
        intro: work.intro || null,
        cards: [],
      });
    }
    byWork.get(key).cards.push({ ...card, _bookmarkedAt: b.created_at });
  }
  // series 가 같은 책들은 책꽂이에서 인접해서 표시되도록 정렬
  return Array.from(byWork.values()).sort((a, b) => {
    const s = a.series.localeCompare(b.series);
    if (s !== 0) return s;
    return a.subtitle.localeCompare(b.subtitle);
  });
}

// ===== library 고양이 마스코트 — 상태별 자세/표정 =====
const CAT_MOOD = {
  idle:     { src: 'assets/cat/cat_idle.png',       h: 58 }, // 평상시(작품 3~4권)
  empty:    { src: 'assets/cat/cat_empty.png',      h: 54 }, // 북마크 0
  few:      { src: 'assets/cat/cat_shelf_few.png',  h: 82 }, // 작품 1~2권
  many:     { src: 'assets/cat/cat_shelf_many.png', h: 90 }, // 작품 5권 이상
  struck:   { src: 'assets/cat/cat_struck.png',     h: 90 }, // 저장 직후 / 탭
  confused: { src: 'assets/cat/cat_confused.png',   h: 86 }, // 검색 결과 0
};
let catBaseMood = 'idle';
let catStruckTimer = null;
let catPrevBookmarkLen = -1;

function applyCatMood(mood) {
  if (!archiveCat) return;
  const m = CAT_MOOD[mood] || CAT_MOOD.idle;
  if (archiveCat.dataset.mood === mood) return;
  archiveCat.dataset.mood = mood;
  // crossfade: 페이드아웃 → src/높이 교체 → 페이드인
  archiveCat.classList.add('swap');
  setTimeout(() => {
    archiveCat.src = m.src;
    archiveCat.style.height = m.h + 'px';
    archiveCat.classList.remove('swap');
  }, 160);
}

function setCatBaseMood(mood) {
  catBaseMood = mood;
  if (!catStruckTimer) applyCatMood(mood); // struck 표시 중이 아니면 즉시 반영
}

function triggerCatStruck() {
  applyCatMood('struck');
  if (catStruckTimer) clearTimeout(catStruckTimer);
  catStruckTimer = setTimeout(() => {
    catStruckTimer = null;
    applyCatMood(catBaseMood); // 끝나면 원래 상태로 복귀
  }, 1400);
}

// 전체 도서 카탈로그 — LibraryViewModel.buildBooks 미러. state.allCards 를 work 단위로 묶음.
// groupBookmarksByWork 와 동일한 work-shape 라 buildGenreShelf/openBookModal 을 그대로 재사용.
function groupAllCardsByWork() {
  const byWork = new Map();
  for (const card of (state.allCards || [])) {
    if (!card || !card.works) continue;   // 작품 없는 카드는 제외 (LibraryViewModel 미러)
    const work = card.works;
    const key = workGroupKey(work);
    if (!byWork.has(key)) {
      const { series, subtitle } = resolveSeriesSubtitle(work);
      byWork.set(key, {
        key,
        series,
        subtitle,
        title: subtitle || series || displayTitle(work.title) || '제목 없음',
        rawTitle: work.title || '',
        format: (work.format || '').toLowerCase(),
        author: work.author || null,
        year: work.release_year || null,
        intro: work.intro || null,
        cards: [],
      });
    }
    byWork.get(key).cards.push(card);   // 카탈로그 카드엔 _bookmarkedAt 없음
  }
  return Array.from(byWork.values()).sort((a, b) => {
    const s = a.series.localeCompare(b.series);
    if (s !== 0) return s;
    return a.subtitle.localeCompare(b.subtitle);
  });
}

// 공유 책꽂이 렌더 — LIBRARY(카탈로그)와 MY>북마크가 같은 UI(장르별 spine + openBookModal)를 공유.
// ctx: { allWorks, totalCards, search, genre, els:{shelves,empty,noResult,count,loading}, countText(works) }
function renderShelfView(ctx) {
  const { els, allWorks } = ctx;
  if (els.loading) els.loading.style.display = 'none';

  if (allWorks.length === 0) {
    els.shelves.style.display = 'none';
    if (els.noResult) els.noResult.style.display = 'none';
    if (els.empty) els.empty.style.display = 'block';
    if (els.count) els.count.textContent = '';
    return 'empty';
  }
  if (els.empty) els.empty.style.display = 'none';
  if (els.count) els.count.textContent = ctx.countText(allWorks);

  const q = (ctx.search || '').trim().toLowerCase();
  const genre = ctx.genre || '';
  const works = allWorks.filter((w) => {
    if (genre && w.format !== genre) return false;
    if (q) {
      const title = displayTitle(w.title).toLowerCase();
      const series = (w.series || '').toLowerCase();
      const sub = (w.subtitle || '').toLowerCase();
      if (!title.includes(q) && !series.includes(q) && !sub.includes(q)) return false;
    }
    return true;
  });

  if (works.length === 0) {
    els.shelves.style.display = 'none';
    if (els.noResult) els.noResult.style.display = 'block';
    return 'no-result';
  }
  if (els.noResult) els.noResult.style.display = 'none';
  els.shelves.style.display = 'block';

  // 가로 스크롤 위치 보존 (realtime/폴링 재렌더 후 복원)
  const prevScrolls = new Map();
  els.shelves.querySelectorAll('.genre-section').forEach((sec) => {
    const g = sec.dataset.genre;
    const row = sec.querySelector('.shelf-row');
    if (g && row) prevScrolls.set(g, row.scrollLeft);
  });

  els.shelves.innerHTML = '';
  const openFn = (w) => openBookModal(w, allWorks);
  for (const g of GENRE_ORDER) {
    const items = works.filter((w) => w.format === g);
    if (items.length === 0) continue;
    els.shelves.appendChild(buildGenreShelf(g, items, openFn));
  }
  const otherItems = works.filter((w) => !GENRE_ORDER.includes(w.format));
  if (otherItems.length > 0) {
    els.shelves.appendChild(buildGenreShelf('other', otherItems, openFn));
  }

  if (prevScrolls.size > 0) {
    const restore = () => {
      els.shelves.querySelectorAll('.genre-section').forEach((sec) => {
        const g = sec.dataset.genre;
        const r = sec.querySelector('.shelf-row');
        if (g && r && prevScrolls.has(g)) r.scrollLeft = prevScrolls.get(g);
      });
    };
    restore();
    requestAnimationFrame(restore);
  }
  return 'shelves';
}

// 책장 안/위에 고양이를 흩어 놓는다 — 현재 6종 포즈를 순환하고,
// 장르마다 고정 시드를 써서 재렌더해도 위치가 튀지 않게 한다. (크기는 CSS .shelf-cat 48px로 통일)
// 책장 테두리 위에 올릴 고양이 — 쭉 뻗어 엎드린 cat_empty로 확정
// (배·앞발이 바닥에 붙은 포즈라 테두리에 안정적으로 얹힘)
// cat_idle(상체 세우고 앞발 한쪽 늘어뜨린 컷)은 떠 보여서 보류
const SHELF_CAT_POSES = ['cat_empty'];
// 모두 책장 윗 테두리(선반) 위 — 세로 위치는 CSS(.shelf-cat bottom)로 통일, 좌우만 변주
const SHELF_CAT_SPOTS = [
  'left:8%;',
  'left:33%;',
  'left:58%;',
  'right:7%;',
];
function decorateShelfWithCats(shelf, genre) {
  let seed = 0;
  for (const ch of genre) seed += ch.charCodeAt(0);
  const nCats = 1; // 책장마다 1마리 (나머지는 보류)
  const usedSpots = new Set();
  for (let i = 0; i < nCats; i++) {
    let spotIdx = (seed + i * 3) % SHELF_CAT_SPOTS.length;
    while (usedSpots.has(spotIdx)) spotIdx = (spotIdx + 1) % SHELF_CAT_SPOTS.length;
    usedSpots.add(spotIdx);
    const pose = SHELF_CAT_POSES[(seed + i * 2) % SHELF_CAT_POSES.length];
    const img = document.createElement('img');
    img.className = 'shelf-cat';
    img.src = `assets/cat/${pose}.png`;
    img.alt = '';
    img.style.cssText = SHELF_CAT_SPOTS[spotIdx];
    img.style.animationDelay = `${((seed + i) % 7) * 0.2}s`; // 숨쉬기 타이밍 분산
    shelf.appendChild(img);
  }
}

// LIBRARY 탭 = 전체 도서 카탈로그 (비회원 포함 누구나 열람)
function renderArchive() {
  // 안드 LibraryScreen 매칭: 4열 vertical 그리드 + 칩 + 검색. 고양이 마스코트는 안드에 없으니 숨김.
  const gridEl = document.getElementById('archive-grid');
  if (archiveCat) archiveCat.style.display = 'none';
  if (archiveShelves) archiveShelves.style.display = 'none';

  if (!state.allCards || state.allCards.length === 0) {
    if (archiveLoading) archiveLoading.style.display = 'block';
    if (gridEl) gridEl.style.display = 'none';
    if (archiveEmpty) archiveEmpty.style.display = 'none';
    if (archiveNoResult) archiveNoResult.style.display = 'none';
    loadAllCards().then(() => {
      if (state.currentView === 'archive') { renderArchiveChips(); renderArchive(); }
    }).catch(() => {});
    return;
  }
  if (archiveLoading) archiveLoading.style.display = 'none';

  const allWorks = groupAllCardsByWork();
  const totalCards = state.allCards.length;
  if (archiveCount) archiveCount.textContent = `전체 ${allWorks.length}권 · 명대사 ${totalCards}편`;
  /* 정렬 — 'alpha'(가나다, 한글 콜레이션) | 'latest'(책의 max card_id 내림차순)
     안드 LibrarySort 미러: ALPHA / LATEST */
  if (state.archiveSort === 'latest') {
    allWorks.sort((a, b) => {
      const maxA = (a.cards || []).reduce((m, c) => Math.max(m, c.card_id || 0), 0);
      const maxB = (b.cards || []).reduce((m, c) => Math.max(m, c.card_id || 0), 0);
      return maxB - maxA;
    });
  } else {
    allWorks.sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title), 'ko'));
  }
  /* 토글 라벨 sync */
  const sortLabelEl = document.getElementById('archive-sort-label');
  if (sortLabelEl) sortLabelEl.textContent = state.archiveSort === 'latest' ? '최신등록순' : '가나다순';

  const q = (state.archiveSearch || '').trim().toLowerCase();
  const genre = state.archiveGenre || '';
  const works = allWorks.filter((w) => {
    if (genre === 'other') { if (GENRE_ORDER.includes(w.format)) return false; }
    else if (genre && w.format !== genre) return false;
    if (q) {
      const title = displayTitle(w.title).toLowerCase();
      const series = (w.series || '').toLowerCase();
      const sub = (w.subtitle || '').toLowerCase();
      const author = (w.author || '').toLowerCase();
      if (!title.includes(q) && !series.includes(q) && !sub.includes(q) && !author.includes(q)) return false;
    }
    return true;
  });

  if (allWorks.length === 0) {
    if (gridEl) gridEl.style.display = 'none';
    if (archiveNoResult) archiveNoResult.style.display = 'none';
    if (archiveEmpty) archiveEmpty.style.display = 'block';
    return;
  }
  if (works.length === 0) {
    if (gridEl) gridEl.style.display = 'none';
    if (archiveEmpty) archiveEmpty.style.display = 'none';
    if (archiveNoResult) archiveNoResult.style.display = 'block';
    return;
  }
  if (archiveEmpty) archiveEmpty.style.display = 'none';
  if (archiveNoResult) archiveNoResult.style.display = 'none';
  if (!gridEl) return;
  gridEl.style.display = 'grid';
  gridEl.innerHTML = '';

  // 페이지네이션 — 4열 × 3행 = 12권/페이지
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(works.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, state.archivePage || 1), totalPages);
  state.archivePage = safePage;
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageWorks = works.slice(pageStart, pageStart + PAGE_SIZE);

  for (const w of pageWorks) {
    const work = (w.cards || [])[0]?.works || { title: w.title, cover_url: null };
    const displayName = displayTitle(w.title);
    // 카탈로그(LIBRARY) 라벨만 — 셜록홈즈 단편에 한해 "셜록홈즈 : 부제" 표시.
    //   DB·모달·검색은 건드리지 않음 (표시 전용). 다른 작품은 영향 없음.
    const isSherlock = (w.series || '').replace(/\s/g, '').startsWith('셜록홈즈');
    const catalogLabel = (isSherlock && w.subtitle && w.series !== w.subtitle)
      ? `셜록홈즈 : ${w.subtitle}`
      : displayName;
    const label = GENRE_LABEL[w.format] || '기타';
    const titleLen = displayName.length;
    const fontSize = titleLen <= 6 ? 13 : titleLen <= 10 ? 11 : 10;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lib-book';
    btn.innerHTML = work.cover_url
      ? `<div class="lib-cover" style="background:${leatherColorFor(w.title)};">
          <img class="lib-cover-img" src="${escapeHtml(work.cover_url)}" alt="${escapeHtml(displayName)}" loading="lazy" />
        </div>
        <span class="lib-count">${escapeHtml(catalogLabel)}</span>`
      : `<div class="lib-cover" style="background:${leatherColorFor(w.title)};">
          <div class="lib-cover-fallback">
            <span class="lib-cover-meta">${escapeHtml(label)}</span>
            <span class="lib-cover-title" style="font-size:${fontSize}px;">${escapeHtml(displayName)}</span>
            <span class="lib-cover-meta">${escapeHtml((w.author || '').toUpperCase())}</span>
          </div>
        </div>
        <span class="lib-count">${escapeHtml(catalogLabel)}</span>`;
    btn.addEventListener('click', () => {
      track('library_book_opened', { work_key: w.key });
      openBookModal(w, allWorks);
    });
    gridEl.appendChild(btn);
  }

  // 페이지 버튼 — 화면 하단 고정(fixed). 4개 페이지씩 윈도우 표시 (‹ 1 2 3 4 ›).
  // bottom-nav(약 64px) 위에 떠있고, view-archive 가 hide 되면 같이 사라짐(직접 hide 처리).
  let pagesEl = document.getElementById('archive-pages');
  const pagesStyle = 'position:fixed;left:50%;bottom:calc(80px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;justify-content:center;gap:8px;flex-wrap:wrap;z-index:40;background:rgba(250,248,242,0.92);padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(60,40,20,0.18);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  if (!pagesEl) {
    pagesEl = document.createElement('div');
    pagesEl.id = 'archive-pages';
    pagesEl.style.cssText = pagesStyle;
    /* 그리드 다음 위치는 의미 없지만 DOM tree 유지를 위해 그대로 삽입 */
    gridEl.parentNode.insertBefore(pagesEl, gridEl.nextSibling);
  } else {
    pagesEl.style.cssText = pagesStyle;
  }
  if (totalPages <= 1) {
    pagesEl.style.display = 'none';
  } else {
    pagesEl.style.display = 'flex';
    const WINDOW = 4;
    const winStart = Math.floor((safePage - 1) / WINDOW) * WINDOW + 1;
    const winEnd = Math.min(winStart + WINDOW - 1, totalPages);
    const btns = [];
    if (safePage > 1) btns.push(`<button data-page="${safePage - 1}" class="lib-page-btn">‹</button>`);
    for (let p = winStart; p <= winEnd; p++) {
      btns.push(`<button data-page="${p}" class="lib-page-btn${p === safePage ? ' active' : ''}">${p}</button>`);
    }
    if (safePage < totalPages) btns.push(`<button data-page="${safePage + 1}" class="lib-page-btn">›</button>`);
    pagesEl.innerHTML = btns.join('');
    pagesEl.querySelectorAll('[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = Number(b.dataset.page);
        if (!Number.isNaN(p)) {
          state.archivePage = p;
          renderArchive();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }
}

// MY>북마크 화면 = 사용자가 보관한 카드 책꽂이
function renderBookmarksShelf() {
  renderShelfView({
    allWorks: groupBookmarksByWork(),
    search: state.bmSearch,
    genre: state.bmGenre,
    els: { shelves: bmShelves, empty: bmEmpty, noResult: bmNoResult, count: bmCount, loading: null },
    countText: (w) => `소장 ${w.length}권 · 명대사 ${state.bookmarks.length}편`,
  });
}

function buildGenreShelf(genre, items, onOpen) {
  const section = document.createElement('section');
  section.className = 'genre-section';
  // realtime 재렌더 후 장르별 책꽂이 스크롤 위치를 복원하기 위한 키
  section.dataset.genre = genre;
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
        <span class="spine-count"><svg class="spine-count-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a1 1 0 0 1 1 1v18l-7-4-7 4V3a1 1 0 0 1 1-1z"/></svg>${count}</span>
        ${showSeries ? `<span class="spine-series">${escapeHtml(seriesLabel)}</span>` : ''}
        <span class="spine-title" style="font-size:${fontSize}px;">${escapeHtml(displayName)}</span>
        <span class="spine-genre">${escapeHtml(label)}</span>
      </div>
    `;
    spine.addEventListener('click', () => (onOpen ? onOpen(w) : openBookModal(w)));
    row.appendChild(spine);
  });

  shelf.appendChild(row);
  // decorateShelfWithCats 제거 — 사용자 명세: 북마크 책장 고정 고양이 X (랜덤 mascot 으로만)
  section.appendChild(shelf);
  return section;
}

// Book opening modal
function openBookModal(work, worksList) {
  const label = GENRE_LABEL[work.format] || '기타';
  const allWorks = worksList || groupBookmarksByWork();
  const idx = allWorks.findIndex((w) => w.key === work.key) + 1;

  bookEyebrow.textContent = work.subtitle
    ? `${work.series.toUpperCase()} · VOLUME #${String(idx).padStart(2, '0')}`
    : `Collected · Volume #${String(idx).padStart(2, '0')}`;
  // 부제가 있으면 부제를 메인 타이틀로, 없으면 시리즈명/원제목
  bookTitleEl.textContent = work.subtitle || displayTitle(work.title);
  /* 영어 제목 — iOS 매칭. work 자체엔 title_original 없을 수 있어 첫 카드에서 가져옴.
     bookTitleEl 다음 형제로 .book-title-en p 를 1회 생성·재사용. */
  const titleEn = (work.title_original || (work.cards && work.cards[0]?.works?.title_original) || '').trim();
  let titleEnEl = bookTitleEl.parentNode.querySelector('.book-title-en');
  if (!titleEnEl) {
    titleEnEl = document.createElement('p');
    titleEnEl.className = 'book-title-en t-label-sm c-walnut';
    titleEnEl.style.cssText = 'margin:2px 0 0;font-family:"IM Fell DW Pica","Times New Roman",serif;font-size:13px;font-style:italic;letter-spacing:0.02em;opacity:0.75;';
    bookTitleEl.parentNode.insertBefore(titleEnEl, bookTitleEl.nextSibling);
  }
  if (titleEn) {
    titleEnEl.textContent = titleEn;
    titleEnEl.style.display = 'block';
  } else {
    titleEnEl.style.display = 'none';
  }
  bookMetaEl.textContent = [label.toUpperCase(), work.author, work.year]
    .filter(Boolean).join(' · ');

  // 책 소개(intro) — 있으면 상단에 노출, 없으면 숨김
  if (bookIntroEl) {
    const introText = (work.intro || '').trim();
    bookIntroEl.textContent = introText;
    bookIntroEl.style.display = introText ? 'block' : 'none';
  }

  const book = bookModal.querySelector('.book');
  book.style.borderLeftColor = leatherColorFor(work.title);

  bookList.innerHTML = '';
  // 북마크된 card_id 집합 (체크 빠르게)
  const bookmarkedIds = new Set((state.bookmarks || []).map((b) => b?.card_id).filter((x) => x != null));
  work.cards.forEach((card, idx) => {
    const item = document.createElement('div');
    item.className = 'book-quote-item';
    const meta = card.excerpt_description
      ? truncateText(cleanQuote(card.excerpt_description), 60)
      : '';
    const bookmarkedAt = formatBookmarkDate(card._bookmarkedAt);
    const isBookmarked = bookmarkedIds.has(card.card_id);
    /* 카드 번호 #01, #02 ... — 안드 BookQuoteItem 매칭. 북마크 있으면 그 옆에. */
    const numLabel = `#${String(idx + 1).padStart(2, '0')}`;
    const badgeRow = `<span style="position:absolute;top:8px;right:10px;display:inline-flex;align-items:center;gap:6px;">
        ${isBookmarked ? `<span class="material-symbols-outlined" style="font-size:16px;color:var(--cta);font-variation-settings:'FILL' 1;">bookmark</span>` : ''}
        <span class="book-quote-num t-label-sm" style="color:var(--cta);font-weight:600;letter-spacing:0.04em;font-size:11px;">${numLabel}</span>
      </span>`;
    item.style.position = 'relative';
    item.innerHTML = `
      ${badgeRow}
      ${bookmarkedAt ? `<span class="book-quote-date">${escapeHtml(bookmarkedAt)}</span>` : ''}
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

let archiveSearchTrackTimer = null;
archiveSearchInput.addEventListener('input', (e) => {
  state.archiveSearch = e.target.value;
  state.archivePage = 1;  // 검색 변경 시 페이지 1로
  renderArchive();
  // 디바운스 — 입력이 멎고 700ms 뒤 비어있지 않은 질의만 1회 전송
  clearTimeout(archiveSearchTrackTimer);
  archiveSearchTrackTimer = setTimeout(() => {
    const q = (state.archiveSearch || '').trim();
    if (q) track('archive_searched', { query: q });
  }, 700);
});

// 고양이를 탭하면 잠깐 놀라는 반응 (이스터에그)
archiveCat?.addEventListener('click', () => triggerCatStruck());

// ===== Genre chips =====
// 공유 장르 칩 렌더 — LIBRARY(카탈로그)와 MY>북마크 공용
function renderShelfChips(chipsEl, allWorks, currentGenre, onSelect) {
  if (!chipsEl) return;
  const availableGenres = new Set(allWorks.map((w) => w.format).filter(Boolean));
  chipsEl.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'a-chip' + (currentGenre === '' ? ' active' : '');
  allChip.dataset.genre = '';
  allChip.textContent = `All · ${allWorks.length}`;
  chipsEl.appendChild(allChip);
  for (const g of GENRE_ORDER) {
    if (!availableGenres.has(g)) continue;
    const count = allWorks.filter((w) => w.format === g).length;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'a-chip' + (currentGenre === g ? ' active' : '');
    chip.dataset.genre = g;
    chip.textContent = `${GENRE_LABEL[g]} · ${count}`;
    chipsEl.appendChild(chip);
  }
  chipsEl.querySelectorAll('.a-chip').forEach((c) => {
    c.addEventListener('click', () => onSelect(c.dataset.genre));
  });
}

function renderArchiveChips() {
  renderShelfChips(archiveChips, groupAllCardsByWork(), state.archiveGenre || '', (g) => {
    state.archiveGenre = g;
    state.archivePage = 1;  // 장르 변경 시 페이지 1로
    track('library_genre_filtered', { genre: g || 'all' });
    renderArchiveChips();
    renderArchive();
  });
}

function renderBookmarksChips() {
  renderShelfChips(bmChips, groupBookmarksByWork(), state.bmGenre || '', (g) => {
    state.bmGenre = g;
    renderBookmarksChips();
    renderBookmarksShelf();
  });
}

// ── MY > 북마크 화면 (회원 전용 오버레이) ──
function paintMyBookmarksEntry() {
  if (!mypageBookmarksBlock) return;
  mypageBookmarksBlock.style.display = state.userId ? 'block' : 'none';
}

// MY 안 NOTICE 항목 — 안 읽은 공지 있으면 빨간 dot
function paintMyNoticeEntry() {
  const dot = document.getElementById('mypage-notice-dot');
  if (!dot) return;
  dot.style.display = typeof hasUnreadNotice === 'function' && hasUnreadNotice() ? 'inline-block' : 'none';
}

// ===== DAILY 6 섹션 헬퍼 =====
// 책표지 — LIBRARY (#archive-grid .lib-cover) 와 동일 구조. cover_url 있으면 이미지, 없으면 가죽색 + 제목 폴백.
//  · 박스 크기는 opts.width 로 지정 (132:188 비율)
//  · 이미지 로드 실패 시 onerror 로 .lib-cover-fallback 표시
function dailyBookCoverHTML(work, opts = {}) {
  const w = opts.width || 80;
  const h = opts.height || Math.round(w * 188 / 132);
  const radius = opts.radius || 2;
  const title = displayTitle(work?.title || '');
  const cover = work?.cover_url || '';
  const fontSize = Math.max(8, Math.round(w / 8));
  const fallback = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:6px 4px;">
    <span style="font-size:8px;color:var(--paper);opacity:0.85;text-align:center;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(GENRE_LABEL[work?.format] || '기타')}</span>
    <span style="font-family:'Noto Serif KR','Nanum Myeongjo',serif;font-size:${fontSize}px;color:var(--paper);font-weight:600;text-align:center;line-height:1.2;word-break:keep-all;text-shadow:0 1px 2px rgba(0,0,0,0.25);overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;">${escapeHtml(title)}</span>
    <span style="font-size:8px;color:var(--paper);opacity:0.85;text-align:center;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml((work?.author || '').toUpperCase())}</span>
  </div>`;
  if (cover) {
    return `<div style="width:${w}px;height:${h}px;flex-shrink:0;background:${leatherColorFor(title)};box-shadow:0 1px 4px rgba(60,40,20,0.18);overflow:hidden;border-radius:${radius}px;position:relative;">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy"
        onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', this.dataset.fallback);"
        data-fallback="${escapeHtml(fallback)}"
        style="width:100%;height:100%;object-fit:cover;object-position:top;display:block;" />
    </div>`;
  }
  return `<div style="width:${w}px;height:${h}px;flex-shrink:0;background:${leatherColorFor(title)};box-shadow:0 1px 4px rgba(60,40,20,0.18);border-radius:${radius}px;position:relative;overflow:hidden;">
    ${fallback}
  </div>`;
}

function renderDailyDate() {
  const el = document.getElementById('daily-date');
  if (!el) return;
  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  const ymd = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
  el.innerHTML = `<span style="font-weight:700;">${ymd}</span> <span style="color:var(--cta);">${days[d.getDay()]}요일</span>`;
}

const NOTICE_TAG_LABEL_DAILY = { update: 'UPDATE', notice: 'NOTICE', event: 'EVENT' };
let _noticeCarouselTimer = null;
let _noticeCarouselIdx = 0;
function stopNoticeCarousel() {
  if (_noticeCarouselTimer) { clearInterval(_noticeCarouselTimer); _noticeCarouselTimer = null; }
}
function stripMarkdownLite(s) {
  return String(s || '').replace(/[*_`~#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
}

// 섹션 1: 공지 한 줄 + 메가폰 + 10초 (사용자 명세). 클릭 → view-notice.
// (사용자 요청 — 업데이트 공지사항란 자체를 숨김. 헤더의 알림 벨로만 노출.)
function renderDailyNotice() {
  const sec = document.getElementById('daily-section-notice');
  if (!sec) return;
  sec.style.display = 'none';   // ← 숨김. 알림은 상단 벨 아이콘으로 확인.
  return;
  stopNoticeCarousel();
  if (!state.noticesLoaded) {
    if (typeof loadNotices === 'function') {
      loadNotices().then(() => { if (state.currentView === 'daily') renderDailyNotice(); });
    }
  }
  const items = (state.notices || []).slice(0, 3);
  if (items.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  const renderTitle = (i) => escapeHtml(items[i].title || '');

  sec.innerHTML = `
    <button type="button" class="daily-notice-row" aria-label="공지사항 자세히"
      style="display:flex;align-items:center;width:100%;background:var(--latte);border:0.5px solid var(--sand);border-radius:12px;padding:11px 14px;cursor:pointer;text-align:left;">
      <span class="material-symbols-outlined" style="font-size:18px;color:var(--cta);margin-right:10px;flex-shrink:0;">campaign</span>
      <span class="daily-notice-title-line" style="flex:1;min-width:0;font-size:13px;color:var(--espresso);font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity 200ms;">${renderTitle(0)}</span>
      <span class="material-symbols-outlined" style="font-size:16px;color:var(--walnut);margin-left:8px;flex-shrink:0;">chevron_right</span>
    </button>
    <div style="height:16px;"></div>
  `;
  sec.querySelector('.daily-notice-row')?.addEventListener('click', () => {
    stopNoticeCarousel();
    track('daily_notice_clicked');
    setView('notice');
  });
  if (items.length > 1) {
    _noticeCarouselIdx = 0;
    _noticeCarouselTimer = setInterval(() => {
      if (state.currentView !== 'daily') { stopNoticeCarousel(); return; }
      _noticeCarouselIdx = (_noticeCarouselIdx + 1) % items.length;
      const titleEl = sec.querySelector('.daily-notice-title-line');
      if (titleEl) {
        titleEl.style.opacity = '0';
        setTimeout(() => { if (titleEl) { titleEl.innerHTML = renderTitle(_noticeCarouselIdx); titleEl.style.opacity = '1'; } }, 200);
      }
    }, 10000);  // 사용자 명세: 10초
  }
}

// 새 책 메인 순환 — 최근 9개 중 10초마다 한 권씩
let _newbooksTimer = null;
let _newbooksMainIdx = 0;
let _newbooksPool = [];   // 최근 9개 정렬된 works
function stopNewbooksRotation() {
  if (_newbooksTimer) { clearInterval(_newbooksTimer); _newbooksTimer = null; }
}

// 섹션 2: 새로 들어온 책 — 최근 9권 중 메인 1권 (10초마다 순환) + 슬라이더(나머지)
function renderDailyNewBooks() {
  const sec = document.getElementById('daily-section-new-books');
  if (!sec) return;
  stopNewbooksRotation();
  // 날짜 — 카드(블랙 박스) 상단에 표시. 어두운 배경이라 밝은 색으로.
  const _td = new Date();
  const _dayKo = ['일','월','화','수','목','금','토'][_td.getDay()];
  const dailyDateLabel = `<span style="font-weight:700;">${_td.getFullYear()}년 ${_td.getMonth()+1}월 ${_td.getDate()}일</span> <span style="color:var(--cta);">${_dayKo}요일</span>`;
  const works = (typeof groupAllCardsByWork === 'function') ? groupAllCardsByWork()
    : (typeof groupBookmarksByWork === 'function' ? groupBookmarksByWork() : []);
  if (works.length === 0) { sec.style.display = 'none'; return; }
  // 최신 9권 (가장 오래된 건 자동으로 빠짐 — 사용자 명세)
  const sorted = [...works].sort((a, b) => {
    const aT = Math.max(0, ...(a.cards || []).map((c) => new Date(c.created_at || 0).getTime()));
    const bT = Math.max(0, ...(b.cards || []).map((c) => new Date(c.created_at || 0).getTime()));
    return bT - aT;
  }).slice(0, 9);
  _newbooksPool = sorted;
  // 풀 크기 변경 시 idx 보정 (예: 9→8 줄면)
  if (_newbooksMainIdx >= sorted.length) _newbooksMainIdx = 0;

  // 메인 카드 렌더 — 단일 카드(꽉 찬 폭). animate 시 내부만 슬라이드(dir=1 다음, -1 이전).
  const renderBlock = (animate = false, dir = 1) => {
    const main = sorted[_newbooksMainIdx];
    if (!main) return;
    const rest = sorted.filter((_, i) => i !== _newbooksMainIdx);
    const sampleQuote = ((main.cards || [])[0]?.quote || '').slice(0, 60);
    const mainWork = (main.cards || [])[0]?.works || { title: main.title, cover_url: null };
    const applyHTML = () => {
      sec.innerHTML = renderTemplate(main, rest, mainWork, sampleQuote);
      attachClickHandlers();
    };
    if (animate) {
      const oldInner = sec.querySelector('.daily-newbook-main-inner');
      if (oldInner) {
        const outX = dir >= 0 ? '-40%' : '40%';
        const inX = dir >= 0 ? '40%' : '-40%';
        oldInner.style.transition = 'transform 380ms cubic-bezier(0.55, 0, 0.7, 1), opacity 300ms ease-in';
        oldInner.style.transform = `translateX(${outX})`;
        oldInner.style.opacity = '0';
        setTimeout(() => {
          applyHTML();
          const newInner = sec.querySelector('.daily-newbook-main-inner');
          if (newInner) {
            newInner.style.transition = 'none';
            newInner.style.transform = `translateX(${inX})`;
            newInner.style.opacity = '0';
            requestAnimationFrame(() => {
              newInner.style.transition = 'transform 420ms cubic-bezier(0.25, 0.8, 0.3, 1), opacity 340ms ease-out';
              newInner.style.transform = 'translateX(0)';
              newInner.style.opacity = '1';
            });
          }
        }, 400);
        return;
      }
    }
    applyHTML();
  };

  // 단일 카드 + 아래 위치표시 dots + 작은 표지 줄(나머지). 좌우 스와이프로 카드 전환(아래 attachClickHandlers).
  const renderTemplate = (main, rest, mainWork, sampleQuote) => `
    <button type="button" class="daily-newbook-main" data-work-key="${escapeHtml(main.key)}"
      style="display:block;width:100%;background:var(--espresso);color:var(--paper);border:none;border-radius:14px;padding:24px 22px;cursor:pointer;text-align:left;min-height:var(--newbook-main-min-h,auto);box-sizing:border-box;overflow:hidden;position:relative;">
      <div class="daily-newbook-main-inner" style="display:flex;gap:20px;width:100%;align-items:center;">
        <div style="flex:1;min-width:0;">
          <p style="font-family:'Noto Sans KR',sans-serif;font-size:11px;font-weight:500;letter-spacing:0.04em;color:var(--sand);margin:0 0 13px;">${dailyDateLabel}</p>
          <span style="display:inline-block;background:var(--cta);color:var(--paper);font-size:10px;letter-spacing:0.15em;font-weight:700;padding:4px 10px;border-radius:12px;">NEW · 새로 들어온 고전</span>
          <h3 style="font-family:'Noto Serif KR','Nanum Myeongjo',serif;font-size:28px;margin:10px 0 5px;color:var(--paper);font-weight:700;letter-spacing:-0.02em;line-height:1.25;">${escapeHtml(main.series || displayTitle(main.title))}${main.subtitle ? ` <span style="font-size:0.6em;color:var(--sand);font-weight:600;">${escapeHtml(main.subtitle)}</span>` : ''}</h3>
          <p style="font-size:11px;color:var(--sand);margin:0 0 15px 3px;letter-spacing:0.05em;">${escapeHtml(main.author || '')} · ${main.year ? main.year + '년' : ''} · ${escapeHtml(GENRE_LABEL[main.format] || '기타')}</p>
          ${main.intro
            ? `<p style="font-size:14px;color:var(--latte);margin:0;line-height:1.75;font-family:'Noto Serif KR',serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(main.intro)}</p>`
            : `<p style="font-size:14px;color:var(--latte);margin:0;font-style:italic;line-height:1.75;font-family:'Noto Serif KR',serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">"${escapeHtml(sampleQuote)}${sampleQuote.length >= 60 ? '⋯' : ''}"</p>`}
        </div>
        <!-- 책표지 — 얇은 베이지 림 + 그림자로 검은 표지 분리 (사용자 명세: 림 얇게) -->
        <div style="flex-shrink:0;padding:1px;background:var(--latte);border-radius:2px;box-shadow:0 6px 18px rgba(0,0,0,0.5);">
          ${dailyBookCoverHTML(mainWork, { width: 82 })}
        </div>
      </div>
    </button>
    ${sorted.length > 1 ? `<div class="newbook-dots" style="display:flex;justify-content:center;gap:7px;padding:14px 0 0;">
      ${sorted.map((_, i) => `<button type="button" data-dot-idx="${i}" aria-label="${i + 1}번째 새 책 보기" style="width:7px;height:7px;border-radius:50%;border:none;padding:0;cursor:pointer;background:${i === _newbooksMainIdx ? 'var(--espresso)' : 'var(--sand)'};transition:background 0.2s;"></button>`).join('')}
    </div>` : ''}
    <div style="display:flex;gap:12px;overflow-x:auto;padding:18px 0 4px;scrollbar-width:none;">
      ${rest.map((w) => {
        const work = (w.cards || [])[0]?.works || { title: w.title, cover_url: null };
        return `
          <button type="button" data-work-key="${escapeHtml(w.key)}"
            style="background:transparent;border:none;cursor:pointer;flex-shrink:0;width:82px;text-align:center;padding:0;">
            ${dailyBookCoverHTML(work, { width: 82 })}
            <p style="font-size:11px;color:var(--espresso);margin:8px 0 0;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;font-family:'Noto Serif KR',serif;">${escapeHtml(w.series || displayTitle(w.title))}</p>
            <p style="font-size:10px;color:var(--walnut);margin:3px 0 0;line-height:1.3;">${escapeHtml(w.author || '')}</p>
          </button>
        `;
      }).join('')}
    </div>
    <div style="height:36px;"></div>
  `;

  // 핸들러 — 카드/작은표지 클릭(상세 모달)·dot 클릭(해당 책)·좌우 스와이프(카드 전환).
  const attachClickHandlers = () => {
    let swiped = false;   // 스와이프 직후 합성 click 이 모달 열지 않도록 가드(passive:false preventDefault 보조)
    sec.querySelectorAll('[data-work-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (swiped) { swiped = false; return; }
        const key = btn.dataset.workKey;
        const w = works.find((x) => x.key === key);
        if (!w) return;
        track('daily_newbook_clicked', { work_key: key });
        // daily 탭 그대로 머무름 + 팝업만 표시 (LIBRARY 이동 X). 실타래 게이트는 openDetail.
        if (typeof openBookModal === 'function') openBookModal(w, works);
      });
    });

    // dot 클릭 — 자동순환 멈추고 해당 책으로 전환(방향에 맞춰 슬라이드).
    sec.querySelectorAll('[data-dot-idx]').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(dot.dataset.dotIdx, 10);
        if (Number.isNaN(i) || i === _newbooksMainIdx) return;
        stopNewbooksRotation();
        const dir = i > _newbooksMainIdx ? 1 : -1;
        _newbooksMainIdx = i;
        renderBlock(true, dir);
      });
    });

    // 좌우 스와이프 — 점이 작아 누르기 어려워 카드 스와이프로 책 전환. 왼쪽=다음, 오른쪽=이전.
    const card = sec.querySelector('.daily-newbook-main');
    if (card && sorted.length > 1) {
      let sx = 0, sy = 0;
      card.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
      card.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;  // 탭·세로 스크롤은 무시
        e.preventDefault();   // 스와이프 직후 카드 클릭(상세 모달) 방지
        swiped = true;
        stopNewbooksRotation();
        const dir = dx < 0 ? 1 : -1;
        _newbooksMainIdx = (_newbooksMainIdx + dir + sorted.length) % sorted.length;
        renderBlock(true, dir);
      }, { passive: false });
    }
  };

  sec.style.display = 'block';

  // 가장 큰 카드 높이 측정 — 9권 모두 실제 폭(꽉 찬 카드)으로 offscreen 렌더해 max(height) 로 통일.
  // 제목·인용 길이가 달라 카드 전환 시 높이가 튀는 것 방지.
  const measureMaxMainHeight = () => {
    const width = sec.clientWidth || sec.getBoundingClientRect().width || 360;
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${width}px;pointer-events:none;`;
    document.body.appendChild(probe);
    let max = 0;
    try {
      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const rest = sorted.filter((_, idx) => idx !== i);
        const sq = ((m.cards || [])[0]?.quote || '').slice(0, 60);
        const mw = (m.cards || [])[0]?.works || { title: m.title, cover_url: null };
        probe.innerHTML = renderTemplate(m, rest, mw, sq);
        const btn = probe.querySelector('.daily-newbook-main');
        if (btn) max = Math.max(max, btn.getBoundingClientRect().height);
      }
    } finally {
      probe.remove();
    }
    return Math.ceil(max);
  };
  const maxH = measureMaxMainHeight();
  if (maxH > 0) sec.style.setProperty('--newbook-main-min-h', maxH + 'px');

  renderBlock();

  // 10초마다 다음 책으로 자동 전환 — daily 탭 떠나거나 사용자가 스와이프/dot 누르면 정지.
  if (sorted.length > 1) {
    _newbooksTimer = setInterval(() => {
      if (state.currentView !== 'daily') { stopNewbooksRotation(); return; }
      _newbooksMainIdx = (_newbooksMainIdx + 1) % sorted.length;
      renderBlock(true, 1);
    }, 10000);
  }
}

// 섹션 3: 이럴 땐, 이런 문장
// 추천·표시 모두 카드의 구조화된 keywords(LLM 추출 3개) 기준.
// 온도/감도는 모호해서 매칭·표시에서 모두 뺐다(주제 무관 오매칭 방지).
// '설레는 날'은 우리 카탈로그(고전) 결과 잘 안 맞아 카테고리에서 제외.
const CONTEXT_CATEGORIES = [
  { id: 'comfort', label: '위로가 필요할 때',
    keywords: ['위로', '슬픔', '아픔', '상처', '눈물', '치유', '회복', '안식', '위안', '평온', '평화', '포근', '온기', '따뜻', '따스', '용서', '연민', '공감', '고통'] },
  { id: 'lonely',  label: '먹먹한 밤',
    keywords: ['외로움', '그리움', '고독', '적막', '침묵', '회상', '공허', '먹먹', '쓸쓸', '회한', '이별', '상실', '그늘', '밤', '혼자', '홀로', '추억', '미련', '허무'] },
  { id: 'resolve', label: '결심이 필요할 때',
    keywords: ['결심', '의지', '도전', '용기', '운명', '신념', '다짐', '각오', '투지', '극복', '강인', '싸움', '꿈', '희망', '믿음', '열정', '성장', '자유', '선택', '시작', '변화', '두려움'] },
  { id: 'love',    label: '사랑에 빠졌을 때',
    keywords: ['사랑', '연애', '연정', '애정', '설렘', '첫사랑', '열정', '마음', '동경', '끌림', '입맞춤', '고백', '연인', '애틋', '정열', '구애', '연모'] },
  { id: 'ambition', label: '야망이 끓을 때',
    keywords: ['야망', '야심', '권력', '욕망', '성공', '지배', '정복', '명예', '출세', '패권', '군림', '권세', '왕좌', '승리', '쟁취', '도약'] },
  { id: 'anger',   label: '분노가 차오를 때',
    keywords: ['분노', '복수', '증오', '격분', '원한', '적개심', '울분', '노여움', '응징', '저항', '반항', '항거', '울화', '독기', '앙심'] },
  { id: 'mortal',  label: '삶과 죽음을 생각할 때',
    keywords: ['죽음', '삶', '생명', '인생', '운명', '허무', '종말', '소멸', '영원', '유한', '무상', '존재', '필멸', '생사', '덧없음', '세월'] },
  { id: 'desire',  label: '유혹에 흔들릴 때',
    keywords: ['유혹', '욕망', '쾌락', '본능', '충동', '호색', '관능', '탐닉', '중독', '갈망', '끌림', '타락', '방종', '쾌감'] },
  { id: 'faith',   label: '믿음이 흔들릴 때',
    keywords: ['믿음', '신앙', '양심', '기도', '위선', '죄', '구원', '회개', '영혼', '도덕', '종교', '참회', '심판', '용서'] },
  { id: 'freedom', label: '자유를 꿈꿀 때',
    keywords: ['자유', '해방', '독립', '탈출', '속박', '억압', '굴레', '저항', '권리', '평등', '존엄', '굴종', '해탈', '구속'] },
  // 아래 4개는 실제 추출 키워드(글쓰기·강박·직업 / 소유·집착 / 민중·복종·회복력 / 질문·인내·성장)
  // 군집에 근거해 확장 — 표본에 등장한 단어를 앞에 두고 동의어로 보강.
  { id: 'vocation', label: '일과 소명',
    keywords: ['글쓰기', '직업', '강박', '소명', '창작', '예술', '노동', '일', '천직', '몰두', '장인', '재능', '직분', '소임'] },
  { id: 'greed',    label: '욕심과 소유',
    keywords: ['소유', '집착', '욕심', '탐욕', '재물', '돈', '물질', '인색', '미련', '소유욕', '재산', '부', '이익', '가난'] },
  { id: 'society',  label: '시대와 민중',
    keywords: ['민중', '복종', '회복력', '사회', '계급', '권위', '부조리', '시대', '군중', '혁명', '신분', '억압', '체제', '저항'] },
  { id: 'growth',   label: '깨달음과 성장',
    keywords: ['질문', '인내', '성장', '깨달음', '배움', '지혜', '통찰', '성찰', '각성', '자각', '성숙', '깨우침', '수양', '경험'] },
];
let _contextualTimer = null;
let _contextualCatId = null;
let _contextualCardIdx = 0;
// 오늘 날짜(현지 기준)로 만든 일별 시드 — 자정마다 1씩 증가.
// 같은 날엔 같은 문장, 다음 날엔 다른 문장이 나오도록 카드 인덱스 오프셋으로 쓴다.
function _dailySeed() {
  const now = new Date();
  return Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000
  );
}
function stopContextualCarousel() {
  if (_contextualTimer) { clearInterval(_contextualTimer); _contextualTimer = null; }
}
// 카테고리 키워드와 카드 키워드의 일치 여부.
// 양방향 부분일치('사랑'↔'첫사랑')를 허용하되, 1자 토큰('밤','꽃')은
// 완전일치만 인정해 오매칭('밤'→'한밤중' 외 무관 단어)을 막는다.
function _kwMatch(catKw, cardKw) {
  if (!catKw || !cardKw) return false;
  if (catKw === cardKw) return true;
  if (catKw.length >= 2 && cardKw.includes(catKw)) return true;
  if (cardKw.length >= 2 && catKw.includes(cardKw)) return true;
  return false;
}
// 카드의 구조화된 keywords(LLM 추출 3개)만으로 카테고리 키워드와 매칭.
// 온도/감도·본문은 매칭에 쓰지 않는다 → 주제 기반 추천.
function filterContextualCards(catId) {
  const cat = CONTEXT_CATEGORIES.find((c) => c.id === catId) || CONTEXT_CATEGORIES[0];
  const cards = state.allCards || [];
  const scored = [];
  for (const card of cards) {
    const kws = (Array.isArray(card.keywords) ? card.keywords : [])
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean);
    if (kws.length === 0) continue;
    // 매칭된 카테고리 키워드 수 — 카드 키워드 중 하나라도 겹치면 +1
    let kwHits = 0;
    for (const ck of cat.keywords) {
      const c = ck.toLowerCase();
      if (kws.some((k) => _kwMatch(c, k))) kwHits++;
    }
    if (kwHits === 0) continue;
    scored.push({ card, score: kwHits });
  }
  // 키워드 적중 수 우선, 동점이면 조회수로 안정 정렬.
  scored.sort((a, b) => b.score - a.score || (b.card.view_count || 0) - (a.card.view_count || 0));
  return scored.slice(0, 12).map((x) => x.card);
}
function renderDailyContextual() {
  const sec = document.getElementById('daily-section-contextual');
  if (!sec) return;
  stopContextualCarousel();
  // 매칭 카드가 1장 이상 있는 카테고리만 후보로 — 빈 칩이 열리는 걸 막는다.
  const allCats = CONTEXT_CATEGORIES.filter((c) => filterContextualCards(c.id).length > 0);
  if (allCats.length === 0) { sec.style.display = 'none'; return; }
  // 하루에 3개씩만 노출 — 일별 시드로 시작점을 돌려 매일 다른 조합이 나오게 한다.
  // (후보가 3개 이하면 그대로 전부 보여준다.)
  const DAILY_COUNT = 3;
  const start = _dailySeed() % allCats.length;
  const cats = allCats.length <= DAILY_COUNT
    ? allCats
    : Array.from({ length: DAILY_COUNT }, (_, k) => allCats[(start + k) % allCats.length]);
  sec.style.display = 'block';
  // 그날 노출되는 3개 중 첫 번째를 기본으로 연다.
  const _dailyCatIdx = 0;
  sec.innerHTML = `
    <h2 class="t-headline-md c-espresso" style="margin:0 0 4px;font-weight:700;">이럴 땐, 이런 문장</h2>
    <p class="t-body-sm c-walnut" style="margin:0 0 12px;">끌리는 주제를 골라, 새로운 문장을 만나보세요.</p>
    <div class="archive-chips" id="daily-context-chips" style="margin-top:10px;margin-bottom:16px;">
      ${cats.map((c, i) => `<button class="a-chip ${i === _dailyCatIdx ? 'active' : ''}" data-ctx="${c.id}">${escapeHtml(c.label)}</button>`).join('')}
    </div>
    <div id="daily-context-card-host"></div>
    <div style="height:36px;"></div>
  `;
  const renderCard = () => {
    const host = sec.querySelector('#daily-context-card-host');
    if (!host) return;
    const cards = filterContextualCards(_contextualCatId);
    if (cards.length === 0) {
      host.innerHTML = '<p class="t-body-sm c-walnut" style="text-align:center;padding:24px 0;">이 분위기에 맞는 카드는 아직 준비 중이에요</p>';
      return;
    }
    // 일별 시드를 오프셋으로 더해 매일 다른 카드가 첫 화면에 오도록 한다.
    const card = cards[(_contextualCardIdx + _dailySeed()) % cards.length];
    // 하단 메타 — 온도/감도/여운 대신 카드 키워드를 보여줘 큐레이션 의도를 또렷하게.
    const kws = (Array.isArray(card.keywords) ? card.keywords : [])
      .map((k) => String(k || '').trim()).filter(Boolean).slice(0, 3);
    const chipsHtml = kws.length
      ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
          ${kws.map((k) => `<span style="font-size:11px;color:var(--cta);font-weight:600;background:var(--latte);border-radius:999px;padding:4px 11px;">#${escapeHtml(k)}</span>`).join('')}
        </div>`
      : '';
    host.innerHTML = `
      <article class="sharp-card daily-context-card" data-card-id="${card.card_id}" style="padding:24px;cursor:pointer;text-align:center;">
        <p style="margin:0;font-family:'Noto Serif KR','Nanum Myeongjo',serif;font-size:18px;line-height:1.6;color:var(--espresso);">"${escapeHtml((card.quote || '').slice(0, 120))}"</p>
        <div style="height:14px;"></div>
        <p class="t-label-sm c-walnut" style="margin:0;">${escapeHtml(card.works?.title || '')} · ${escapeHtml(card.works?.author || '')}</p>
        ${chipsHtml}
      </article>
    `;
    host.querySelector('.daily-context-card')?.addEventListener('click', () => openDetail(card));
  };
  const switchTo = (catId) => {
    _contextualCatId = catId;
    _contextualCardIdx = 0;
    sec.querySelectorAll('[data-ctx]').forEach((c) => c.classList.toggle('active', c.dataset.ctx === catId));
    renderCard();
  };
  sec.querySelectorAll('[data-ctx]').forEach((btn) => btn.addEventListener('click', () => switchTo(btn.dataset.ctx)));
  switchTo(cats[_dailyCatIdx].id);
  // 자동 회전 비활성 — 사용자가 칩을 직접 누를 때만 카드 변경 (사용자 명시).
}

// 섹션 4: 인기 대사 top 3 — 인기 = 북마크 + 조회수 + 댓글 수 (모두 가중치).
function renderDailyTrending() {
  const sec = document.getElementById('daily-section-trending');
  if (!sec) return;
  const bookmarkMap = state.bookmarkCounts || new Map();
  const commentMap = state.commentCounts || new Map();
  const scored = (state.allCards || [])
    .filter((c) => c?.quote)
    .map((c) => {
      const bm = bookmarkMap.get(c.card_id) || 0;
      const cm = commentMap.get(c.card_id) || 0;
      const vw = c.view_count || 0;
      return { c, bm, cm, vw, score: bm + cm + vw };  // 단순 합계 — 사용자 명세
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (scored.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  sec.innerHTML = `
    <div style="margin-bottom:8px;">
      <h2 class="t-headline-md c-espresso" style="font-weight:700;">이번 주 인기 대사</h2>
    </div>
    ${scored.map(({ c, bm, cm, vw }, i) => `
      <button type="button" data-card-id="${c.card_id}"
        style="display:flex;align-items:flex-start;gap:14px;width:100%;background:transparent;border:none;border-bottom:0.5px solid var(--latte);cursor:pointer;padding:14px 0;text-align:left;">
        <span style="font-family:'Noto Serif KR',serif;font-size:22px;color:var(--espresso);flex-shrink:0;width:20px;">${i + 1}</span>
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:14px;color:var(--espresso);line-height:1.5;">"${escapeHtml((c.quote || '').slice(0, 80))}"</p>
          <div style="margin-top:8px;display:flex;gap:14px;font-size:11px;color:var(--walnut);">
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:13px !important;">bookmark</span>${formatCount(bm)}</span>
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:13px !important;">visibility</span>${formatCount(vw)}</span>
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:13px !important;">chat_bubble</span>${formatCount(cm)}</span>
          </div>
        </div>
      </button>
    `).join('')}
    <div style="height:36px;"></div>
  `;
  sec.querySelectorAll('[data-card-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cardId = Number(btn.dataset.cardId);
      const card = (state.allCards || []).find((c) => c.card_id === cardId);
      if (card) { track('daily_trending_clicked', { card_id: cardId }); openDetail(card); }
    });
  });
}

// 섹션 5: 오즈 추천
function renderDailyOzPick() {
  const sec = document.getElementById('daily-section-oz');
  if (!sec) return;
  const allCards = state.allCards || [];
  if (allCards.length === 0) { sec.style.display = 'none'; return; }

  // 행동 취향(북마크 키워드) — 선호 미설정 시 폴백용.
  const taste = new Set();
  for (const b of (state.bookmarks || [])) {
    const card = b?.cards;
    if (card?.keywords && Array.isArray(card.keywords)) card.keywords.forEach((k) => taste.add(k));
  }

  // 사용자가 온보딩에서 직접 고른 선호.
  const prefs = getPrefs() || {};
  const chosenThemes = (!prefs.any && Array.isArray(prefs.themes)) ? prefs.themes.filter(Boolean) : [];
  const chosenThemeSet = new Set(chosenThemes);
  const chosenGenres = new Set(Array.isArray(prefs.genres) ? prefs.genres : []);
  const userName = state.userNickname || state.userLoginId || '오즈';

  // 비로그인 사용자 — 카드 자체는 흐릿한 미리보기로 띄우고, 그 위에 '로그인하고 보기' 안내 오버레이.
  if (state.isAnonymous) {
    sec.style.display = 'block';
    const guestName = state.userNickname || '게스트';
    sec.innerHTML = `
      <h2 class="c-espresso" style="margin:0 0 8px;display:flex;align-items:baseline;gap:8px;font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-weight:400;">
        <span style="font-size:17px;">당신을 위한</span>
        <span class="brand-logo" style="font-size:24px;"><span class="cap">D</span>aily <span class="cap">S</span>cript<span class="dot">.</span></span>
      </h2>
      <article class="sharp-card" style="padding:20px;position:relative;overflow:hidden;">
        <!-- 흐릿한 미리보기 콘텐츠 (실제 추천 데이터는 로그인 후 노출) -->
        <div style="filter:blur(6px);pointer-events:none;user-select:none;opacity:0.7;">
          <div style="display:flex;align-items:center;gap:18px;margin-bottom:16px;">
            <img src="assets/cat/cat_computer.png" alt="" style="width:140px;height:auto;flex-shrink:0;" />
            <div style="flex:1;min-width:0;">
              <p style="margin:0;font-size:11px;color:var(--walnut);line-height:1.9;">
                <strong style="font-size:15px;color:#000;font-weight:700;">${escapeHtml(guestName)}</strong> 님<br>
                <strong style="color:var(--cta);">장르</strong> : 미스터리, 비극<br>
                <strong style="color:var(--cta);">주제</strong> : 사랑, 성장, 회복
              </p>
            </div>
          </div>
          <div style="background:var(--latte);border:0.5px solid var(--sand);padding:14px 16px;margin-bottom:14px;border-radius:8px;">
            <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:13px;color:var(--espresso);line-height:1.6;">오즈가 당신의 취향에 맞춰 골랐어요.</p>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:56px;height:80px;background:var(--latte);border-radius:2px;"></div>
            <div style="flex:1;min-width:0;">
              <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:15px;color:var(--espresso);font-weight:700;line-height:1.3;">로미오와 줄리엣</p>
              <p style="margin:4px 0 0;font-size:12px;color:var(--walnut);">셰익스피어 · 1597</p>
            </div>
          </div>
        </div>
        <!-- 안내 오버레이 — 클릭 시 인증 모달 -->
        <button type="button" id="oz-login-overlay" aria-label="로그인하고 추천 받기"
          style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(250,248,242,0.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border:none;cursor:pointer;padding:24px;text-align:center;">
          <span class="material-symbols-outlined" style="font-size:32px;color:var(--cta);">lock</span>
          <p style="margin:0;font-family:'Nanum Myeongjo','Noto Serif KR',serif;font-size:16px;color:var(--espresso);font-weight:700;line-height:1.4;">로그인하면 당신만의<br>오즈 추천을 받을 수 있어요</p>
          <span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:12px;color:var(--cta);font-weight:600;">로그인 / 회원가입<span style="font-size:14px;">›</span></span>
        </button>
      </article>
      <div style="height:36px;"></div>
    `;
    sec.querySelector('#oz-login-overlay')?.addEventListener('click', () => {
      track('oz_login_cta');
      try { openSigninModal(); } catch (e) { console.warn('[m] openSigninModal failed:', e); }
    });
    return;
  }

  // (옛 분기 유지 — 가입했는데 선호 미설정한 사용자만 도달 — 현재는 unreachable 이지만 향후 비익명 첫 진입 케이스 대비)
  if (false && state.isAnonymous && !hasActivePrefs(prefs)) {
    sec.style.display = 'block';
    const guestName = state.userNickname || '게스트';
    sec.innerHTML = `
      <h2 class="c-espresso" style="margin:0 0 8px;display:flex;align-items:baseline;gap:8px;font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-weight:400;">
        <span style="font-size:17px;">당신을 위한</span>
        <span class="brand-logo" style="font-size:24px;"><span class="cap">D</span>aily <span class="cap">S</span>cript<span class="dot">.</span></span>
      </h2>
      <article class="sharp-card" style="padding:20px;">
        <div style="display:flex;align-items:center;gap:18px;margin-bottom:16px;">
          <img src="assets/cat/cat_computer.png" alt="오즈"
            style="width:140px;height:auto;flex-shrink:0;pointer-events:none;user-select:none;-webkit-user-drag:none;" />
          <div style="flex:1;min-width:0;">
            <p style="margin:0 0 6px;font-weight:700;color:var(--espresso);font-size:14px;">${escapeHtml(guestName)}</p>
            <p style="margin:0;font-size:12px;color:var(--walnut);line-height:1.6;">아직 당신의 취향을 몰라요</p>
          </div>
        </div>
        <div style="background:var(--latte);border:0.5px solid var(--sand);padding:14px 16px;margin-bottom:16px;border-radius:8px;">
          <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:13px;color:var(--espresso);line-height:1.6;">좋아하는 장르와 주제만 알려주시면, 오즈가 매일 딱 맞는 한 문장을 골라드려요.</p>
        </div>
        <button id="oz-personalize-btn" type="button"
          style="width:100%;padding:13px;background:var(--cta);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">취향 알려주기</button>
      </article>
      <div style="height:36px;"></div>
    `;
    sec.querySelector('#oz-personalize-btn')?.addEventListener('click', () => {
      track('oz_personalize_cta');
      runPreferenceFlow();
    });
    return;
  }

  // 카드가 사용자가 고른 주제에 닿는지 — card-theme 분류기로 카드 키워드→주제 집합 후 교집합.
  const matchedChosenTheme = (card) => {
    if (!chosenThemeSet.size || typeof cardThemeSet !== 'function') return null;
    const themes = cardThemeSet(card.keywords || []);
    for (const t of themes) if (chosenThemeSet.has(t)) return t;
    return null;
  };

  // 하루 1개 — localStorage 에 date+card_id 캐시. 같은 날짜면 같은 카드, 0시에 갱신.
  const OZ_DAILY_KEY = 'ds.oz.daily';
  const todayKey = todayStr();
  let pick = null;
  try {
    const raw = JSON.parse(safeStorageGet(OZ_DAILY_KEY, 'null') || 'null');
    if (raw && raw.date === todayKey && raw.cardId) {
      pick = allCards.find((c) => c && c.card_id === raw.cardId);
    }
  } catch { /* ignore */ }

  // 캐시 검증 — 고른 주제가 있는데 캐시 카드가 그 주제에 안 닿으면(또는 취향 키워드 불일치) 다시 뽑는다.
  if (pick) {
    if (chosenThemeSet.size) { if (!matchedChosenTheme(pick)) pick = null; }
    else if (taste.size > 0 && !(pick.keywords || []).some((k) => taste.has(k))) pick = null;
  }

  if (!pick) {
    let pool;
    if (chosenThemeSet.size) {
      let matched = allCards.filter((c) => matchedChosenTheme(c));
      if (chosenGenres.size) {
        const both = matched.filter((c) => chosenGenres.has(c.works && c.works.format));
        if (both.length) matched = both;  // 주제+장르 둘 다 맞으면 우선
      }
      pool = matched.length ? matched : allCards;
    } else if (taste.size > 0) {
      const matched = allCards.filter((c) => (c.keywords || []).some((k) => taste.has(k)));
      pool = matched.length ? matched : allCards;
    } else {
      pool = allCards;
    }
    pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) safeStorageSet(OZ_DAILY_KEY, JSON.stringify({ date: todayKey, cardId: pick.card_id }));
  }
  if (!pick) { sec.style.display = 'none'; return; }

  // 추천 한마디 — 고른 주제 > 행동 취향 > 일반 순으로 개인화.
  // 로그인 상태면 '당신' 대신 표시 이름(닉네임>아이디)+'님'으로 호명.
  // reasonHtml 은 의도된 <strong> 을 포함하므로 렌더 시 escape 하지 않는다 — 동적 값은 개별 escape.
  const themeHit = matchedChosenTheme(pick);
  const tasteHit = (pick.keywords || []).find((k) => taste.has(k));
  const reasonHtml = themeHit
    ? `<strong>'${escapeHtml(themeHit)}'</strong> 이야기를 좋아한다면, 이 작품이 잘 맞을 거예요.`
    : tasteHit
      ? `<strong>'${escapeHtml(tasteHit)}'</strong>에 자주 머무는 당신이라면, 좋아할 한 문장이에요.`
      : '오즈가 오늘 골라드린 한 문장이에요.';
  const work = pick.works || {};
  // 선호 메타 표시용 — 고른 장르/주제(없으면 상관없음).
  const genreText = chosenGenres.size ? [...chosenGenres].map((g) => GENRE_LABEL[g] || g).join(', ') : '상관없음';
  const themeText = prefs.any ? '상관없음' : (chosenThemes.length ? chosenThemes.join(', ') : '상관없음');

  sec.style.display = 'block';
  sec.innerHTML = `
    <h2 class="c-espresso" style="margin:0 0 4px;display:flex;align-items:baseline;gap:8px;font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-weight:400;">
      <span style="font-size:17px;">당신을 위한</span>
      <span class="brand-logo" style="font-size:24px;"><span class="cap">D</span>aily <span class="cap">S</span>cript<span class="dot">.</span></span>
    </h2>
    <p class="t-body-sm c-walnut" style="margin:0 0 12px;">오즈가 당신의 취향을 살펴 골랐어요.</p>
    <article class="sharp-card daily-oz-card" data-card-id="${pick.card_id}" style="padding:20px;cursor:pointer;">
      <!-- 헤더 — 고양이 + 닉네임 + 선호(장르/주제) 메타 -->
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:16px;">
        <img src="assets/cat/cat_computer.png" alt="오즈"
          style="width:140px;height:auto;flex-shrink:0;pointer-events:none;user-select:none;-webkit-user-drag:none;" />
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-size:11px;color:var(--walnut);line-height:1.9;">
            ${(state.userNickname || state.userLoginId) ? '<strong style="font-size:15px;color:#000;font-weight:700;">' + escapeHtml(userName) + '</strong> 님' : '<strong style="font-size:15px;color:#000;font-weight:700;">당신</strong>'}<br>
            <strong style="color:var(--cta);">장르</strong> : ${escapeHtml(genreText)}<br>
            <strong style="color:var(--cta);">주제</strong> : ${escapeHtml(themeText)}
          </p>
        </div>
      </div>
      <!-- 추천 한마디 박스 (별도) -->
      <div style="background:var(--latte);border:0.5px solid var(--sand);padding:14px 16px;margin-bottom:14px;border-radius:8px;">
        <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:13px;color:var(--espresso);line-height:1.6;">${reasonHtml}</p>
      </div>
      <!-- 추천 책 — 클릭 시 해당 도서의 모든 카드(collected volume) 책 펼침 모달 -->
      <div class="oz-rec-book" role="button" tabindex="0" style="display:flex;align-items:center;gap:12px;cursor:pointer;">
        ${dailyBookCoverHTML(work, { width: 56 })}
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:15px;color:var(--espresso);font-weight:700;line-height:1.3;">${escapeHtml(work.title || '')}</p>
          <p style="margin:4px 0 0;font-size:12px;color:var(--walnut);">${escapeHtml(work.author || '')}${work.release_year ? ' · ' + work.release_year : ''}</p>
        </div>
        <span class="oz-rec-cta" style="font-size:11px;color:var(--cta);letter-spacing:0.04em;font-weight:600;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:2px;">책 펼치기<span style="font-size:13px;line-height:1;">›</span></span>
      </div>
    </article>
    <div style="height:36px;"></div>
  `;
  // 사용자 명세: 오즈 카드 클릭 → daily 탭에 랜덤 고양이 spawn (카드 상세 이동 X).
  const ozCard = sec.querySelector('.daily-oz-card');
  if (ozCard) {
    ozCard.style.cursor = 'pointer';
    ozCard.addEventListener('click', () => {
      track('daily_oz_clicked', { card_id: pick.card_id });
      spawnRandomCat();
    });
  }
  // 추천 책 클릭 → 해당 도서의 collected volume(모든 카드) 책 펼침 모달로 이동.
  // (예전엔 today 카드로 띄웠는데 사용자 명세로 도서 전체 카드 보기로 변경)
  const recBook = sec.querySelector('.oz-rec-book');
  if (recBook) {
    const openRec = (e) => {
      e.stopPropagation();
      track('daily_oz_recommend_open', { card_id: pick.card_id });
      try {
        const allWorks = groupAllCardsByWork();
        const targetWork = allWorks.find((w) => (w.cards || []).some((c) => c.card_id === pick.card_id));
        if (targetWork && typeof openBookModal === 'function') {
          openBookModal(targetWork, allWorks);
        } else {
          // fallback — 책 못 찾으면 옛 흐름(추천 카드 띄움)
          openRecommendedCard(pick);
        }
      } catch (err) {
        console.warn('[m] open recommended work failed:', err);
        openRecommendedCard(pick);
      }
    };
    recBook.addEventListener('click', openRec);
    recBook.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openRec(e); });
  }
}

// 랜덤 고양이 spawn — 오즈 카드 클릭 시 view-daily 안 랜덤 위치에 생성, 10초 후 페이드아웃.
const RANDOM_CAT_FILES = [
  'cat_confused.png', 'cat_empty.png', 'cat_idle.png',
  'cat_shelf_few.png', 'cat_shelf_many.png', 'cat_struck.png',
  /* 추가된 새 자세 — TODAY/피드/LIBRARY/카드 상세 등에 쓰이던 이미지도 랜덤 풀에 포함 */
  'cat_today.png', 'cat_pen.png', 'cat_library.png', 'library-cat-2.png',
];
function spawnRandomCat() {
  const file = RANDOM_CAT_FILES[Math.floor(Math.random() * RANDOM_CAT_FILES.length)];
  const img = document.createElement('img');
  img.src = `assets/cat/${file}`;
  img.className = 'daily-random-cat';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  const w = 60 + Math.floor(Math.random() * 50);  // 60~110px

  // DAILY 탭 viewport 영역 아무 위치나 — 단 마지막 컨텐츠 박스 아래(빈 공간)는 회피.
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const TOP_MARGIN = 70;   // 상단바
  // 마지막 컨텐츠 박스의 bottom 찾기 (viewport 좌표). 그 아래는 빈 공간.
  let maxContentBottom = 0;
  document.querySelectorAll('#view-daily .sharp-card, #view-daily .daily-notice-row, #view-daily .daily-newbook-main')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > maxContentBottom) maxContentBottom = r.bottom;
    });
  const yMax = Math.min(vh - 80, Math.max(TOP_MARGIN + w + 20, maxContentBottom));
  const top = TOP_MARGIN + Math.random() * Math.max(0, yMax - TOP_MARGIN - w);
  const left = 12 + Math.random() * Math.max(0, vw - w - 24);

  const rotate = Math.floor(Math.random() * 30) - 15;
  img.style.cssText = `position:fixed;width:${w}px;height:auto;top:${Math.floor(top)}px;left:${Math.floor(left)}px;z-index:90;pointer-events:none;user-select:none;-webkit-user-drag:none;opacity:0;transform:rotate(${rotate}deg);transition:opacity 500ms;`;
  document.body.appendChild(img);
  requestAnimationFrame(() => { img.style.opacity = '1'; });
  setTimeout(() => {
    img.style.opacity = '0';
    setTimeout(() => { if (img.parentNode) img.parentNode.removeChild(img); }, 600);
  }, 10000);
}

function clearRandomCats() {
  document.querySelectorAll('.daily-random-cat').forEach((el) => el.remove());
}

// 섹션 6: 다시 만나기 — 최근 북마크
function renderDailyRecent() {
  const sec = document.getElementById('daily-section-recent');
  if (!sec) return;
  // 사용자 명세: 가장 최근 북마크한 카드 (열람 우선순위 제거)
  const bookmarks = state.bookmarks || [];
  if (bookmarks.length === 0) { sec.style.display = 'none'; return; }
  const recent = [...bookmarks].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  const card = recent?.cards;
  if (!card) { sec.style.display = 'none'; return; }
  const days = Math.floor((Date.now() - new Date(recent.created_at || 0).getTime()) / (24 * 60 * 60 * 1000));
  const ago = (days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`) + ' 북마크';
  const work = card.works || {};
  sec.style.display = 'block';
  sec.innerHTML = `
    <h2 style="font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-size:20px;color:var(--espresso);margin:0 0 4px;font-weight:700;">다시 만나기</h2>
    <p class="t-body-sm c-walnut" style="margin:0 0 12px;">담아둔 문장, 다시 읽어볼까요?</p>
    <button type="button" class="sharp-card daily-recent-card" data-card-id="${card.card_id}"
      style="display:flex;align-items:center;gap:14px;width:100%;padding:16px;cursor:pointer;text-align:left;">
      ${dailyBookCoverHTML(work, { width: 64 })}
      <div style="flex:1;min-width:0;">
        <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:14px;color:var(--espresso);line-height:1.6;word-break:keep-all;overflow-wrap:break-word;">"${escapeHtml(card.quote || '')}"</p>
        <p class="t-label-sm c-walnut" style="margin:8px 0 0;">${escapeHtml(work.title || '')} · ${escapeHtml(ago)}</p>
      </div>
    </button>
    <div style="height:36px;"></div>
  `;
  sec.querySelector('.daily-recent-card')?.addEventListener('click', () => {
    track('daily_recent_clicked', { card_id: card.card_id });
    openDetail(card);
  });
}
function openBookmarksScreen() {
  if (!bookmarksScreen) return;
  if (!state.userId) { toast('로그인 후 사용할 수 있어요'); return; }
  history.pushState({ overlay: 'bookmarks' }, '');
  bookmarksScreen.style.display = 'flex';
  if (bookmarksBody) bookmarksBody.scrollTop = 0;
  requestAnimationFrame(() => bookmarksScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  renderBookmarksChips();
  renderBookmarksShelf();
  spawnBookmarksMascot();   // 매번 진입 시 랜덤 자세 + 위치 (사용자 명세)
  track('bookmarks_opened');
}

// MY > 북마크 화면 진입 시 오즈 고양이 spawn — 매번 자세/위치 랜덤.
function spawnBookmarksMascot() {
  // 기존 mascot 제거 (재진입 시 새로 spawn)
  document.querySelectorAll('.bm-random-mascot').forEach((el) => el.remove());
  if (!bookmarksScreen) return;
  const file = RANDOM_CAT_FILES[Math.floor(Math.random() * RANDOM_CAT_FILES.length)];
  const img = document.createElement('img');
  img.src = `assets/cat/${file}`;
  img.className = 'bm-random-mascot';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  const w = 70 + Math.floor(Math.random() * 40);  // 70~110px
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  // 상단 헤더 70px + 검색/칩 영역 (~140px) 아래에 spawn — 상단 컨텐츠 가리지 않음.
  const top = 200 + Math.random() * Math.max(0, vh * 0.5 - w);
  const left = 12 + Math.random() * Math.max(0, vw - w - 24);
  const rotate = Math.floor(Math.random() * 30) - 15;
  img.style.cssText = `position:fixed;width:${w}px;height:auto;top:${Math.floor(top)}px;left:${Math.floor(left)}px;z-index:80;pointer-events:none;user-select:none;-webkit-user-drag:none;opacity:0;transform:rotate(${rotate}deg);transition:opacity 400ms;`;
  bookmarksScreen.appendChild(img);
  requestAnimationFrame(() => { img.style.opacity = '1'; });
}

function closeBookmarksScreenInternal() {
  if (!bookmarksScreen) return;
  bookmarksScreen.classList.remove('open');
  setTimeout(() => {
    bookmarksScreen.style.display = 'none';
    document.body.style.overflow = '';
    // 닫을 때 mascot 제거 — 다음 진입 시 새로 spawn
    document.querySelectorAll('.bm-random-mascot').forEach((el) => el.remove());
  }, 250);
}
function closeBookmarksScreen() {
  if (history.state && history.state.overlay === 'bookmarks') history.back();
  else closeBookmarksScreenInternal();
}
if (mypageBookmarksEntry) mypageBookmarksEntry.addEventListener('click', openBookmarksScreen);
$('#mypage-notice-entry')?.addEventListener('click', () => {
  track('nav_my_notice');
  setView('notice');
});
$('#mypage-yarn-entry')?.addEventListener('click', () => {
  track('nav_my_yarn');
  openYarnScreen();
});
$('#mypage-attendance-entry')?.addEventListener('click', () => {
  track('nav_my_attendance');
  openAttendanceModal();
});
if (bookmarksBack) bookmarksBack.addEventListener('click', closeBookmarksScreen);
if (bmSearchInput) {
  bmSearchInput.addEventListener('input', (e) => {
    state.bmSearch = e.target.value;
    renderBookmarksShelf();
  });
}

// ---------- Settings ----------
function paintPushToggle() {
  pushToggle.classList.toggle('on', !!state.pushEnabled);
  pushToggle.setAttribute('aria-checked', state.pushEnabled ? 'true' : 'false');
}
pushToggle.addEventListener('click', () => {
  state.pushEnabled = !state.pushEnabled;
  safeStorageSet('ds.push', state.pushEnabled ? '1' : '0');
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

// Settings 의 MY CHATS 진입 버튼 표시/숨김 — 로그인 사용자에게만 노출
function paintMyChatsEntry() {
  // '내 활동' 라벨은 활동 블록과 함께(로그인 시) 노출
  if (mypageActivityLabel) mypageActivityLabel.style.display = state.userId ? 'block' : 'none';
  if (!mypageChatsBlock) return;
  mypageChatsBlock.style.display = state.userId ? 'block' : 'none';
}

function openChatsScreen() {
  if (!chatsScreen) return;
  if (!state.userId) { toast('로그인 후 사용할 수 있어요'); return; }
  history.pushState({ overlay: 'chats' }, '');
  chatsScreen.style.display = 'flex';
  if (chatsBody) chatsBody.scrollTop = 0;
  requestAnimationFrame(() => chatsScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  // 데이터 로드 (entry 안 하던 초기 상태에선 비어 있을 수 있음)
  loadAndRenderMyChats().catch((err) => console.warn('[m] openChatsScreen load failed', err));
}

function closeChatsScreenInternal() {
  if (!chatsScreen) return;
  chatsScreen.classList.remove('open');
  setTimeout(() => {
    chatsScreen.style.display = 'none';
    document.body.style.overflow = '';
  }, 250);
}

function closeChatsScreen() {
  if (history.state && history.state.overlay === 'chats') {
    history.back();
  } else {
    closeChatsScreenInternal();
  }
}

// 공용 inline 버튼 스타일
const LINK_BTN_CSS = 'background:transparent;border:none;cursor:pointer;padding:4px 0;color:var(--walnut);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;';

async function loadAndRenderMyChats() {
  if (!chatsList || !chatsEmpty) return;
  chatsEmpty.style.display = 'none';
  chatsList.innerHTML = '<p class="t-body-md c-walnut" style="padding:8px 0;">불러오는 중⋯</p>';
  try {
    const sb = await getSupabase();
    if (!sb) { chatsList.innerHTML = ''; chatsEmpty.style.display = 'block'; return; }
    const { data, error } = await sb
      .from('card_comments')
      .select('comment_id, card_id, body, created_at, parent_comment_id')
      .eq('user_id', state.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    state.myChats = Array.isArray(data) ? data : [];
    state.editingMyChatId = null;
    renderMyChatsList();
  } catch (err) {
    console.warn('[m] loadAndRenderMyChats failed', err);
    chatsList.innerHTML = '';
    chatsEmpty.style.display = 'block';
  }
}

function renderMyChatsList() {
  if (!chatsList || !chatsEmpty) return;
  const rows = state.myChats || [];
  if (rows.length === 0) {
    chatsList.innerHTML = '';
    chatsEmpty.style.display = 'block';
    return;
  }
  chatsEmpty.style.display = 'none';
  chatsList.innerHTML = '';
  for (const r of rows) chatsList.appendChild(buildMyChatRow(r));
  chatsList.querySelectorAll('.mc-edit-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    state.editingMyChatId = parseInt(b.dataset.id, 10);
    renderMyChatsList();
    const ta = chatsList.querySelector(`textarea.mc-edit-input[data-id="${b.dataset.id}"]`);
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {} }
  }));
  chatsList.querySelectorAll('.mc-cancel-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); state.editingMyChatId = null; renderMyChatsList();
  }));
  chatsList.querySelectorAll('.mc-save-btn').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = parseInt(b.dataset.id, 10);
    const ta = chatsList.querySelector(`textarea.mc-edit-input[data-id="${id}"]`);
    if (!ta) return;
    const body = String(ta.value || '').trim();
    if (!body) { toast('내용을 입력해주세요'); return; }
    if (body.length > 500) { toast('500자 이내로 작성해주세요'); return; }
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('card_comments').update({ body }).eq('comment_id', id).eq('user_id', state.userId);
      if (error) throw error;
      const row = state.myChats.find((x) => x.comment_id === id);
      if (row) row.body = body;
      state.editingMyChatId = null;
      renderMyChatsList();
      toast('수정됨');
    } catch (err) { console.warn(err); toast('수정 실패: ' + (err.message || '')); }
  }));
  chatsList.querySelectorAll('.mc-delete-btn').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!(await appConfirm({ title: '댓글 삭제', message: '이 댓글을 삭제할까요?', confirmLabel: '삭제' }))) return;
    const id = parseInt(b.dataset.id, 10);
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('card_comments').delete().eq('comment_id', id).eq('user_id', state.userId);
      if (error) throw error;
      state.myChats = state.myChats.filter((x) => x.comment_id !== id);
      renderMyChatsList();
      toast('삭제됨');
    } catch (err) { console.warn(err); toast('삭제 실패: ' + (err.message || '')); }
  }));
}

function buildMyChatRow(r) {
  const card = (state.allCards || []).find((c) => c.card_id === r.card_id);
  const w = card?.works || {};
  const title = displayTitle(w.title) || '—';
  const kindLabel = r.parent_comment_id != null ? '↳ 답글' : '댓글';
  const when = formatBookmarkDate(r.created_at) || '';
  const meta = [when, title, kindLabel].filter(Boolean).join('  —  ').toUpperCase();
  const isEditing = state.editingMyChatId === r.comment_id;

  const wrap = document.createElement('div');
  const node = document.createElement('div');
  node.className = 'bookmark-row';
  if (isEditing) {
    node.innerHTML = `
      <div style="flex:1;min-width:0;">
        ${meta ? `<p class="t-label-sm c-walnut">${escapeHtml(meta)}</p><div style="height:6px;"></div>` : ''}
        <textarea class="mc-edit-input" data-id="${r.comment_id}" maxlength="500"
                  style="width:100%;min-height:60px;padding:8px;border:0.5px solid var(--latte);background:var(--paper);font-family:inherit;font-size:14px;line-height:1.6;color:var(--espresso);resize:vertical;box-sizing:border-box;margin-bottom:8px;">${escapeHtml(r.body || '')}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button class="mc-cancel-btn" data-id="${r.comment_id}" style="${LINK_BTN_CSS}">Cancel</button>
          <button class="mc-save-btn"   data-id="${r.comment_id}" style="${LINK_BTN_CSS}color:var(--cta);">Save</button>
        </div>
      </div>
    `;
  } else {
    node.innerHTML = `
      <div class="mc-body-area" style="flex:1;min-width:0;cursor:${card ? 'pointer' : 'default'};">
        ${meta ? `<p class="t-label-sm c-walnut">${escapeHtml(meta)}</p><div style="height:6px;"></div>` : ''}
        <p class="t-body-md c-espresso" style="line-height:1.55;white-space:pre-wrap;">${escapeHtml(r.body || '')}</p>
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:10px;">
          <button class="mc-edit-btn"   data-id="${r.comment_id}" style="${LINK_BTN_CSS}">Edit</button>
          <button class="mc-delete-btn" data-id="${r.comment_id}" style="${LINK_BTN_CSS}color:var(--cta);">Delete</button>
        </div>
      </div>
    `;
    if (card) {
      const bodyArea = node.querySelector('.mc-body-area');
      bodyArea?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        closeChatsScreenInternal();
        setTimeout(() => openDetail(card), 280);
      });
    }
  }
  wrap.appendChild(node);
  const hr = document.createElement('div');
  hr.className = 'hairline';
  wrap.appendChild(hr);
  return wrap;
}

// 이벤트 바인딩
if (mypageChatsEntry) mypageChatsEntry.addEventListener('click', openChatsScreen);
if (chatsBack) chatsBack.addEventListener('click', closeChatsScreen);

// ============================================================================
// MY FEED — 내가 쓴 오늘의 한줄(comment) + 내가 만든 하이라이트(highlight)
// ============================================================================
function paintMyFeedEntry() {
  if (!mypageFeedBlock) return;
  mypageFeedBlock.style.display = state.userId ? 'block' : 'none';
}

function openMyFeedScreen() {
  if (!myfeedScreen) return;
  if (!state.userId) { toast('로그인 후 사용할 수 있어요'); return; }
  history.pushState({ overlay: 'myfeed' }, '');
  myfeedScreen.style.display = 'flex';
  requestAnimationFrame(() => myfeedScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  paintMyFeedChips();
  loadAndRenderMyFeed().catch((e) => console.warn('[myfeed] load failed', e));
}

function closeMyFeedScreenInternal() {
  if (!myfeedScreen) return;
  myfeedScreen.classList.remove('open');
  setTimeout(() => {
    myfeedScreen.style.display = 'none';
    document.body.style.overflow = '';
  }, 250);
}
function closeMyFeedScreen() {
  if (history.state && history.state.overlay === 'myfeed') history.back();
  else closeMyFeedScreenInternal();
}

// ---------- 의견 남기기 (피드백) ----------
const FB_RATING_LABELS = { 1: '매우 불만족', 2: '불만족', 3: '보통', 4: '만족', 5: '매우 만족' };
let fbRatingValue = 0;       // 현재 선택된 별점 (0 = 미선택)
let fbSubmitting = false;

// 별점 그리기 — previewVal 이 있으면(호버/포커스) 미리보기, 없으면 확정값 기준
function paintFbStars(previewVal) {
  const shown = previewVal || fbRatingValue;
  document.querySelectorAll('#fb-rating .star').forEach((star) => {
    const v = Number(star.dataset.val);
    star.classList.toggle('on', v <= shown);
    star.setAttribute('aria-checked', String(v === fbRatingValue));
  });
  const labelEl = $('#fb-rating-label');
  if (labelEl) labelEl.textContent = shown ? FB_RATING_LABELS[shown] : '';
}

function setFbRating(val) {
  fbRatingValue = val;
  paintFbStars();
  const err = $('#fb-error');
  if (err && val) err.style.display = 'none';
}

// 별점 인터랙션 1회 연결 (클릭·호버·포커스·키보드)
function initFbRating() {
  const wrap = $('#fb-rating');
  if (!wrap || wrap._wired) return;
  wrap._wired = true;
  wrap.querySelectorAll('.star').forEach((star) => {
    const v = Number(star.dataset.val);
    star.addEventListener('click', () => setFbRating(v));
    star.addEventListener('mouseenter', () => paintFbStars(v));
    star.addEventListener('focus', () => paintFbStars(v));
  });
  wrap.addEventListener('mouseleave', () => paintFbStars());
  wrap.addEventListener('blur', () => paintFbStars(), true);
  wrap.addEventListener('keydown', (e) => {
    let next = fbRatingValue;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, (fbRatingValue || 0) + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, (fbRatingValue || 1) - 1);
    else if (e.key >= '1' && e.key <= '5') next = Number(e.key);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    else return;
    e.preventDefault();
    setFbRating(next);
    wrap.querySelector(`.star[data-val="${next}"]`)?.focus();
  });
}

function resetFeedbackForm() {
  fbRatingValue = 0;
  ['fb-gender', 'fb-age', 'fb-liked', 'fb-improve', 'fb-message', 'fb-email'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  paintFbStars();
  const err = $('#fb-error'); if (err) err.style.display = 'none';
  const form = $('#fb-form'); if (form) form.style.display = '';
  const success = $('#fb-success'); if (success) success.style.display = 'none';
  const submit = $('#fb-submit'); if (submit) { submit.disabled = false; submit.textContent = '보내기'; }
}

// 회원이면 성별·연령대 프리필 (state 값 → 폼 라벨). 이메일은 자동 채우지 않는다.
function prefillFeedback() {
  const genderMap = { male: '남성', female: '여성', other: '기타' };
  const g = document.getElementById('fb-gender');
  if (g && genderMap[state.userGender]) g.value = genderMap[state.userGender];
  const a = document.getElementById('fb-age');
  if (a && state.userAgeGroup) {
    const n = parseInt(state.userAgeGroup, 10); // '20s' → 20
    const label = n >= 60 ? '60대 이상' : (n >= 10 ? n + '대' : '');
    if (label && [...a.options].some((o) => o.value === label)) a.value = label;
  }
  // 이메일은 프리필/자동완성하지 않는다 — 빈 칸 + placeholder("you@example.com")만 노출.
}

function openFeedbackScreen() {
  if (!feedbackScreen) return;
  resetFeedbackForm();
  initFbRating();
  prefillFeedback();
  history.pushState({ overlay: 'feedback' }, '');
  feedbackScreen.style.display = 'flex';
  requestAnimationFrame(() => feedbackScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
}
function closeFeedbackScreenInternal() {
  if (!feedbackScreen) return;
  feedbackScreen.classList.remove('open');
  setTimeout(() => {
    feedbackScreen.style.display = 'none';
    document.body.style.overflow = '';
  }, 250);
}
function closeFeedbackScreen() {
  if (history.state && history.state.overlay === 'feedback') history.back();
  else closeFeedbackScreenInternal();
}

async function submitFeedback() {
  if (fbSubmitting) return;
  const err = $('#fb-error');
  // 만족도(별점)만 필수
  if (!fbRatingValue) {
    if (err) { err.textContent = '만족도를 선택해 주세요.'; err.style.display = 'block'; }
    document.querySelector('#fb-rating .star')?.focus();
    return;
  }
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const payload = {
    gender: val('fb-gender'),
    age: val('fb-age'),
    rating: fbRatingValue,
    liked: val('fb-liked'),
    improve: val('fb-improve'),
    message: val('fb-message'),
    email: val('fb-email'),
    page: location.href,
  };
  const submit = $('#fb-submit');
  fbSubmitting = true;
  if (submit) { submit.disabled = true; submit.textContent = '보내는 중…'; }
  if (err) err.style.display = 'none';
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    try { track('feedback_submit', { rating: fbRatingValue }); } catch {}
    const form = $('#fb-form'); if (form) form.style.display = 'none';
    const success = $('#fb-success'); if (success) success.style.display = 'block';
  } catch (e) {
    console.warn('[feedback] submit failed:', e);
    if (err) { err.textContent = '전송에 실패했어요. 잠시 후 다시 시도해 주세요.'; err.style.display = 'block'; }
    if (submit) { submit.disabled = false; submit.textContent = '다시 시도'; }
  } finally {
    fbSubmitting = false;
  }
}

feedbackEntry?.addEventListener('click', openFeedbackScreen);
$('#feedback-back')?.addEventListener('click', closeFeedbackScreen);
$('#fb-submit')?.addEventListener('click', submitFeedback);
$('#fb-success-close')?.addEventListener('click', closeFeedbackScreen);

function paintMyFeedChips() {
  const cat = state.myfeedCategory || 'comment';
  document.querySelectorAll('#myfeed-chips .a-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.myfeedCat === cat);
  });
}

// 카테고리 칩 클릭
document.querySelectorAll('#myfeed-chips .a-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.myfeedCategory = btn.dataset.myfeedCat || 'comment';
    paintMyFeedChips();
    loadAndRenderMyFeed().catch((e) => console.warn('[myfeed] reload failed', e));
  });
});

async function loadAndRenderMyFeed() {
  if (!myfeedList || !myfeedEmpty) return;
  myfeedEmpty.style.display = 'none';
  myfeedList.innerHTML = '<p class="t-body-md c-walnut" style="padding:8px 0;">불러오는 중⋯</p>';
  const cat = state.myfeedCategory || 'comment';
  try {
    if (cat === 'comment') await renderMyComments();
    else await renderMyHighlights();
  } catch (err) {
    console.warn('[myfeed] render failed', err);
    myfeedList.innerHTML = '';
    showEmpty(cat);
  }
}

function showEmpty(cat) {
  if (!myfeedEmpty) return;
  if (cat === 'comment') {
    if (myfeedEmptyIcon) myfeedEmptyIcon.textContent = 'edit_note';
    if (myfeedEmptyTitle) myfeedEmptyTitle.textContent = '아직 작성한 한줄이 없어요';
    if (myfeedEmptySub) myfeedEmptySub.textContent = '피드의 + 로 나의 감상평을 남겨보세요.';
  } else {
    if (myfeedEmptyIcon) myfeedEmptyIcon.textContent = 'auto_awesome';
    if (myfeedEmptyTitle) myfeedEmptyTitle.textContent = '아직 만든 하이라이트가 없어요';
    if (myfeedEmptySub) myfeedEmptySub.textContent = '본문을 길게 눌러 한 구절을 하이라이트해보세요.';
  }
  myfeedEmpty.style.display = 'block';
}

async function renderMyComments() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('feed_posts')
    .select('post_id, card_id, user_id, body, created_at, cards(card_id, quote, works(title, subtitle, format, author, release_year, cover_url))')
    .eq('user_id', state.userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  state.myFeedComments = Array.isArray(data) ? data : [];
  if (state.editingMyFeedKind === 'comment') state.editingMyFeedId = null;
  renderMyCommentsList();
}

function renderMyCommentsList() {
  if (!myfeedList || !myfeedEmpty) return;
  const rows = state.myFeedComments || [];
  if (rows.length === 0) { myfeedList.innerHTML = ''; showEmpty('comment'); return; }
  myfeedEmpty.style.display = 'none';
  myfeedList.innerHTML = '';
  for (const p of rows) myfeedList.appendChild(buildMyFeedCommentRow(p));
  // row 클릭 시 그 글의 상세(feedpost-screen) 로 이동 — 버튼/textarea/input 영역 클릭은 무시
  myfeedList.querySelectorAll('[data-myfeed-post]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button, textarea, input')) return;
      const id = parseInt(row.dataset.myfeedPost, 10);
      const post = (state.myFeedComments || []).find((p) => p.post_id === id);
      if (post) { try { closeMyFeedScreenInternal?.(); } catch {} ; setTimeout(() => { try { openFeedPostDetail(post); } catch (err) { console.warn('[m] openFeedPostDetail failed:', err); } }, 220); }
    });
  });
  // 이벤트 바인딩
  myfeedList.querySelectorAll('.mfc-edit-btn').forEach((b) => b.addEventListener('click', () => {
    state.editingMyFeedId = parseInt(b.dataset.id, 10);
    state.editingMyFeedKind = 'comment';
    renderMyCommentsList();
    const ta = myfeedList.querySelector(`textarea.mfc-edit-input[data-id="${b.dataset.id}"]`);
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {} }
  }));
  myfeedList.querySelectorAll('.mfc-cancel-btn').forEach((b) => b.addEventListener('click', () => {
    state.editingMyFeedId = null; state.editingMyFeedKind = null; renderMyCommentsList();
  }));
  myfeedList.querySelectorAll('.mfc-save-btn').forEach((b) => b.addEventListener('click', async () => {
    const id = parseInt(b.dataset.id, 10);
    const ta = myfeedList.querySelector(`textarea.mfc-edit-input[data-id="${id}"]`);
    if (!ta) return;
    const body = String(ta.value || '').trim();
    if (!body) { toast('내용을 입력해주세요'); return; }
    if (body.length > 500) { toast('500자 이내로 작성해주세요'); return; }
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('feed_posts').update({ body }).eq('post_id', id).eq('user_id', state.userId);
      if (error) throw error;
      const row = state.myFeedComments.find((x) => x.post_id === id);
      if (row) row.body = body;
      state.editingMyFeedId = null; state.editingMyFeedKind = null;
      renderMyCommentsList();
      toast('수정됨');
    } catch (err) { console.warn(err); toast('수정 실패: ' + (err.message || '')); }
  }));
  myfeedList.querySelectorAll('.mfc-delete-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!(await appConfirm({ title: '감상평 삭제', message: '이 한 줄을 삭제할까요?', confirmLabel: '삭제' }))) return;
    const id = parseInt(b.dataset.id, 10);
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('feed_posts').delete().eq('post_id', id).eq('user_id', state.userId);
      if (error) throw error;
      state.myFeedComments = state.myFeedComments.filter((x) => x.post_id !== id);
      renderMyCommentsList();
      toast('삭제됨');
    } catch (err) { console.warn(err); toast('삭제 실패: ' + (err.message || '')); }
  }));
}

function buildMyFeedCommentRow(p) {
  const w = p.cards?.works || {};
  const title = displayTitle(w.title) || '—';
  const subtitle = w.subtitle ? String(w.subtitle).trim() : '';
  const fmt = GENRE_LABEL[w.format] || w.format || '';
  const when = formatBookmarkDate(p.created_at) || '';
  const meta = [fmt, when].filter(Boolean).join('  ·  ').toUpperCase();
  const isEditing = state.editingMyFeedKind === 'comment' && state.editingMyFeedId === p.post_id;

  const wrap = document.createElement('div');
  wrap.dataset.myfeedPost = String(p.post_id);
  wrap.style.cssText = `padding:16px 0;border-bottom:0.5px solid var(--latte);${isEditing ? '' : 'cursor:pointer;'}`;
  if (isEditing) {
    wrap.innerHTML = `
      <p class="t-label-sm c-walnut" style="margin-bottom:6px;">${escapeHtml(meta)}</p>
      <p class="t-title-lg c-espresso" style="margin-bottom:8px;word-break:keep-all;">${escapeHtml(title)}${subtitle ? '  <span class="t-body-sm c-walnut">'+escapeHtml(subtitle)+'</span>' : ''}</p>
      <textarea class="mfc-edit-input" data-id="${p.post_id}" maxlength="500"
                style="width:100%;min-height:60px;padding:8px;border:0.5px solid var(--latte);background:var(--paper);font-family:inherit;font-size:14px;line-height:1.6;color:var(--espresso);resize:vertical;box-sizing:border-box;margin-bottom:8px;">${escapeHtml(p.body || '')}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:12px;">
        <button class="mfc-cancel-btn" style="${LINK_BTN_CSS}">Cancel</button>
        <button class="mfc-save-btn" data-id="${p.post_id}" style="${LINK_BTN_CSS}color:var(--cta);">Save</button>
      </div>
    `;
  } else {
    wrap.innerHTML = `
      <p class="t-label-sm c-walnut" style="margin-bottom:6px;">${escapeHtml(meta)}</p>
      <p class="t-title-lg c-espresso" style="margin-bottom:2px;word-break:keep-all;">${escapeHtml(title)}${subtitle ? '  <span class="t-body-sm c-walnut">'+escapeHtml(subtitle)+'</span>' : ''}</p>
      <p class="t-body-md c-espresso" style="margin-top:8px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(p.body || '')}</p>
      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:10px;">
        <button class="mfc-edit-btn"   data-id="${p.post_id}" style="${LINK_BTN_CSS}">Edit</button>
        <button class="mfc-delete-btn" data-id="${p.post_id}" style="${LINK_BTN_CSS}color:var(--cta);">Delete</button>
      </div>
    `;
  }
  return wrap;
}

async function renderMyHighlights() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('card_highlights')
    .select('highlight_id, card_id, user_id, selected_text, created_at, cards(card_id, works(work_id, title, subtitle, format, author, release_year, cover_url))')
    .eq('user_id', state.userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  state.myFeedHighlights = Array.isArray(data) ? data : [];
  if (state.editingMyFeedKind === 'highlight') state.editingMyFeedId = null;
  renderMyHighlightsList();
}

function renderMyHighlightsList() {
  if (!myfeedList || !myfeedEmpty) return;
  const rows = state.myFeedHighlights || [];
  if (rows.length === 0) { myfeedList.innerHTML = ''; showEmpty('highlight'); return; }
  myfeedEmpty.style.display = 'none';
  myfeedList.innerHTML = '';
  for (const h of rows) myfeedList.appendChild(buildMyFeedHighlightRow(h));
  // row 클릭 시 그 하이라이트의 상세 모달로 이동 — 버튼 영역은 무시
  myfeedList.querySelectorAll('[data-myfeed-highlight]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = parseInt(row.dataset.myfeedHighlight, 10);
      const highlight = (state.myFeedHighlights || []).find((h) => h.highlight_id === id);
      if (highlight) { try { closeMyFeedScreenInternal?.(); } catch {} ; setTimeout(() => { try { openHighlightDetail(highlight); } catch (err) { console.warn('[m] openHighlightDetail failed:', err); } }, 220); }
    });
  });
  // 하이라이트는 Delete 만 (Edit 제거).
  myfeedList.querySelectorAll('.mfh-delete-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!(await appConfirm({ title: '하이라이트 삭제', message: '이 하이라이트를 삭제할까요?', confirmLabel: '삭제' }))) return;
    const id = parseInt(b.dataset.id, 10);
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('card_highlights').delete().eq('highlight_id', id).eq('user_id', state.userId);
      if (error) throw error;
      state.myFeedHighlights = state.myFeedHighlights.filter((x) => x.highlight_id !== id);
      renderMyHighlightsList();
      toast('삭제됨');
    } catch (err) { console.warn(err); toast('삭제 실패: ' + (err.message || '')); }
  }));
}

function buildMyFeedHighlightRow(h) {
  const w = h.cards?.works || {};
  const title = displayTitle(w.title) || '—';
  const subtitle = w.subtitle ? String(w.subtitle).trim() : '';
  const fmt = GENRE_LABEL[w.format] || w.format || '';
  const when = formatBookmarkDate(h.created_at) || '';
  const meta = [fmt, when].filter(Boolean).join('  ·  ').toUpperCase();
  const idTag = `#${String(h.card_id).padStart(5, '0')}`;

  const wrap = document.createElement('div');
  wrap.dataset.myfeedHighlight = String(h.highlight_id);
  wrap.style.cssText = 'padding:16px 0;border-bottom:0.5px solid var(--latte);cursor:pointer;';
  wrap.innerHTML = `
    <p class="t-label-sm c-walnut" style="margin-bottom:6px;">${escapeHtml(meta)}</p>
    <p class="t-title-lg c-espresso" style="margin-bottom:8px;word-break:keep-all;">${escapeHtml(title)}${subtitle ? '  <span class="t-body-sm c-walnut">'+escapeHtml(subtitle)+'</span>' : ''}</p>
    <p style="font-family:'Nanum Myeongjo',Georgia,serif;font-size:15px;line-height:28px;color:var(--espresso);white-space:pre-wrap;word-break:keep-all;">“${renderMarkdownBold(h.selected_text || '')}”</p>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span class="t-label-sm c-sand">${idTag}</span>
      <button class="mfh-delete-btn" data-id="${h.highlight_id}" style="${LINK_BTN_CSS}color:var(--cta);">Delete</button>
    </div>
  `;
  return wrap;
}

if (mypageFeedEntry) mypageFeedEntry.addEventListener('click', openMyFeedScreen);
if (myfeedBack) myfeedBack.addEventListener('click', closeMyFeedScreen);

function paintTasteProfile() {
  if (!tasteProfileEl) return;
  if (!isTasteEnabled()) {
    tasteProfileEl.style.display = 'none';
    return;
  }
  // 북마크 수가 임계치 미만일 때만 안내 — 어떤 기준으로 추천하는지는 노출하지 않음.
  const bookmarkCount = (state.bookmarks || []).filter((b) => b && b.cards).length;
  if (bookmarkCount < MIN_BOOKMARKS_FOR_TASTE) {
    tasteProfileEl.style.display = 'block';
    tasteProfileEl.textContent = `북마크 ${MIN_BOOKMARKS_FOR_TASTE}개 이상부터 추천이 적용됩니다 (현재 ${bookmarkCount}/${MIN_BOOKMARKS_FOR_TASTE})`;
    return;
  }
  // 임계치 충족 — 어떤 기준인지는 가리고 안내 영역 자체를 숨김.
  tasteProfileEl.style.display = 'none';
}

tasteToggle.addEventListener('click', () => {
  const newEnabled = !isTasteEnabled();
  safeStorageSet('ds.taste', newEnabled ? '1' : '0');
  paintTasteToggle();
  // 즉시 효과 — 새 추천 카드 한 장 뽑기
  if (state.currentView === 'home') {
    applyTodayCard(pickRandomCard());
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
  safeStorageSet('ds.theme', theme);
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
    themeSubtitle.textContent = isDark ? '다크 · 에스프레소 나이트' : '라이트 · 크림 페이퍼';
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

// ---------- Custom select — 네이티브 <select>를 톤에 맞춘 드롭다운으로 대체 ----------
// 원본 <select>는 DOM에 숨겨둔 채 값의 원천(source of truth)으로 유지 → 저장/로드 로직 불변.
function enhanceSelect(sel) {
  if (!sel || sel.dataset.enhanced) return;
  sel.dataset.enhanced = '1';
  sel.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'c-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'c-select-trigger';
  const label = document.createElement('span');
  label.className = 'c-select-label';
  const caret = document.createElement('span');
  caret.className = 'c-select-caret';
  trigger.append(label, caret);
  wrap.appendChild(trigger);
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const menu = document.createElement('div');
  menu.className = 'c-select-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);

  const syncLabel = () => {
    const opt = sel.options[sel.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
  };
  const isOpen = () => menu.style.display === 'block';

  function position() {
    const r = trigger.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.width = r.width + 'px';
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    if (below >= 200 || below >= above) {
      menu.style.bottom = '';
      menu.style.top = (r.bottom + 4) + 'px';
      menu.style.maxHeight = Math.min(260, below - 12) + 'px';
    } else {
      menu.style.top = '';
      menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      menu.style.maxHeight = Math.min(260, above - 12) + 'px';
    }
  }
  function close() {
    if (!isOpen()) return;
    menu.style.display = 'none';
    wrap.classList.remove('open');
    document.removeEventListener('click', onDoc);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  }
  function onDoc(e) {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) close();
  }
  function open() {
    menu.innerHTML = '';
    Array.from(sel.options).forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'c-select-option' + (opt.value === sel.value ? ' selected' : '');
      item.textContent = opt.textContent;
      item.addEventListener('click', () => {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        syncLabel();
        close();
      });
      menu.appendChild(item);
    });
    menu.style.display = 'block';
    position();
    wrap.classList.add('open');
    setTimeout(() => document.addEventListener('click', onDoc), 0);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });
  sel._syncCustom = syncLabel;
  syncLabel();
}
enhanceSelect(profileGender);
enhanceSelect(profileAge);

// ---------- Nickname edit ----------
function openNicknameModal() {
  if (!nicknameModal) return;
  nicknameInput.value = state.userNickname || '';
  if (profileGender) profileGender.value = state.userGender || '';
  if (profileAge) profileAge.value = state.userAgeGroup || '';
  profileGender?._syncCustom?.();
  profileAge?._syncCustom?.();
  /* 이메일 칸 — 로컬(ID/비번) 회원만. 소셜 사용자는 provider 가 관리 → 숨김. */
  const emailRow = document.getElementById('profile-email-row');
  const emailInput = document.getElementById('profile-email');
  const isSocial = state.authProvider === 'google' || state.authProvider === 'kakao';
  if (emailRow) emailRow.style.display = (state.isAnonymous || isSocial) ? 'none' : 'block';
  if (emailInput) {
    /* 합성 이메일(@user.local) 이면 빈 placeholder, 진짜 이메일이면 채움 */
    const cur = String(state.authEmail || '');
    emailInput.value = cur.endsWith('@user.local') ? '' : cur;
  }
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
  const gender = profileGender?.value || null;
  const ageGroup = profileAge?.value || null;
  /* 이메일 변경 — 로컬 회원만. updateUser({ email }) 호출 시 Supabase 가 새 이메일로
     확인 메일 발송, 사용자가 클릭해야 실제 auth.users.email 갱신. */
  const emailInput = document.getElementById('profile-email');
  const newEmail = (emailInput?.value || '').trim();
  const isSocial = state.authProvider === 'google' || state.authProvider === 'kakao';
  const canSetEmail = !state.isAnonymous && !isSocial;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('users')
      .update({ nickname: newName, gender, age_group: ageGroup })
      .eq('user_id', state.userId);
    if (error) throw error;
    state.userNickname = newName;
    state.userGender = gender || '';
    state.userAgeGroup = ageGroup || '';
    // 변경된 성별·나이대를 Amplitude에 반영
    setUserProps({ accountType: 'member', gender: state.userGender, ageGroup: state.userAgeGroup });
    /* 이메일 변경 시도 — 형식 OK 이고 현재와 다르면 updateUser. */
    if (canSetEmail && newEmail && newEmail !== state.authEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      try {
        const { error: emErr } = await sb.auth.updateUser({ email: newEmail });
        if (emErr) throw emErr;
        toast(`프로필 저장됨 · ${newEmail} 로 확인 메일 발송`);
      } catch (e) {
        console.warn('[m] email update failed:', e);
        toast(`프로필은 저장됐으나 이메일 변경 실패: ${e.message || e}`);
      }
    } else {
      toast('프로필이 저장됐어요');
    }
    paintAuthIdentity();
    closeNicknameModal();
  } catch (err) {
    console.error('[m] save profile failed:', err);
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

// 마이페이지 — 버전 정보 7번 연속 클릭 → 제작자 크레딧 이스터에그
(function _versionEasterEgg() {
  const row = document.getElementById('version-row');
  if (!row) return;
  let count = 0;
  let timer = null;
  row.addEventListener('click', () => {
    count += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 1500); // 1.5s 안에 다음 탭 없으면 reset
    if (count >= 7) {
      count = 0;
      clearTimeout(timer);
      openPromptModal({
        title: '제작',
        message: '정환욱\n박신영\n함승엽\n이창훈',
        confirmLabel: '확인',
        dismissLabel: '',
        openSigninOnConfirm: false,
        onConfirm: () => {},
      });
    }
  });
})();

signOutBtn.addEventListener('click', async () => {
  const msg = state.isAnonymous
    ? '익명 세션을 종료할까요? 다시 입장하면 새 익명 ID가 생성됩니다.'
    : '로그아웃할까요? 다음 로그인 전까지 익명 세션으로 동작합니다.';
  if (!(await appConfirm({ title: state.isAnonymous ? '세션 종료' : '로그아웃', message: msg, confirmLabel: state.isAnonymous ? '종료' : '로그아웃' }))) return;
  const sb = await getSupabase();
  // 로그인 상태였으면 DB의 session_id도 정리 (다른 기기 알림이 잘못 뜨지 않도록)
  try {
    if (!state.isAnonymous && state.userId) {
      await sb.from('users').update({ session_id: null }).eq('user_id', state.userId);
    }
  } catch {}
  await sb.auth.signOut();
  resetUser();  // Amplitude userId/deviceId 초기화 (회원 분석 깔끔하게 분리)
  safeStorageRemove('ds.prevAnonUserId');
  safeStorageRemove(SESSION_KEY);
  // 자격증명 기억은 유지 (다음 로그인 편의)
  location.reload();
});

/* 계정 삭제 — 이중 확인 후 public.users row 삭제(FK CASCADE 로 관련 데이터 같이) + signOut.
   GDPR / 앱스토어 1.1.x Account Deletion 요건 충족. auth.users 삭제는 서버 RPC 후속 작업. */
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
  if (state.isAnonymous || !state.userId) { toast('로그인 사용자만 삭제할 수 있어요'); return; }
  if (!(await appConfirm({
    title: '계정 삭제',
    message: '모든 북마크·하이라이트·감상평·실타래가 영구 삭제됩니다.\n이 작업은 되돌릴 수 없어요.',
    confirmLabel: '계속',
    dismissLabel: '취소',
  }))) return;
  if (!(await appConfirm({
    title: '한 번 더 확인',
    message: '정말 계정을 영구 삭제할까요?',
    confirmLabel: '영구 삭제',
    dismissLabel: '취소',
  }))) return;
  try {
    const sb = await getSupabase();
    /* delete_my_account RPC — public.users + auth.users 둘 다 삭제 (migration 044).
       기존 sb.from('users').delete() 만 호출하면 auth.users 남아서 같은 email 재가입 시
       'already registered' 에러. */
    const deletedUid = state.userId;
    const { error } = await sb.rpc('delete_my_account', { p_user_id: deletedUid });
    if (error) throw error;
    await sb.auth.signOut();
    resetUser();
    safeStorageRemove('ds.prevAnonUserId');
    safeStorageRemove(SESSION_KEY);
    /* 사용자 명세: 계정 삭제 시 해당 계정의 구매 물품 전부 소멸. 서버는 FK CASCADE
       (migration 047) 로 처리, 클라이언트도 사용자별 localStorage 백업 키 정리. */
    try {
      localStorage.removeItem(`ds.ownedShareBgs.${deletedUid}`);
      localStorage.removeItem(`ds.guideSeenForUser.${deletedUid}`);
      localStorage.removeItem(`ds.yarnRewarded.${deletedUid}`);
      localStorage.removeItem(`ds.firstShareGuideShown.${deletedUid}`);
    } catch {}
    toast('계정이 삭제되었어요');
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    console.warn('[m] delete account failed:', e);
    toast('삭제 실패. 관리자에게 문의해주세요. (1ckdgns24@gmail.com)');
  }
});

// ---------- Social Login ----------
async function startOAuth(provider) {
  try {
    const sb = await getSupabase();
    // 현재 익명 user_id를 마이그레이션용으로 백업
    if (state.userId) safeStorageSet('ds.prevAnonUserId', String(state.userId));
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

signinGoogle?.addEventListener('click', () => startOAuth('google'));
// 카카오: 카카오 비즈니스 앱 전환 + account_email/profile_image 동의항목 ON +
// Supabase Dashboard 의 Kakao provider 활성화(REST API 키·Client Secret·Redirect URI) 필요.
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
const signinRememberInput = $('#signin-remember');
const signupIdCheckBtn = $('#signup-idcheck-btn');
const signupIdCheckResult = $('#signup-idcheck-result');
const signupExtra = $('#signup-extra');
const signupGender = $('#signup-gender');
const signupAge = $('#signup-age');
let signinMode = 'signin';  // 'signin' | 'signup'
let signupIdAvailable = false;  // 회원가입 모드에서 아이디 중복확인 통과 여부

// ---------- 공용 안내/유도 모달 (랜딩 + 회원전용 게이트) ----------
const promptModal = $('#prompt-modal');
const promptModalTitle = $('#prompt-modal-title');
const promptModalMsg = $('#prompt-modal-msg');
const promptModalConfirm = $('#prompt-modal-confirm');
const promptModalDismiss = $('#prompt-modal-dismiss');
const promptModalSubnote = $('#prompt-modal-subnote');
const DISMISS_LINK_STYLE = 'width:100%;background:transparent;border:none;margin-top:12px;cursor:pointer;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--walnut);';
let _promptOnDismiss = null;

// OZ's house iframe 에서도 호출 가능하게 window 에 게시 (테마 해금 안내/구매 확인 등)
window.openPromptModal = (...args) => openPromptModal(...args);
/* 브라우저 기본 confirm() 대체 — PWA 공용 모달(openPromptModal) 기반 Promise wrapper.
   기존 `if (!confirm(...)) return;` 를 `if (!(await appConfirm({...}))) return;` 로 1줄 치환 가능. */
function appConfirm({ title = '확인', message, confirmLabel = '확인', dismissLabel = '취소' }) {
  return new Promise((resolve) => {
    openPromptModal({
      title, message, confirmLabel, dismissLabel,
      openSigninOnConfirm: false,
      onConfirm: () => resolve(true),
      onDismiss: () => resolve(false),
    });
  });
}
window.appConfirm = appConfirm;
function openPromptModal({ title, message, confirmLabel = '로그인', dismissLabel = '닫기', subNote = '', dismissAsButton = false, onConfirm = null, onDismiss = null, openSigninOnConfirm = true }) {
  if (!promptModal) return;
  promptModalTitle.textContent = title;
  promptModalMsg.textContent = message;
  promptModalConfirm.textContent = confirmLabel;
  promptModalDismiss.textContent = dismissLabel;
  if (promptModalSubnote) {
    promptModalSubnote.textContent = subNote;
    promptModalSubnote.style.display = subNote ? 'block' : 'none';
  }
  if (dismissAsButton) {
    promptModalDismiss.className = 'sharp-btn outline';
    promptModalDismiss.style.cssText = 'width:100%;margin-top:10px;';
  } else {
    promptModalDismiss.className = '';
    promptModalDismiss.style.cssText = DISMISS_LINK_STYLE;
  }
  promptModal._onConfirm = onConfirm;
  promptModal._openSigninOnConfirm = openSigninOnConfirm;
  _promptOnDismiss = onDismiss;
  promptModal.style.display = 'flex';
}
function closePromptModal() {
  if (promptModal) promptModal.style.display = 'none';
}
promptModalConfirm?.addEventListener('click', () => {
  const cb = promptModal?._onConfirm;
  const openSignin = promptModal?._openSigninOnConfirm !== false;
  closePromptModal();
  cb?.();
  if (openSignin) openSigninModal();
});
promptModalDismiss?.addEventListener('click', () => {
  const cb = _promptOnDismiss;
  closePromptModal();
  cb?.();
});
promptModal?.addEventListener('click', (e) => {
  if (e.target === promptModal) {
    const cb = _promptOnDismiss;
    closePromptModal();
    cb?.();
  }
});

// ---------- 비회원 카드 새로고침 일일 제한 ----------
const REFRESH_LIMIT = 3;
const REFRESH_COUNT_KEY = 'ds.refreshCount';
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getRefreshState() {
  try {
    const raw = JSON.parse(safeStorageGet(REFRESH_COUNT_KEY, 'null') || 'null');
    if (raw && raw.date === todayStr() && Number.isInteger(raw.count)) return raw;
  } catch {}
  return { date: todayStr(), count: 0 };
}
function bumpRefreshCount() {
  const next = { date: todayStr(), count: getRefreshState().count + 1 };
  safeStorageSet(REFRESH_COUNT_KEY, JSON.stringify(next));
  return next.count;
}

// ============================================================================
// 실타래(yarn) — 카드 열람 게이트 (YarnViewModel/YarnGate/YarnPurchaseScreen 미러)
//   - 무료 5개/일: localStorage (날짜 비교 리셋)
//   - 충전 잔액: 서버 users.yarn_balance (consume_yarn/grant_yarn RPC)
//   - 카드당 1회 unlock: 3일간 무료 재열람
//   - 차감 우선순위: 무료분 → 충전 잔액
//   - 투어 중에는 무료(차감/다이얼로그 없음)
// ============================================================================
// 사용자 명세(2026-06): 매일 5개 무료 폐지 — 일일 잔여분(YARN_DAILY_GRANT) 제거.
//   잔액 = 서버 충전분(state.yarnPurchased) 만. 보상은 카드 첫 열람(+1) + 출석체크(+5).
const YARN_UNLOCK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;  // 3일
const YARN_UNLOCKED_KEY = 'ds.yarnUnlocked';
const YARN_TIERS = [[1, 100], [10, 1000], [21, 2000], [32, 3000], [113, 10000]];
function getUnlockedMap() {
  try {
    const raw = JSON.parse(safeStorageGet(YARN_UNLOCKED_KEY, 'null') || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch {}
  return {};
}
// 신규 게이트 정책(투어 무관, 3일 unlock만 무료) 적용 시 1회 unlock 누적 자동 리셋
//   기존 사용자가 이전 정책(투어 활성 중 무제한 무료)에서 카드를 다 unlock 마킹해뒀던 케이스 복구
(function _yarnGateMigration_v2() {
  try {
    if (!safeStorageGet('ds.yarn.gate.v2')) {
      safeStorageSet(YARN_UNLOCKED_KEY, '{}');
      safeStorageSet('ds.yarn.gate.v2', '1');
    }
  } catch {}
})();

function isCardUnlocked(cardId) {
  const ts = getUnlockedMap()[String(cardId)];
  return !!ts && (Date.now() - ts < YARN_UNLOCK_WINDOW_MS);
}
function markCardUnlocked(cardId) {
  const map = getUnlockedMap();
  const now = Date.now();
  for (const k of Object.keys(map)) {        // 만료 항목 정리
    if (now - map[k] >= YARN_UNLOCK_WINDOW_MS) delete map[k];
  }
  map[String(cardId)] = now;
  safeStorageSet(YARN_UNLOCKED_KEY, JSON.stringify(map));
}
function yarnAvailable() {
  return state.yarnPurchased || 0;
}
function isTourActive() {
  return !!document.querySelector('#coachmark');
}

async function consumeYarnRpc() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('consume_yarn');
  if (error) throw error;
  return typeof data === 'number' ? data : parseInt(data, 10);
}
async function grantYarnRpc(n) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('grant_yarn', { p_n: n });
  if (error) throw error;
  return typeof data === 'number' ? data : parseInt(data, 10);
}

// OZ 테마 구매 — 서버 atomic 차감 + 영구 unlock 기록.
//   반환: 새 yarn_balance (>=0), -1=인자 NULL, -2=잔액 부족.
async function purchaseOzThemeRpc(themeId, price) {
  if (!state.userId) throw new Error('not_signed_in');
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('purchase_oz_theme', {
    p_user_id: state.userId,
    p_theme_id: themeId,
    p_price: price,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : parseInt(data, 10);
}
window.purchaseOzThemeRpc = purchaseOzThemeRpc;

// 카드 첫 열람 보상 — 카드당 1회 +1 실타래 (중복 지급 없음).
//   로컬 키 ds.yarnRewarded.<userId> 에 카드ID 기록 → optimistic 차단 후 RPC 호출.
//   ⚠️ user-scope 필수 — 옛 가입 때 받은 카드를 새 가입 사용자에게 'already received' 로 잘못 차단하던 문제 fix.
const YARN_REWARDED_KEY = 'ds.yarnRewarded';
function rewardedKey() {
  return state.userId ? `${YARN_REWARDED_KEY}.${state.userId}` : YARN_REWARDED_KEY;
}
function getRewardedMap() {
  try {
    const raw = JSON.parse(safeStorageGet(rewardedKey(), 'null') || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch {}
  return {};
}
function isCardRewarded(cardId) {
  return !!getRewardedMap()[String(cardId)];
}
function markCardRewarded(cardId) {
  const map = getRewardedMap();
  map[String(cardId)] = Date.now();
  safeStorageSet(rewardedKey(), JSON.stringify(map));
}
async function rewardYarnForFirstView(cardId) {
  if (!cardId) return;
  if (!state.userId) return;
  /* 클라이언트 측 빠른 중복 차단(같은 세션 안에서). 서버 dedup 이 진실. */
  if (isCardRewarded(cardId)) return;
  markCardRewarded(cardId);
  try {
    /* 서버 RPC — (user_id, card_id) UNIQUE 로 영구 dedup. 이미 받았으면 잔액 그대로. */
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('reward_yarn_first_view', {
      p_user_id: state.userId,
      p_card_id: cardId,
    });
    if (error) throw error;
    const newBalance = typeof data === 'number' ? data : parseInt(data, 10);
    const prev = state.yarnPurchased || 0;
    if (Number.isFinite(newBalance) && newBalance >= 0) {
      state.yarnPurchased = newBalance;
      renderYarnChip();
      /* 잔액이 실제로 늘었을 때만 액션 — chip 옆 floating '+N' + chip img bounce */
      if (newBalance > prev) {
        try { playYarnRewardFly(newBalance - prev); } catch (e) { console.warn('[m] reward fly failed:', e); }
        /* 첫 보상 직후 1회 — 공유 유도 안내 (회원가입 직후 첫 카드 read 케이스) */
        try { maybeShowFirstShareGuide(cardId, newBalance - prev); } catch (e) { console.warn('[m] first share guide failed:', e); }
      }
    }
  } catch (e) {
    console.warn('[m] rewardYarnForFirstView failed:', e);
  }
}

/* 첫 카드 읽고 실타래 받은 직후 1회 — 공유 기능 안내 + CTA. 보상 fly 가 사라진 후 ~2.5s 뒤에 띄움.
   사용자 명세: "비로그인 카드 read 는 카운트 X, 첫 로그인 후 첫 카드 read 가 새 시작". 그래서
   user_id 별로 flag 분리. 다른 계정 로그인 시 다시 처음부터 가이드 표시. */
function maybeShowFirstShareGuide(cardId, amount) {
  if (!state.userId) return;
  const key = `ds.firstShareGuideShown.${state.userId}`;
  if (safeStorageGet(key) === '1') return;
  safeStorageSet(key, '1');
  setTimeout(() => { try { showFirstShareGuideModal(cardId, amount); } catch {} }, 2500);
}
function showFirstShareGuideModal(cardId, amount) {
  if (document.getElementById('first-share-guide-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'first-share-guide-modal';
  modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(14,12,10,0.65);display:flex;align-items:center;justify-content:center;z-index:170;padding:24px;padding-top:max(24px,env(safe-area-inset-top));padding-bottom:max(24px,env(safe-area-inset-bottom));opacity:0;transition:opacity .25s ease;`;
  modal.innerHTML = `
    <div style="background:var(--paper);border-radius:16px;padding:32px 26px 22px;max-width:340px;width:100%;max-height:90vh;overflow-y:auto;text-align:center;box-shadow:0 24px 56px rgba(0,0,0,.28);border:0.5px solid var(--latte);margin:auto;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(216,128,80,.12);color:var(--cta);font-size:11px;font-weight:700;letter-spacing:.16em;padding:6px 14px;border-radius:999px;margin-bottom:18px;">
        <img src="/m/assets/daily-script-bar.png" alt="" style="width:14px;height:14px;border-radius:50%;object-fit:cover;display:block;" />
        FIRST READ +${amount || 300}
      </div>
      <h3 style="font-family:'Nanum Myeongjo','Noto Serif KR',serif;font-size:20px;color:var(--espresso);margin:0 0 10px;font-weight:700;line-height:1.4;">첫 명대사를 다 읽었어요</h3>
      <p style="font-size:13px;color:var(--walnut);line-height:1.7;margin:0 0 20px;">
        마음을 흔드는 문장이라면<br/>
        <span style="color:var(--espresso);font-weight:600;">아름다운 카드지로 꾸며</span> 친구에게 공유해보세요.<br/>
        <span style="color:var(--walnut);font-size:11px;letter-spacing:.04em;">공유한 친구가 가입하면 둘 다 600 실타래!</span>
      </p>
      <p style="font-size:11px;color:var(--walnut);line-height:1.6;margin:0 0 18px;padding:10px 12px;background:rgba(216,128,80,.06);border-radius:8px;text-align:left;">
        <span style="color:var(--cta);font-weight:600;">💡 길라잡기</span><br/>
        앱이 처음이라면 <strong style="color:var(--espresso);">앱 사용법 둘러보기</strong> 로<br/>
        홈·카드 상세·피드까지 한 바퀴 살펴볼 수 있어요.
      </p>
      <button id="first-share-now" type="button" style="width:100%;background:var(--cta);color:#fff;border:none;border-radius:8px;padding:14px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">지금 공유해보기</button>
      <button id="first-share-tour" type="button" style="width:100%;background:transparent;border:1px solid var(--latte);color:var(--espresso);border-radius:8px;padding:13px;font-size:13px;font-weight:500;cursor:pointer;margin-bottom:8px;display:inline-flex;align-items:center;justify-content:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;">tour</span>앱 사용법 둘러보기</button>
      <button id="first-share-later" type="button" style="background:transparent;border:none;color:var(--walnut);font-size:12px;padding:10px;cursor:pointer;width:100%;">나중에 할게요</button>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => { modal.style.opacity = '1'; });
  const close = () => { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 250); };
  modal.querySelector('#first-share-now')?.addEventListener('click', () => {
    close();
    /* cardId 로 카드 찾아 공유 모달 직접 열기. (detail-share 같은 버튼이 없어서
       click 시뮬레이션은 안 됨.) */
    setTimeout(() => {
      try {
        const card = state.detailCard
          || (state.allCards || []).find((c) => c && Number(c.card_id) === Number(cardId));
        if (!card) { toast('카드를 찾을 수 없어요'); return; }
        const w = card.works || {};
        const meta = (typeof shareMetaLinesFromWork === 'function') ? shareMetaLinesFromWork(w) : { metaKo: '', metaEn: '' };
        openShareModal({
          cardId: card.card_id,
          quote: card.quote || '',
          speaker: card.speaker || '',
          work: w.title || '',
          workId: w.work_id ?? null,
          author: w.author || '',
          metaKo: meta.metaKo, metaEn: meta.metaEn,
          coverUrl: w.cover_url || '',
        });
      } catch (e) { console.warn('[m] first share open failed:', e); toast('공유 화면을 열 수 없어요'); }
    }, 280);
  });
  modal.querySelector('#first-share-tour')?.addEventListener('click', () => {
    close();
    /* 기존 onboarding 코치마크 투어 — 홈 → 전문 → 피드 단계별 버튼 위치 안내. detail 열려있으면 닫고 홈으로. */
    setTimeout(() => {
      try {
        if (detailScreen && detailScreen.classList.contains('open')) closeDetailInternal();
        setView('home');
        setTimeout(() => { try { launchTour(); } catch (e) { console.warn('[m] launchTour failed:', e); } }, 400);
      } catch (e) { console.warn('[m] tour start failed:', e); }
    }, 280);
  });
  modal.querySelector('#first-share-later')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

// 차감 — 카드 열람 게이트 제거됐으나 호출 시그니처는 호환 유지(현재 사용처 없음).
async function spendYarn(cardId) {
  if (isCardUnlocked(cardId)) return 'alreadyUnlocked';
  try {
    const balance = await consumeYarnRpc();
    if (balance < 0) return 'insufficient';
    state.yarnPurchased = balance;
    markCardUnlocked(cardId);
    return 'chargedPurchased';
  } catch (e) {
    console.warn('[m] consumeYarn failed:', e);
    return 'error';
  }
}

// ─────── 출석체크 ───────
// 사용자 명세: 00시 기준 그날 처음 앱을 열면 한 달 달력 팝업 1회 + 실타래 5개 지급.
//   ds.attendance.history = 출석한 날짜 배열(YYYY-MM-DD)
//   ds.attendance.lastShown = 오늘 모달을 띄웠는지(매일 1회로 제한)
// 출석 날짜는 서버 권위(attendance 테이블, 045_attendance.sql). 달력은 캐시에서 즉시
// 렌더하고, 모달을 열기 전 fetchAttendanceHistory() 로 서버에서 채운다. lastShown 만 로컬
// (모달 1일 1회 게이트 — 보상 dedup 은 서버가 (user_id, date) UNIQUE 로 보장).
const ATTENDANCE_LAST_SHOWN_KEY = 'ds.attendance.lastShown';
const ATTENDANCE_REWARD = 100;

let attendanceHistoryCache = [];
function getAttendanceHistory() { return attendanceHistoryCache; }

/* 서버에서 출석한 날짜(YYYY-MM-DD) 로드. 익명/비로그인은 빈 배열. */
async function fetchAttendanceHistory() {
  if (state.isAnonymous || !state.userId) { attendanceHistoryCache = []; return attendanceHistoryCache; }
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('attendance').select('attended_date');
    if (error) throw error;
    attendanceHistoryCache = (data || []).map((r) => r.attended_date);
  } catch (e) { console.warn('[m] attendance history fetch failed:', e); }
  return attendanceHistoryCache;
}

/* 오늘(KST) 첫 출석이면 서버가 기록 + 보상(+100)을 원자적으로. 반환 { rewarded, balance, today }. */
async function checkInAttendanceRpc(reward) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('check_in_attendance', { p_reward: reward });
  if (error) throw error;
  return data;
}

function buildAttendanceCalendarHTML() {
  /* 안드 AttendanceDialog/CalendarGrid 미러:
     - 월 제목 left-aligned (titleMedium)
     - 요일 헤더 7열 + 일요일은 cta 색
     - 출석일 sand alpha 0.35, 노란빛 셀 배경
     - 출석일은 18px 실타래 아이콘 + 날짜
     - 오늘은 cta border 1.5dp */
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const history = new Set(getAttendanceHistory());
  const todayKey = todayStr();
  const yarnImg = `<img src="assets/daily-script-bar.png" alt="실타래" style="width:18px;height:18px;object-fit:cover;border-radius:50%;display:block;" />`;
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const head = dayLabels.map((d, i) =>
    `<div style="text-align:center;font-size:11px;color:${i === 0 ? 'var(--cta)' : 'var(--walnut)'};font-weight:700;padding:6px 0;">${d}</div>`
  ).join('');
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<div></div>');
  for (let d = 1; d <= lastDate; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const attended = history.has(ds);
    const isToday = ds === todayKey;
    const borderStyle = isToday ? 'border:1.5px solid var(--cta);' : 'border:1px solid transparent;';
    cells.push(
      `<div style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:8px;${borderStyle}background:${attended ? 'rgba(216,160,90,0.35)' : 'transparent'};gap:2px;">
        <span style="font-size:11px;color:${attended ? 'var(--espresso)' : 'var(--walnut)'};font-weight:${isToday ? 700 : 500};">${d}</span>
        <div style="height:18px;display:flex;align-items:center;justify-content:center;">${attended ? yarnImg : ''}</div>
      </div>`
    );
  }
  while (cells.length % 7 !== 0) cells.push('<div></div>');
  return `
    <p style="text-align:left;font-family:'Noto Serif KR',serif;font-size:16px;color:var(--espresso);font-weight:700;margin:0 0 10px;">${year}년 ${month + 1}월</p>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;width:100%;">${head}${cells.join('')}</div>
  `;
}

// 출석현황 보기 — MY 진입용. 보상 지급 없이 달력만 띄움.
async function openAttendanceModal() {
  const modal = document.getElementById('attendance-modal');
  if (!modal) return;
  await fetchAttendanceHistory();   // 서버 출석 기록 → 달력
  const grid = modal.querySelector('#attendance-grid');
  const reward = modal.querySelector('#attendance-reward-msg');
  if (grid) grid.innerHTML = buildAttendanceCalendarHTML();
  if (reward) reward.style.display = 'none';
  modal.style.display = 'flex';
  modal.querySelector('#attendance-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  }, { once: true });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  }, { once: true });
}

async function maybeShowAttendance() {
  /* 로그인 사용자만 출석 보상·달력 동작 — 익명 사용자는 출석 자체 추적 안 함 */
  if (state.isAnonymous || !state.userId) return;
  const today = todayStr();
  if (safeStorageGet(ATTENDANCE_LAST_SHOWN_KEY) === today) return;
  safeStorageSet(ATTENDANCE_LAST_SHOWN_KEY, today);
  let result = null;
  try { result = await checkInAttendanceRpc(ATTENDANCE_REWARD); }
  catch (e) { console.warn('[m] attendance check-in failed:', e); }
  const newAttendance = !!(result && result.rewarded);  // 서버가 오늘 첫 출석으로 판정 → 보상 지급됨
  const newBalance = (result && Number.isFinite(result.balance)) ? result.balance : null;
  if (newAttendance) {
    try { track('attendance_check', { date: today }); } catch {}
  }
  await fetchAttendanceHistory();   // 오늘 포함 출석 기록 → 달력
  /* 첫 출석이고 보상이 잡혔으면 → 보상 애니메이션 (burst → chip) 끝나고 달력 노출 */
  if (newAttendance && Number.isFinite(newBalance) && newBalance >= 0) {
    try { await playAttendanceRewardAnim(ATTENDANCE_REWARD, newBalance); }
    catch (e) { console.warn('[m] attendance anim failed:', e); state.yarnPurchased = newBalance; renderYarnChip(); }
  }
  const modal = document.getElementById('attendance-modal');
  if (!modal) return;
  const grid = modal.querySelector('#attendance-grid');
  const reward = modal.querySelector('#attendance-reward-msg');
  if (grid) grid.innerHTML = buildAttendanceCalendarHTML();
  if (reward) reward.style.display = newAttendance ? 'flex' : 'none';
  modal.style.display = 'flex';
  modal.querySelector('#attendance-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  }, { once: true });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  }, { once: true });
}

/* 출석 보상 애니메이션 — 중앙 burst(실타래 ×N) → 우측 상단 yarn-chip 으로 축소 이동 → 잔액 카운팅 */
async function playAttendanceRewardAnim(amount, finalBalance) {
  if (!yarnChip) { state.yarnPurchased = finalBalance; renderYarnChip(); return; }
  /* 1회용 CSS — head 에 한 번만 inject */
  if (!document.getElementById('attendance-anim-css')) {
    const css = document.createElement('style');
    css.id = 'attendance-anim-css';
    css.textContent = `
      .ar-backdrop{ position:fixed; inset:0; background:rgba(14,12,10,.42); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); opacity:0; transition:opacity .35s ease; z-index:140; pointer-events:none; }
      .ar-backdrop.show{ opacity:1; pointer-events:auto; }
      /* burst z-index 145 — header(z-index ~30) 위로 떠올라 상단바와 겹쳐서 보임. chip(150)이 burst 보다 위. */
      .ar-burst{ position:fixed; left:50%; top:50%; transform:translate(-50%,-50%) scale(1); transform-origin:center center; display:flex; flex-direction:column; align-items:center; gap:14px; opacity:0; z-index:145; pointer-events:none;
        transition: opacity .35s ease, transform 1.4s cubic-bezier(.45,.05,.25,1), left 1.4s cubic-bezier(.45,.05,.25,1), top 1.4s cubic-bezier(.45,.05,.25,1); }
      .ar-burst.show{ opacity:1; }
      .ar-burst.fly{ transform:translate(-50%,-50%) scale(.16); opacity:1; }
      .ar-burst.fade{ opacity:0; transition:opacity .25s ease; }
      .ar-yarn{ width:180px; height:180px; border-radius:50%; background:url('assets/daily-script-bar.png') center/cover; box-shadow:0 18px 40px rgba(60,38,18,.35), 0 0 0 8px rgba(255,255,255,.18); animation:ar-burst-bounce 1.2s ease-in-out infinite; }
      .ar-times{ font-family:'Bodoni 72',Georgia,serif; font-size:64px; font-weight:700; color:#fff; letter-spacing:.02em; text-shadow:0 4px 18px rgba(0,0,0,.35); font-variant-numeric:tabular-nums; }
      .ar-times .x{ opacity:.78; margin-right:4px; }
      .ar-label{ color:#fff; font-size:13px; letter-spacing:.2em; opacity:.78; text-transform:uppercase; }
      @keyframes ar-burst-bounce{ 0%,100%{ transform:translateY(0) rotate(-4deg); } 50%{ transform:translateY(-10px) rotate(4deg); } }
      /* 시퀀스 중 yarn-chip — burst 보다 위로 끌어올림. chip 박스는 정지, 안의 실타래 이미지만 공 튀기듯 bounce. */
      body.ar-active #yarn-chip{ position:relative; z-index:150 !important; }
      body.ar-active #yarn-chip.ar-bounce img{ animation: ar-img-bounce .9s cubic-bezier(.34,1.56,.64,1); transform-origin:center center; }
      @keyframes ar-img-bounce{
        0%   { transform:scale(1)    translateY(0); }
        12%  { transform:scale(1.55) translateY(-10px); }
        26%  { transform:scale(.78)  translateY(4px); }
        42%  { transform:scale(1.22) translateY(-5px); }
        58%  { transform:scale(.92)  translateY(2px); }
        74%  { transform:scale(1.08) translateY(-2px); }
        100% { transform:scale(1)    translateY(0); }
      }
    `;
    document.head.appendChild(css);
  }
  /* element 생성 */
  const bd = document.createElement('div'); bd.className = 'ar-backdrop';
  const burst = document.createElement('div');
  burst.className = 'ar-burst';
  burst.innerHTML = `
    <div class="ar-label">ATTENDANCE</div>
    <div class="ar-yarn"></div>
    <div class="ar-times"><span class="x">+</span>${amount}</div>
  `;
  document.body.appendChild(bd);
  document.body.appendChild(burst);
  document.body.classList.add('ar-active');
  /* 시퀀스 — 중앙에 띄웠다가 2초 뒤 자연스럽게 fade out. chip 으로 fly 안 함 (사용자 명세). */
  await sleep(20);
  bd.classList.add('show');
  burst.classList.add('show');
  /* 잔액은 보상 액션 시작과 동시에 chip 에 카운트 업 (chip 이 MY 페이지에 있어도 정합성 유지) */
  state.yarnPurchased = finalBalance;
  renderYarnChip();
  /* 중앙 burst 2초 유지 */
  await sleep(2000);
  burst.classList.add('fade');
  bd.classList.remove('show');
  await sleep(260);
  bd.remove(); burst.remove();
  document.body.classList.remove('ar-active');
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* 보상 액션 — 카드 첫 열람 등에서 토스트 대신 사용.
   화면 중앙·하단바 위에 큰 실타래 + '+N' 표시. 실타래 자체가 통통 튀는 bounce. 배경 없이 깔끔.
   2초 지속 후 fade out. chip 안의 img 도 동시에 bounce. */
function playYarnRewardFly(amount) {
  if (!amount) return;
  /* 비로그인 사용자에게는 보상 fly 자체를 띄우지 않음 — 사용자 명세 "비로그인은 실타래 지급 X" */
  if (!state.userId) return;
  /* keyframes 1회 inject */
  if (!document.getElementById('reward-yarn-bounce-css')) {
    const css = document.createElement('style');
    css.id = 'reward-yarn-bounce-css';
    css.textContent = `@keyframes reward-yarn-bounce {
      0%, 100% { transform: translateY(0) scale(1); }
      20%      { transform: translateY(-18px) scale(1.12); }
      40%      { transform: translateY(0)     scale(0.92); }
      60%      { transform: translateY(-10px) scale(1.06); }
      80%      { transform: translateY(0)     scale(0.98); }
    }`;
    document.head.appendChild(css);
  }
  /* chip img 동반 bounce — 출석 보상 CSS 재사용 */
  if (yarnChip) {
    document.body.classList.add('ar-active');
    yarnChip.classList.add('ar-bounce');
    setTimeout(() => {
      yarnChip.classList.remove('ar-bounce');
      document.body.classList.remove('ar-active');
    }, 950);
  }
  /* 화면 정중앙. 페이퍼 박스 + 그림자 — 본문 텍스트와 시각 분리. */
  const pop = document.createElement('div');
  pop.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:160;display:inline-flex;align-items:center;gap:12px;pointer-events:none;opacity:0;transition:opacity .35s ease;background:var(--paper);border:0.5px solid var(--latte);border-radius:999px;padding:14px 24px;box-shadow:0 18px 48px rgba(60,38,18,.28), 0 0 0 1px rgba(60,38,18,.06);`;
  pop.innerHTML = `
    <img src="/m/assets/daily-script-bar.png" alt=""
         style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;filter:drop-shadow(0 4px 10px rgba(60,38,18,.35));animation:reward-yarn-bounce 1.4s cubic-bezier(.34,1.56,.64,1) infinite;" />
    <span style="color:var(--espresso);font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;text-shadow:0 1px 0 rgba(250,248,242,.8);">+${amount}</span>
  `;
  document.body.appendChild(pop);
  requestAnimationFrame(() => { pop.style.opacity = '1'; });
  /* 2초 지속 → 0.4s fade → 제거 */
  setTimeout(() => { pop.style.opacity = '0'; }, 2000);
  setTimeout(() => { try { pop.remove(); } catch {} }, 2450);
}

function countYarnTo(fromN, toN, ms) {
  if (!yarnChip) return;
  const label = yarnChip.querySelector('.yarn-chip-count');
  const balanceEl = yarnBalanceNum;
  const t0 = performance.now();
  function step(t){
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    const cur = Math.round(fromN + (toN - fromN) * eased);
    if (label) label.textContent = String(cur);
    if (balanceEl) balanceEl.textContent = String(cur);
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderYarnChip() {
  if (!yarnChip) return;
  const n = yarnAvailable();
  const label = yarnChip.querySelector('.yarn-chip-count');
  if (label) label.textContent = String(n);
  if (yarnBalanceNum) yarnBalanceNum.textContent = String(n);
}

// 카드 열람 확인/부족 다이얼로그 (ConfirmSpendDialog / InsufficientDialog 미러)
function showYarnConfirm(card) {
  openPromptModal({
    title: '실타래 사용',
    message: '이 카드를 읽으면 실타래 1개가 사용됩니다.',
    subNote: `보유 실타래 ${yarnAvailable()}개`,
    confirmLabel: '사용하기',
    dismissLabel: '취소',
    openSigninOnConfirm: false,
    onConfirm: async () => {
      const r = await spendYarn(card.card_id);
      if (r === 'insufficient') { showYarnInsufficient(); return; }
      if (r === 'error') { toast('잠시 후 다시 시도해주세요.'); return; }
      renderYarnChip();
      openDetailApproved(card);
    },
  });
}
function showYarnInsufficient() {
  openPromptModal({
    title: '실타래가 부족해요',
    message: '오늘의 무료 실타래를 모두 사용했어요. 충전하면 계속 읽을 수 있어요.',
    confirmLabel: '충전하러 가기',
    dismissLabel: '닫기',
    openSigninOnConfirm: false,
    onConfirm: () => openYarnScreen(),
  });
}

// 충전 화면
function renderYarnTiers() {
  if (!yarnTiersEl) return;
  yarnTiersEl.innerHTML = '';
  YARN_TIERS.forEach(([count, price]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:0.5px solid var(--latte);';
    row.innerHTML =
        `<span style="display:flex;align-items:center;gap:12px;"><img src="assets/daily-script-bar.png" alt="실타래" style="width:28px;height:28px;display:block;object-fit:cover;border-radius:50%;" /></span>`
      + `<span class="t-title-lg c-espresso">실타래 ${count}개</span></span>`
      + `<span class="yarn-tier-buy" style="background:var(--cta);color:#fff;-webkit-text-fill-color:#fff;border-radius:6px;padding:8px 14px;font-size:11px;font-weight:700;cursor:pointer;">₩${price.toLocaleString()}</span>`;
    row.querySelector('.yarn-tier-buy').addEventListener('click', async () => {
      // 결제는 '준비 중' — 현재는 즉시 충전(grant_yarn)으로 동작 (YarnPurchaseScreen 미러)
      try {
        const balance = await grantYarnRpc(count);
        state.yarnPurchased = balance;
        renderYarnChip();
        toast(`실타래 ${count}개를 충전했어요.`);
      } catch (e) {
        console.warn('[m] grantYarn failed:', e);
        toast('충전에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
    });
    yarnTiersEl.appendChild(row);
  });
}
function setYarnTab(about) {
  if (yarnChargeTab) yarnChargeTab.style.display = about ? 'none' : 'block';
  if (yarnAboutTab) yarnAboutTab.style.display = about ? 'block' : 'none';
  if (yarnTabCharge) { yarnTabCharge.style.fontWeight = about ? '400' : '700'; yarnTabCharge.style.color = about ? 'var(--walnut)' : 'var(--espresso)'; }
  if (yarnTabAbout) { yarnTabAbout.style.fontWeight = about ? '700' : '400'; yarnTabAbout.style.color = about ? 'var(--espresso)' : 'var(--walnut)'; }
}
function openYarnScreen() {
  if (!yarnScreen) return;
  setYarnTab(false);
  renderYarnTiers();
  renderYarnChip();
  history.pushState({ overlay: 'yarn' }, '');
  yarnScreen.style.display = 'flex';
  requestAnimationFrame(() => yarnScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  track('yarn_screen_opened');
}
function closeYarnScreenInternal() {
  if (!yarnScreen) return;
  yarnScreen.classList.remove('open');
  setTimeout(() => { yarnScreen.style.display = 'none'; document.body.style.overflow = ''; }, 250);
}
function closeYarnScreen() {
  if (history.state && history.state.overlay === 'yarn') history.back();
  else closeYarnScreenInternal();
}
if (yarnChip) yarnChip.addEventListener('click', openYarnScreen);
if (yarnBack) yarnBack.addEventListener('click', closeYarnScreen);

// OZ's house — 우측 상단 칩, 고양이 집 페이지
const ozHouseScreen = $('#oz-house-screen');
const ozHouseBtn = $('#oz-house-btn');
const ozHouseBack = $('#oz-house-back');
function openOzHouse() {
  if (!ozHouseScreen) return;
  history.pushState({ overlay: 'ozHouse' }, '');
  ozHouseScreen.style.display = 'flex';
  requestAnimationFrame(() => ozHouseScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  // OZ's house 진입 시 하단바 자체 + cat / 피드 글쓰기 말풍선 모두 숨김 (사용자 명세)
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = 'none';
  if (feedFab) feedFab.style.display = 'none';
  // OZ's house iframe — 첫 진입은 init 코드의 랜덤 placeCat 으로 자세 결정.
  // 재진입은 iframe 이 이미 로드된 상태 → 자식의 refreshCat() 직접 호출해 매번 새 자세.
  const frame = document.getElementById('oz-house-frame');
  if (frame) {
    const target = frame.dataset.src || 'oz-house.html';
    const cw = frame.contentWindow;
    if (cw && typeof cw.refreshCat === 'function') {
      try { cw.refreshCat(); } catch {}
    } else if (!frame.src || frame.src === 'about:blank' || !frame.src.includes(target)) {
      frame.src = target;
    }
  }
  track('oz_house_opened');
}
function closeOzHouseInternal() {
  if (!ozHouseScreen) return;
  // 즉시 닫음 — transition / src=about:blank 둘 다 흰 화면 깜빡임 원인이라 모두 제거 (사용자 명세)
  ozHouseScreen.classList.remove('open');
  ozHouseScreen.style.display = 'none';
  document.body.style.overflow = '';
  // 하단바 / cat / 피드 fab 복귀 — 현재 view 기준
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = '';
  updateBottomNavCatForView(state.currentView);
  if (feedFab) feedFab.style.display = (state.currentView === 'feed') ? 'inline-flex' : 'none';
  // iframe 은 그대로 둠 — 다음 진입 시 즉시 표시되어 흰 화면 없음 (oz-house.html 은 setInterval 없음)
}
function closeOzHouse() {
  if (history.state && history.state.overlay === 'ozHouse') history.back();
  else closeOzHouseInternal();
}
if (ozHouseBtn) ozHouseBtn.addEventListener('click', openOzHouse);
if (ozHouseBack) ozHouseBack.addEventListener('click', closeOzHouse);

// OZ's house 외부 top-bar 의 밤/낮 토글 — iframe 안 .room 의 .night 클래스를 직접 토글
const ozDayNightBtn = $('#oz-house-day-night');
if (ozDayNightBtn) {
  ozDayNightBtn.addEventListener('click', () => {
    const frame = document.getElementById('oz-house-frame');
    const doc = frame?.contentDocument;
    if (!doc) return;
    const room = doc.getElementById('room');
    if (!room) return;
    const isNight = room.classList.toggle('night');
    ozDayNightBtn.textContent = isNight ? '🌙' : '☀️';
    // iframe 안에 남아 있는 day-night 버튼(hidden) 의 .on 상태도 동기화
    doc.querySelectorAll('.day-night button').forEach((b) =>
      b.classList.toggle('on', b.dataset.val === (isNight ? 'night' : 'day'))
    );
  });
}
// OZ's house 외부 top-bar 의 편집 토글 — iframe 안 window.toggleOzEdit() 호출
const ozEditBtn = $('#oz-house-edit');
if (ozEditBtn) {
  ozEditBtn.addEventListener('click', () => {
    const frame = document.getElementById('oz-house-frame');
    try { frame?.contentWindow?.toggleOzEdit?.(); } catch {}
  });
}

if (yarnTabCharge) yarnTabCharge.addEventListener('click', () => setYarnTab(false));
if (yarnTabAbout) yarnTabAbout.addEventListener('click', () => setYarnTab(true));

// ---------- 사용법 코치마크 투어 (첫 접속/첫 로그인 1회) ----------
const GUIDE_SEEN_KEY = 'ds.guideSeen';

// 투어 데모용 하이라이트 카드 — 오늘 카드를 '방금 하이라이트한 것'처럼 피드에 보여준다.
function injectDemoHighlight() {
  const list = document.getElementById('highlights-list');
  const card = state.todayCard;
  if (!list || !card) return;
  document.getElementById('cm-demo-hl')?.remove();
  const w = card.works || {};
  const title = displayTitle(w.title) || '';
  const subtitle = w.subtitle ? String(w.subtitle).trim() : '';
  const author = w.author || '';
  const formatLabel = GENRE_LABEL[w.format] || w.format || '';
  const nickname = (!state.isAnonymous && state.userNickname) ? state.userNickname : '나';
  const metaLine = [formatLabel, '방금'].filter(Boolean).join(' · ');
  const coverColor = leatherColorFor(w.title || title);
  const item = document.createElement('div');
  item.className = 'hl-card';
  item.id = 'cm-demo-hl';
  item.innerHTML = `
    <div class="hl-card-head">
      <p class="nickname">${escapeHtml(nickname)}</p>
      ${metaLine ? `<p class="meta">${escapeHtml(metaLine)}</p>` : ''}
    </div>
    <div class="hl-bookcover" style="background:${coverColor};">
      <p class="bc-title">${escapeHtml(title)}</p>
      ${subtitle ? `<p class="bc-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      ${author ? `<p class="bc-author">${escapeHtml(author)}</p>` : ''}
    </div>
    <div class="hl-quote">
      <span class="open-q">“</span>
      <p>${escapeHtml(cleanQuote(card.quote))}</p>
      <span class="close-q">”</span>
    </div>
    <p class="hl-card-foot">#${String(card.card_id).padStart(5, '0')}</p>`;
  list.prepend(item);
}

// 온보딩 고정 카드 — 비교적 짧은 햄릿(141번)으로 진행해 Read Full Script 화면이 길어지지 않게.
const ONBOARDING_CARD_ID = 141;

// 홈 → 전문 → 피드를 넘나드는 투어. 각 전환은 실제 화면을 열고 레이아웃이 준비되면 resolve.
function launchTour() {
  const savedFeedCat = state.feedCategory;
  state.suppressShownTrack = true;  // 투어 데모 카드 전환은 card_shown 집계에서 제외
  // 온보딩 동안 홈·전문·피드 데모를 모두 141번 카드로 고정 (없으면 현재 카드 유지)
  const tourCard = (state.allCards || []).find((c) => Number(c.card_id) === ONBOARDING_CARD_ID);
  const prevCard = state.todayCard;
  if (tourCard && tourCard !== state.todayCard) { state.todayCard = tourCard; applyTodayCard(tourCard); }
  return startCoachmarkTour({
    // 홈 5단계: 전문 화면 열기 (슬라이드인 0.25s 뒤 측정)
    onOpenDetail: () => new Promise((resolve) => {
      if (state.todayCard) openDetail(state.todayCard);
      setTimeout(resolve, 360);
    }),
    // 전문 5단계: 전문을 닫고 피드 하이라이트 탭(+데모 카드)으로
    onOpenFeed: () => new Promise((resolve) => {
      if (history.state && history.state.overlay === 'detail') {
        history.replaceState({ tab: 'feed' }, '', '#feed');  // 남은 overlay 히스토리 정리
      }
      if (detailScreen.classList.contains('open')) closeDetailInternal();
      state.feedCategory = 'today';  // setView→renderFeed 의 async 하이라이트 로드 회피
      setView('feed');
      document.querySelectorAll('#feed-chips .a-chip').forEach((b) => b.classList.toggle('active', b.dataset.feedCat === 'highlight'));
      const today = document.getElementById('feed-today');
      const hl = document.getElementById('feed-highlight');
      const empty = document.getElementById('highlights-empty');
      if (today) today.style.display = 'none';
      if (hl) hl.style.display = 'block';
      if (empty) empty.style.display = 'none';
      injectDemoHighlight();
      setTimeout(resolve, 360);  // 전문 슬라이드아웃(0.25s) 뒤 피드/데모 측정
    }),
    // 마침/건너뛰기: 데모 정리 + 홈 카드 원복 후 홈으로
    onEnd: () => {
      document.getElementById('cm-demo-hl')?.remove();
      if (detailScreen.classList.contains('open')) closeDetailInternal();
      state.feedCategory = savedFeedCat;
      if (tourCard && prevCard && prevCard !== tourCard) { state.todayCard = prevCard; applyTodayCard(prevCard); }
      state.suppressShownTrack = false;  // 투어 종료 — 집계 재개 (원복 카드는 집계 제외)
      setView('home');
    },
  });
}

// ---------- 선호도 온보딩 (사용법 투어 직전 1회) ----------
// 신규/기존 공통으로 1회 노출. 코치마크(ds.guideSeen)는 신규만 뜨므로 흐름이 자연히 갈린다:
//   신규(guideSeen 없음): 선호도 → 홈 + 코치마크
//   기존(guideSeen='1') : 선호도 → 홈
const PREF_SELECTED_KEY = 'ds.prefSelected';
const PREF_DATA_KEY = 'ds.pref';
async function maybeShowPreferences() {
  if (safeStorageGet(PREF_SELECTED_KEY) === '1') return false;
  if (!document.getElementById('pref-screen')) return false;
  if (state.currentView !== 'home' || !state.todayCard) return false;  // 홈·오늘 카드 준비됐을 때만
  await preferencesReady;
  const result = await startPreferenceFlow();
  if (!result) return false;  // 모듈/화면 없음 — 마킹하지 않고 다음 기회로
  const pref = { genres: result.genres || [], themes: result.themes || [], any: !!result.any };
  try { safeStorageSet(PREF_DATA_KEY, JSON.stringify({ ...pref, ts: Date.now() })); }
  catch (e) { console.warn('[m] pref save failed:', e); }
  safeStorageSet(PREF_SELECTED_KEY, '1');
  savePreferencesToDb(pref);  // 서버에도 저장(fire-and-forget) — 기기 간 동기화
  track('preferences_set', {
    genreCount: pref.genres.length,
    themeCount: pref.themes.length,
    any: pref.any,
    skipped: !!result.skipped,
  });
  return true;
}

// 온디맨드 개인화 — 오즈 카드의 '취향 알려주기' CTA 에서 호출. 결과 저장 후 섹션 재렌더.
async function runPreferenceFlow() {
  if (!document.getElementById('pref-screen')) return;
  await preferencesReady;
  const result = await startPreferenceFlow();
  if (!result) return;
  const pref = { genres: result.genres || [], themes: result.themes || [], any: !!result.any };
  try { safeStorageSet(PREF_DATA_KEY, JSON.stringify({ ...pref, ts: Date.now() })); }
  catch (e) { console.warn('[m] pref save failed:', e); }
  safeStorageSet(PREF_SELECTED_KEY, '1');
  savePreferencesToDb(pref);  // 로그인 상태면 서버에도 저장(익명이면 로컬만)
  track('preferences_set', {
    genreCount: pref.genres.length, themeCount: pref.themes.length,
    any: pref.any, skipped: !!result.skipped, source: 'oz_cta',
  });
  renderDailyOzPick();
}

/* 사용자별 가이드 flag — 같은 디바이스에서 비로그인 1회 본 사람이 로그인하면
   '첫 로그인'으로 보고 다시 한 번 띄움. 사용자 명세: '첫 로그인 시 앱사용법'. */
function userGuideSeenKey() {
  return state.userId ? `ds.guideSeenForUser.${state.userId}` : GUIDE_SEEN_KEY;
}

// 첫 진입 시 1회 자동 노출. 띄웠으면 true 반환 → 같은 부팅에서 랜딩 로그인 유도는 미룬다.
async function maybeShowGuide() {
  /* 사용자 명세: '첫 로그인에만' — 비로그인(익명) 사용자에게는 절대 띄우지 않음.
     로그인된 사용자 1회만 노출. */
  if (state.isAnonymous || !state.userId) return false;
  const key = userGuideSeenKey();
  /* signin 직후 reload 시 set 된 force flag — seen 키와 무관하게 1회 강제 노출 */
  let force = false;
  try {
    if (localStorage.getItem('ds.forceGuideNext') === '1') {
      force = true;
      localStorage.removeItem('ds.forceGuideNext');
    }
  } catch {}
  if (!force && safeStorageGet(key) === '1') return false;
  if (!document.querySelector('#coachmark')) return false;
  /* 기본 view 가 'daily' (getInitialView) — 'home' alias 와 둘 다 허용해야 첫 진입에 통과 */
  if (state.currentView !== 'home' && state.currentView !== 'daily') return false;
  /* todayCard 가 아직 set 되지 않았으면 최대 1.5초 대기 (bootstrap 직후 race 보정) */
  if (!state.todayCard) {
    await new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        if (state.todayCard || tries >= 15) return resolve();
        tries += 1;
        setTimeout(tick, 100);
      };
      tick();
    });
    if (!state.todayCard) return false;
  }
  await onboardingReady;  // 동적 import 완료까지 대기 → 첫 진입 사용자에게 무조건 노출
  const started = launchTour();
  if (started) { safeStorageSet(key, '1'); track('onboarding_start', { userScoped: !!state.userId }); }
  return started;
}

// 설정 → 앱 사용법: 같은 코치마크 투어를 다시 보여준다 (정적 페이지 이동 대신).
$('#guide-replay')?.addEventListener('click', (e) => {
  if (!document.querySelector('#coachmark')) return;  // 없으면 href 그대로 이동
  e.preventDefault();
  setView('home');
  requestAnimationFrame(launchTour);  // 홈 레이아웃 반영 후 시작
});

// ---------- 랜딩 로그인 유도 (최초 1회) ----------
const LANDING_SEEN_KEY = 'ds.landingSeen';
function maybeShowLanding() {
  if (!state.isAnonymous) return;
  if (safeStorageGet(LANDING_SEEN_KEY) === '1') return;
  const markSeen = () => { safeStorageSet(LANDING_SEEN_KEY, '1'); };
  openPromptModal({
    title: '오늘의 명대사',
    message: '로그인하면 마음에 든 명대사를 내 서재에 보관 할 수 있어요.',
    confirmLabel: '로그인 / 회원가입',
    subNote: '먼저 둘러보셔도 좋아요.',
    dismissLabel: '둘러보기',
    dismissAsButton: true,
    onConfirm: markSeen,
    onDismiss: markSeen,
  });
}

// ---------- 카드 15장 열람 시 피드백 유도 (최초 1회) ----------
const CARDS_VIEWED_KEY = 'ds.cardsViewed';
const FEEDBACK_NUDGE_KEY = 'ds.feedbackNudgeSeen';
const FEEDBACK_NUDGE_THRESHOLD = 15;

function feedbackNudgeSeen() {
  return safeStorageGet(FEEDBACK_NUDGE_KEY) === '1';
}
function bumpCardsViewed() {
  let n = 0;
  n = (parseInt(safeStorageGet(CARDS_VIEWED_KEY, '0'), 10) || 0) + 1;
  safeStorageSet(CARDS_VIEWED_KEY, String(n));
  return n;
}

const feedbackNudgeModal = $('#feedback-nudge-modal');
function maybeShowFeedbackNudge() {
  if (!feedbackNudgeModal || feedbackNudgeSeen()) return;
  safeStorageSet(FEEDBACK_NUDGE_KEY, '1');  // 표시 즉시 영구 1회 보장
  feedbackNudgeModal.style.display = 'flex';
}
function closeFeedbackNudge() {
  if (feedbackNudgeModal) feedbackNudgeModal.style.display = 'none';
}
$('#fb-nudge-confirm')?.addEventListener('click', () => {
  closeFeedbackNudge();
  setView('settings');
  openFeedbackScreen();
});
$('#fb-nudge-dismiss')?.addEventListener('click', closeFeedbackNudge);
feedbackNudgeModal?.addEventListener('click', (e) => {
  if (e.target === feedbackNudgeModal) closeFeedbackNudge();
});

const REMEMBER_KEY = 'ds.rememberCreds';
const SESSION_KEY = 'ds.sessionId';
function loadRememberedCreds() {
  try {
    const raw = safeStorageGet(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}
function saveRememberedCreds(id, password) {
  try {
    safeStorageSet(REMEMBER_KEY, JSON.stringify({ id, password, savedAt: Date.now() }));
  } catch {}
}
function clearRememberedCreds() {
  safeStorageRemove(REMEMBER_KEY);
}

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
  // 회원가입 전용 UI(중복확인 버튼·성별·나이대·이메일) 토글 + 중복확인 상태 초기화
  const isSignup = (mode === 'signup');
  if (signupIdCheckBtn) signupIdCheckBtn.style.display = isSignup ? '' : 'none';
  if (signupExtra) signupExtra.style.display = isSignup ? 'block' : 'none';
  const signupEmailRow = document.getElementById('signup-email-row');
  if (signupEmailRow) signupEmailRow.style.display = isSignup ? 'block' : 'none';
  /* 비번 찾기 링크 — 로그인 모드에서만 노출 */
  const forgotBtn = document.getElementById('signin-forgot-btn');
  if (forgotBtn) forgotBtn.style.display = isSignup ? 'none' : 'inline-block';
  signupIdAvailable = false;
  if (signupIdCheckResult) signupIdCheckResult.style.display = 'none';
  signinErrorEl.style.display = 'none';
}

function openSigninModal() {
  if (!signinModal) return;
  setSigninMode('signin');
  // 기억된 자격증명 자동 채움
  const remembered = loadRememberedCreds();
  signinIdInput.value = remembered?.id || '';
  signinPasswordInput.value = remembered?.password || '';
  if (signinRememberInput) signinRememberInput.checked = !!remembered;
  signinErrorEl.style.display = 'none';
  signinModal.style.display = 'flex';
  setTimeout(() => {
    if (remembered?.id) signinPasswordInput.focus();
    else signinIdInput.focus();
  }, 50);
}
function closeSigninModal() {
  signinModal.style.display = 'none';
}

function showSigninError(msg) {
  signinErrorEl.textContent = msg;
  signinErrorEl.style.display = 'block';
}

function showIdCheckResult(msg, ok) {
  if (!signupIdCheckResult) return;
  signupIdCheckResult.textContent = msg;
  signupIdCheckResult.style.color = ok ? '#1A7F37' : 'var(--cta)';
  signupIdCheckResult.style.display = 'block';
}

// 아이디 중복확인 — RLS가 타인 행 조회를 막으므로 SECURITY DEFINER RPC(email_available) 사용.
async function checkSignupId() {
  const id = (signinIdInput.value || '').trim();
  const email = idToEmail(id);
  if (!email) { signupIdAvailable = false; showIdCheckResult('아이디를 입력해주세요.', false); return; }
  signupIdCheckBtn.disabled = true;
  const prev = signupIdCheckBtn.textContent;
  signupIdCheckBtn.textContent = '⋯';
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('email_available', { p_email: email });
    if (error) throw error;
    if (data === true) {
      signupIdAvailable = true;
      showIdCheckResult('사용 가능한 아이디입니다.', true);
    } else {
      signupIdAvailable = false;
      showIdCheckResult('이미 사용 중인 아이디입니다.', false);
    }
  } catch (err) {
    // RPC 미설치(마이그레이션 전) 등 — 가입 단계에서 중복이면 거부되므로 진행은 허용
    console.warn('[m] email_available rpc failed:', err);
    signupIdAvailable = true;
    showIdCheckResult('중복확인을 건너뜁니다 — 중복이면 가입 단계에서 안내됩니다.', true);
  } finally {
    signupIdCheckBtn.disabled = false;
    signupIdCheckBtn.textContent = prev;
  }
}

function idToEmail(id) {
  // ⚠️ 3개 클라이언트 동기화 필수 — 이 알고리즘을 바꾸면 기존 계정 로그인이 전부 깨진다.
  //    Android: AuthRepository.idToEmail  (main_app/android/.../data/repo/AuthRepository.kt)
  //    iOS:     AuthSession.idToEmail     (main_app/ios/.../Data/AuthSession.swift)
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
  /* 회원가입 모드 — 사용자가 입력한 진짜 이메일 사용. 합성 이메일(@user.local) 폐기.
     기존 사용자(합성) 로그인은 ID → find_email_by_login_id RPC 로 email 조회 후 로그인. */
  const signupEmailEl = document.getElementById('signup-email');
  const signupRealEmail = (signupEmailEl?.value || '').trim();
  const fallbackEmail = idToEmail(id);
  if (!id) { showSigninError('아이디를 입력해주세요.'); return; }
  if (!password) { showSigninError('비밀번호를 입력해주세요.'); return; }
  if (signinMode === 'signup' && !signupIdAvailable) {
    showSigninError('아이디 중복확인을 해주세요.');
    return;
  }
  if (signinMode === 'signup' && (!signupRealEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupRealEmail))) {
    showSigninError('이메일을 정확히 입력해주세요. (비밀번호 찾기에 사용)');
    return;
  }
  signinErrorEl.style.display = 'none';
  signinSubmitBtn.disabled = true;
  signinSubmitBtn.textContent = '⋯';
  try {
    const sb = await getSupabase();
    // 익명 사용자의 user_id 백업 (가입/로그인 직후 북마크 이전용)
    if (state.userId) safeStorageSet('ds.prevAnonUserId', String(state.userId));

    if (signinMode === 'signup') {
      /* 진짜 이메일로 가입 — 추후 resetPasswordForEmail 가능 */
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email: signupRealEmail, password });
      if (signUpError) throw signUpError;
      if (!signUpData?.session) {
        const { error: autoSignInError } = await sb.auth.signInWithPassword({ email: signupRealEmail, password });
        if (autoSignInError) {
          throw new Error('가입은 됐으나 자동 로그인 실패. 다시 로그인 모드로 시도해주세요.');
        }
      }
      // 가입 프로필 보존 — reload 후 bootstrapAuth가 새 user 행에 기록
      safeStorageSet('ds.signupProfile', JSON.stringify({
        login_id: id,
        gender: signupGender?.value || null,
        age_group: signupAge?.value || null,
      }));
    } else {
      /* 로그인 — 신규(진짜 이메일) 가입자는 ID → find_email_by_login_id RPC 로 email 조회.
         실패하거나 결과 없으면 옛 합성 이메일 시도 (기존 사용자 호환). */
      let loginEmail = null;
      try {
        const { data: foundEmail } = await sb.rpc('find_email_by_login_id', { p_login_id: id });
        if (foundEmail && typeof foundEmail === 'string') loginEmail = foundEmail;
      } catch { /* RPC 없으면 합성 이메일로 폴백 */ }
      if (!loginEmail) loginEmail = fallbackEmail;
      const { error } = await sb.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
    }
    // 기억하기 옵션 처리
    if (signinRememberInput?.checked) {
      saveRememberedCreds(id, password);
    } else {
      clearRememberedCreds();
    }
    // 명시적 로그인/가입 이벤트 (Amplitude) — reload 전에 발생, SDK가 저장 후 전송
    track(signinMode === 'signup' ? 'sign_up' : 'login', { method: 'id_password' });
    toast(signinMode === 'signup' ? '가입 완료' : '로그인 됨');
    closeSigninModal();
    /* 사용자 명세: 첫 로그인 직후 reload 된 새 부팅에서 코치마크 투어가 '바로' 떠야 함.
       reload 후 maybeShowGuide 가 userGuideSeenKey 기반 1회 노출하므로 여기선 추가 동작 X.
       다만 사용자별 키가 미설정인 사용자의 reload 첫 부팅에 확실히 떠야 하니 force flag set. */
    try { localStorage.setItem('ds.forceGuideNext', '1'); } catch {}
    // 세션이 바뀌었으므로 reload — bootstrapAuth가 새 user 행 만들고 마이그레이션 + session_id 발급
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    console.error('[m] signin/up failed:', err);
    const msg = String(err?.message || err);
    console.warn('[m] signin/up raw error:', err);
    let friendly = msg;
    if (/Invalid login credentials/i.test(msg)) friendly = '아이디 또는 비밀번호가 맞지 않습니다.';
    else if (/User already registered/i.test(msg)) friendly = '이미 가입된 아이디입니다. 로그인해주세요.';
    else if (/Password should be at least/i.test(msg)) friendly = '비밀번호가 너무 짧습니다. (보통 6자 이상)';
    else if (/Password should be/i.test(msg)) friendly = '비밀번호가 너무 짧거나 약합니다.';
    else if (/Email rate limit/i.test(msg) || /email_send_rate_limit/i.test(msg)) {
      friendly = '이메일 발송 제한 초과 — Supabase Auth에서 "Confirm email" 옵션을 OFF로 바꾸고 다시 시도해주세요. (1시간 후 자동 풀림)';
    }
    else if (/For security purposes/i.test(msg) || /you can only request/i.test(msg)) {
      friendly = '잠시 (약 1분) 후 다시 시도해주세요.';
    }
    else if (/rate limit/i.test(msg)) friendly = 'Auth rate limit — 1시간 후 다시 시도하거나, Supabase Dashboard에서 Auth 설정 확인.';
    else if (/signups not allowed/i.test(msg) || /not enabled/i.test(msg)) {
      friendly = '회원가입이 비활성화됨 — Supabase Authentication > Providers > Email > "Enable sign ups" 체크.';
    }
    else if (/email.*not.*valid/i.test(msg) || /unable to validate email/i.test(msg)) {
      friendly = '이 아이디는 사용 불가 — 다른 아이디를 시도해주세요.';
    }
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
signupIdCheckBtn?.addEventListener('click', checkSignupId);
// 아이디가 바뀌면 다시 중복확인하도록 통과 상태 리셋
signinIdInput?.addEventListener('input', () => {
  signupIdAvailable = false;
  if (signupIdCheckResult) signupIdCheckResult.style.display = 'none';
});

function paintAuthIdentity() {
  // 닉네임/EDIT 영역은 로그인된 사용자에게만 노출 — 익명 상태에선 통째로 숨김
  const identityBlock = document.getElementById('settings-identity');
  const identitySpacer = document.getElementById('settings-identity-spacer');
  if (state.isAnonymous) {
    if (identityBlock) identityBlock.style.display = 'none';
    if (identitySpacer) identitySpacer.style.display = 'none';
  } else {
    if (identityBlock) identityBlock.style.display = 'flex';
    if (identitySpacer) identitySpacer.style.display = '';
    const name = state.userNickname || state.userLoginId || 'Signed In';
    settingsName.textContent = name;
  }
  // EDIT 버튼도 로그인 상태에서만
  if (editNicknameBtn) {
    editNicknameBtn.style.display = state.isAnonymous ? 'none' : '';
  }

  // bio 영역에 provider 뱃지 / 이메일
  // 익명일 때만 SIGN IN 섹션 (ID + 비밀번호 모달 열기) 노출
  /* 계정 삭제 버튼 — 로그인 사용자만 노출 (익명은 의미 없음). */
  const deleteAccBtn = document.getElementById('delete-account-btn');
  if (deleteAccBtn) deleteAccBtn.style.display = state.isAnonymous ? 'none' : 'inline-block';
  /* 비밀번호 변경 — 로컬(ID/비번) 로그인 사용자만. 구글·카카오 등 소셜 로그인은 숨김.
     소셜 사용자는 비번이 없거나 provider 측에서 관리 → 변경 의미 없음. */
  const changePwBtn = document.getElementById('change-password-btn');
  const isSocialLogin = state.authProvider === 'google' || state.authProvider === 'kakao';
  if (changePwBtn) changePwBtn.style.display = (state.isAnonymous || isSocialLogin) ? 'none' : 'inline-block';

  if (state.isAnonymous) {
    settingsBio.style.display = 'none';
    if (signinBlock) signinBlock.style.display = 'block';
    signOutBtn.textContent = 'Reset Anonymous';
  } else {
    settingsBio.style.display = '';
    if (signinBlock) signinBlock.style.display = 'none';
    // ID+비밀번호 계정은 합성 이메일(@user.local) 대신 아이디만 노출
    const isLocalAccount = (state.authEmail || '').endsWith('@user.local');
    let bio;
    if (isLocalAccount) {
      const loginId = state.userLoginId
        || state.authEmail.slice(0, -'@user.local'.length);
      bio = loginId ? `아이디 · ${loginId}` : '로그인됨';
    } else {
      const providerLabel = state.authProvider === 'google' ? 'Google'
        : state.authProvider === 'kakao' ? 'Kakao'
        : (state.authProvider || 'Account');
      bio = state.authEmail
        ? `${providerLabel} · ${state.authEmail}`
        : `${providerLabel} 계정으로 로그인됨`;
    }
    settingsBio.textContent = bio;
    signOutBtn.textContent = 'Sign Out';
  }

  // 홈 우상단 버튼: 익명이면 '로그인', 로그인 상태면 'MY PAGE'
  const myPageBtn = document.getElementById('my-page-btn');
  if (myPageBtn) myPageBtn.textContent = state.isAnonymous ? '로그인' : 'MY PAGE';
}

// ---------- Detail (full-screen) ----------
// 사용자 명세(2026-06): 실타래 게이트/팝업 제거 — 모든 카드 자유 열람.
//   대신 카드 1개당 1번에 한해 처음 열람 시 실타래 +1 지급 (중복 없음).
function openDetail(card) {
  if (!card) return;
  // 카드 상세 진입 직후 cat_today 가 잠깐 보이는 깜빡임 방지 — 클릭 즉시 cat 자세 변경
  setBottomNavCat('cat_library.png', 'right-far', 'large');
  // 피드의 글쓰기 연필 fab 은 카드 상세 화면에서 보이면 안 됨 (피드 탭 진입 시에만)
  if (feedFab) feedFab.style.display = 'none';
  // 실타래 보상은 90% 스크롤 시점에 트리거 — 여기서 호출 X. 다음 카드용 flag reset.
  state._rewardTriggeredCardId = null;
  openDetailApproved(card);
}

function openDetailApproved(card) {
  if (!card) return;
  setBottomNavCat('cat_library.png', 'right-far', 'large');   // 카드 상세 — 책장 앞 자세, 우측 하단 + 크게
  if (feedFab) feedFab.style.display = 'none';                // 카드 상세에서는 글쓰기 연필 fab 절대 안 보임
  // 카드 열람 누적 카운트 — 임계치 도달 시, 카드를 가리지 않도록 '닫힐 때' 유도 팝업 예약
  if (bumpCardsViewed() >= FEEDBACK_NUDGE_THRESHOLD && !feedbackNudgeSeen()) {
    state._feedbackNudgePending = true;
  }
  // Fire-and-forget view increment + optimistic local bump so the count below reflects this open.
  (async () => {
    try {
      const sb = await getSupabase();
      await sb.rpc('increment_card_view', { p_card_id: card.card_id });
    } catch (e) { console.warn('[m] increment view failed:', e); }
  })();
  card.view_count = (card.view_count || 0) + 1;
  const sameInAllCards = state.allCards?.find((c) => c.card_id === card.card_id);
  if (sameInAllCards && sameInAllCards !== card) {
    sameInAllCards.view_count = card.view_count;
  }
  state.detailCardId = card.card_id;
  state.detailCard = card;
  const w = card.works || {};
  const title = displayTitle(w.title) || '';
  const subtitle = w.subtitle ? String(w.subtitle).trim() : '';

  detailWorkTitle.textContent = title;
  // 시리즈물 부제 — 있으면 작은 글자로 타이틀 아래 표시
  // 상세 화면 EN 토글 — 새 카드 진입 시 한국어로 리셋
  state.detailLang = 'ko';

  const detailWorkSubtitle = document.getElementById('detail-work-subtitle');
  if (detailWorkSubtitle) {
    if (subtitle) {
      detailWorkSubtitle.textContent = subtitle;
      detailWorkSubtitle.style.display = 'block';
    } else {
      detailWorkSubtitle.style.display = 'none';
    }
  }

  // metadata 두 행 분리:
  //   1행: 형식 / 작가 (FORMAT / AUTHOR)
  //   2행: 연도 · 조회수 · 북마크
  const headItems = [
    w.format ? w.format.toUpperCase() : null,
    w.author ? w.author.toUpperCase() : null,
  ].filter(Boolean);
  const yearHtml = w.release_year
    ? `<span class="t-label-sm c-walnut">${escapeHtml(String(w.release_year))}</span><span class="t-label-sm c-walnut">·</span>`
    : '';
  /* 사용자 명세: 본문 메타 최상단에 작품 제목(작가 이름 위).
     paintDetail 안에선 titleSrc/subtitleSrc 가 정의돼 있지 않음 — w.title/w.subtitle 직접 사용.
     (언어 토글 시엔 applyDetailLang 가 titleSrc/subtitleSrc 기반으로 재생성) */
  const detailWorkTitleText = displayTitle(w.title || '');
  const detailSubText = w.subtitle ? String(w.subtitle).trim() : '';
  detailMeta.style.flexDirection = 'column';
  detailMeta.innerHTML =
      `<p style="margin:0 0 4px;font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-size:18px;font-weight:700;color:var(--espresso);text-align:center;line-height:1.3;word-break:keep-all;">${escapeHtml(detailWorkTitleText)}</p>`
    + (detailSubText ? `<p style="margin:0 0 10px;font-size:12px;color:var(--walnut);text-align:center;letter-spacing:0.04em;">${escapeHtml(detailSubText)}</p>` : `<div style="height:8px;"></div>`)
    + `<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">`
    + headItems.map((v) => `<span class="t-label-sm c-walnut">${escapeHtml(v)}</span>`).join('')
    + `</div>`
    + `<div style="margin-top:6px;display:flex;gap:6px;justify-content:center;align-items:center;">`
    + yearHtml
    + renderCounts(card)
    + `<span id="detail-comment-count" class="t-label-sm c-walnut" style="display:inline-flex;align-items:center;gap:6px;"></span>`
    + `</div>`;

  // 상세 ENG 토글 — 장면 설명 위 가로 행 (lang-segmented, 토글 안에 KR/ENG 라벨)
  const detailLangRow = document.getElementById('detail-lang-toggle-row');
  const detailLangSpacer = document.getElementById('detail-lang-spacer');
  const detailLangBtn = document.getElementById('detail-lang-toggle');
  const detailLangRowLabel = document.getElementById('detail-lang-row-label');
  // 좌측 라벨 — 토글 상태에 따라 바뀜 (KR 모드: 한국어로 안내, EN 모드: 영어로 안내)
  const LANG_LABEL_KO = '원문(영문)으로 보기';
  const LANG_LABEL_EN = 'View in Korean';
  if (detailLangRow && detailLangBtn) {
    // ★ 토글 항상 노출 — 옛날 카드(영문 _original 없음) 도 보이도록.
    //   영문이 없으면 applyDetailLang 의 fallback (useEn && X_original ? X_original : X) 으로
    //   한국어가 그대로 표시됨. Android DetailScreen 의 LangRow 항상 표시 패턴과 일치.
    detailLangRow.style.display = 'flex';
    if (detailLangSpacer) detailLangSpacer.style.display = '';
    // 매번 OFF(KR) 상태로 리셋 — 새 카드 진입 시 한국어부터
    detailLangBtn.classList.remove('on');
    detailLangBtn.setAttribute('aria-checked', 'false');
    if (detailLangRowLabel) detailLangRowLabel.textContent = LANG_LABEL_KO;
    // 핸들러는 매번 새로 바인딩 — 노드 교체로 이전 카드 핸들러 제거
    const fresh = detailLangBtn.cloneNode(true);
    detailLangBtn.parentNode.replaceChild(fresh, detailLangBtn);
    fresh.addEventListener('click', (e) => {
      e.stopPropagation();
      state.detailLang = state.detailLang === 'ko' ? 'en' : 'ko';
      applyDetailLang(state.detailLang);
      const isEn = state.detailLang === 'en';
      fresh.classList.toggle('on', isEn);
      fresh.setAttribute('aria-checked', isEn ? 'true' : 'false');
      if (detailLangRowLabel) {
        detailLangRowLabel.textContent = isEn ? LANG_LABEL_EN : LANG_LABEL_KO;
      }
    });
  }

  // 좁은 폰 화면에서 LLM이 끼워 넣은 \n이 어색하게 wrap되는 걸 막기 위해
  // 산문 필드(설명·의의)는 줄바꿈을 공백으로 펴서 한 단락처럼 흐르게 한다.
  const flowProse = (s) => String(s ?? '').replace(/\s*\n+\s*/g, ' ').trim();

  // excerpt description (centered) — 관리자 ** 굵게 마커도 렌더.
  if (card.excerpt_description) {
    detailDescription.innerHTML = renderMarkdownBold(flowProse(card.excerpt_description));
    detailDescriptionBlock.style.display = 'block';
    detailDescSpacer.style.height = '24px';
  } else {
    detailDescriptionBlock.style.display = 'none';
    detailDescSpacer.style.height = '0';
  }

  // script_excerpt — 시(poem)는 행·연 구조를 그대로 보존하고,
  // 산문(novel/essay)은 단락으로 흘려보내고(화자 볼드 없음),
  // 그 외(대본 등)는 기존 화자 라인 볼드 처리 (admin library.js와 동일).
  // 모든 경로 결과는 escape 가 끝난 안전한 HTML — 그 위에 ** 만 추가 변환.
  {
    const baseHtml =
      String(w.format || '').toLowerCase() === 'poem'
        ? escapeHtml(formatPoemScript(card.script_excerpt || ''))
        : isProseFormat(w.format)
          ? escapeHtml(flowProseScript(card.script_excerpt || ''))
          : boldSpeakerLines(cleanForDisplay(card.script_excerpt || '', w.characters), w.characters);
    detailScript.innerHTML = applyMarkdownBoldOnHtml(baseHtml);
    /* 본문 정렬 — 관리자 편집에서 저장한 text_align 적용. NULL 이면 format 기본값 (poem=center, else=left). */
    const _fmt = String(w.format || '').toLowerCase();
    const _defaultAlign = _fmt === 'poem' ? 'center' : 'left';
    detailScript.style.textAlign = card.text_align || _defaultAlign;
  }

  // significance — 네 프롬프트(screen/opera/play/literature) 모두 생성하므로
  // format 게이팅 없이 값이 있으면 표시. ** 굵게 마커도 렌더.
  if (card.significance && String(card.significance).trim()) {
    detailSignificance.innerHTML = renderMarkdownBold(flowProse(card.significance));
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

  // Comments — clear and start loading
  paintCommentForm();
  detailCommentsList.innerHTML = '';
  detailCommentsEmpty.style.display = 'none';
  state.detailComments = [];
  state.detailLikes = new Map();
  renderDetailCommentCount();   // 로드 전 0 표시 → 로드 후 renderComments 가 갱신
  loadCommentsForCard(card.card_id).catch((e) => console.warn('[m] loadComments failed:', e));
  subscribeToDetailComments(card.card_id);

  // open the screen — history 에 overlay 상태 push (swipe-back으로 닫히도록)
  history.pushState({ overlay: 'detail', cardId: card.card_id }, '');
  detailScreen.style.display = 'flex';
  // detail-body 는 재사용되는 단일 요소라 이전 카드의 스크롤 위치를 기억함 → 항상 맨 위에서 시작하도록 리셋
  if (detailBody) detailBody.scrollTop = 0;
  requestAnimationFrame(() => detailScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';

  track('script_opened', { card_id: card.card_id, work_title: w.title || null, format: w.format || null, fromHome: card.card_id === (state.todayCard && state.todayCard.card_id), ...cardMatchProps(card) });
}

// 상세 화면 EN 토글 — 5필드(제목·부제·작가·명대사·발췌) 한 번에 스왑.
// 해설(설명·의의)은 한국어 그대로.
function applyDetailLang(lang) {
  const card = state.detailCard;
  if (!card) return;
  const w = card.works || {};
  const useEn = lang === 'en';

  const titleSrc    = useEn && w.title_original    ? w.title_original    : w.title;
  const subtitleSrc = useEn && w.subtitle_original ? w.subtitle_original : w.subtitle;
  const authorSrc   = useEn && w.author_original   ? w.author_original   : w.author;
  const quoteSrc    = useEn && card.quote_original ? card.quote_original : card.quote;
  const scriptSrc   = useEn && card.script_excerpt_original ? card.script_excerpt_original : card.script_excerpt;

  // 헤더 — 제목/부제
  if (detailWorkTitle) detailWorkTitle.textContent = displayTitle(titleSrc || '');
  const subtitleEl = document.getElementById('detail-work-subtitle');
  if (subtitleEl) {
    if (subtitleSrc) {
      subtitleEl.textContent = subtitleSrc;
      subtitleEl.style.display = 'block';
    } else {
      subtitleEl.style.display = 'none';
    }
  }

  // 메타 두 행 — 1행: 형식·작가  /  2행: 연도·조회·북마크
  const headItems = [
    w.format ? w.format.toUpperCase() : null,
    authorSrc ? String(authorSrc).toUpperCase() : null,
  ].filter(Boolean);
  const yearHtml = w.release_year
    ? `<span class="t-label-sm c-walnut">${escapeHtml(String(w.release_year))}</span><span class="t-label-sm c-walnut">·</span>`
    : '';
  const detailWorkTitleText2 = displayTitle(titleSrc || w.title || '');
  const detailSubText2 = subtitleSrc ? String(subtitleSrc).trim() : '';
  detailMeta.innerHTML =
      `<p style="margin:0 0 4px;font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-size:18px;font-weight:700;color:var(--espresso);text-align:center;line-height:1.3;word-break:keep-all;">${escapeHtml(detailWorkTitleText2)}</p>`
    + (detailSubText2 ? `<p style="margin:0 0 10px;font-size:12px;color:var(--walnut);text-align:center;letter-spacing:0.04em;">${escapeHtml(detailSubText2)}</p>` : `<div style="height:8px;"></div>`)
    + `<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">`
    + headItems.map((v) => `<span class="t-label-sm c-walnut">${escapeHtml(v)}</span>`).join('')
    + `</div>`
    + `<div style="margin-top:6px;display:flex;gap:6px;justify-content:center;align-items:center;">`
    + yearHtml
    + renderCounts(card)
    + `<span id="detail-comment-count" class="t-label-sm c-walnut" style="display:inline-flex;align-items:center;gap:6px;"></span>`
    + `</div>`;
  renderDetailCommentCount();   // 언어 토글로 메타 재생성 후 댓글 수 복원

  // 발췌 (script_excerpt) 스왑
  {
    const baseHtml =
      String(w.format || '').toLowerCase() === 'poem'
        ? escapeHtml(formatPoemScript(scriptSrc || ''))
        : isProseFormat(w.format)
          ? escapeHtml(flowProseScript(scriptSrc || ''))
          : boldSpeakerLines(cleanForDisplay(scriptSrc || '', w.characters), w.characters);
    detailScript.innerHTML = applyMarkdownBoldOnHtml(baseHtml);
    /* 본문 정렬 — KO/EN 별도 저장된 text_align 적용. NULL 이면 format 기본 (poem=center, else=left). */
    const _fmt = String(w.format || '').toLowerCase();
    const _defaultAlign = _fmt === 'poem' ? 'center' : 'left';
    const _alignSrc = useEn ? (card.text_align_original || card.text_align) : card.text_align;
    detailScript.style.textAlign = _alignSrc || _defaultAlign;
  }

  // 상황 설명 (excerpt_description) + 의의 (significance) 스왑
  const flowProse = (s) => String(s ?? '').replace(/\s*\n+\s*/g, ' ').trim();
  const descSrc = useEn && card.excerpt_description_original ? card.excerpt_description_original : card.excerpt_description;
  if (descSrc && detailDescription) {
    detailDescription.innerHTML = renderMarkdownBold(flowProse(descSrc));
  }
  const sigSrc = useEn && card.significance_original ? card.significance_original : card.significance;
  if (sigSrc && detailSignificance) {
    detailSignificance.innerHTML = renderMarkdownBold(flowProse(sigSrc));
  }
}

function paintDetailCollectBtn(isBookmarked) {
  detailCollectBtn.textContent = isBookmarked ? 'Collected' : 'Collect Script Artifact';
}

function closeDetailInternal() {
  detailScreen.classList.remove('open');
  unsubscribeFromDetailComments();
  cancelReply();
  updateBottomNavCatForView(state.currentView);   // 카드 상세 닫힘 → 탭별 기본 자세 복귀
  // 펜 fab — 항상 syncFeedFab 로 통일 (feedpost/hl-compose 가 열려있으면 hide 유지)
  syncFeedFab();
  setTimeout(() => {
    detailScreen.style.display = 'none';
    document.body.style.overflow = '';
    state.detailCardId = null;
    state.detailCard = null;
    state.detailComments = [];
    state.detailLikes = new Map();
    // 15장 열람 유도 팝업이 예약돼 있으면 카드가 닫힌 뒤 노출
    if (state._feedbackNudgePending) {
      state._feedbackNudgePending = false;
      maybeShowFeedbackNudge();
    }
    // DAILY 탭에 있으면 인기 대사 + 다시 만나기 즉시 갱신 (북마크/조회/댓글/unlock 변화 반영)
    if (state.currentView === 'daily') {
      try { renderDailyTrending(); renderDailyRecent(); } catch {}
    }
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

// ---------- Comments + Heart Reactions ----------
function paintCommentForm() {
  if (state.isAnonymous) {
    detailCommentLogin.style.display = 'block';
    detailCommentForm.style.display = 'none';
  } else {
    detailCommentLogin.style.display = 'none';
    detailCommentForm.style.display = 'block';
  }
}

function formatRelativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${dd}`;
}

async function loadCommentsForCard(cardId) {
  if (cardId == null) return;
  const sb = await getSupabase();

  const { data: comments, error: cErr } = await sb
    .from('card_comments')
    .select('comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });
  if (cErr) {
    console.warn('[m] comments load error:', cErr.message);
    return;
  }
  state.detailComments = comments || [];

  const commentIds = state.detailComments.map((c) => c.comment_id);
  if (commentIds.length === 0) {
    state.detailLikes = new Map();
    renderComments();
    return;
  }
  const { data: likes, error: lErr } = await sb
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);
  if (lErr) {
    console.warn('[m] likes load error:', lErr.message);
    state.detailLikes = new Map();
  } else {
    const map = new Map();
    (likes || []).forEach((row) => {
      if (!map.has(row.comment_id)) map.set(row.comment_id, new Set());
      map.get(row.comment_id).add(row.user_id);
    });
    state.detailLikes = map;
  }
  renderComments();
}

function renderComments() {
  if (state.detailCardId == null) return;
  const list = state.detailComments;
  renderDetailCommentCount();
  if (!list || list.length === 0) {
    detailCommentsList.innerHTML = '';
    detailCommentsEmpty.style.display = 'block';
    return;
  }
  detailCommentsEmpty.style.display = 'none';

  const myUserId = state.userId;
  // 트리 구성: top-level은 parent_comment_id == null
  // 그 외는 부모 아래 묶음. 깊이 1단계만 허용 — 답글의 답글은 자동으로 부모의 부모 아래로 평탄화.
  const byParent = new Map();
  byParent.set(null, []);
  list.forEach((c) => {
    let parentKey = c.parent_comment_id ?? null;
    // 부모가 또 답글이면 그 부모의 부모(즉 root)로 정규화
    if (parentKey != null) {
      const parent = list.find((x) => x.comment_id === parentKey);
      if (parent && parent.parent_comment_id != null) {
        parentKey = parent.parent_comment_id;
      }
    }
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey).push(c);
  });

  const renderOne = (c, isReply) => {
    const likeSet = state.detailLikes.get(c.comment_id) || new Set();
    const likeCount = likeSet.size;
    const likedByMe = myUserId != null && likeSet.has(myUserId);
    const nickname = c.author_nickname || '익명';
    const isMine = myUserId != null && c.user_id === myUserId;
    const isEditing = state.editingCommentId === c.comment_id;
    const linkBtnCss = 'background:transparent;border:none;cursor:pointer;padding:4px 0;color:var(--walnut);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;';

    // 본문 + 액션 — 수정 모드일 땐 textarea + Save/Cancel
    const bodyAndActions = isEditing
      ? `
        <textarea class="comment-edit-input" data-comment-id="${c.comment_id}" maxlength="500"
                  style="width:100%;min-height:60px;padding:8px;border:0.5px solid var(--latte);background:var(--paper);font-family:inherit;font-size:14px;line-height:1.6;color:var(--espresso);resize:vertical;box-sizing:border-box;margin-bottom:8px;">${escapeHtml(c.body)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button class="comment-cancel-edit-btn" data-comment-id="${c.comment_id}" style="${linkBtnCss}">Cancel</button>
          <button class="comment-save-edit-btn" data-comment-id="${c.comment_id}" style="${linkBtnCss}color:var(--cta);">Save</button>
        </div>`
      : `
        <p class="t-body-md c-espresso" style="line-height:1.6;white-space:pre-wrap;margin:0 0 8px 0;text-align:left;">${escapeHtml(c.body)}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <button class="comment-like-btn" data-comment-id="${c.comment_id}"
                    style="background:transparent;border:none;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:6px;color:${likedByMe ? 'var(--cta)' : 'var(--walnut)'};">
              <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' ${likedByMe ? 1 : 0};">favorite</span>
              <span class="t-label-sm" style="color:${likedByMe ? 'var(--cta)' : 'var(--walnut)'};">${likeCount}</span>
            </button>
            ${!isReply ? `<button class="comment-reply-btn" data-comment-id="${c.comment_id}" data-nickname="${escapeHtml(nickname)}" style="${linkBtnCss}">Reply</button>` : ''}
          </div>
          ${isMine ? `<div style="display:flex;gap:12px;">
            <button class="comment-edit-btn" data-comment-id="${c.comment_id}" style="${linkBtnCss}">Edit</button>
            <button class="comment-delete-btn" data-comment-id="${c.comment_id}" style="${linkBtnCss}">Delete</button>
          </div>` : ''}
        </div>`;

    return `
      <div class="comment-row${isReply ? ' is-reply' : ''}" data-comment-id="${c.comment_id}"
           style="border:0.5px solid var(--latte);padding:12px 14px;background:var(--paper);${isReply ? 'margin-left:24px;border-left:2px solid var(--cta);' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;">
          <span class="t-label-sm c-espresso" style="font-weight:600;">${isReply ? '↳ ' : ''}${escapeHtml(nickname)}</span>
          <span class="t-label-sm c-walnut">${escapeHtml(formatRelativeTime(c.created_at))}</span>
        </div>
        ${bodyAndActions}
      </div>
    `;
  };

  const tops = byParent.get(null) || [];
  const html = tops.map((top) => {
    const replies = byParent.get(top.comment_id) || [];
    return renderOne(top, false) + replies.map((r) => renderOne(r, true)).join('');
  }).join('');
  detailCommentsList.innerHTML = html;

  detailCommentsList.querySelectorAll('.comment-like-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) toggleCommentLike(id);
    });
  });
  detailCommentsList.querySelectorAll('.comment-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) deleteComment(id);
    });
  });
  detailCommentsList.querySelectorAll('.comment-reply-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      const nick = btn.dataset.nickname || '';
      if (!Number.isNaN(id)) startReply(id, nick);
    });
  });
  detailCommentsList.querySelectorAll('.comment-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) startEditComment(id);
    });
  });
  detailCommentsList.querySelectorAll('.comment-cancel-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => cancelEditComment());
  });
  detailCommentsList.querySelectorAll('.comment-save-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (Number.isNaN(id)) return;
      const ta = detailCommentsList.querySelector(`textarea.comment-edit-input[data-comment-id="${id}"]`);
      if (!ta) return;
      saveEditComment(id, ta.value);
    });
  });
}

function startReply(commentId, nickname) {
  if (state.isAnonymous) {
    toast('답글은 로그인 후 가능합니다');
    return;
  }
  state.replyingToCommentId = commentId;
  state.replyingToNickname = nickname || '';
  detailReplyTargetName.textContent = nickname || '익명';
  detailReplyTarget.style.display = 'flex';
  detailCommentInput.placeholder = `${nickname || '익명'}에게 답글을 남기세요…`;
  detailCommentInput.focus();
  // 입력창으로 스크롤
  detailCommentInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelReply() {
  state.replyingToCommentId = null;
  state.replyingToNickname = '';
  detailReplyTarget.style.display = 'none';
  detailCommentInput.placeholder = '이 명대사에 대한 생각을 남겨보세요…';
}

async function submitComment() {
  if (state.detailCommentSubmitting) return;
  if (state.isAnonymous) {
    toast('로그인이 필요합니다');
    return;
  }
  const cardId = state.detailCardId;
  if (cardId == null || !state.userId) return;
  const body = String(detailCommentInput.value || '').trim();
  if (!body) {
    toast('내용을 입력해주세요');
    return;
  }
  state.detailCommentSubmitting = true;
  detailCommentSubmit.disabled = true;
  try {
    const sb = await getSupabase();
    const payload = {
      card_id: cardId,
      user_id: state.userId,
      author_nickname: state.userNickname || null,
      body,
    };
    if (state.replyingToCommentId != null) {
      payload.parent_comment_id = state.replyingToCommentId;
    }
    const { data, error } = await sb
      .from('card_comments')
      .insert(payload)
      .select('comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at')
      .single();
    if (error) throw error;
    track('comment_submitted', { card_id: cardId, is_reply: state.replyingToCommentId != null });
    detailCommentInput.value = '';
    cancelReply();
    updateCommentCounter();
    // optimistic — realtime이 곧 따라잡지만 즉시 표시
    if (data && !state.detailComments.find((c) => c.comment_id === data.comment_id)) {
      state.detailComments.push(data);
      renderComments();
    }
  } catch (err) {
    console.warn('[m] submitComment failed:', err);
    toast('댓글 작성 실패: ' + (err.message || ''));
  } finally {
    state.detailCommentSubmitting = false;
    detailCommentSubmit.disabled = false;
  }
}

function startEditComment(commentId) {
  if (state.isAnonymous) { toast('로그인이 필요합니다'); return; }
  state.editingCommentId = commentId;
  renderComments();
  // textarea가 화면에 그려진 뒤 focus + 커서 맨 뒤로
  const ta = detailCommentsList.querySelector(`textarea.comment-edit-input[data-comment-id="${commentId}"]`);
  if (ta) {
    ta.focus();
    const len = ta.value.length;
    try { ta.setSelectionRange(len, len); } catch {}
  }
}

function cancelEditComment() {
  state.editingCommentId = null;
  renderComments();
}

async function saveEditComment(commentId, rawBody) {
  if (state.isAnonymous || !state.userId) return;
  const body = String(rawBody || '').trim();
  if (!body) { toast('내용을 입력해주세요'); return; }
  if (body.length > 500) { toast('500자 이내로 작성해주세요'); return; }
  // 변경 없으면 그냥 닫기
  const original = state.detailComments.find((x) => x.comment_id === commentId);
  if (original && original.body === body) {
    state.editingCommentId = null;
    renderComments();
    return;
  }
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('card_comments')
      .update({ body })
      .eq('comment_id', commentId)
      .eq('user_id', state.userId);
    if (error) throw error;
    if (original) original.body = body;
    state.editingCommentId = null;
    renderComments();
    toast('댓글이 수정되었습니다');
  } catch (err) {
    console.warn('[m] saveEditComment failed:', err);
    toast('수정 실패: ' + (err.message || ''));
  }
}

async function deleteComment(commentId) {
  if (state.isAnonymous || !state.userId) return;
  if (!(await appConfirm({ title: '댓글 삭제', message: '이 댓글을 삭제할까요?', confirmLabel: '삭제' }))) return;
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('card_comments')
      .delete().eq('comment_id', commentId).eq('user_id', state.userId);
    if (error) throw error;
    state.detailComments = state.detailComments.filter((c) => c.comment_id !== commentId);
    state.detailLikes.delete(commentId);
    renderComments();
  } catch (err) {
    console.warn('[m] deleteComment failed:', err);
    toast('삭제 실패: ' + (err.message || ''));
  }
}

async function toggleCommentLike(commentId) {
  if (state.isAnonymous || !state.userId) {
    toast('하트 반응은 로그인 후 가능합니다');
    return;
  }
  const likeSet = state.detailLikes.get(commentId) || new Set();
  const wasLiked = likeSet.has(state.userId);
  try {
    const sb = await getSupabase();
    // optimistic update
    if (wasLiked) {
      likeSet.delete(state.userId);
    } else {
      likeSet.add(state.userId);
    }
    state.detailLikes.set(commentId, likeSet);
    renderComments();

    if (wasLiked) {
      const { error } = await sb.from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', state.userId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('comment_likes')
        .insert({ comment_id: commentId, user_id: state.userId });
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[m] toggleCommentLike failed:', err);
    // revert optimistic
    if (wasLiked) {
      (state.detailLikes.get(commentId) || new Set()).add(state.userId);
    } else {
      (state.detailLikes.get(commentId) || new Set()).delete(state.userId);
    }
    renderComments();
    toast('반응 처리 실패: ' + (err.message || ''));
  }
}

function updateCommentCounter() {
  const v = String(detailCommentInput.value || '');
  detailCommentCounter.textContent = `${v.length} / 500`;
}

detailCommentInput?.addEventListener('input', updateCommentCounter);
detailCommentSubmit?.addEventListener('click', submitComment);
detailReplyCancel?.addEventListener('click', cancelReply);
detailCommentInput?.addEventListener('keydown', (e) => {
  // Ctrl/Cmd+Enter 빠른 제출
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitComment();
  }
  // Escape로 답글 취소
  if (e.key === 'Escape' && state.replyingToCommentId != null) {
    e.preventDefault();
    cancelReply();
  }
});

// ---------- Realtime: comments / likes for currently open card ----------
async function subscribeToDetailComments(cardId) {
  unsubscribeFromDetailComments();
  if (cardId == null) return;
  try {
    const sb = await getSupabase();
    const ch = sb.channel(`ds-card-comments-${cardId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'card_comments', filter: `card_id=eq.${cardId}` },
        () => {
          if (state.detailCardId === cardId) {
            loadCommentsForCard(cardId).catch(() => {});
          }
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comment_likes' },
        (payload) => {
          if (state.detailCardId !== cardId) return;
          // 우리 카드에 속한 comment인지 확인
          const row = payload.new || payload.old;
          if (!row) return;
          const knownIds = new Set(state.detailComments.map((c) => c.comment_id));
          if (knownIds.has(row.comment_id)) {
            loadCommentsForCard(cardId).catch(() => {});
          }
        });
    ch.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // best-effort: 채널 오류는 무시 (메인 realtime이 따로 동작)
      }
    });
    detailCommentsChannel = ch;
  } catch (err) {
    console.warn('[m] subscribeToDetailComments failed:', err);
  }
}
async function unsubscribeFromDetailComments() {
  if (!detailCommentsChannel) return;
  try {
    const sb = await getSupabase();
    await sb.removeChannel(detailCommentsChannel);
  } catch {}
  detailCommentsChannel = null;
}

// ---------- Feed ----------
// 백엔드(feed_posts)가 비어있거나 로컬(정적 서버)에서 불러오기 실패 시 보여줄 더미.
// DB row와 동일한 모양(cards→works 조인 형태)이라 buildFeedItem이 그대로 처리한다.
const _feedNow = Date.now();
const _feedAgo = (ms) => new Date(_feedNow - ms).toISOString();
const _MIN = 60000, _HR = 3600000, _DAY = 86400000;
const FEED_SAMPLES = [
  {
    post_id: 's1', author_nickname: '춤추는 늑대', created_at: _feedAgo(1 * _MIN),
    body: '처음 읽었을 때보다 다시 펼쳤을 때 더 좋았다.\n홈즈의 관찰력은 결국 사람을 향한 관심이라는 걸 이제야 알겠다.',
    cards: { card_id: 232, quote: '자네는 보기만 하고 관찰하지는 않는군.',
      works: { title: '셜록 홈즈', subtitle: '얼룩끈', format: 'novel', author: '아서 코난 도일', release_year: 1892 } },
  },
  {
    post_id: 's2', author_nickname: '별 보는 고양이', created_at: _feedAgo(12 * _HR),
    body: '사느냐 죽느냐, 그 한 줄 앞에서 한참을 멈췄다.\n오래된 문장인데 하나도 낡지 않았다.',
    cards: { card_id: 17, quote: '사느냐 죽느냐, 그것이 문제로다.',
      works: { title: '햄릿', subtitle: '', format: 'play', author: '윌리엄 셰익스피어', release_year: 1601 } },
  },
  {
    post_id: 's3', author_nickname: '댄싱 울프', created_at: _feedAgo(3 * _HR),
    body: '추리보다 인물이 남는 이야기.\n다 읽고 나면 사건은 잊혀도 그 새벽의 공기는 오래 기억에 남는다.',
    cards: { card_id: 255, quote: '평범함 속에 비범함이 숨어 있다네.',
      works: { title: '셜록 홈즈', subtitle: '보스콤 계곡의 미스터리', format: 'novel', author: '아서 코난 도일', release_year: 1891 } },
  },
  {
    post_id: 's4', author_nickname: '노래하는 강아지', created_at: _feedAgo(3 * _DAY),
    body: '아무 일도 일어나지 않는데 자꾸 마음이 움직인다.\n체호프는 늘 그런 식이다.',
    cards: { card_id: 123, quote: '우리는 살아갈 거예요, 긴 나날들을.',
      works: { title: '바냐 아저씨', subtitle: '', format: 'play', author: '안톤 체호프', release_year: 1897 } },
  },
  {
    post_id: 's5', author_nickname: '책 읽는 여우', created_at: _feedAgo(5 * _DAY),
    body: '개츠비가 바라본 초록 불빛이 오늘따라 내 것처럼 느껴졌다.',
    cards: { card_id: 88, quote: '그래서 우리는 계속 나아간다, 물결을 거슬러.',
      works: { title: '위대한 개츠비', subtitle: '', format: 'novel', author: 'F. 스콧 피츠제럴드', release_year: 1925 } },
  },
];

// feed_posts 조인 로드 — loadBookmarks() 와 동일한 cards→works 조인 패턴
async function loadFeedPosts() {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('feed_posts')
      .select('post_id, card_id, user_id, author_nickname, body, created_at, cards(card_id, quote, works(title, subtitle, format, author, release_year, cover_url))')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.feedPosts = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[m] loadFeedPosts failed:', err);
    state.feedPosts = [];
  } finally {
    state.feedLoaded = true;
    if (state.currentView === 'feed') renderFeedList();
  }
}

function renderFeed() {
  // 카테고리 칩 active 상태
  const cat = state.feedCategory || 'today';
  document.querySelectorAll('#feed-chips .a-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.feedCat === cat);
  });
  // 컨텐츠 영역 표시 전환
  const today = document.getElementById('feed-today');
  const highlight = document.getElementById('feed-highlight');
  if (today) today.style.display = (cat === 'today') ? 'block' : 'none';
  if (highlight) highlight.style.display = (cat === 'highlight') ? 'block' : 'none';
  if (cat === 'today') renderFeedList();
  if (cat === 'highlight') loadAndRenderHighlights().catch((e) => console.warn('[hl] load failed', e));
}

// 실제 글이 있으면 그것을, 없으면(로컬·빈 DB) 더미를 보여준다.
function renderFeedList() {
  if (!feedList) return;
  const list = state.feedPosts.length ? state.feedPosts : FEED_SAMPLES;
  feedList.innerHTML = '';
  list.forEach((post) => feedList.appendChild(buildFeedItem(post)));
}

function buildFeedItem(post) {
  const card = post.cards || {};
  const w = card.works || {};
  const wrap = document.createElement('div');
  wrap.className = 'feed-item';
  const title = displayTitle(w.title) || '—';
  const author = w.author || '';
  // 표지 — cover_url 있으면 이미지, 없으면 가죽색 폴백 (사용자 명세: 리골레토 등도 표시)
  const cover = w.cover_url || '';
  const fallbackBg = leatherColorFor(w.title || title);
  const coverHtml = cover
    ? `<img class="fb-cover" src="${escapeHtml(cover)}" alt="" loading="lazy"
         onerror="this.outerHTML='<div class=\\'fb-cover-fallback\\' style=\\'background:${fallbackBg};\\'><span>${escapeHtml(title).replace(/'/g, "&#39;")}</span></div>'" />`
    : `<div class="fb-cover-fallback" style="background:${fallbackBg};"><span>${escapeHtml(title)}</span></div>`;
  wrap.innerHTML = `
    <div class="feed-item-head">
      <div class="feed-avatar"><span class="material-symbols-outlined">edit</span></div>
      <div class="feed-head-text">
        <p class="feed-nick">${escapeHtml(post.author_nickname || '익명')}</p>
        <p class="feed-time">한 줄 리뷰 · ${escapeHtml(formatRelativeTime(post.created_at))}</p>
      </div>
    </div>
    <div class="feed-quote-panel" style="position:relative;">
      ${makeLikeHTML('feed_post', post.post_id)}
      ${makeFoldHTML(post.body || '')}
    </div>
    <div class="feed-book-line">
      <p class="fb-title">${escapeHtml(title)}</p>
      ${author ? `<p class="fb-author">${escapeHtml(author)}</p>` : ''}
      ${coverHtml}
    </div>
  `;
  // 카드 탭 → 피드 글 상세(명대사 + 본문 + 댓글) — FeedPostDetailSheet 미러
  // 좋아요/접기 버튼 클릭은 상세 열기에서 제외 (capture 가드와 이중 안전망)
  wrap.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.like-btn, .fold-btn')) return;
    openFeedPostDetail(post);
  });
  return wrap;
}

// 카테고리 칩 클릭 → state 변경 후 재렌더 + localStorage 저장 (새로고침 유지).
// 사용자 명세: 시트(feedpost detail)가 열려있을 때 다른 칩을 누르면 카테고리 전환 X,
// 시트만 닫음. 사용자가 닫힌 뒤 다시 칩을 누르면 그때 전환된다.
document.querySelectorAll('#feed-chips .a-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (feedpostScreen && feedpostScreen.classList.contains('open')) {
      try { closeFeedPostDetail(); } catch (e) { closeFeedPostDetailInternal(); }
      return;   // 시트 닫기만, 카테고리 전환 안 함
    }
    state.feedCategory = btn.dataset.feedCat || 'today';
    safeStorageSet('ds.feedCategory', state.feedCategory);
    renderFeed();
  });
});

// ----- Feed: 작성 플로우 (FAB → 북마크 선택 → 한줄 작성 → 등록) -----
function restoreScrollIfClosed() {
  if (feedPickerModal.style.display !== 'flex' && feedComposeModal.style.display !== 'flex') {
    document.body.style.overflow = '';
  }
}

function openFeedPicker() {
  if (state.isAnonymous) {
    openPromptModal({
      title: '로그인이 필요해요',
      message: state.feedCategory === 'highlight'
        ? '북마크한 카드에 하이라이트를 남기려면 로그인이 필요해요.'
        : '북마크한 명대사에 한줄을 남기려면 로그인이 필요해요.',
    });
    return;
  }
  // 피커 제목을 현재 피드 카테고리에 맞춰 변경
  const titleEl = document.getElementById('feed-picker-title');
  if (titleEl) {
    titleEl.textContent = (state.feedCategory === 'highlight')
      ? '어떤 카드에 하이라이트를 남길까요?'
      : '어떤 명대사에 한줄을 남길까요?';
  }
  renderFeedPicker();
  feedPickerModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // 하드웨어/스와이프 백 으로 피커가 닫히게끔 history 에 entry 한 칸 push
  history.pushState({ overlay: 'feedPicker' }, '');
}

// 외부에서 호출되는 close — back 트리거. 실제 hide 는 popstate 핸들러가 closeFeedPickerInternal 호출.
function closeFeedPicker() {
  if (feedPickerModal.style.display === 'flex' && history.state?.overlay === 'feedPicker') {
    history.back();
  } else {
    closeFeedPickerInternal();
  }
}
function closeFeedPickerInternal() {
  feedPickerModal.style.display = 'none';
  restoreScrollIfClosed();
}

function renderFeedPicker() {
  feedPickerList.innerHTML = '';
  const rows = [...state.bookmarks].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  if (!rows.length) {
    feedPickerList.innerHTML =
      '<div style="padding:48px 0;text-align:center;"><p class="t-body-md c-walnut" style="line-height:1.7;">아직 북마크한 명대사가 없어요.<br>마음에 드는 명대사를 먼저 보관해보세요.</p></div>';
    return;
  }
  rows.forEach((row) => feedPickerList.appendChild(buildFeedPickerRow(row)));
}

function buildFeedPickerRow(row) {
  const card = row.cards || {};
  const w = card.works || {};
  const node = document.createElement('div');
  node.className = 'feed-pick-row';
  const metaParts = [GENRE_LABEL[w.format] || w.format, w.release_year].filter(Boolean);
  node.innerHTML = `
    <div style="flex:1;min-width:0;">
      ${metaParts.length ? `<p class="t-label-sm c-walnut">${escapeHtml(metaParts.join(' · ').toUpperCase())}</p><div style="height:6px;"></div>` : ''}
      <p class="t-title-lg c-espresso single-line">${escapeHtml(displayTitle(w.title) || '—')}</p>
      <div style="height:4px;"></div>
      <p class="t-body-md c-walnut single-line">${escapeHtml(cleanQuote(card.quote))}</p>
    </div>
    <span class="material-symbols-outlined arrow">arrow_forward_ios</span>
  `;
  node.addEventListener('click', () => {
    // 카테고리에 따라 라우팅: 오늘의 한줄=compose, 하이라이트=상세화면 열고 본문 길게 누르기
    if (state.feedCategory === 'highlight') {
      // picker 를 내부적으로 닫고 (history 변경 없음), picker 의 overlay state 를
      // 비워둔 채 openDetail 이 자기 state 를 push 하게 함.
      // 이렇게 하면 back 한 번에 detail 닫고 feed 탭으로 깔끔하게 돌아감.
      closeFeedPickerInternal();
      if (history.state?.overlay === 'feedPicker') {
        history.replaceState(null, '');
      }
      const full = (state.allCards || []).find((c) => c.card_id === card.card_id) || card;
      setTimeout(() => openDetail(full), 200);
    } else {
      openFeedCompose(card);
    }
  });
  return node;
}

function openFeedCompose(card) {
  if (!card) return;
  state.composeCard = card;
  const w = card.works || {};
  fcTitle.textContent = displayTitle(w.title) || '—';
  const metaParts = [GENRE_LABEL[w.format] || w.format, w.author, w.release_year].filter(Boolean);
  fcMeta.textContent = metaParts.join(' · ').toUpperCase();
  fcEdition.textContent = card.card_id != null ? `#${card.card_id}` : '';
  fcInput.value = '';
  updateFcCounter();
  // picker 가 떠 있던 상태 → picker 내부적으로만 hide (history 변경 없음).
  closeFeedPickerInternal();
  feedComposeModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // picker 의 history state 를 compose 로 교체 — back 한 번에 compose 만 닫고 feed 탭으로 돌아감.
  if (history.state?.overlay === 'feedPicker') {
    history.replaceState({ overlay: 'feedCompose' }, '');
  } else {
    history.pushState({ overlay: 'feedCompose' }, '');
  }
  setTimeout(() => { try { fcInput.focus(); } catch {} }, 60);
}

function closeFeedCompose() {
  if (feedComposeModal.style.display === 'flex' && history.state?.overlay === 'feedCompose') {
    history.back();
  } else {
    closeFeedComposeInternal();
  }
}
function closeFeedComposeInternal() {
  feedComposeModal.style.display = 'none';
  state.composeCard = null;
  restoreScrollIfClosed();
}

function updateFcCounter() {
  const len = (fcInput.value || '').length;
  fcCounter.textContent = `${len}/300자`;
}

async function submitFeedPost() {
  if (state.feedSubmitting) return;
  if (state.isAnonymous) { toast('로그인이 필요합니다'); return; }
  const card = state.composeCard;
  if (!card || card.card_id == null || !state.userId) return;
  const body = String(fcInput.value || '').trim();
  if (!body) { toast('내용을 입력해주세요'); return; }
  state.feedSubmitting = true;
  fcSubmit.disabled = true;
  try {
    const sb = await getSupabase();
    const payload = {
      card_id: card.card_id,
      user_id: state.userId,
      author_nickname: state.userNickname || null,
      body,
    };
    const { data, error } = await sb
      .from('feed_posts')
      .insert(payload)
      .select('post_id, card_id, user_id, author_nickname, body, created_at')
      .single();
    if (error) throw error;
    track('feed_post_submitted', { card_id: card.card_id });
    // insert 응답엔 조인이 없으므로 작성에 쓴 카드 정보를 붙여 즉시 렌더
    const enriched = { ...data, cards: { card_id: card.card_id, quote: card.quote, works: card.works } };
    state.feedPosts.unshift(enriched);
    // 제출 성공 → history back 으로 자연스럽게 닫기 (state 정리 포함)
    if (feedComposeModal.style.display === 'flex' && history.state?.overlay === 'feedCompose') {
      history.back();
    } else {
      closeFeedComposeInternal();
    }
    state.feedCategory = 'today';
    renderFeed();
    toast('피드에 올렸어요');
  } catch (err) {
    console.warn('[m] submitFeedPost failed:', err);
    toast('등록 실패: ' + (err.message || ''));
  } finally {
    state.feedSubmitting = false;
    fcSubmit.disabled = false;
  }
}

// 피드 카드 탭 시 뜨는 명대사 한 줄 팝업 (홈에서 보여지는 한 줄과 동일)
function openFeedQuote(card) {
  if (!card) return;
  const w = card.works || {};
  fqQuote.textContent = cleanQuote(card.quote) || '명대사 준비 중';
  const src = [displayTitle(w.title), w.author].filter(Boolean).join(' · ');
  fqSource.textContent = src ? `— ${src}` : '';
  feedQuoteModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // back 으로 닫히게 history 한 칸 push
  history.pushState({ overlay: 'feedQuote' }, '');
}
function closeFeedQuote() {
  if (feedQuoteModal.style.display === 'flex' && history.state?.overlay === 'feedQuote') {
    history.back();
  } else {
    closeFeedQuoteInternal();
  }
}
function closeFeedQuoteInternal() {
  feedQuoteModal.style.display = 'none';
  document.body.style.overflow = '';
}

// ===== 피드 글 상세 + 댓글 (FeedPostDetailSheet / FeedPostDetailViewModel 미러) =====
// 평면 댓글(답글·좋아요 없음). card_comments 와 동일 RLS 패턴이라 인증은 그대로 동작.
function isRealFeedPost(post) {
  // FEED_SAMPLES 의 post_id 는 's1' 등 비숫자 → 실제 글(숫자)만 댓글 가능
  return !!post && /^\d+$/.test(String(post.post_id));
}

function paintFeedCommentForm() {
  if (!fpCommentLogin || !fpCommentForm) return;
  const anon = state.isAnonymous;
  fpCommentLogin.style.display = anon ? 'block' : 'none';
  fpCommentForm.style.display = anon ? 'none' : 'block';
}

function updateFpCounter() {
  if (!fpCommentInput || !fpCommentCounter) return;
  fpCommentCounter.textContent = `${(fpCommentInput.value || '').length} / 500`;
}

function openFeedPostDetail(post) {
  if (!post || !feedpostScreen) return;
  state.detailType = 'post';
  state.currentFeedPost = post;
  state.currentHighlight = null;
  if (feedFab) feedFab.style.display = 'none';   // 댓글 화면에서는 글쓰기 말풍선 숨김
  hideBottomNavCat();   // 피드 카드 상세에서는 하단바 cat 숨김
  /* 명대사 박스 — 하이라이트 모드에서 innerHTML 을 '카드 보기' 로 덮어썼을 수 있으므로 항상 원본 형태로 복원.
     원본 element 들(fpQuote 등) 이 stale 될 수 있어 매번 fresh query 로 set. */
  const quoteBox = document.querySelector('#feedpost-body > div:first-child');
  if (quoteBox) {
    quoteBox.style.display = '';
    quoteBox.innerHTML = `
      <p id="fp-quote" class="t-headline-md c-espresso" style="line-height:1.5;"></p>
      <p id="fp-source" class="t-label-sm c-walnut" style="margin-top:16px;letter-spacing:0.1em;"></p>
      <button id="fp-open-card" class="sharp-btn" style="width:100%;margin-top:24px;">명대사 읽어보기</button>
    `;
    quoteBox.querySelector('#fp-open-card')?.addEventListener('click', openCardFromFeedPost);
  }
  const highlightCardViewBtn = document.getElementById('fp-highlight-card-view');
  if (highlightCardViewBtn) highlightCardViewBtn.style.display = 'none';
  const card = post.cards || {};
  const w = card.works || {};
  const fpQuoteEl = document.getElementById('fp-quote');
  if (fpQuoteEl) fpQuoteEl.textContent = cleanQuote(card.quote) || '명대사 준비 중';
  const src = [displayTitle(w.title), w.author].filter(Boolean).join(' · ');
  const fpSourceEl = document.getElementById('fp-source');
  if (fpSourceEl) fpSourceEl.textContent = src ? `— ${src}` : '';
  if (fpAuthor) fpAuthor.textContent = post.author_nickname || '익명';
  if (fpDate) fpDate.textContent = formatBookmarkDate(post.created_at) || formatRelativeTime(post.created_at);
  if (fpBody) fpBody.textContent = post.body || '';
  paintFeedCommentForm();
  if (fpCommentInput) fpCommentInput.value = '';
  updateFpCounter();
  state.feedPostComments = [];
  renderFeedComments();
  history.pushState({ overlay: 'feedPost' }, '');
  /* Bottom sheet 모드 — 피드 chips 까지 보이도록 시트 top 을 chips.bottom 위치로.
     상단(masthead + 제목 + chips)은 안 가리고 시트가 그 아래부터 슬라이드업. */
  positionFeedPostSheet();
  feedpostScreen.style.display = 'flex';
  if (feedpostBody) feedpostBody.scrollTop = 0;
  requestAnimationFrame(() => feedpostScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  track('feed_post_opened', { post_id: post.post_id });
  if (isRealFeedPost(post)) {
    loadFeedComments(post.post_id).catch((e) => console.warn('[m] loadFeedComments failed:', e));
  }
}

// 하이라이트 상세 — 안드 HighlightDetailSheet 매칭 (책표지 + 발췌 + 출처 + "카드 보기").
function openHighlightDetail(highlight) {
  if (!highlight || !feedpostScreen) return;
  const card = highlight.cards || {};
  const w = card.works || {};
  state.detailType = 'highlight';
  state.currentHighlight = highlight;
  state.currentFeedPost = null;
  hideBottomNavCat();   // 하이라이트 상세에서도 하단바 cat 숨김 (feedFab 은 아래에서 hide)
  // 명대사 박스(card-warm 배경)를 안드 HighlightContentCard 구조로 재구성:
  //   책표지(120x170 cover_url 또는 가죽색 폴백) + selected_text(큰 serif) + 출처 + '카드 읽어보기' 버튼
  // ⚠️ fresh query — 모듈 상단 fpQuote 변수가 stale 될 수 있어(openFeedPostDetail 이
  // quoteBox.innerHTML 으로 교체) 매번 #feedpost-body 첫 자식을 새로 찾는다.
  const quoteBox = document.querySelector('#feedpost-body > div:first-child');
  if (quoteBox) {
    quoteBox.style.display = '';
    const title = displayTitle(w.title || '');
    const author = w.author || '';
    const source = [title, author].filter(Boolean).join(' · ');
    const coverHTML = w.cover_url
      ? `<div style="width:120px;height:170px;margin:0 auto;background:${leatherColorFor(title)};overflow:hidden;box-shadow:0 4px 14px rgba(60,40,20,0.3);border-radius:2px;">
          <img src="${escapeHtml(w.cover_url)}" alt="${escapeHtml(title)}" loading="lazy"
            onerror="this.outerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:10px;\\'><span style=\\'font-family:Noto Serif KR,serif;color:#FAF8F2;font-weight:600;font-size:14px;text-align:center;line-height:1.3;text-shadow:0 1px 2px rgba(0,0,0,0.45);\\'>${escapeHtml(title).replace(/'/g, "&#39;")}</span></div>'"
            style="width:100%;height:100%;object-fit:cover;display:block;" />
        </div>`
      : `<div style="width:120px;height:170px;margin:0 auto;background:${leatherColorFor(title)};display:flex;align-items:center;justify-content:center;padding:10px;box-shadow:0 4px 14px rgba(60,40,20,0.3);border-radius:2px;">
          <span style="font-family:'Noto Serif KR',serif;color:#FAF8F2;font-weight:600;font-size:14px;text-align:center;line-height:1.3;text-shadow:0 1px 2px rgba(0,0,0,0.45);">${escapeHtml(title)}</span>
        </div>`;
    /* 발췌 텍스트 — 피드 목록의 .hl-quote .fold-text 와 완전히 동일한 형식 유지:
       text-align inherit (left) + white-space:pre-wrap + word-break:keep-all + 명조체.
       100자 / 3줄 이상이면 접기·펴기 — 글로벌 .fold-btn delegation 가 토글 처리. */
    const selText = String(highlight.selected_text || '');
    const safeQuote = renderMarkdownBold(selText);
    const needFold = selText.length > 100 || (selText.match(/\n/g) || []).length >= 3;
    const quoteStyle = `font-family:'Nanum Myeongjo','Noto Serif KR',Georgia,serif;font-size:15px;line-height:28px;color:var(--espresso);margin:0;white-space:pre-wrap;word-break:keep-all;`;
    const quoteHTML = needFold
      ? `<div class="fold-wrap"><p id="fp-quote" class="fold-text" style="${quoteStyle}">${safeQuote}</p><button type="button" class="fold-btn visible" style="display:block;margin:8px auto 0;">더 보기</button></div>`
      : `<p id="fp-quote" style="${quoteStyle}">${safeQuote}</p>`;
    quoteBox.innerHTML = `
      ${coverHTML}
      <div style="height:22px;"></div>
      ${quoteHTML}
      ${source ? `<div style="height:16px;"></div><p id="fp-source" class="t-label-sm c-walnut" style="letter-spacing:0.1em;text-align:center;margin:0;">— ${escapeHtml(source)}</p>` : '<p id="fp-source" style="display:none;"></p>'}
      <div style="height:24px;"></div>
      <button id="fp-open-card" class="sharp-btn" style="width:100%;">카드 읽어보기</button>
    `;
    // 클릭 핸들러는 #feedpost-screen 의 위임 리스너가 일괄 처리 → 여기선 등록 X
    //  (quoteBox.innerHTML 재설정으로 element 가 자주 교체돼도 안정적으로 동작)
  }
  if (fpAuthor) fpAuthor.textContent = highlight.author_nickname || '익명';
  if (fpDate) fpDate.textContent = formatBookmarkDate(highlight.created_at) || formatRelativeTime(highlight.created_at);
  if (feedFab) feedFab.style.display = 'none';   // 댓글 화면에서는 글쓰기 말풍선 숨김
  // fp-body = 작성자 메모(user_note)만 — selected_text 는 위 박스에 이미 표시
  if (fpBody) {
    fpBody.textContent = (highlight.user_note || '').trim();
  }
  // 카드 보기는 quoteBox 안에 들어갔으니 별도 fp-highlight-card-view 버튼은 숨김
  const highlightCardViewBtn = document.getElementById('fp-highlight-card-view');
  if (highlightCardViewBtn) highlightCardViewBtn.style.display = 'none';
  paintFeedCommentForm();
  if (fpCommentInput) { fpCommentInput.value = ''; fpCommentInput.placeholder = '이 하이라이트에 대한 생각을 남겨주세요…'; }
  updateFpCounter();
  state.highlightComments = [];
  state.highlightCommentLikes = new Map();
  state.highlightCommentLikedByMe = new Set();
  renderFeedComments();
  history.pushState({ overlay: 'feedPost' }, '');
  positionFeedPostSheet();
  feedpostScreen.style.display = 'flex';
  if (feedpostBody) feedpostBody.scrollTop = 0;
  requestAnimationFrame(() => feedpostScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
  track('highlight_opened', { highlight_id: highlight.highlight_id });
  loadHighlightComments(highlight.highlight_id).catch((e) => console.warn('[m] loadHighlightComments failed:', e));
}

async function loadHighlightComments(highlightId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('card_highlight_comments')
    .select('comment_id, highlight_id, user_id, parent_comment_id, author_nickname, body, created_at')
    .eq('highlight_id', highlightId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[m] highlight comments load error:', error.message); return; }
  if (!state.currentHighlight || String(state.currentHighlight.highlight_id) !== String(highlightId)) return;
  state.highlightComments = data || [];
  const commentIds = (data || []).map((c) => c.comment_id);
  state.highlightCommentLikes = new Map();
  state.highlightCommentLikedByMe = new Set();
  if (commentIds.length > 0) {
    try {
      const { data: likes } = await sb
        .from('card_highlight_comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);
      for (const l of (likes || [])) {
        state.highlightCommentLikes.set(l.comment_id, (state.highlightCommentLikes.get(l.comment_id) || 0) + 1);
        if (state.userId && l.user_id === state.userId) state.highlightCommentLikedByMe.add(l.comment_id);
      }
    } catch (e) { console.warn('[m] highlight comment likes load failed:', e); }
  }
  renderFeedComments();
}

async function loadFeedComments(postId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('feed_post_comments')
    .select('comment_id, post_id, user_id, parent_comment_id, author_nickname, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[m] feed comments load error:', error.message); return; }
  if (!state.currentFeedPost || String(state.currentFeedPost.post_id) !== String(postId)) return;
  state.feedPostComments = data || [];

  // 좋아요 — 댓글별 카운트 + 내가 누른 목록
  const commentIds = (data || []).map((c) => c.comment_id);
  state.feedPostCommentLikes = new Map();
  state.feedPostCommentLikedByMe = new Set();
  if (commentIds.length > 0) {
    try {
      const { data: likes } = await sb
        .from('feed_post_comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);
      for (const l of (likes || [])) {
        state.feedPostCommentLikes.set(l.comment_id, (state.feedPostCommentLikes.get(l.comment_id) || 0) + 1);
        if (state.userId && l.user_id === state.userId) state.feedPostCommentLikedByMe.add(l.comment_id);
      }
    } catch (e) { console.warn('[m] feed comment likes load failed:', e); }
  }
  renderFeedComments();
}

function renderFeedComments() {
  if (!fpCommentsList || !fpCommentsHeader) return;
  // type 분기 — highlight 면 highlight 데이터 사용, 아니면 feed_post
  const isHighlight = state.detailType === 'highlight';
  const list = isHighlight ? (state.highlightComments || []) : (state.feedPostComments || []);
  const likesMap = isHighlight ? state.highlightCommentLikes : state.feedPostCommentLikes;
  const likedByMe = isHighlight ? state.highlightCommentLikedByMe : state.feedPostCommentLikedByMe;
  fpCommentsHeader.textContent = `댓글 ${list.length}`;
  if (list.length === 0) {
    fpCommentsList.innerHTML = '';
    if (fpCommentsEmpty) fpCommentsEmpty.style.display = 'block';
    return;
  }
  if (fpCommentsEmpty) fpCommentsEmpty.style.display = 'none';

  // 트리 구성 — top-level은 parent_comment_id == null. 답글은 부모 아래 평면(2단 깊이 제한).
  const topLevel = list.filter((c) => c.parent_comment_id == null);
  const childrenOf = new Map();
  for (const c of list) {
    if (c.parent_comment_id == null) continue;
    let parentKey = c.parent_comment_id;
    // 답글의 답글은 최상위 부모 아래로 합침 (2단 깊이 제한)
    const parent = list.find((x) => x.comment_id === parentKey);
    if (parent && parent.parent_comment_id != null) parentKey = parent.parent_comment_id;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey).push(c);
  }

  const myUserId = state.userId;
  const renderOne = (c, isReply) => {
    const isMine = myUserId != null && c.user_id === myUserId;
    const nick = escapeHtml(c.author_nickname || '익명');
    const when = escapeHtml(formatRelativeTime(c.created_at));
    const body = escapeHtml(c.body || '');
    const likes = likesMap?.get(c.comment_id) || 0;
    const liked = likedByMe?.has(c.comment_id);
    const heart = `<button class="fp-like" data-comment-id="${c.comment_id}" style="background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px 6px;color:${liked ? 'var(--cta)' : 'var(--walnut)'};">
      <span class="material-symbols-outlined" style="font-size:16px;${liked ? 'font-variation-settings:\'FILL\' 1;' : ''}">favorite</span>
      <span style="font-size:11px;">${likes}</span>
    </button>`;
    const replyBtn = !isReply
      ? `<button class="fp-reply" data-comment-id="${c.comment_id}" style="background:transparent;border:none;cursor:pointer;color:var(--walnut);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;padding:4px 6px;">답글</button>`
      : '';
    const del = isMine
      ? `<button class="fp-comment-delete" data-comment-id="${c.comment_id}" style="background:transparent;border:none;cursor:pointer;color:var(--walnut);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;padding:4px 6px;">삭제</button>`
      : '';
    const indent = isReply ? 'margin-left:28px;border-left:2px solid var(--latte);padding-left:12px;' : '';
    return `<div style="border:0.5px solid var(--latte);background:var(--paper);padding:12px 14px;${indent}">`
      + `<div style="display:flex;justify-content:space-between;align-items:center;">`
      + `<span class="t-body-md c-espresso" style="font-weight:600;">${isReply ? '↳ ' : ''}${nick}</span>`
      + `<span class="t-label-sm c-walnut">${when}</span>`
      + `</div>`
      + `<p class="t-body-md c-espresso" style="margin:6px 0 8px;white-space:pre-wrap;word-break:keep-all;">${body}</p>`
      + `<div style="display:flex;justify-content:space-between;align-items:center;">`
      + `<div style="display:flex;gap:4px;">${heart}${replyBtn}</div>`
      + `<div>${del}</div>`
      + `</div>`
      + `</div>`;
  };

  const blocks = [];
  for (const c of topLevel) {
    blocks.push(renderOne(c, false));
    const replies = childrenOf.get(c.comment_id) || [];
    for (const r of replies) blocks.push(renderOne(r, true));
  }
  fpCommentsList.innerHTML = blocks.join('');

  fpCommentsList.querySelectorAll('.fp-comment-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) deleteFeedComment(id);
    });
  });
  fpCommentsList.querySelectorAll('.fp-like').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) toggleFeedCommentLike(id);
    });
  });
  fpCommentsList.querySelectorAll('.fp-reply').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.commentId, 10);
      if (!Number.isNaN(id)) startFeedReply(id);
    });
  });
}

function startFeedReply(commentId) {
  state.replyingToFeedCommentId = commentId;
  const isHighlight = state.detailType === 'highlight';
  const list = isHighlight ? (state.highlightComments || []) : (state.feedPostComments || []);
  const target = list.find((c) => c.comment_id === commentId);
  const nick = target?.author_nickname || '익명';
  if (fpCommentInput) {
    fpCommentInput.placeholder = `@${nick} 에게 답글⋯`;
    fpCommentInput.focus();
  }
}

async function toggleFeedCommentLike(commentId) {
  if (state.isAnonymous || !state.userId) { toast('로그인이 필요합니다'); return; }
  const isHighlight = state.detailType === 'highlight';
  const table = isHighlight ? 'card_highlight_comment_likes' : 'feed_post_comment_likes';
  const likesMap = isHighlight ? state.highlightCommentLikes : state.feedPostCommentLikes;
  const likedSet = isHighlight ? state.highlightCommentLikedByMe : state.feedPostCommentLikedByMe;
  const liked = likedSet?.has(commentId);
  try {
    const sb = await getSupabase();
    if (liked) {
      const { error } = await sb.from(table)
        .delete().eq('comment_id', commentId).eq('user_id', state.userId);
      if (error) throw error;
      likedSet.delete(commentId);
      likesMap.set(commentId, Math.max(0, (likesMap.get(commentId) || 1) - 1));
    } else {
      const { error } = await sb.from(table)
        .insert({ comment_id: commentId, user_id: state.userId });
      if (error) throw error;
      likedSet.add(commentId);
      likesMap.set(commentId, (likesMap.get(commentId) || 0) + 1);
    }
    renderFeedComments();
  } catch (err) {
    console.warn('[m] toggleFeedCommentLike failed:', err);
    toast('좋아요 처리 실패');
  }
}

async function submitFeedComment() {
  if (state.feedCommentSubmitting) return;
  if (state.isAnonymous) { toast('로그인이 필요합니다'); return; }
  const isHighlight = state.detailType === 'highlight';
  const item = isHighlight ? state.currentHighlight : state.currentFeedPost;
  if (!item || !state.userId) return;
  if (!isHighlight && !isRealFeedPost(item)) return;
  const body = String(fpCommentInput.value || '').trim();
  if (!body) { toast('내용을 입력해주세요'); return; }
  state.feedCommentSubmitting = true;
  if (fpCommentSubmit) fpCommentSubmit.disabled = true;
  try {
    const sb = await getSupabase();
    const table = isHighlight ? 'card_highlight_comments' : 'feed_post_comments';
    const fkField = isHighlight ? 'highlight_id' : 'post_id';
    const fkValue = isHighlight ? item.highlight_id : item.post_id;
    const payload = { [fkField]: fkValue, user_id: state.userId, author_nickname: state.userNickname || null, body };
    if (state.replyingToFeedCommentId) payload.parent_comment_id = state.replyingToFeedCommentId;
    const selectCols = isHighlight
      ? 'comment_id, highlight_id, user_id, parent_comment_id, author_nickname, body, created_at'
      : 'comment_id, post_id, user_id, parent_comment_id, author_nickname, body, created_at';
    const { data, error } = await sb.from(table).insert(payload).select(selectCols).single();
    if (error) throw error;
    track(isHighlight ? 'highlight_comment_submitted' : 'feed_comment_submitted', { is_reply: !!payload.parent_comment_id });
    fpCommentInput.value = '';
    fpCommentInput.placeholder = '댓글을 남겨주세요';
    state.replyingToFeedCommentId = null;
    updateFpCounter();
    if (data) {
      if (isHighlight) {
        if (!(state.highlightComments || []).find((c) => c.comment_id === data.comment_id)) {
          state.highlightComments = [...(state.highlightComments || []), data];
        }
      } else {
        if (!(state.feedPostComments || []).find((c) => c.comment_id === data.comment_id)) {
          state.feedPostComments = [...(state.feedPostComments || []), data];
        }
      }
      renderFeedComments();
    }
  } catch (err) {
    console.warn('[m] submitFeedComment failed:', err);
    toast('댓글 작성 실패: ' + (err.message || ''));
  } finally {
    state.feedCommentSubmitting = false;
    if (fpCommentSubmit) fpCommentSubmit.disabled = false;
  }
}

async function deleteFeedComment(commentId) {
  if (state.isAnonymous || !state.userId) return;
  if (!(await appConfirm({ title: '댓글 삭제', message: '이 댓글을 삭제할까요?', confirmLabel: '삭제' }))) return;
  const isHighlight = state.detailType === 'highlight';
  const table = isHighlight ? 'card_highlight_comments' : 'feed_post_comments';
  try {
    const sb = await getSupabase();
    const { error } = await sb.from(table)
      .delete().eq('comment_id', commentId).eq('user_id', state.userId);
    if (error) throw error;
    if (isHighlight) {
      state.highlightComments = (state.highlightComments || []).filter((c) => c.comment_id !== commentId);
    } else {
      state.feedPostComments = (state.feedPostComments || []).filter((c) => c.comment_id !== commentId);
    }
    renderFeedComments();
  } catch (err) {
    console.warn('[m] deleteFeedComment failed:', err);
    toast('삭제 실패: ' + (err.message || ''));
  }
}

/* Bottom sheet 위치 — 피드 chips.bottom 으로 top 동적 설정. 피드 view 가 아니거나
   chips 가 안 보이면 inset:0 기본(전체화면) 유지. */
function positionFeedPostSheet() {
  if (!feedpostScreen) return;
  if (state.currentView !== 'feed') { feedpostScreen.style.top = ''; return; }
  const chips = document.getElementById('feed-chips');
  if (!chips) { feedpostScreen.style.top = ''; return; }
  const bottom = chips.getBoundingClientRect().bottom;
  feedpostScreen.style.top = Math.max(0, bottom) + 'px';
}

function closeFeedPostDetailInternal() {
  if (!feedpostScreen) return;
  feedpostScreen.classList.remove('open');
  /* 다음 진입(다른 view 일 수도)에서 정확히 분기되게 top 리셋 */
  feedpostScreen.style.top = '';
  // 하단바 cat 복귀 — view 기준 (피드면 cat_pen, 그 외 cat_today)
  showBottomNavCat();
  updateBottomNavCatForView(state.currentView);
  setTimeout(() => {
    feedpostScreen.style.display = 'none';
    document.body.style.overflow = '';
    // type 리셋 — 다음 진입 시 정확히 분기되게
    state.detailType = null;
    state.currentHighlight = null;
    // 펜 fab — 항상 syncFeedFab 로 통일 (다른 오버레이가 열려있으면 hide 유지)
    syncFeedFab();
  }, 250);
  state.currentFeedPost = null;
}
function closeFeedPostDetail() {
  if (history.state && history.state.overlay === 'feedPost') {
    history.back();
  } else {
    closeFeedPostDetailInternal();
  }
}

// "명대사 읽어보기" → 카드 상세 (오버레이 닫고 openDetail; picker→detail 핸드오프 패턴)
function openCardFromFeedPost() {
  const post = state.currentFeedPost;
  if (!post) return;
  const card = post.cards || {};
  const full = (state.allCards || []).find((c) => c.card_id === post.card_id) || card;
  closeFeedPostDetailInternal();
  if (history.state?.overlay === 'feedPost') {
    history.replaceState(null, '');
  }
  setTimeout(() => openDetail(full), 200);
}

if (feedFab) feedFab.addEventListener('click', openFeedPicker);
if (archiveFab) archiveFab.addEventListener('click', () => {
  /* (구) 라이브러리 우측 fab — 사용자 요청으로 제거. element 없으면 이 listener 도 안 등록. */
  try { openBookmarksScreen(); } catch (e) { console.warn('[m] openBookmarksScreen failed:', e); }
});

/* 비밀번호 찾기 — 로그인 모달의 '비밀번호를 잊으셨나요' 클릭. ID 입력받아 RPC 로
   해당 사용자의 auth.users.email 조회 후 resetPasswordForEmail 발송. */
document.getElementById('signin-forgot-btn')?.addEventListener('click', async () => {
  const id = (signinIdInput?.value || '').trim() || prompt('가입했던 아이디를 입력해주세요');
  if (!id) return;
  try {
    const sb = await getSupabase();
    const { data: email, error } = await sb.rpc('find_email_by_login_id', { p_login_id: id });
    if (error) throw error;
    if (!email) { toast('해당 아이디로 가입된 계정이 없어요'); return; }
    if (String(email).endsWith('@user.local')) {
      toast('이메일 정보가 없어 비밀번호 재설정이 불가합니다. 관리자에게 문의해주세요.');
      return;
    }
    const { error: resetError } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/m/`,
    });
    if (resetError) throw resetError;
    toast(`${email} 로 재설정 링크를 보냈어요. 이메일을 확인해주세요.`);
  } catch (e) {
    console.warn('[m] reset password failed:', e);
    toast('전송 실패: ' + (e.message || e));
  }
});

/* 비밀번호 변경 — 로컬 회원 전용. 본인 인증 위해 로그인 ID 입력 → state.userLoginId 와
   일치 확인 → 등록된 이메일로 reset 링크 발송 (resetPasswordForEmail). */
document.getElementById('change-password-btn')?.addEventListener('click', async () => {
  if (state.isAnonymous || !state.userId) { toast('로그인 후 사용할 수 있어요'); return; }
  const isSocial = state.authProvider === 'google' || state.authProvider === 'kakao';
  if (isSocial) { toast('소셜 로그인은 해당 서비스에서 비밀번호를 관리해주세요'); return; }
  const inputId = prompt('본인 확인을 위해 로그인 아이디를 입력해주세요');
  if (!inputId) return;
  if (inputId.trim() !== (state.userLoginId || '')) { toast('아이디가 일치하지 않습니다'); return; }
  try {
    const sb = await getSupabase();
    const { data: email, error } = await sb.rpc('find_email_by_login_id', { p_login_id: inputId.trim() });
    if (error) throw error;
    if (!email) { toast('이메일 정보를 찾을 수 없어요'); return; }
    if (String(email).endsWith('@user.local')) {
      toast('등록된 이메일이 없어요. 프로필 편집에서 이메일을 먼저 등록해주세요');
      return;
    }
    const { error: resetError } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/m/`,
    });
    if (resetError) throw resetError;
    toast(`${email} 로 비밀번호 재설정 링크를 보냈어요`);
  } catch (e) {
    console.warn('[m] change password (reset email) failed:', e);
    toast('전송 실패: ' + (e.message || e));
  }
});
/* top-bar 의 북마크 버튼 — 모든 view 에서 노출, 내 북마크 책꽂이로 바로 이동. */
document.getElementById('top-bookmark-btn')?.addEventListener('click', () => {
  try { openBookmarksScreen(); } catch (e) { console.warn('[m] openBookmarksScreen failed:', e); }
});

/* 라이브러리 정렬 토글 — 가나다순 ⇄ 최신등록순 (안드 LibraryScreen SortToggle 미러) */
document.getElementById('archive-sort-toggle')?.addEventListener('click', () => {
  state.archiveSort = (state.archiveSort === 'latest') ? 'alpha' : 'latest';
  try { localStorage.setItem('ds.archiveSort', state.archiveSort); } catch {}
  state.archivePage = 1;   // 정렬 바뀌면 첫 페이지로
  try { track('library_sorted', { sort: state.archiveSort }); } catch {}
  if (typeof renderArchive === 'function') renderArchive();
});

// 안드 DetailScreen 하단 두 버튼 — 북마크하고 오늘의 한줄 작성 / 라이브러리 진입
$('#detail-post-oneliner')?.addEventListener('click', async () => {
  const card = state.detailCard;
  if (!card) return;
  // 북마크 보장 — 안 됐으면 토글 (fire-and-forget)
  const isBookmarked = (state.bookmarks || []).some((b) => b?.card_id === card.card_id);
  if (!isBookmarked) {
    try { await toggleBookmark(card.card_id); } catch {}
  }
  if (state.isAnonymous) { toast('로그인 후 나의 감상평을 남길 수 있어요.'); return; }
  track('detail_post_oneliner', { card_id: card.card_id });
  openFeedCompose(card);
});
/* 상단 우측 공유 아이콘 — '오늘의 명대사 공유하기' 버튼과 동일 동작 (단순 위임). */
document.getElementById('detail-share-btn')?.addEventListener('click', () => {
  document.getElementById('detail-go-library')?.click();
});

$('#detail-go-library')?.addEventListener('click', () => {
  const card = state.detailCard;
  if (!card) return;
  track('detail_share_click', { card_id: card.card_id });
  /* 카드 상세에서 바로 공유 모달 열기 — detail-share 버튼이 없어 payload 직접 구성 후 openShareModal. */
  try {
    const w = card.works || {};
    const meta = (typeof shareMetaLinesFromWork === 'function') ? shareMetaLinesFromWork(w) : { metaKo: '', metaEn: '' };
    openShareModal({
      cardId: card.card_id,
      quote: card.quote || '',
      speaker: card.speaker || '',
      work: w.title || '',
      workId: w.work_id ?? null,
      author: w.author || '',
      metaKo: meta.metaKo, metaEn: meta.metaEn,
      coverUrl: w.cover_url || '',
    });
  } catch (e) { console.warn('[m] open share from detail failed:', e); toast('공유 화면을 열 수 없어요'); }
});
if (feedPickerClose) feedPickerClose.addEventListener('click', closeFeedPicker);
if (feedComposeClose) feedComposeClose.addEventListener('click', closeFeedCompose);
if (feedPickerModal) feedPickerModal.addEventListener('click', (e) => { if (e.target === feedPickerModal) closeFeedPicker(); });
if (feedComposeModal) feedComposeModal.addEventListener('click', (e) => { if (e.target === feedComposeModal) closeFeedCompose(); });
if (feedQuoteModal) feedQuoteModal.addEventListener('click', closeFeedQuote);  // 아무 곳이나 탭하면 닫힘
if (fcInput) fcInput.addEventListener('input', updateFcCounter);
if (fcSubmit) fcSubmit.addEventListener('click', submitFeedPost);

// 피드 글 상세 + 댓글 wiring
if (feedpostBack) feedpostBack.addEventListener('click', closeFeedPostDetail);
// #fp-open-card 클릭 — 이벤트 위임(#feedpost-screen 에 한 번만 등록).
//   quoteBox.innerHTML 으로 element 가 새로 만들어져도 항상 잡힘.
//   currentHighlight 가 있으면 하이라이트 모드, currentFeedPost 면 피드 글 모드로 분기.
document.getElementById('feedpost-screen')?.addEventListener('click', (e) => {
  if (!e.target.closest('#fp-open-card')) return;
  if (state.currentHighlight) {
    const h = state.currentHighlight;
    const cardObj = (state.allCards || []).find((c) => c && c.card_id === h.card_id);
    const target = cardObj || { card_id: h.card_id, ...(h.cards || {}) };
    try { track('highlight_card_view', { highlight_id: h.highlight_id, card_id: h.card_id }); } catch {}
    closeFeedPostDetailInternal();
    if (history.state?.overlay === 'feedPost') history.replaceState(null, '');
    setTimeout(() => openDetail(target), 200);
    return;
  }
  if (state.currentFeedPost) { openCardFromFeedPost(); return; }
});
$('#fp-highlight-card-view')?.addEventListener('click', () => {
  const h = state.currentHighlight;
  if (!h) return;
  // state.allCards 에서 카드 객체 찾아 openDetail — 실타래 + 3일 unlock 자동 적용
  const card = (state.allCards || []).find((c) => c && c.card_id === h.card_id);
  if (!card) {
    // 폴백 — highlight.cards 미니멈 객체로 openDetail (실타래 게이트만 동작)
    openDetail({ card_id: h.card_id, ...(h.cards || {}) });
    return;
  }
  track('highlight_card_view', { highlight_id: h.highlight_id, card_id: h.card_id });
  openDetail(card);
});
if (fpCommentInput) fpCommentInput.addEventListener('input', updateFpCounter);
if (fpCommentSubmit) fpCommentSubmit.addEventListener('click', submitFeedComment);

// ============================================================================
// HIGHLIGHT 기능
// ============================================================================

// ============================================================================
// 본문 커스텀 선택 (Android·iOS 시스템 텍스트 메뉴 우회)
// ----------------------------------------------------------------------------
// CSS 에서 터치 단말은 user-select:none. 네이티브 선택 자체를 못 하게 해
// OS·브라우저의 텍스트 작업 메뉴(구글 검색·복사·공유) 자체가 트리거되지 않는다.
// 대신 여기서 long-press → 단어 선택 → 드래그 확장을 직접 구현.
// 컨텍스트 메뉴·복사 이벤트도 같이 막아 데스크톱에서도 우리 + HL 만 의미 있게 함.
// 외부에서 window.__getScriptHlText() / window.__clearScriptHl() 로 접근.
// ============================================================================
(function setupTouchHighlight() {
  const scriptEl = document.getElementById('detail-script');
  if (!scriptEl) return;

  // -- 컨텍스트 메뉴·복사·드래그 차단 (데스크톱 우클릭 포함) -----------------
  scriptEl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  ['copy', 'cut', 'paste'].forEach((evt) =>
    scriptEl.addEventListener(evt, (e) => e.preventDefault())
  );
  scriptEl.addEventListener('dragstart', (e) => e.preventDefault());

  // -- selection 오버레이 (body 직속 fixed — innerHTML 재할당에도 살아남음) --
  let overlay = document.getElementById('hl-selection-layer');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'hl-selection-layer';
    document.body.appendChild(overlay);
  }

  let lpTimer = null;
  let startPoint = null;
  let isSelecting = false;
  let anchor = null;   // {node, offset}
  let focus = null;
  const LONG_PRESS_MS = 500;
  const MOVE_CANCEL_PX = 12;

  function caretFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r && r.startContainer && r.startContainer.nodeType === 3 && scriptEl.contains(r.startContainer)) {
        return { node: r.startContainer, offset: r.startOffset };
      }
    }
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p && p.offsetNode && p.offsetNode.nodeType === 3 && scriptEl.contains(p.offsetNode)) {
        return { node: p.offsetNode, offset: p.offset };
      }
    }
    // iOS WebKit: user-select:none(@media pointer:coarse) 인 .script-mono 위에서는
    // 위 두 caret API 가 null 또는 바깥 노드를 반환한다. Range 글자 단위 hit-test 는
    // user-select 와 무관하게 동작하므로, 좌표에 닿는(없으면 가장 가까운) 글자를 직접 찾는다.
    return caretFromPointFallback(x, y);
  }

  function caretFromPointFallback(x, y) {
    const walker = document.createTreeWalker(scriptEl, NodeFilter.SHOW_TEXT, null);
    const probe = document.createRange();
    let best = null, bestDist = Infinity, node;
    while ((node = walker.nextNode())) {
      const len = (node.textContent || '').length;
      for (let i = 0; i < len; i++) {
        probe.setStart(node, i);
        probe.setEnd(node, i + 1);
        for (const rc of probe.getClientRects()) {
          if (rc.width === 0 && rc.height === 0) continue;
          if (y >= rc.top && y <= rc.bottom && x >= rc.left && x <= rc.right) {
            return { node, offset: x < rc.left + rc.width / 2 ? i : i + 1 };
          }
          const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
          const d = (cx - x) ** 2 + (cy - y) ** 2;
          if (d < bestDist) { bestDist = d; best = { node, offset: x < cx ? i : i + 1 }; }
        }
      }
    }
    return best;
  }

  function expandToWord(point) {
    if (!point || point.node.nodeType !== 3) return null;
    const text = point.node.textContent || '';
    let pos = Math.max(0, Math.min(text.length, point.offset));
    // 공백 위 터치면 가장 가까운 글자로 스냅
    if (/\s/.test(text[pos] || '')) {
      if (pos > 0 && /\S/.test(text[pos - 1])) pos -= 1;
      else if (pos < text.length && /\S/.test(text[pos])) { /* ok */ }
      else return null;
    }
    let s = pos, e = pos;
    while (s > 0 && /\S/.test(text[s - 1])) s--;
    while (e < text.length && /\S/.test(text[e])) e++;
    if (s >= e) return null;
    return { startNode: point.node, startOffset: s, endNode: point.node, endOffset: e };
  }

  function buildRange() {
    if (!anchor || !focus) return null;
    const r = document.createRange();
    try {
      // anchor 가 focus 보다 뒤면 swap
      const tmp = document.createRange();
      tmp.setStart(anchor.node, anchor.offset); tmp.collapse(true);
      const tmp2 = document.createRange();
      tmp2.setStart(focus.node, focus.offset); tmp2.collapse(true);
      const cmp = tmp.compareBoundaryPoints(Range.START_TO_START, tmp2);
      if (cmp <= 0) {
        r.setStart(anchor.node, anchor.offset);
        r.setEnd(focus.node, focus.offset);
      } else {
        r.setStart(focus.node, focus.offset);
        r.setEnd(anchor.node, anchor.offset);
      }
      return r.collapsed ? null : r;
    } catch { return null; }
  }

  function renderOverlay() {
    overlay.innerHTML = '';
    const r = buildRange();
    if (!r) { hideHl(); return; }
    // 1) 형광펜 사각형 (라인별, viewport 좌표 그대로)
    const rects = r.getClientRects();
    for (const rect of rects) {
      if (rect.width === 0 && rect.height === 0) continue;
      const d = document.createElement('div');
      d.className = 'hl-rect';
      d.style.left   = rect.left   + 'px';
      d.style.top    = rect.top    + 'px';
      d.style.width  = rect.width  + 'px';
      d.style.height = rect.height + 'px';
      overlay.appendChild(d);
    }
    // 2) 끝점 caret
    try {
      const endRange = document.createRange();
      endRange.setStart(r.endContainer, r.endOffset);
      endRange.setEnd(r.endContainer, r.endOffset);
      const rcts = endRange.getClientRects();
      const last = rcts[rcts.length - 1] || (rects.length ? rects[rects.length - 1] : null);
      if (last) {
        const caret = document.createElement('div');
        caret.className = 'hl-edge';
        caret.style.left = (last.right) + 'px';
        caret.style.top = (last.top) + 'px';
        caret.style.height = Math.max(14, last.height) + 'px';
        overlay.appendChild(caret);
      }
    } catch {}
    showHl();
  }

  // 스크롤·리사이즈에도 오버레이가 따라오게
  const reposition = () => { if (anchor && focus) renderOverlay(); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  function showHl() {
    const btn = document.getElementById('hl-add-btn');
    if (!btn) return;
    if (detailScreen && detailScreen.classList.contains('open')) {
      btn.style.display = 'block';
    }
  }
  function hideHl() {
    const btn = document.getElementById('hl-add-btn');
    if (btn) btn.style.display = 'none';
  }

  function clearAll() {
    anchor = null; focus = null; isSelecting = false;
    overlay.innerHTML = '';
    hideHl();
  }

  // 외부 노출 — + HL 핸들러에서 호출
  window.__getScriptHlText = () => {
    const r = buildRange();
    return r ? r.toString().trim() : '';
  };
  window.__clearScriptHl = clearAll;

  // -- 터치 인터랙션 ---------------------------------------------------------
  scriptEl.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    startPoint = { x: t.clientX, y: t.clientY };
    // 새 long-press → 기존 선택 해제
    if (anchor) clearAll();
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      lpTimer = null;
      const p = caretFromPoint(startPoint.x, startPoint.y);
      const word = expandToWord(p);
      if (!word) return;
      anchor = { node: word.startNode, offset: word.startOffset };
      focus  = { node: word.endNode,   offset: word.endOffset };
      isSelecting = true;
      renderOverlay();
      try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
    }, LONG_PRESS_MS);
  }, { passive: true });

  scriptEl.addEventListener('touchmove', (e) => {
    if (!startPoint) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startPoint.x);
    const dy = Math.abs(t.clientY - startPoint.y);
    if (lpTimer && (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX)) {
      clearTimeout(lpTimer); lpTimer = null;
    }
    if (isSelecting) {
      const p = caretFromPoint(t.clientX, t.clientY);
      if (p) {
        focus = p;
        renderOverlay();
      }
      e.preventDefault();  // 선택 중에는 스크롤 잠금
    }
  }, { passive: false });

  ['touchend', 'touchcancel'].forEach((evt) =>
    scriptEl.addEventListener(evt, () => {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      startPoint = null;
      // 선택 자체는 유지 (+ HL 누를 때까지)
    }, { passive: true })
  );

  // 본문 바깥 탭하면 선택 해제 (+ HL 버튼 위 탭은 예외)
  document.addEventListener('touchstart', (e) => {
    if (scriptEl.contains(e.target)) return;
    const btn = document.getElementById('hl-add-btn');
    if (btn && btn.contains(e.target)) return;
    if (anchor) clearAll();
  }, true);

  // 상세화면이 닫히면 선택 정리
  if (typeof detailScreen !== 'undefined' && detailScreen) {
    new MutationObserver(() => {
      if (!detailScreen.classList.contains('open')) clearAll();
    }).observe(detailScreen, { attributes: true, attributeFilter: ['class'] });
  }
})();

// 데스크톱(native selection) fallback: 텍스트 선택되면 + HL 버튼 노출
// (터치 단말은 setupTouchHighlight 내부에서 직접 show/hide)
function updateHlButtonForSelection() {
  if (!hlAddBtn) return;
  if (!detailScreen || !detailScreen.classList.contains('open')) {
    hlAddBtn.style.display = 'none';
    return;
  }
  const customText = (typeof window.__getScriptHlText === 'function') ? window.__getScriptHlText() : '';
  if (customText) { hlAddBtn.style.display = 'block'; return; }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { hlAddBtn.style.display = 'none'; return; }
  const text = String(sel.toString() || '').trim();
  if (!text) { hlAddBtn.style.display = 'none'; return; }
  const scriptEl = document.getElementById('detail-script');
  if (!scriptEl) { hlAddBtn.style.display = 'none'; return; }
  const range = sel.getRangeAt(0);
  if (!scriptEl.contains(range.commonAncestorContainer)) {
    hlAddBtn.style.display = 'none';
    return;
  }
  hlAddBtn.style.display = 'block';
}

document.addEventListener('selectionchange', updateHlButtonForSelection);
document.addEventListener('mouseup', () => setTimeout(updateHlButtonForSelection, 30));

hlAddBtn?.addEventListener('click', () => {
  // 커스텀 selection(터치) 우선, 없으면 native(데스크톱) 사용
  let text = (typeof window.__getScriptHlText === 'function') ? window.__getScriptHlText() : '';
  let usedCustom = !!text;
  if (!text) {
    const sel = window.getSelection();
    text = sel ? String(sel.toString() || '').trim() : '';
  }
  if (!text) { toast('본문에서 텍스트를 선택해주세요'); return; }
  const cardId = state.detailCardId;
  const card = (state.allCards || []).find((c) => c.card_id === cardId);
  if (!card) { toast('카드 정보를 찾을 수 없어요'); return; }
  if (state.isAnonymous || !state.userId) { toast('로그인 후 사용할 수 있어요'); return; }

  state.draftHighlight = { card, selectedText: text };
  // 선택 해제
  if (usedCustom && typeof window.__clearScriptHl === 'function') window.__clearScriptHl();
  else { const s = window.getSelection(); if (s) s.removeAllRanges(); }
  hlAddBtn.style.display = 'none';
  openHlCompose();
});

// NEW HIGHLIGHT 페이지의 floating 공유 fab — draftHighlight.selectedText 로 공유 카드 생성.
// 모달 닫혀도 hl-compose-screen 그대로 유지(모달 자체가 별도 z-index 130).
document.getElementById('hl-compose-share')?.addEventListener('click', () => {
  const draft = state.draftHighlight;
  if (!draft || !draft.selectedText) { toast('하이라이트할 텍스트가 없어요'); return; }
  const card = draft.card || {};
  const w = card.works || {};
  openShareModal({
    cardId: card.card_id,
    quote: draft.selectedText,
    speaker: card.speaker || '',
    work: w.title || '',
    workId: w.work_id ?? null,
    author: w.author || '',
    coverUrl: w.cover_url || '',
  });
});

function openHlCompose() {
  if (!hlComposeScreen || !state.draftHighlight) return;
  const { card, selectedText } = state.draftHighlight;
  const w = card.works || {};
  const title = displayTitle(w.title) || '';
  const subtitle = w.subtitle ? String(w.subtitle).trim() : '';
  const author = w.author || '';
  const year = w.release_year ? String(w.release_year) : '';

  if (hlTitleEl) hlTitleEl.textContent = title || '제목 없음';
  if (hlSubtitleEl) {
    if (subtitle) { hlSubtitleEl.textContent = subtitle; hlSubtitleEl.style.display = 'block'; }
    else hlSubtitleEl.style.display = 'none';
  }
  if (hlAuthorYearEl) {
    hlAuthorYearEl.textContent = [author, year].filter(Boolean).join(' · ');
  }
  if (hlCardIdEl) hlCardIdEl.textContent = `#${String(card.card_id).padStart(5, '0')}`;
  if (hlCoverFallback) {
    /* cover_url 있으면 실제 책 표지 적용, 없으면 기존 가죽색 폴백 */
    const cu = w.cover_url || '';
    if (cu) {
      hlCoverFallback.textContent = '';
      hlCoverFallback.style.background = `#1B0D08 url("${cu}") center/cover no-repeat`;
      hlCoverFallback.style.color = 'transparent';
    } else {
      hlCoverFallback.textContent = subtitle || title || '';
      hlCoverFallback.style.background = 'linear-gradient(160deg,#B33A2E 0%,#7A1F15 100%)';
      hlCoverFallback.style.color = '#fff';
    }
  }
  if (hlSelectedTextEl) hlSelectedTextEl.textContent = selectedText;

  history.pushState({ overlay: 'hl-compose' }, '');
  hlComposeScreen.style.display = 'flex';
  requestAnimationFrame(() => hlComposeScreen.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeHlComposeInternal() {
  if (!hlComposeScreen) return;
  hlComposeScreen.classList.remove('open');
  setTimeout(() => {
    hlComposeScreen.style.display = 'none';
    document.body.style.overflow = '';
    state.draftHighlight = null;
  }, 250);
}

function closeHlCompose() {
  if (history.state && history.state.overlay === 'hl-compose') {
    history.back();
  } else {
    closeHlComposeInternal();
  }
}

hlComposeBack?.addEventListener('click', closeHlCompose);

hlComposeSave?.addEventListener('click', async () => {
  if (!state.draftHighlight) { closeHlComposeInternal(); return; }
  if (state.isAnonymous || !state.userId) { toast('로그인이 필요합니다'); return; }
  const { card, selectedText } = state.draftHighlight;
  if (!selectedText) { toast('본문 선택이 비어있어요'); return; }
  try {
    hlComposeSave.disabled = true;
    const sb = await getSupabase();
    let { error } = await sb.from('card_highlights').insert({
      card_id: card.card_id,
      user_id: state.userId,
      selected_text: selectedText,
      author_nickname: state.userNickname || null,
    });
    // 018 마이그레이션이 아직 안 돌아간 환경에서는 author_nickname 컬럼이 없음 →
    // 그 경우만 한 번 더 시도(저장 자체는 무조건 성공시킴).
    if (error && /author_nickname|schema cache/i.test(error.message || '')) {
      console.warn('[hl] author_nickname column missing, retrying without it');
      const retry = await sb.from('card_highlights').insert({
        card_id: card.card_id,
        user_id: state.userId,
        selected_text: selectedText,
      });
      error = retry.error;
    }
    if (error) throw error;
    toast('하이라이트 추가됨');
    closeHlComposeInternal();
    // 상세화면도 함께 닫고 피드 > 하이라이트로 이동
    if (detailScreen && detailScreen.classList.contains('open')) closeDetailInternal();
    setTimeout(() => {
      state.feedCategory = 'highlight';
      setView('feed');
    }, 280);
  } catch (err) {
    console.warn('[hl] save failed', err);
    toast('저장 실패: ' + (err.message || ''));
  } finally {
    hlComposeSave.disabled = false;
  }
});

// 피드 > 하이라이트 로드 + 렌더
async function loadAndRenderHighlights() {
  if (!highlightsList || !highlightsEmpty) return;
  highlightsEmpty.style.display = 'none';
  highlightsList.innerHTML = '<p class="t-body-md c-walnut" style="padding:8px 0;text-align:center;">불러오는 중⋯</p>';
  try {
    const sb = await getSupabase();
    let { data, error } = await sb
      .from('card_highlights')
      .select('highlight_id, card_id, user_id, selected_text, author_nickname, created_at, cards(card_id, works(work_id, title, subtitle, format, author, release_year, cover_url))')
      .order('created_at', { ascending: false })
      .limit(50);
    // 018 마이그레이션 안 돌아간 경우 author_nickname 빼고 재시도
    if (error && /author_nickname|schema cache/i.test(error.message || '')) {
      console.warn('[hl] author_nickname column missing, falling back select');
      const retry = await sb
        .from('card_highlights')
        .select('highlight_id, card_id, user_id, selected_text, created_at, cards(card_id, works(work_id, title, subtitle, format, author, release_year, cover_url))')
        .order('created_at', { ascending: false })
        .limit(50);
      data = retry.data; error = retry.error;
    }
    if (error) throw error;
    state.highlights = Array.isArray(data) ? data : [];
    renderHighlights();
  } catch (err) {
    console.warn('[hl] load failed', err);
    highlightsList.innerHTML = '';
    highlightsEmpty.style.display = 'block';
  }
}

function renderHighlights() {
  if (!highlightsList || !highlightsEmpty) return;
  const rows = state.highlights || [];
  if (rows.length === 0) {
    highlightsList.innerHTML = '';
    highlightsEmpty.style.display = 'block';
    return;
  }
  highlightsEmpty.style.display = 'none';
  highlightsList.innerHTML = '';
  for (const h of rows) {
    const w = h.cards?.works || {};
    const title = displayTitle(w.title) || '';
    const subtitle = w.subtitle ? String(w.subtitle).trim() : '';
    const author = w.author || '';
    const year = w.release_year || '';
    const nickname = h.author_nickname || '익명';
    const formatLabel = GENRE_LABEL[w.format] || w.format || '';
    const when = formatBookmarkDate(h.created_at) || '';
    const metaLine = [formatLabel, when].filter(Boolean).join(' · ');
    const coverColor = leatherColorFor(w.title || title);

    const cover = w.cover_url || '';
    const item = document.createElement('div');
    item.className = 'hl-card';
    item.style.position = 'relative';   /* 좋아요 버튼 absolute 기준 — 카드 우상단 고정 */
    item.innerHTML = `
      ${makeLikeHTML('highlight', h.highlight_id)}
      <div class="hl-card-head">
        <p class="nickname">${escapeHtml(nickname)}</p>
        ${metaLine ? `<p class="meta">${escapeHtml(metaLine)}</p>` : ''}
      </div>
      <div class="hl-bookcover" style="background:${coverColor};overflow:hidden;position:relative;">
        ${cover
          ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy"
              style="width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0;" />`
          : `<p class="bc-title">${escapeHtml(title)}</p>
            ${subtitle ? `<p class="bc-subtitle">${escapeHtml(subtitle)}</p>` : ''}
            ${author ? `<p class="bc-author">${escapeHtml(author)}</p>` : ''}`
        }
      </div>
      <!-- 책표지 바로 아래 — 제목 + 작가 (사용자 명세) -->
      <div class="hl-book-info" style="text-align:center;margin-top:10px;">
        <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:14px;color:var(--espresso);font-weight:600;line-height:1.3;">${escapeHtml(title)}</p>
        ${author ? `<p style="margin:3px 0 0;font-size:11px;color:var(--walnut);">${escapeHtml(author)}${year ? ' · ' + escapeHtml(String(year)) : ''}</p>` : ''}
      </div>
      <div class="hl-quote">
        <span class="open-q">“</span>
        ${makeFoldHTML(h.selected_text || '')}
        <span class="close-q">”</span>
      </div>
      <p class="hl-card-foot">#${String(h.card_id).padStart(5,'0')}</p>
    `;
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.like-btn, .fold-btn')) return;
      openHighlightDetail(h);
    });
    highlightsList.appendChild(item);
  }
}

// popstate 처리 — hl-compose 도 우선순위에 포함
// (기존 popstate 핸들러는 별도로 detail/chats/book modal 처리. 여기서 보완)

// ---------- Notice (공지사항) ----------
// 공지는 Supabase `notices` 테이블에서 불러온다. 어드민(upload_web)이 작성/수정/삭제하고,
// 소비자 앱은 published=true 인 공지만 읽는다(RLS). 새 공지가 생기면 하단 NOTICE 탭에
// 빨간 점이 뜨고(localStorage로 마지막으로 본 notice_id 추적), 탭을 열어보면 사라진다.
const NOTICE_SEEN_KEY = 'ds.lastSeenNotice';
const NOTICE_TAG_LABEL = { update: 'UPDATE', notice: 'NOTICE', event: 'EVENT' };

async function loadNotices() {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('notices')
      .select('notice_id, tag, title, body, pinned, created_at')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.notices = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[m] loadNotices failed:', err);
    state.notices = [];
  } finally {
    state.noticesLoaded = true;
  }
}

// 안 읽음 판정은 '가장 최근 생성된 공지' 기준 — notice_id 는 시퀀스라 최댓값이 최신.
function latestNoticeId() {
  const items = state.notices || [];
  if (!items.length) return null;
  let maxId = items[0].notice_id;
  for (const n of items) if (n.notice_id > maxId) maxId = n.notice_id;
  return String(maxId);
}
function hasUnreadNotice() {
  const latest = latestNoticeId();
  return !!latest && safeStorageGet(NOTICE_SEEN_KEY) !== latest;
}
function markNoticesSeen() {
  const latest = latestNoticeId();
  if (latest) safeStorageSet(NOTICE_SEEN_KEY, latest);
}
function paintNoticeBadge() {
  const dot = document.getElementById('notice-unread-dot');
  if (dot) dot.classList.toggle('show', hasUnreadNotice());
}
function formatNoticeDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
  } catch { return ''; }
}
function renderNotice() {
  const listEl = document.getElementById('notice-list');
  const emptyEl = document.getElementById('notice-empty');
  if (!listEl) return;
  const items = state.notices || [];
  if (items.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    // 아직 안 불러왔으면 한 번 로드한 뒤 다시 렌더
    if (!state.noticesLoaded) {
      loadNotices().then(() => { if (state.currentView === 'notice') renderNotice(); });
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  listEl.innerHTML = '';
  for (const n of items) {
    const tag = String(n.tag || 'notice').toLowerCase();
    const card = document.createElement('article');
    card.className = 'notice-card';
    card.innerHTML = `
      <div class="notice-head">
        <span class="notice-tag t-${escapeHtml(tag)}">${escapeHtml(NOTICE_TAG_LABEL[tag] || tag.toUpperCase())}</span>
        <span class="notice-date">${escapeHtml(formatNoticeDate(n.created_at))}</span>
      </div>
      <h2 class="notice-title">${escapeHtml(n.title || '')}</h2>
      <div class="notice-body">${renderNoticeBodyHtml(n.body || '')}</div>
    `;
    listEl.appendChild(card);
  }
  // 탭을 열어 봤으니 최신 공지를 읽음 처리하고 배지 제거
  markNoticesSeen();
  paintNoticeBadge();
}

// 하단바 장식 고양이 — 페이지별로 자세 + 위치를 바꾼다.
//   default(daily/home/archive/notice/settings) = cat_today  / 중앙 살짝 오른쪽 (실타래 굴리는 자세)
//   feed                                       = cat_pen    / 우측 하단 (원래 위치)
//   카드 상세                                   = cat_library / 우측 하단 (원래 위치)
function setBottomNavCat(srcFile, pos /* 'center' | 'right' | 'right-far' | 'corner' */, size /* 'large'? */) {
  const cat = document.querySelector('.bottom-nav-cat');
  if (!cat) return;
  const target = 'assets/cat/' + srcFile;
  if (!cat.src.endsWith(srcFile)) cat.src = target;
  // right-far 는 .right + .right-far 둘 다 적용 — CSS 가 right-far 로 left override
  cat.classList.toggle('right', pos === 'right' || pos === 'right-far');
  cat.classList.toggle('right-far', pos === 'right-far');
  cat.classList.toggle('left', pos === 'left');
  cat.classList.toggle('corner', pos === 'corner');
  cat.classList.toggle('large', size === 'large');
  if (cat.style.display === 'none') cat.style.display = '';
}
function hideBottomNavCat() {
  const cat = document.querySelector('.bottom-nav-cat');
  if (cat) cat.style.display = 'none';
}
function showBottomNavCat() {
  const cat = document.querySelector('.bottom-nav-cat');
  if (cat) cat.style.display = '';
}
// cat 이미지 preload — 카드 상세 진입 시 cat_today 가 잠깐 보이는 깜빡임 방지
['cat_today.png', 'cat_pen.png', 'cat_library.png', 'cat_struck.png', 'cat_empty.png'].forEach((f) => {
  const img = new Image();
  img.src = 'assets/cat/' + f;
});
function updateBottomNavCatForView(view) {
  if (view === 'feed') setBottomNavCat('cat_pen.png', 'left', 'large');              // 피드 — 우측 글쓰기 fab 과 충돌 방지 위해 좌측 배치
  else if (view === 'archive') setBottomNavCat('cat_struck.png', 'left', 'large');    // LIBRARY — 우측 북마크 fab 과 충돌 방지 위해 좌측 배치
  else if (view === 'daily' || view === 'settings') setBottomNavCat('cat_empty.png', 'corner'); // daily/MY 동일
  else setBottomNavCat('cat_today.png', 'center');
}

// ---------- 실뭉치 힌트 (TODAY 재탭 = 새 명대사) ----------
// TODAY 화면에서 가운데 실뭉치를 몇 초마다 톡톡 흔들어 '눌러봐' 신호를 준다.
// 한 번이라도 새 명대사를 받아보면(refreshTodayCard) 제스처를 익힌 것으로 보고 흔들림 정지.
const navYarn = document.querySelector('.nav-home-center .nav-home-yarn');
function yarnHinted() {
  try { return localStorage.getItem('today_yarn_hinted') === '1'; } catch { return false; }
}
function updateYarnHint(view) {
  if (!navYarn) return;
  navYarn.classList.toggle('yarn-hint', view === 'home' && !yarnHinted());
}
function spinYarn() {
  if (!navYarn) return;
  navYarn.classList.remove('yarn-hint', 'yarn-spin');
  void navYarn.offsetWidth;   // reflow — 연타해도 회전 재시작
  navYarn.classList.add('yarn-spin');
  navYarn.addEventListener('animationend', () => {
    navYarn.classList.remove('yarn-spin');
    updateYarnHint(state.currentView);  // 회전 후, 아직 새 명대사 안 받아봤고 TODAY면 흔들림 복귀
  }, { once: true });
}

// ---------- View switching ----------
function setView(view) {
  // LIBRARY(archive) 탭은 전체 도서 카탈로그 — 누구나 열람(익명 게이트 제거).
  state.currentView = view;
  if (viewDaily) viewDaily.style.display = (view === 'daily') ? 'block' : 'none';
  viewHome.style.display = (view === 'home') ? 'block' : 'none';
  viewArchive.style.display = (view === 'archive') ? 'block' : 'none';
  if (viewFeed) viewFeed.style.display = (view === 'feed') ? 'block' : 'none';
  if (viewNotice) viewNotice.style.display = (view === 'notice') ? 'block' : 'none';
  viewSettings.style.display = (view === 'settings') ? 'block' : 'none';
  if (feedFab) feedFab.style.display = (view === 'feed') ? 'inline-flex' : 'none';
  if (archiveFab) archiveFab.style.display = (view === 'archive') ? 'inline-flex' : 'none';

  // Top bar — Settings has its own
  topBarHome.style.display = (view === 'settings') ? 'none' : 'flex';
  topBarSettings.style.display = (view === 'settings') ? 'flex' : 'none';
  // 설정 화면에선 헤더 하단 구분선 숨김 (소개문구 위 라인 제거)
  if (headerHairline) headerHairline.style.display = (view === 'settings') ? 'none' : 'block';

  $$('.bottom-nav .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === view);
  });

  renderYarnChip();   // 상단바 실타래 칩 — 잔여 무료분+충전분 반영
  updateBottomNavCatForView(view);  // 하단바 고양이 자세 — feed/그 외
  updateYarnHint(view);  // 실뭉치 톡톡 힌트 — TODAY에서만, 아직 안 눌러봤으면

  if (view === 'archive') { renderArchiveChips(); renderArchive(); }
  if (view === 'feed') {
    renderFeed();
    if (!state.feedLoaded) loadFeedPosts();  // 읽기는 공개 — 익명도 실제 피드 로드
  }
  if (view === 'notice') renderNotice();
  if (view === 'settings') { paintTasteProfile(); paintMyChatsEntry(); paintMyFeedEntry(); paintMyBookmarksEntry(); paintMyNoticeEntry(); }
  if (view === 'daily') {
    // 캐시된 state.allCards 에 cover_url 키가 없으면 (이전 SELECT 결과) 강제 reload — 한 번만.
    const sample = (state.allCards || [])[0];
    const needsReload = sample?.works && !('cover_url' in sample.works);
    if (needsReload) {
      state.allCards = null;
      loadAllCards().then(() => {
        if (state.currentView === 'daily') {
          renderDailyDate();
          renderDailyNotice();
          renderDailyNewBooks();
          renderDailyContextual();
          renderDailyTrending();
          renderDailyOzPick();
          renderDailyRecent();
        }
      });
    } else {
      renderDailyDate();
      renderDailyNotice();
      renderDailyNewBooks();
      renderDailyContextual();
      renderDailyTrending();
      renderDailyOzPick();
      renderDailyRecent();
    }
  } else {
    stopNoticeCarousel?.();
    stopContextualCarousel?.();
    stopNewbooksRotation?.();   // 새 책 메인 순환 정지
    clearRandomCats?.();        // 다른 페이지 이동 시 랜덤 고양이 모두 제거
  }
  // LIBRARY 도 동일 — cover_url 누락 시 reload
  if (view === 'archive') {
    const sample = (state.allCards || [])[0];
    if (sample?.works && !('cover_url' in sample.works)) {
      state.allCards = null;
      loadAllCards().then(() => {
        if (state.currentView === 'archive') { renderArchiveChips(); renderArchive(); }
      });
    }
  }

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

// 하단 메뉴(bottom-nav) 클릭 — 열려 있는 detail-screen 오버레이를 먼저 닫고
// setView 로 탭 전환. 카드 상세를 열어 둔 채 메뉴를 눌러도 시각적으로 즉시 이동되게 함.
function closeAllOpenOverlays() {
  // 닫을 detail-screen overlay 들 — 모두 .detail-screen.open 패턴
  document.querySelectorAll('.detail-screen.open').forEach((el) => {
    el.classList.remove('open');
    // 슬라이드 아웃 transition 끝나면 display:none (closeDetailInternal 패턴과 일치)
    setTimeout(() => { if (!el.classList.contains('open')) el.style.display = 'none'; }, 250);
  });
  document.body.style.overflow = '';
  // 카드 상세 state 정리 (열려 있었던 경우)
  if (state) {
    state.detailCardId = null;
    state.detailCard = null;
    state.detailComments = [];
    state.detailLikes = new Map();
  }
  // history overlay state 초기화 — back 키 누를 때 다시 detail 로 안 가게
  if (history.state && history.state.overlay) {
    try {
      const baseHash = (state && state.currentView) ? `#${state.currentView}` : location.pathname;
      history.replaceState({ tab: state?.currentView || 'home' }, '', baseHash);
    } catch { /* noop */ }
  }
}

$$('[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const nav = btn.dataset.nav;
    track('nav', { to: nav });
    // TODAY 탭에 있는 동안 TODAY를 다시 누르면 새로고침 — 다른 탭에서 진입할 땐 새로고침 안 함.
    if (nav === 'home' && state.currentView === 'home' && !document.querySelector('.detail-screen.open')) {
      refreshTodayCard();
      return;
    }
    closeAllOpenOverlays();
    setView(nav);
    // 다른 탭에서 실뭉치를 눌러 TODAY로 들어올 때도 한 바퀴 회전 — 첫 탭부터 '누르면 반응한다'를 인지.
    if (nav === 'home') spinYarn();
  });
});

// 상단 좌측 'Daily Script' 로고: 어느 화면에서든 클릭(또는 Enter/Space) 시 홈으로
$$('.brand-logo').forEach((logo) => {
  const goHome = () => {
    track('nav', { to: 'home', from: 'brand-logo' });
    setView('home');
  };
  logo.addEventListener('click', goHome);
  logo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goHome();
    }
  });
});

// 홈 우상단 버튼: 익명이면 로그인 모달, 로그인 상태면 마이페이지(설정)로
$('#my-page-btn')?.addEventListener('click', () => {
  if (state.isAnonymous) {
    openSigninModal();
  } else {
    track('nav', { to: 'settings' });
    setView('settings');
  }
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

// 관리자가 편집에서 ** 로 감싼 부분을 <strong> 으로 렌더 (먼저 escape 후 마커만 변환 — XSS 안전)
function renderMarkdownBold(text) {
  return escapeHtml(text).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
}
// 이미 escape 가 끝난 HTML 위에 ** 만 추가로 변환 (boldSpeakerLines 결과 등에 사용)
function applyMarkdownBoldOnHtml(html) {
  return String(html).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
}

// 공지 본문을 안전한 HTML 로 렌더 (관리자가 작성한 마크다운 소부분집합).
//   **굵게**          → <strong>
//   ## 소제목          → 강조 라인
//   - 항목 / • 항목     → 불릿 목록
//   ![설명](https://…) → 이미지 (https 만 허용)
//   빈 줄              → 문단 간격
// 모든 텍스트는 escapeHtml 을 먼저 거치고, 이미지 URL 은 https 로 제한 + escape 하므로 XSS 안전.
function renderNoticeBodyHtml(raw) {
  const inline = (s) => escapeHtml(s).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
  const lines = String(raw ?? '').split('\n');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const line of lines) {
    const t = line.trim();
    let m;
    if ((m = t.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/))) {
      closeList();
      out.push(`<img class="nb-img" src="${escapeHtml(m[2])}" alt="${escapeHtml(m[1])}" loading="lazy">`);
    } else if ((m = t.match(/^#{1,3}\s+(.+)$/))) {
      closeList();
      out.push(`<p class="nb-h">${inline(m[1])}</p>`);
    } else if ((m = t.match(/^[-•]\s+(.+)$/))) {
      if (!inList) { out.push('<ul class="nb-ul">'); inList = true; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (t === '') {
      closeList();
      out.push('<div class="nb-gap"></div>');
    } else {
      closeList();
      out.push(`<p class="nb-p">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

// 발췌문 표시용 정리. admin library.js와 동일 로직 — 화자/대사 라인 재조립.
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
  text = text.replace(/[—–―─━‐‑‒ㅡー﹘﹣－]/g, ' ');
  const speakers = new Set();
  const colonRegex = /^([^:：()\n]{1,14})[:：][ \t]*/gm;
  let m;
  while ((m = colonRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) speakers.add(name);
  }
  // 조사로 끝나는 단어는 narrative 주어 — 화자명이 아님. 께/께서는 존경형 격조사.
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

// works.characters에 있는 이름과 정확히 일치하면서 "블록 첫 줄"인 라인만 볼드.
// 화자명은 항상 빈 줄 다음 첫 줄(또는 맨 첫 줄)에 온다 — 대사 중간에 인물 이름이
// 한 줄로 나와도(부르거나 외치는 경우) 화자로 오인해 볼드하지 않도록 위치를 함께 본다.
// 목록 없으면 볼드 없이 escape만.
function boldSpeakerLines(cleanedText, characterNames) {
  const text = String(cleanedText ?? '');
  const names = Array.isArray(characterNames) ? characterNames : [];
  if (names.length === 0) return escapeHtml(text);
  const nameSet = new Set(names.map((n) => String(n).trim()).filter(Boolean));
  const lines = text.split('\n');
  // 라벨에 따라붙는 마침표/콜론/세미콜론/콤마/느낌·물음표 제거 후 nameSet 매칭 —
  // LLM 출력의 "Romeo.", "노라:", "햄릿;" 같은 형식도 등장인물명으로 인식하기 위함.
  const TRAILING_PUNCT = /[.,:;!?！？：]+$/;
  return lines.map((line, i) => {
    const safe = escapeHtml(line);
    const t = line.trim();
    if (!t) return safe;
    const isBlockStart = i === 0 || lines[i - 1].trim() === '';
    if (!isBlockStart) return safe;
    const namePart = t.split('(')[0].trim();
    const tNorm = t.replace(TRAILING_PUNCT, '').trim();
    const nameNorm = namePart.replace(TRAILING_PUNCT, '').trim();
    const isSpeaker = nameSet.has(t) || nameSet.has(namePart) ||
                      nameSet.has(tNorm) || nameSet.has(nameNorm);
    return isSpeaker ? `<strong>${safe}</strong>` : safe;
  }).join('\n');
}

// ============================================================
// 알림 (확성기) — 댓글/대댓글 발생 시 자동 생성 (DB 040 트리거).
//   헤더 #notif-btn 클릭 시 모달 → 항목 클릭 시 해당 컨텐츠로 이동 + is_read 마킹.
//   미읽음 개수는 #notif-badge 에 표시.
// ============================================================
async function loadNotifUnreadCount() {
  if (!state.userId) { setNotifBadge(0); return; }
  try {
    const sb = await getSupabase();
    const { count, error } = await sb
      .from('notifications')
      .select('notification_id', { count: 'exact', head: true })
      .eq('recipient_user_id', state.userId)
      .eq('is_read', false);
    if (error) throw error;
    setNotifBadge(Number(count) || 0);
  } catch (e) { console.warn('[m] notif count failed:', e); }
}
function setNotifBadge(n) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (n > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = n > 99 ? '99+' : String(n);
  } else {
    badge.style.display = 'none';
  }
}
async function openNotifModal() {
  const modal = document.getElementById('notif-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  await renderNotifList();
  /* 모달 열린 시점에 모든 알림 read 처리 (badge 0 으로) */
  try {
    if (state.userId) {
      const sb = await getSupabase();
      await sb.from('notifications').update({ is_read: true })
        .eq('recipient_user_id', state.userId)
        .eq('is_read', false);
      setNotifBadge(0);
    }
  } catch (e) { console.warn('[m] notif mark read failed:', e); }
}
function closeNotifModal() {
  const modal = document.getElementById('notif-modal');
  if (modal) modal.style.display = 'none';
}
async function renderNotifList() {
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  if (!list) return;
  list.innerHTML = '<p class="t-body-sm c-walnut" style="padding:24px;text-align:center;">불러오는 중⋯</p>';
  if (!state.userId) { list.innerHTML = ''; if (empty) { empty.style.display = 'block'; empty.textContent = '로그인 후 사용할 수 있어요.'; } return; }
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('notifications')
      .select('notification_id, actor_user_id, actor_nickname, kind, target_post_id, target_highlight_id, target_comment_id, body_preview, is_read, created_at')
      .eq('recipient_user_id', state.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = data || [];
    state._notifications = rows;
    if (rows.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = rows.map(notifRowHtml).join('');
    list.querySelectorAll('[data-notif-id]').forEach((el) => {
      el.addEventListener('click', () => onNotifClick(parseInt(el.dataset.notifId, 10)));
    });
  } catch (e) {
    console.warn('[m] notif list failed:', e);
    list.innerHTML = '<p class="t-body-sm c-cta" style="padding:24px;text-align:center;">불러오기 실패</p>';
  }
}
function notifRowHtml(n) {
  const actor = escapeHtml(n.actor_nickname || '익명');
  const verb = {
    post_comment: '내 감상평에 댓글을 남겼어요',
    comment_reply: '내 댓글에 답글을 남겼어요',
    highlight_comment: '내 하이라이트에 댓글을 남겼어요',
    highlight_comment_reply: '내 하이라이트 댓글에 답글을 남겼어요',
  }[n.kind] || '댓글을 남겼어요';
  const when = formatRelativeTime(n.created_at) || '';
  const preview = n.body_preview ? `<p class="t-body-sm c-walnut" style="margin:6px 0 0;line-height:1.5;white-space:pre-wrap;word-break:keep-all;">${escapeHtml(n.body_preview)}</p>` : '';
  return `
    <div data-notif-id="${n.notification_id}" style="padding:14px 18px;border-bottom:0.5px solid var(--latte);cursor:pointer;${n.is_read ? '' : 'background:rgba(216,90,48,.06);'}">
      <p class="t-body-md c-espresso" style="margin:0;line-height:1.5;"><b>${actor}</b> 님이 ${verb}</p>
      ${preview}
      <p class="t-label-sm c-walnut" style="margin:6px 0 0;letter-spacing:.04em;">${escapeHtml(when)}</p>
    </div>
  `;
}
async function onNotifClick(notifId) {
  const n = (state._notifications || []).find((x) => x.notification_id === notifId);
  if (!n) return;
  closeNotifModal();
  /* kind 별로 해당 컨텐츠로 이동 */
  setTimeout(async () => {
    try {
      if (n.kind === 'post_comment' || n.kind === 'comment_reply') {
        /* feed_post 상세 열기 */
        const sb = await getSupabase();
        const { data: post } = await sb.from('feed_posts')
          .select('post_id, card_id, user_id, author_nickname, body, created_at, cards(card_id, quote, works(work_id, title, subtitle, format, author, cover_url))')
          .eq('post_id', n.target_post_id).single();
        if (post) openFeedPostDetail(post);
      } else if (n.kind === 'highlight_comment' || n.kind === 'highlight_comment_reply') {
        const sb = await getSupabase();
        const { data: h } = await sb.from('card_highlights')
          .select('highlight_id, card_id, user_id, author_nickname, selected_text, user_note, created_at, cards(card_id, works(work_id, title, subtitle, format, author, cover_url))')
          .eq('highlight_id', n.target_highlight_id).single();
        if (h) openHighlightDetail(h);
      }
    } catch (e) { console.warn('[m] notif navigation failed:', e); toast('이동 실패'); }
  }, 200);
}

/* 헤더 확성기 클릭 + 모달 닫기 */
document.getElementById('notif-btn')?.addEventListener('click', openNotifModal);
document.getElementById('notif-close')?.addEventListener('click', closeNotifModal);
document.getElementById('notif-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'notif-modal') closeNotifModal();
});

/* 주기적 unread count 폴링 — 60초마다 + 페이지 visible 변화 시 + 첫 진입 1.5s 후 */
setInterval(() => { if (!document.hidden) loadNotifUnreadCount(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNotifUnreadCount(); });
setTimeout(() => { if (state.userId) loadNotifUnreadCount(); }, 1500);

let toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    console.warn('[toast]', msg);
    return;
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

// ============================================================
// 공유 카드 — 9:16 비율, 편지지 배경, 다운로드 + Web Share API
// 1차 MVP: 무료 4종 + 유료 4종(잠금 표시만, 구매 RPC 는 후속)
// 후속: 카드 상세 텍스트 블록 선택 → 블록 부분 공유, 유료 배경 구매 RPC
// ============================================================
const SHARE_BACKGROUNDS = [
  /* Free — 기본 편지지 + 톤·질감 강화본까지 모두 무료 */
  { id: 'beige',     name: '크림 편지지',  tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#F4ECDB', '#E0D5BC', '#3B2A1A') },
  { id: 'rose',      name: '로즈 편지지',  tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#FAEAE2', '#E6C9BD', '#4A2A24') },
  { id: 'mint',      name: '민트 편지지',  tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#E8F1E4', '#C6D6BF', '#2B3B2A') },
  { id: 'sky',       name: '스카이 편지지', tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#E4ECF5', '#C0CDDC', '#2A344A') },
  { id: 'parchment', name: '양피지',       tier: 'free', paint: (ctx, W, H) => paintParchment(ctx, W, H) },
  { id: 'kraft',     name: '크라프트',     tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#C8A876', '#A88858', '#1F140A') },
  { id: 'midnight',  name: '미드나잇',     tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#1B2436', '#0E1626', '#F4ECDB') },
  { id: 'rosegold',  name: '로즈골드',     tier: 'free', paint: (ctx, W, H) => paintLetter(ctx, W, H, '#E8C9B7', '#C9A88E', '#3A1F18') },
  /* Premium 999🧶 / Royal 2999🧶 — 더 이상 코드에 없음. share_backgrounds 테이블에서
     loadShareBackgrounds() 로 받아 allShareBackgrounds() 가 free 8종 뒤에 합친다. */
];

// ===== 원격 카드지(premium/royal) — share_backgrounds 테이블 + 이미지 캐시 + 잠금 해제 =====
let shareBgRemote = null;
async function loadShareBackgrounds() {
  if (shareBgRemote) return shareBgRemote;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('share_backgrounds')
      .select('slug,name,tier,price,image_url,ink,work_id,work_title,sort_order')
      .eq('is_active', true).order('sort_order');
    if (error) throw error;
    shareBgRemote = (data || []).map((r) => ({
      id: r.slug, name: r.name, tier: r.tier, price: r.price || 0,
      imageUrl: r.image_url, ink: r.ink || '#3B2A1A',
      workId: r.work_id ?? null, workTitle: r.work_title || '',
      /* paint 없음 → 렌더/썸네일 코드가 이미지 배경으로 식별 */
    }));
  } catch (e) {
    console.warn('[m] loadShareBackgrounds failed:', e);
    return [];   // 캐시 안 함(shareBgRemote=null 유지) → 다음 호출에 재시도
  }
  return shareBgRemote;
}
/** free 8종 + 원격 premium/royal 합친 리스트(아직 못 받았으면 free 만). */
function allShareBackgrounds() {
  return (shareBgRemote && shareBgRemote.length) ? SHARE_BACKGROUNDS.concat(shareBgRemote) : SHARE_BACKGROUNDS;
}

// 카드지 이미지 캐시 — toBlob 오염(taint) 방지 위해 crossOrigin='anonymous'(공개 버킷 CORS 헤더 제공).
const shareImgCache = new Map();   // url -> { img, promise }
function loadShareImage(url) {
  const cached = shareImgCache.get(url);
  if (cached) return cached.promise;
  const img = new Image();
  img.crossOrigin = 'anonymous';   // ★ src 보다 먼저 — 안 그러면 캔버스가 tainted 되어 toBlob 이 던짐
  const promise = new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = (e) => { shareImgCache.delete(url); reject(e); };
  });
  img.src = url;
  shareImgCache.set(url, { img, promise });
  return promise;
}
function readyShareImage(url) {
  const e = shareImgCache.get(url);
  return (e && e.img && e.img.complete && e.img.naturalWidth > 0) ? e.img : null;
}
function drawShareCover(ctx, img, W, H) {
  const s = Math.max(W / img.width, H / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// 보유 카드지 id — 서버 권위(share_theme_unlocks, 046_share_theme_unlocks.sql). 그리드를 즉시
// 렌더하려고 캐시에 보관하고, 공유 시트 열 때 fetchPurchasedShareThemes() 로 서버에서 채운다.
// + localStorage 영구 백업 — 서버 fetch 실패/마이그레이션 미적용 시 보유 소실 방지.
let purchasedShareThemesCache = new Set();
function ownedBgLsKey() { return `ds.ownedShareBgs.${state.userId || 'anon'}`; }
function loadOwnedBgsFromLs() {
  try {
    const raw = localStorage.getItem(ownedBgLsKey());
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}
function saveOwnedBgsToLs(set) {
  try { localStorage.setItem(ownedBgLsKey(), JSON.stringify([...set])); } catch {}
}
function getPurchasedShareThemes() { return purchasedShareThemesCache; }

/* 서버 + 로컬 백업 합집합 → cache. 서버가 죽어도 로컬 보유는 유지.
   비로그인은 anon 로컬 키 사용. */
async function fetchPurchasedShareThemes() {
  /* 1) 로컬 백업 즉시 적용 — 사용자 명세 '영구 소장' 보장의 최후 안전망 */
  const local = loadOwnedBgsFromLs();
  purchasedShareThemesCache = new Set(local);
  if (!state.userId) return purchasedShareThemesCache;
  /* 2) 서버 합집합 — 성공 시 로컬에도 반영(다음 부팅에 더 정확) */
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('share_theme_unlocks').select('theme_id');
    if (error) throw error;
    const merged = new Set(local);
    (data || []).forEach((r) => { if (r && r.theme_id) merged.add(r.theme_id); });
    purchasedShareThemesCache = merged;
    saveOwnedBgsToLs(merged);
  } catch (e) {
    console.warn('[m] share themes fetch failed (로컬 백업 유지):', e);
  }
  return purchasedShareThemesCache;
}

/* 카드지 구매 — 서버에서 실타래 차감 + 소유 등록을 원자적으로. 반환: >=0 차감 후 잔액 / -2 부족 / -1·-3 오류. */
async function purchaseShareThemeRpc(themeId, price) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('purchase_share_theme', { p_theme_id: themeId, p_price: price });
  if (error) throw error;
  return typeof data === 'number' ? data : parseInt(data, 10);
}
async function spendYarnRpc(amount) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('spend_yarn', { p_amount: amount });
  if (error) throw error;
  return typeof data === 'number' ? data : parseInt(data, 10);
}

// 잠긴 카드지 탭 → 구매 확인 → 실타래 차감(spend_yarn) → 로컬 보유 기록 + 선택. (안드 buyShareTheme 미러)
function promptUnlockShareBg(b) {
  openPromptModal({
    title: `${b.tier === 'royal' ? 'Royal' : 'Premium'} 카드지 잠금 해제`,
    message: `이 배경을 실타래 ${b.price}개로 잠금 해제할까요?`,
    subNote: `보유 실타래 ${yarnAvailable()}개`,
    confirmLabel: '잠금 해제',
    dismissLabel: '취소',
    openSigninOnConfirm: false,
    onConfirm: async () => {
      try {
        const balance = await purchaseShareThemeRpc(b.id, b.price);
        if (!Number.isFinite(balance) || balance < 0) { showYarnInsufficient(); return; }
        state.yarnPurchased = balance;
        purchasedShareThemesCache.add(b.id);
        saveOwnedBgsToLs(purchasedShareThemesCache);   // 영구 백업 — 다음 부팅에 서버가 미응답해도 유지
        renderYarnChip();
        shareState.bgId = b.id;
        renderShareBgList();
        renderShareCardCurrent();
        toast(`${b.name} 잠금 해제!`);
      } catch (e) {
        console.warn('[m] unlock share bg failed:', e);
        toast('잠금 해제에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
    },
  });
}

// 다운로드/공유 직전 — 선택 배경이 이미지면 로드 완료를 보장하고 재렌더(미로드 시 종이톤 폴백, toBlob 오염 방지).
async function ensureShareCanvasPainted() {
  const bg = allShareBackgrounds().find((b) => b.id === shareState.bgId);
  if (bg && bg.imageUrl && !readyShareImage(bg.imageUrl)) {
    try { await loadShareImage(bg.imageUrl); } catch { /* 실패 → 종이톤 폴백 */ }
    renderShareCardCurrent();
  }
}

function paintLetter(ctx, W, H, bgTop, bgBot, ink) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, bgTop); g.addColorStop(1, bgBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  /* 테두리만 — 점선 모서리 (가로줄 제거) */
  ctx.strokeStyle = ink + '40'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.setLineDash([]);
  return ink;
}
function paintParchment(ctx, W, H) {
  const ink = '#3A2614';
  const g = ctx.createRadialGradient(W/2, H/2, W*0.2, W/2, H/2, W*0.85);
  g.addColorStop(0, '#F0E0BB'); g.addColorStop(1, '#C9A872');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  /* 종이 결 — 노이즈 점 */
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.fillStyle = `rgba(58,38,20,${Math.random() * 0.06})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = ink + '50'; ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  return ink;
}

/* 작품명 정규화 — 공백/대소문자/관사/구두점 제거. 한국어 표기 우선. */
function normalizeWorkTitle(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/* 단어(어절) 단위 줄바꿈 + 의미 묶음(chunk) — 한국어 의존명사·관형사·보조용언이
   줄 머리·꼬리에 단독으로 떨어지지 않도록 짧은(1~2자) 어절은 다음 어절과 한 chunk
   로 먼저 묶고, chunk 단위로 wrap. chunk 는 절대 중간에서 끊지 않는다.

   묶음 예시:
     "그 명을" / "있는 거죠" / "제 몸을" / "두고 싶은" / "늘 곁에" / "말 없는"
   한 chunk 가 maxWidth 보다 넓으면 overflow (정상 한국어/영문은 거의 그럴 일 없음). */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(/\s+/).filter(Boolean);
    /* 1) 의미 묶음 — 첫 어절이 1~2자(관형사·짧은 부사·의존명사 등)면 다음 어절 1개 흡수.
       1회만 흡수해서 chunk 가 무한정 길어지는 것 방지. */
    const chunks = [];
    let i = 0;
    while (i < words.length) {
      let chunk = words[i++];
      if (chunk.length <= 2 && i < words.length) {
        chunk += ' ' + words[i++];
      }
      chunks.push(chunk);
    }
    /* 2) chunk 단위 wrap — 한 줄에 가능한 한 많은 chunk. chunk 사이에서만 끊김. */
    let cur = '';
    for (const ch of chunks) {
      if (!cur) { cur = ch; continue; }
      const test = cur + ' ' + ch;
      if (ctx.measureText(test).width <= maxWidth) {
        cur = test;
      } else {
        lines.push(cur);
        cur = ch;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

/* 메인 렌더 — quote / speaker / work·author 를 9:16 캔버스에 그림.
   영역 분할 (W=540, H=960 기준):
   · 'Daily Script' 워터마크 (상단):  y = 100
   · 따옴표:                          y = 260 (본문 위, 매우 여린 농도)
   · 본문:                            y = 290 ~ 760  (자동 줄바꿈 + 크기 점진 축소)
   · speaker:                         y = 800
   · 작품 · 작가 (하단):              y = 870 */
function renderShareCard(canvas, bg, payload) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  /* 비동기 이미지 재렌더가 더 새로운 선택을 덮어쓰지 않게 시퀀스 토큰으로 가드 */
  const seq = (canvas._shareSeq = (canvas._shareSeq || 0) + 1);
  ctx.clearRect(0, 0, W, H);

  let ink;
  if (bg.paint) {
    ink = bg.paint(ctx, W, H) || '#3B2A1A';                 // 무료 8종 — 절차적
  } else {
    ink = bg.ink || '#3B2A1A';                              // 이미지 배경(premium/royal)
    const img = bg.imageUrl ? readyShareImage(bg.imageUrl) : null;
    if (img) {
      drawShareCover(ctx, img, W, H);
    } else {
      ctx.fillStyle = '#EDE7DA'; ctx.fillRect(0, 0, W, H);  // 로드 전/실패 종이톤
      if (bg.imageUrl) {
        loadShareImage(bg.imageUrl)
          .then(() => { if (canvas._shareSeq === seq) renderShareCard(canvas, bg, payload); })
          .catch(() => { /* 로드 실패 → 종이톤 유지(toBlob 안전) */ });
      }
    }
  }
  drawShareCardText(ctx, ink, payload, W, H);
}

/* 명대사/화자/작품 텍스트 — 배경(절차적·이미지) 위에 공통으로 그린다.
   안드 ShareCardRenderer 와 동일 layout — 명조체(Nanum Myeongjo),
   본문은 0.27h~0.75h 안전 영역에 세로 중앙, 하단에 화자 + metaKo + metaEn 3줄. */
function drawShareCardText(ctx, ink, payload, W, H) {
  const s = W / 540;
  /* 메타(작가/작품)를 확실히 보이게 하단 영역을 H*0.85 까지 확장 (기존 0.75 → 0.85).
     안드/iOS 와 동일하게 작가·작품 라인이 카드 안에 들어옴. */
  const zoneTop = H * 0.24, zoneBot = H * 0.86;
  const zoneH = zoneBot - zoneTop;
  const maxW = W - 220 * s;
  const SERIF = `"Nanum Myeongjo", "Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  /* 1) 명대사 — fs 점진 축소(영역 60% 안에 들도록). 메타가 카드 안에 확실히 들어오도록 비율 약간 줄임. */
  let qLines = [];
  let qLineH = 0;
  let bodyFs = 40;
  for (const fs of [40, 36, 32, 28, 24, 20]) {
    ctx.font = `400 ${fs * s}px ${SERIF}`;
    qLines = wrapText(ctx, payload.quote || '', maxW);
    qLineH = fs * s * 1.6;
    bodyFs = fs;
    if (qLines.length * qLineH <= zoneH * 0.55) break;
  }

  const hasSpeaker = !!(payload.speaker && String(payload.speaker).trim());
  const hasKo = !!(payload.metaKo && String(payload.metaKo).trim());
  const hasEn = !!(payload.metaEn && String(payload.metaEn).trim());
  const gapSpeaker = 18 * s;
  const speakerLineH = 30 * s;
  const gapMeta = 36 * s;
  const metaKoLineH = 28 * s;   // 19 → 22 글자 크기에 맞춰 lh 도 약간 확장
  const metaEnLineH = 24 * s;

  /* 2) 블록 전체 높이 → 안전 영역 세로 중앙. */
  let blockH = qLines.length * qLineH;
  if (hasSpeaker) blockH += gapSpeaker + speakerLineH;
  if (hasKo)      blockH += gapMeta + metaKoLineH;
  if (hasEn)      blockH += metaEnLineH;

  let y = zoneTop + Math.max(0, (zoneH - blockH) / 2);

  /* 명대사 */
  ctx.fillStyle = ink;
  ctx.font = `400 ${bodyFs * s}px ${SERIF}`;
  for (const ln of qLines) { ctx.fillText(ln, W / 2, y); y += qLineH; }

  /* 화자 */
  if (hasSpeaker) {
    y += gapSpeaker;
    ctx.font = `400 ${22 * s}px ${SERIF}`;
    ctx.fillStyle = ink + 'EE';   // 화자 alpha CC → EE (더 진하게)
    ctx.fillText(`— ${payload.speaker}`, W / 2, y);
    y += speakerLineH;
  }
  /* 메타 — 작가/작품 (사용자 명세 가장 잘 보이도록 alpha 진하게 + 글자 키움) */
  if (hasKo) {
    y += gapMeta;
    ctx.font = `600 ${22 * s}px ${SERIF}`;    // 19px → 22px + weight 600
    ctx.fillStyle = ink + 'DD';                // alpha 99(60%) → DD(87%)
    ctx.fillText(payload.metaKo, W / 2, y);
    y += metaKoLineH;
  }
  if (hasEn) {
    ctx.font = `400 ${18 * s}px ${SERIF}`;    // 16 → 18
    ctx.fillStyle = ink + 'AA';                // 80(50%) → AA(67%)
    ctx.fillText(payload.metaEn, W / 2, y);
  }
}

/* 안드 ShareCardPayload.toSharePayload 미러 — metaKo/metaEn 2줄 (영문 원본 없으면 EN 줄 생략). */
const SHARE_FORMAT_LABEL_KO = { movie: '영화', drama: '드라마', play: '연극', musical: '뮤지컬', opera: '오페라', novel: '소설', poem: '시', essay: '에세이' };
const SHARE_FORMAT_LABEL_EN = { movie: 'movie', drama: 'drama', play: 'play', musical: 'musical', opera: 'opera', novel: 'novel', poem: 'poem', essay: 'essay' };
function shareMetaLine(genre, title, author) {
  const head = [genre, title ? `<${title}>` : ''].filter(Boolean).join(' ');
  return [head, author].filter(Boolean).join(', ');
}
function shareMetaLinesFromWork(w) {
  if (!w) return { metaKo: '', metaEn: '' };
  const fmt = String(w.format || '').toLowerCase();
  const titleKo  = String(w.title || '').trim();
  const authorKo = String(w.author || '').trim();
  const titleEn  = String(w.title_original || '').trim();
  const authorEn = String(w.author_original || '').trim();
  const metaKo = shareMetaLine(SHARE_FORMAT_LABEL_KO[fmt] || '', titleKo, authorKo);
  const metaEn = (titleEn || authorEn)
    ? shareMetaLine(SHARE_FORMAT_LABEL_EN[fmt] || '', titleEn, authorEn)
    : '';
  return { metaKo, metaEn };
}

const shareState = { tab: 'free', bgId: 'beige', payload: null, lastBlob: null };

function renderShareBgList() {
  const list = document.getElementById('share-bg-list');
  if (!list) return;
  list.innerHTML = '';
  const purchasedSet = getPurchasedShareThemes();
  let items = allShareBackgrounds().filter((b) => b.tier === shareState.tab);
  /* Premium / Royal — 카드지 name(=책 제목)이 현재 공유 카드의 책 제목과 같은 것을 맨 앞으로.
     예: 프랑켄슈타인 카드 공유 → name:'프랑켄슈타인' 카드지가 그리드 첫번째. */
  if (shareState.tab === 'premium' || shareState.tab === 'royal') {
    /* 공유 카드의 책에 연결된 카드지를 맨 앞으로 — work_id 우선, 없으면 제목 매칭 */
    const targetId = shareState.payload?.workId;
    const targetTitle = normalizeWorkTitle(shareState.payload?.work);
    if (targetId != null || targetTitle) {
      const score = (bg) => {
        if (targetId != null && bg.workId != null && Number(bg.workId) === Number(targetId)) return 2;
        if (targetTitle && normalizeWorkTitle(bg.workTitle || bg.name) === targetTitle) return 1;
        return 0;
      };
      items.sort((a, b) => score(b) - score(a));
    }
  }
  if (items.length === 0) {
    list.innerHTML = '<div style="padding:24px 8px;width:100%;text-align:center;font-size:12px;color:var(--walnut);line-height:1.6;">곧 만나요 ✨<br/>새 배경을 준비하고 있어요.</div>';
    return;
  }
  for (const b of items) {
    const cell = document.createElement('button');
    const locked = b.tier !== 'free' && !purchasedSet.has(b.id);   /* 보유 안 한 유료 티어만 잠금 */
    cell.type = 'button';
    cell.dataset.bg = b.id;
    const active = shareState.bgId === b.id && !locked;
    cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;border:none;cursor:pointer;padding:0;width:100%;-webkit-tap-highlight-color:transparent;outline:none;`;
    cell.innerHTML = `
      <div style="position:relative;width:100%;aspect-ratio:9/16;border-radius:6px;overflow:hidden;border:2px solid ${active ? 'var(--cta)' : 'transparent'};box-shadow:0 2px 5px rgba(0,0,0,.12);">
        <canvas data-thumb="${b.id}" width="144" height="256" style="width:100%;height:100%;display:block;"></canvas>
        ${locked ? `<div style="position:absolute;inset:0;background:rgba(14,12,10,.42);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FAF8F2;font-size:11px;font-weight:700;letter-spacing:.02em;"><span class="material-symbols-outlined" style="font-size:18px;">lock</span><span style="margin-top:2px;display:inline-flex;align-items:center;gap:3px;">${b.price || 0}<img src="assets/daily-script-bar.png" alt="" style="width:11px;height:11px;object-fit:cover;border-radius:50%;display:inline-block;" /></span></div>` : ''}
      </div>
      <span style="font-size:10px;color:var(--espresso);text-align:center;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${b.name}</span>
    `;
    list.appendChild(cell);
    /* 썸네일 렌더 — 절차적이면 paint, 이미지면 cover(로드 후 교체) */
    const tc = cell.querySelector(`canvas[data-thumb="${b.id}"]`);
    if (tc) {
      const tctx = tc.getContext('2d');
      tctx.clearRect(0, 0, tc.width, tc.height);
      if (b.paint) {
        try { b.paint(tctx, tc.width, tc.height); } catch {}
      } else if (b.imageUrl) {
        const ready = readyShareImage(b.imageUrl);
        if (ready) { try { drawShareCover(tctx, ready, tc.width, tc.height); } catch {} }
        else {
          tctx.fillStyle = '#EDE7DA'; tctx.fillRect(0, 0, tc.width, tc.height);
          loadShareImage(b.imageUrl).then((img) => { try { drawShareCover(tctx, img, tc.width, tc.height); } catch {} }).catch(() => {});
        }
      }
    }
    cell.addEventListener('click', () => {
      if (locked) { promptUnlockShareBg(b); return; }
      shareState.bgId = b.id;
      renderShareBgList();
      renderShareCardCurrent();
    });
  }
}

function renderShareCardCurrent() {
  const canvas = document.getElementById('share-canvas');
  const bg = allShareBackgrounds().find((b) => b.id === shareState.bgId) || SHARE_BACKGROUNDS[0];
  if (canvas && shareState.payload) renderShareCard(canvas, bg, shareState.payload);
  shareState.lastBlob = null;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}
// 공유/다운로드 카운트 + 1 — 서버 RPC + 로컬 카드 share_count 갱신 + TODAY chip 갱신.
//  share-modal 의 다운로드 + 공유하기 두 액션 모두 호출.
async function bumpShareCount() {
  const cardId = state.todayCard?.card_id || state.detailCardId;
  if (!cardId) return;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('increment_share_count', { p_card_id: cardId });
    if (error) throw error;
    const newCount = typeof data === 'number' ? data : parseInt(data, 10);
    if (Number.isFinite(newCount) && newCount >= 0) {
      const candidates = [
        state.todayCard,
        state.detailCard,
        ...(state.allCards || []).filter((c) => c && c.card_id === cardId),
      ];
      candidates.forEach((c) => { if (c) c.share_count = newCount; });
      paintShareCounts(cardId, newCount);
    }
  } catch (e) { console.warn('[m] bumpShareCount failed:', e); }
}
function paintShareCounts(cardId, count) {
  if (state.todayCard?.card_id === cardId) {
    const el = document.getElementById('today-share-count');
    if (el) el.textContent = String(count);
  }
}

async function downloadShareCard() {
  const canvas = document.getElementById('share-canvas');
  if (!canvas) return;
  await ensureShareCanvasPainted();   // 이미지 배경이면 로드 완료 보장(toBlob 오염 방지)
  const blob = await canvasToBlob(canvas);
  if (!blob) { toast('이미지 생성 실패'); return; }
  const filename = `daily-script-${Date.now()}.png`;
  const url = URL.createObjectURL(blob);
  /* 1차 — anchor.download (Chrome / Edge / Firefox / Android Chrome) */
  let downloaded = false;
  try {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    downloaded = true;
  } catch (e) { console.warn('[share] anchor download failed:', e); }
  /* 2차 — iOS Safari / PWA standalone: anchor.download 무동작 → Web Share API 폴백 */
  if (!downloaded || /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Daily Script' });
        URL.revokeObjectURL(url);
        return;
      }
    } catch (e) { /* AbortError 무시 */ }
  }
  /* 3차 — 새 탭으로 띄움 (사용자가 길게 눌러 저장) */
  if (!downloaded) {
    window.open(url, '_blank');
    toast('이미지를 길게 눌러 저장하세요');
  } else {
    toast('이미지 저장됨');
  }
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}
// 친구 초대 referral 링크 — 본인 user_id + 공유한 카드 id + (선택) 카드지/하이라이트.
//   r=ref c=card b=bg q=quote (URL-safe base64). 한글 percent-encoding(9bytes/char) 대비 ~3x 단축.
function urlSafeB64Encode(s) {
  return btoa(unescape(encodeURIComponent(String(s || ''))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function urlSafeB64Decode(s) {
  try {
    const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - t.length % 4) % 4;
    return decodeURIComponent(escape(atob(t + '='.repeat(pad))));
  } catch { return ''; }
}
function buildReferralUrl(cardId, opts) {
  try {
    const base = `${window.location.origin}/m/`;
    const params = [];
    if (state.userId)    params.push(`r=${state.userId}`);
    if (cardId)          params.push(`c=${cardId}`);
    if (opts?.bgId)      params.push(`b=${encodeURIComponent(opts.bgId)}`);
    if (opts?.quote)     params.push(`q=${urlSafeB64Encode(opts.quote.slice(0, 300))}`);
    return params.length ? `${base}?${params.join('&')}` : base;
  } catch { return ''; }
}
/* 이미지 보내기 — 캔버스 PNG 를 Web Share files 로. 카카오톡 포함 모든 메신저가 이미지로 받음. */
async function shareImage() {
  const canvas = document.getElementById('share-canvas'); if (!canvas) return;
  await ensureShareCanvasPainted();   // 이미지 배경이면 로드 완료 보장(toBlob 오염 방지)
  const blob = await canvasToBlob(canvas); if (!blob) { toast('이미지 생성 실패'); return; }
  const file = new File([blob], 'daily-script.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Daily Script' });
      return;
    }
  } catch (e) { /* AbortError 무시 */ }
  /* Web Share files 미지원 → 다운로드 폴백 */
  await downloadShareCard();
}

/* 링크 보내기 — server-side short URL (Supabase share_links) 발급 → /m/?s=<6자>.
   실패 시 옛 long URL(buildReferralUrl) 로 자동 폴백. */
async function shareLink() {
  const payload = shareState.payload || {};
  const cardId  = payload?.cardId;
  const card    = (state.allCards || []).find((c) => c && c.card_id === cardId);
  const fullQuote = String(card?.quote || '').trim();
  const myQuote   = String(payload?.quote || '').trim();
  const isFullQuote = myQuote && fullQuote && myQuote === fullQuote;
  const quoteForUrl = isFullQuote ? '' : myQuote;
  let refUrl = '';
  try {
    const sb = await getSupabase();
    const { data: shortId, error } = await sb.rpc('create_share_link', {
      p_referrer_id: state.userId || null,
      p_card_id: cardId || null,
      p_bg_id: shareState.bgId || null,
      p_quote_b64: quoteForUrl ? urlSafeB64Encode(quoteForUrl.slice(0, 300)) : null,
    });
    if (!error && shortId) refUrl = `${window.location.origin}/m/?s=${shortId}`;
    else if (error) console.warn('[m] create_share_link RPC error, fallback to long URL:', error);
    console.log('[m] shareLink RPC sent bg_id=', shareState.bgId, '→ shortId=', shortId, 'refUrl=', refUrl);
  } catch (e) { console.warn('[m] create_share_link RPC threw, fallback to long URL:', e); }
  if (!refUrl) refUrl = buildReferralUrl(cardId, { bgId: shareState.bgId, quote: quoteForUrl });
  const quote   = payload.quote ? `"${payload.quote}"` : '';
  const credit  = payload.work  ? ` — ${payload.work}` : '';
  /* 카카오톡은 url 을 OG 카드 미리보기로 자동 렌더 → 본문 text 에 URL 중복 넣지 않음.
     본문은 명대사 + 작품만, 링크 박스는 카카오톡이 URL 한 번만 카드로 표시. */
  const text    = (quote + credit).trim();
  try {
    if (navigator.share) {
      await navigator.share({ text, title: 'Daily Script', url: refUrl || undefined });
      return;
    }
  } catch (e) { /* AbortError 무시 */ }
  /* Web Share 미지원 — 클립보드 복사로 폴백 */
  try { if (navigator.clipboard?.writeText && refUrl) { await navigator.clipboard.writeText(refUrl); toast('앱 링크가 클립보드에 복사됨'); } } catch {}
}

function openShareModal(payload) {
  const modal = document.getElementById('share-modal');
  if (!modal) return;
  shareState.payload = payload || {};
  shareState.tab = 'free';
  shareState.bgId = 'beige';
  /* 미리보기 — 기본 접힘 상태로 reset (배경 그리드가 한눈에 보이게) */
  const wrap = document.getElementById('share-preview-wrap');
  const icon = document.getElementById('share-preview-icon');
  const label = document.getElementById('share-preview-label');
  if (wrap)  wrap.style.display = 'none';
  if (icon)  icon.textContent  = 'unfold_more';
  if (label) label.textContent = '카드 펼치기';
  /* 탭 표시 동기화 */
  document.querySelectorAll('#share-modal .share-tab').forEach((el) => {
    const active = el.dataset.tab === shareState.tab;
    el.style.fontWeight = active ? '700' : '600';
    el.style.color = active ? 'var(--espresso)' : 'var(--walnut)';
    el.style.borderBottom = `2px solid ${active ? 'var(--espresso)' : 'transparent'}`;
  });
  renderShareBgList();
  renderShareCardCurrent();
  modal.style.display = 'flex';
  /* 보유 카드지(서버 share_theme_unlocks) 로드 후 그리드 갱신 — 잠금 표시 정확화 */
  fetchPurchasedShareThemes().then(() => { renderShareBgList(); }).catch(() => {});
  /* 원격 카드지(premium/royal) 비동기 로드 후 그리드 갱신 */
  loadShareBackgrounds().then(() => { renderShareBgList(); }).catch(() => {});
}
function closeShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'none';
}

/* 미리보기 펼치기/접기 토글 — 기본 접힘, 펼칠 때 캔버스 렌더 */
document.getElementById('share-preview-toggle')?.addEventListener('click', () => {
  const wrap = document.getElementById('share-preview-wrap');
  const icon = document.getElementById('share-preview-icon');
  const label = document.getElementById('share-preview-label');
  if (!wrap) return;
  const opening = wrap.style.display === 'none' || !wrap.style.display;
  wrap.style.display = opening ? 'flex' : 'none';
  if (icon)  icon.textContent  = opening ? 'unfold_less' : 'unfold_more';
  if (label) label.textContent = opening ? '카드 접기'   : '카드 펼치기';
  if (opening) { try { renderShareCardCurrent(); } catch {} }
});

document.getElementById('share-close')?.addEventListener('click', closeShareModal);
document.getElementById('share-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'share-modal') closeShareModal();
});
document.querySelectorAll('#share-modal .share-tab').forEach((el) => {
  el.addEventListener('click', () => {
    shareState.tab = el.dataset.tab;
    document.querySelectorAll('#share-modal .share-tab').forEach((x) => {
      const active = x.dataset.tab === shareState.tab;
      x.style.fontWeight = active ? '700' : '600';
      x.style.color = active ? 'var(--espresso)' : 'var(--walnut)';
      x.style.borderBottom = `2px solid ${active ? 'var(--espresso)' : 'transparent'}`;
    });
    renderShareBgList();
  });
});
document.getElementById('share-download')?.addEventListener('click', async () => { await downloadShareCard(); bumpShareCount(); });
/* 이미지 보내기 — Web Share files (캔버스 PNG) */
document.getElementById('share-send-image')?.addEventListener('click', async () => { await shareImage(); bumpShareCount(); });
/* 링크 보내기 — Web Share text+url, OG 메타 기반 카드 미리보기 */
document.getElementById('share-send-link')?.addEventListener('click', async () => { await shareLink(); bumpShareCount(); });

/* payload 추출 — 오늘의 카드 / 카드 상세에서 공통 */
function payloadForToday() {
  const c = state.todayCard || {};
  const w = c.works || {};
  const { metaKo, metaEn } = shareMetaLinesFromWork(w);
  return {
    cardId: c.card_id,
    quote: c.quote || '',
    speaker: c.speaker || '',
    work: w.title || '',
    workId: w.work_id ?? null,
    author: w.author || '',
    metaKo, metaEn,
    coverUrl: w.cover_url || '',
  };
}
function payloadForDetail() {
  const c = state.detailCard || {};
  const w = c.works || {};
  const { metaKo, metaEn } = shareMetaLinesFromWork(w);
  return {
    cardId: c.card_id,
    quote: c.quote || '',
    speaker: c.speaker || '',
    work: w.title || '',
    workId: w.work_id ?? null,
    author: w.author || '',
    metaKo, metaEn,
    coverUrl: w.cover_url || '',
  };
}

document.getElementById('today-share')?.addEventListener('click', () => openShareModal(payloadForToday()));
document.getElementById('detail-share')?.addEventListener('click', () => openShareModal(payloadForDetail()));
