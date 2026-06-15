// Daily Script SPA — Android HomeScreen/ArchiveScreen/SettingsScreen/DetailScreen port
import { getSupabase } from '/assets/supabase-client.js';
/* OZ's house iframe 이 부모의 Supabase 클라이언트에 접근하기 위해 window 에 노출 */
window.getSupabase = getSupabase;
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
    const amplitudeUserId = (!state.isAnonymous && state.userLoginId)
      ? state.userLoginId
      : String(state.userId);
    identify(amplitudeUserId);
    // 회원/익명 구분 + (회원이면) 성별·나이대를 Amplitude User Property로 전송 (타겟층 분석용)
    // user_pk: login_id로 식별해도 DB 내부 user_id로 역추적할 수 있게 보존
    setUserProps({
      accountType: state.isAnonymous ? 'anonymous' : 'member',
      gender: state.isAnonymous ? null : state.userGender,
      ageGroup: state.isAnonymous ? null : state.userAgeGroup,
      userPk: state.userId != null ? String(state.userId) : null,
    });
    paintAuthIdentity();
    await Promise.all([loadAllCards(), loadBookmarks(), loadBookmarkCounts(), loadCommentCounts()]);
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

  // 소셜 로그인 직후라면 이전 익명 user_id의 북마크를 옮긴다
  if (!state.isAnonymous) {
    // 회원가입 직후라면 저장해둔 프로필(로그인 ID·성별·나이대)을 새 행에 기록
    await applySignupProfile(sb, state.userId);
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
 * users.session_id 비교로 다른 기기에서 동일 ID 로그인이 발생했는지 감지.
 *  - localStorage의 sessionId가 비어있다 → 방금 로그인됨 → 새 sessionId 발급해 DB+local 양쪽 저장
 *  - 두 값 일치 → OK
 *  - 두 값 불일치 → 다른 기기에서 새 로그인이 발생 → 강제 로그아웃 + 안내
 */
async function enforceSingleSession(sb) {
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
    const { data, error } = await sb
      .from('cards')
      .select('card_id, work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, created_at, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, works(work_id, title, subtitle, format, author, release_year, characters, title_original, subtitle_original, author_original, cover_url)')
      .order('card_id', { ascending: false }).limit(500);
    if (error) throw error;
    state.allCards = Array.isArray(data) ? data : [];
  })().finally(() => { loadAllCardsInFlight = null; });
  return loadAllCardsInFlight;
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
      .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, works(work_id, title, subtitle, format, author, release_year, characters, title_original, subtitle_original, author_original, cover_url))')
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
        .select('bookmark_id, card_id, created_at, cards(card_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity, significance, view_count, works(work_id, title, subtitle, format, author, release_year, characters, cover_url))')
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
  });
});
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
        <span class="lib-count">${escapeHtml(displayName)}</span>`
      : `<div class="lib-cover" style="background:${leatherColorFor(w.title)};">
          <div class="lib-cover-fallback">
            <span class="lib-cover-meta">${escapeHtml(label)}</span>
            <span class="lib-cover-title" style="font-size:${fontSize}px;">${escapeHtml(displayName)}</span>
            <span class="lib-cover-meta">${escapeHtml((w.author || '').toUpperCase())}</span>
          </div>
        </div>
        <span class="lib-count">${escapeHtml(displayName)}</span>`;
    btn.addEventListener('click', () => {
      track('library_book_opened', { work_key: w.key });
      openBookModal(w, allWorks);
    });
    gridEl.appendChild(btn);
  }

  // 페이지 버튼 — 그리드 바로 아래 한 줄
  let pagesEl = document.getElementById('archive-pages');
  if (!pagesEl) {
    pagesEl = document.createElement('div');
    pagesEl.id = 'archive-pages';
    // main padding(30 + safe-area)이 nav 회피 — pages 자체 margin 최소화
    pagesEl.style.cssText = 'display:flex;justify-content:center;gap:8px;margin:16px 0 0;flex-wrap:wrap;';
    gridEl.parentNode.insertBefore(pagesEl, gridEl.nextSibling);
  }
  if (totalPages <= 1) {
    pagesEl.style.display = 'none';
  } else {
    pagesEl.style.display = 'flex';
    const btns = [];
    if (safePage > 1) btns.push(`<button data-page="${safePage - 1}" class="lib-page-btn">‹</button>`);
    for (let p = 1; p <= totalPages; p++) {
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
  bookMetaEl.textContent = [label.toUpperCase(), work.author, work.year]
    .filter(Boolean).join(' · ');

  const book = bookModal.querySelector('.book');
  book.style.borderLeftColor = leatherColorFor(work.title);

  bookList.innerHTML = '';
  // 북마크된 card_id 집합 (체크 빠르게)
  const bookmarkedIds = new Set((state.bookmarks || []).map((b) => b?.card_id).filter((x) => x != null));
  work.cards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'book-quote-item';
    const meta = card.excerpt_description
      ? truncateText(cleanQuote(card.excerpt_description), 60)
      : '';
    const bookmarkedAt = formatBookmarkDate(card._bookmarkedAt);
    const isBookmarked = bookmarkedIds.has(card.card_id);
    // 북마크 표시 — 사용자 명세: 책 펼침 모달 안 카드 목록에서 북마크 한 카드 구별
    const bookmarkBadge = isBookmarked
      ? `<span class="book-quote-bookmark" style="position:absolute;top:8px;right:10px;display:inline-flex;align-items:center;gap:3px;color:var(--cta);">
          <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1;">bookmark</span>
        </span>`
      : '';
    item.style.position = 'relative';
    item.innerHTML = `
      ${bookmarkBadge}
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
        style="width:100%;height:100%;object-fit:cover;display:block;" />
    </div>`;
  }
  return `<div style="width:${w}px;height:${h}px;flex-shrink:0;background:${leatherColorFor(title)};box-shadow:0 1px 4px rgba(60,40,20,0.18);border-radius:${radius}px;position:relative;overflow:hidden;">
    ${fallback}
  </div>`;
}

// 온도/강도 → 한국어 정서 라벨. 데이터 범위 자동 정규화 (0~1 / 0~10 / 0~100 어느 것이든).
// 카드별로 다양한 라벨이 나오게 5단계 매핑.
function _normTone(n) {
  if (!Number.isFinite(n)) return null;
  // 0~1, 0~10, 0~100 자동 추정
  if (n > 10) return Math.min(1, n / 100);
  if (n > 1)  return Math.min(1, n / 10);
  return Math.max(0, Math.min(1, n));
}
function toneLabels(card) {
  if (!card) return null;
  const t = _normTone(Number(card.temperature));
  const i = _normTone(Number(card.intensity));
  // 온도 — 차가움/차분함/따스함/뜨거움/뜨거움
  const tempLabel = t == null ? null
    : t < 0.2 ? '차가움'
    : t < 0.4 ? '차분함'
    : t < 0.6 ? '미지근'
    : t < 0.8 ? '따스함'
    : '뜨거움';
  // 감도 — 잔잔/조용/적당/짙음/강렬
  const intensityLabel = i == null ? null
    : i < 0.2 ? '잔잔'
    : i < 0.4 ? '조용'
    : i < 0.6 ? '적당'
    : i < 0.8 ? '짙음'
    : '강렬';
  // 여운 — significance 길이 기반. 데이터 없으면 카드 본문 길이 fallback.
  const sigLen = String(card.significance || '').length;
  const excerptLen = String(card.script_excerpt || '').length;
  const baseLen = sigLen || Math.floor(excerptLen / 8);
  const aftertasteLabel = baseLen <= 0 ? null
    : baseLen < 40  ? '짧음'
    : baseLen < 80  ? '담백'
    : baseLen < 140 ? '보통'
    : baseLen < 220 ? '깊음'
    : '길음';
  return { tempLabel, intensityLabel, aftertasteLabel };
}

function renderDailyDate() {
  const el = document.getElementById('daily-date');
  if (!el) return;
  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  el.textContent = `${d.getFullYear()} · ${String(d.getMonth()+1).padStart(2,'0')} · ${String(d.getDate()).padStart(2,'0')} · ${days[d.getDay()]}`;
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
function renderDailyNotice() {
  const sec = document.getElementById('daily-section-notice');
  if (!sec) return;
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
      style="display:flex;align-items:center;width:100%;background:var(--latte);border:0.5px solid var(--sand);padding:12px 14px;cursor:pointer;text-align:left;">
      <span class="material-symbols-outlined" style="font-size:18px;color:var(--cta);margin-right:10px;flex-shrink:0;">campaign</span>
      <span class="daily-notice-title-line" style="flex:1;min-width:0;font-size:13px;color:var(--espresso);font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity 200ms;">${renderTitle(0)}</span>
      <span class="material-symbols-outlined" style="font-size:16px;color:var(--walnut);margin-left:8px;flex-shrink:0;">chevron_right</span>
    </button>
    <div style="height:28px;"></div>
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

  const renderBlock = (animate = false) => {
    const main = sorted[_newbooksMainIdx];
    if (!main) return;
    const rest = sorted.filter((_, i) => i !== _newbooksMainIdx);
    const sampleQuote = ((main.cards || [])[0]?.quote || '').slice(0, 60);
    const mainWork = (main.cards || [])[0]?.works || { title: main.title, cover_url: null };
    const applyHTML = () => {
      sec.innerHTML = renderTemplate(main, rest, mainWork, sampleQuote);
      attachClickHandlers(works);
    };
    if (animate) {
      // 박스(button)는 고정. 내부 .daily-newbook-main-inner 만 좌측 아웃 → 우측 인.
      const oldInner = sec.querySelector('.daily-newbook-main-inner');
      if (oldInner) {
        oldInner.style.transition = 'transform 380ms cubic-bezier(0.55, 0, 0.7, 1), opacity 300ms ease-in';
        oldInner.style.transform = 'translateX(-40%)';
        oldInner.style.opacity = '0';
        setTimeout(() => {
          applyHTML();
          const newInner = sec.querySelector('.daily-newbook-main-inner');
          if (newInner) {
            newInner.style.transition = 'none';
            newInner.style.transform = 'translateX(40%)';
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

  const renderTemplate = (main, rest, mainWork, sampleQuote) => `
    <button type="button" class="daily-newbook-main" data-work-key="${escapeHtml(main.key)}"
      style="display:block;width:100%;background:var(--espresso);color:var(--paper);border:none;padding:20px;cursor:pointer;text-align:left;min-height:var(--newbook-main-min-h,auto);box-sizing:border-box;overflow:hidden;position:relative;">
      <div class="daily-newbook-main-inner" style="display:flex;gap:16px;width:100%;align-items:center;">
        <div style="flex:1;min-width:0;">
          <span style="display:inline-block;background:var(--cta);color:var(--paper);font-size:10px;letter-spacing:0.15em;font-weight:700;padding:4px 10px;border-radius:12px;">NEW · 새로 들어온 고전</span>
          <h3 style="font-family:'Noto Serif KR','Nanum Myeongjo',serif;font-size:30px;margin:14px 0 8px;color:var(--paper);font-weight:700;letter-spacing:-0.02em;line-height:1.2;">${escapeHtml(main.series || displayTitle(main.title))}${main.subtitle ? ` <span style="font-size:0.6em;color:var(--sand);font-weight:600;">${escapeHtml(main.subtitle)}</span>` : ''}</h3>
          <p style="font-size:11px;color:var(--sand);margin:0 0 12px;letter-spacing:0.05em;">${escapeHtml(main.author || '')} · ${main.year || ''} · ${escapeHtml(GENRE_LABEL[main.format] || '기타')}</p>
          <p style="font-size:13px;color:var(--latte);margin:0;font-style:italic;line-height:1.5;font-family:'Noto Serif KR',serif;">"${escapeHtml(sampleQuote)}${sampleQuote.length >= 60 ? '⋯' : ''}"</p>
        </div>
        <!-- 책표지 — 얇은 베이지 림 + 그림자로 검은 표지 분리 (사용자 명세: 림 얇게) -->
        <div style="flex-shrink:0;padding:1px;background:var(--latte);border-radius:2px;box-shadow:0 6px 18px rgba(0,0,0,0.5);">
          ${dailyBookCoverHTML(mainWork, { width: 88 })}
        </div>
      </div>
    </button>
    <div style="display:flex;gap:12px;overflow-x:auto;padding:16px 0 8px;scrollbar-width:none;">
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

  const attachClickHandlers = (worksList) => {
    sec.querySelectorAll('[data-work-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.workKey;
        const w = worksList.find((x) => x.key === key);
        if (!w) return;
        track('daily_newbook_clicked', { work_key: key });
        // daily 탭 그대로 머무름 + 팝업만 표시 (LIBRARY 이동 X). 실타래 게이트는 openDetail.
        if (typeof openBookModal === 'function') openBookModal(w, worksList);
      });
    });
  };

  sec.style.display = 'block';

  // 가장 큰 메인 카드 높이 측정 — 9개 후보 모두 offscreen 렌더해 max(height) 산출 → CSS var 로 적용.
  // 카드마다 제목·인용 길이 달라 슬라이드 전환 시 화면이 튀는 문제 방지.
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

  // 10초마다 메인 책 다음 인덱스 — 추가된 순서(최신 1번 → 오래된 9번) 순환, 슬라이드 인 애니메이션
  if (sorted.length > 1) {
    _newbooksTimer = setInterval(() => {
      if (state.currentView !== 'daily') { stopNewbooksRotation(); return; }
      _newbooksMainIdx = (_newbooksMainIdx + 1) % sorted.length;
      renderBlock(true);
    }, 10000);
  }
}

// 섹션 3: 이럴 땐, 이런 문장
const CONTEXT_CATEGORIES = [
  { id: 'comfort', label: '위로가 필요할 때',
    keywords: ['위로', '슬픔', '아픔', '눈물', '치유', '회복', '안식', '평온', '포근', '따뜻', '따스', '기댐', '감싸', '쓰다듬', '받아들', '용서', '슬퍼', '아파'],
    // 차분~따스 + 강도 낮~중 (감정 짙으면 위로보다 절망)
    toneScore: (t, i) => {
      let s = 0;
      if (t != null) s += (t < 0.6 ? 2 : t < 0.8 ? 1 : 0);
      if (i != null) s += (i < 0.7 ? 1 : 0);
      return s;
    } },
  { id: 'flutter', label: '설레는 날',
    keywords: ['사랑', '설렘', '첫사랑', '두근', '떨림', '봄', '꽃', '만남', '청춘', '달콤', '가슴', '설레', '연인', '키스', '입맞춤', '미소', '눈빛', '입술'],
    // 따스~뜨거움 + 강도 중~높
    toneScore: (t, i) => {
      let s = 0;
      if (t != null) s += (t > 0.5 ? 2 : t > 0.3 ? 1 : 0);
      if (i != null) s += (i > 0.4 ? 1 : 0);
      return s;
    } },
  { id: 'lonely',  label: '먹먹한 밤',
    keywords: ['외로움', '그리움', '고독', '적막', '침묵', '회상', '공허', '먹먹', '쓸쓸', '낙엽', '회한', '밤하늘', '혼자', '홀로', '잊혀', '그립', '추억', '낙심', '비'],
    // 차분 + 잔잔 (낮은 온도 + 낮은 강도)
    toneScore: (t, i) => {
      let s = 0;
      if (t != null) s += (t < 0.5 ? 2 : 0);
      if (i != null) s += (i < 0.5 ? 2 : i < 0.7 ? 1 : 0);
      return s;
    } },
  { id: 'resolve', label: '결심이 필요할 때',
    keywords: ['결심', '의지', '도전', '용기', '운명', '신념', '다짐', '각오', '맞서', '투지', '이겨', '포기하지', '나아', '극복', '굳건', '강인', '싸움', '꿈', '희망', '믿음'],
    // 강도 높음 (뜨거움 + 강렬)
    toneScore: (t, i) => {
      let s = 0;
      if (i != null) s += (i > 0.6 ? 2 : i > 0.4 ? 1 : 0);
      if (t != null) s += (t > 0.5 ? 1 : 0);
      return s;
    } },
];
let _contextualTimer = null;
let _contextualCatId = null;
let _contextualCardIdx = 0;
function stopContextualCarousel() {
  if (_contextualTimer) { clearInterval(_contextualTimer); _contextualTimer = null; }
}
// 카드의 키워드 + 본문(quote/excerpt/significance) 에서 카테고리 키워드 매칭.
// 매칭된 키워드 수 + tone 점수 합산 → 높은 점수 카드 우선.
function filterContextualCards(catId) {
  const cat = CONTEXT_CATEGORIES.find((c) => c.id === catId) || CONTEXT_CATEGORIES[0];
  const cards = state.allCards || [];
  const scored = [];
  for (const card of cards) {
    const kws = Array.isArray(card.keywords) ? card.keywords : [];
    const haystack = (kws.join(' ') + ' ' + (card.quote || '') + ' ' + (card.script_excerpt || '') + ' ' + (card.significance || '')).toLowerCase();
    // 키워드 매칭 점수 — 매칭된 카테고리 키워드 수
    let kwHits = 0;
    for (const t of cat.keywords) { if (haystack.includes(t.toLowerCase())) kwHits++; }
    if (kwHits === 0) continue;
    // tone 점수 — temperature/intensity 가 카테고리에 맞는지
    const t = _normTone(Number(card.temperature));
    const i = _normTone(Number(card.intensity));
    const toneS = typeof cat.toneScore === 'function' ? cat.toneScore(t, i) : 0;
    scored.push({ card, score: kwHits * 3 + toneS });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12).map((x) => x.card);
}
function renderDailyContextual() {
  const sec = document.getElementById('daily-section-contextual');
  if (!sec) return;
  stopContextualCarousel();
  sec.style.display = 'block';
  sec.innerHTML = `
    <h2 class="t-headline-md c-espresso" style="margin:0 0 4px;">이럴 땐, 이런 문장</h2>
    <p class="t-body-sm c-walnut" style="margin:0 0 14px;">지금 마음에 맞춰 한 문장을 골라드려요</p>
    <div class="archive-chips" id="daily-context-chips" style="margin-bottom:16px;">
      ${CONTEXT_CATEGORIES.map((c, i) => `<button class="a-chip ${i === 0 ? 'active' : ''}" data-ctx="${c.id}">${escapeHtml(c.label)}</button>`).join('')}
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
    const card = cards[_contextualCardIdx % cards.length];
    const labels = toneLabels(card);
    const chipsHtml = labels && (labels.tempLabel || labels.intensityLabel || labels.aftertasteLabel)
      ? `<div style="display:flex;gap:14px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
          ${labels.tempLabel ? `<span style="font-size:11px;color:var(--walnut);">온도 <strong style="color:var(--cta);font-weight:600;margin-left:4px;">${escapeHtml(labels.tempLabel)}</strong></span>` : ''}
          ${labels.intensityLabel ? `<span style="font-size:11px;color:var(--walnut);">감도 <strong style="color:var(--cta);font-weight:600;margin-left:4px;">${escapeHtml(labels.intensityLabel)}</strong></span>` : ''}
          ${labels.aftertasteLabel ? `<span style="font-size:11px;color:var(--walnut);">여운 <strong style="color:var(--cta);font-weight:600;margin-left:4px;">${escapeHtml(labels.aftertasteLabel)}</strong></span>` : ''}
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
  switchTo(CONTEXT_CATEGORIES[0].id);
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
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;">
      <h2 class="t-headline-md c-espresso">이번 주 인기 대사</h2>
      <button id="daily-trending-all" class="t-label-sm c-walnut" style="background:transparent;border:none;cursor:pointer;">전체 ›</button>
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
  sec.querySelector('#daily-trending-all')?.addEventListener('click', () => setView('archive'));
}

// 섹션 5: 오즈 추천
function renderDailyOzPick() {
  const sec = document.getElementById('daily-section-oz');
  if (!sec) return;
  const taste = new Set();
  if (Array.isArray(state.userTasteKeywords)) state.userTasteKeywords.forEach((k) => taste.add(k));
  if (Array.isArray(state.tasteKeywords)) state.tasteKeywords.forEach((k) => taste.add(k));
  for (const b of (state.bookmarks || [])) {
    const card = b?.cards;
    if (card?.keywords && Array.isArray(card.keywords)) card.keywords.forEach((k) => taste.add(k));
  }
  const allCards = state.allCards || [];
  if (allCards.length === 0) { sec.style.display = 'none'; return; }

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

  // 취향(북마크 키워드)이 생긴 뒤엔 취향과 겹치는 카드로 한 번 승급 — 취향이 없던 시점에
  // 캐시된 비매칭 카드가 그날 내내 고정돼 "당신이라면" 개인화 문구가 안 뜨던 문제 방지.
  if (pick && taste.size > 0 && !(pick.keywords || []).some((k) => taste.has(k))) {
    pick = null;
  }

  if (!pick) {
    const matched = allCards.filter((card) => {
      const kws = Array.isArray(card.keywords) ? card.keywords : [];
      return kws.some((k) => taste.has(k));
    });
    const pool = matched.length > 0 ? matched : allCards;
    pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) safeStorageSet(OZ_DAILY_KEY, JSON.stringify({ date: todayKey, cardId: pick.card_id }));
  }
  if (!pick) { sec.style.display = 'none'; return; }
  const matchedKw = (pick.keywords || []).find((k) => taste.has(k));
  const reason = matchedKw
    ? `'${matchedKw}'에 자주 머무는 당신이라면, 좋아할 한 문장이에요.`
    : '오즈가 오늘 골라드린 한 문장이에요.';
  const work = pick.works || {};
  // 사용자 선호 메타 — "당신의 취향 · 비극 · 운명" 형식
  const tasteMeta = [];
  tasteMeta.push('당신의 취향');
  const formatLabel = GENRE_LABEL[work.format];
  if (formatLabel) tasteMeta.push(formatLabel);
  if (matchedKw) tasteMeta.push(matchedKw);
  const metaText = tasteMeta.join(' · ');

  sec.style.display = 'block';
  sec.innerHTML = `
    <h2 class="t-headline-md c-espresso" style="margin:0 0 14px;">오즈의 오늘의 추천</h2>
    <article class="sharp-card daily-oz-card" data-card-id="${pick.card_id}" style="padding:20px;cursor:pointer;">
      <!-- 오즈 헤더 — 책 위 고양이 + 이름 + 메타 -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <img src="assets/cat/cat_shelf_few.png" alt="오즈"
          style="width:72px;height:auto;flex-shrink:0;pointer-events:none;user-select:none;-webkit-user-drag:none;" />
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-weight:700;color:var(--espresso);font-size:14px;">오즈</p>
          <p style="margin:2px 0 0;font-size:11px;color:var(--walnut);">${escapeHtml(metaText)}</p>
        </div>
      </div>
      <!-- 추천 한마디 박스 (별도) -->
      <div style="background:var(--latte);border:0.5px solid var(--sand);padding:14px 16px;margin-bottom:14px;border-radius:8px;">
        <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:13px;color:var(--espresso);line-height:1.6;">${escapeHtml(reason)}</p>
      </div>
      <!-- 책표지(좌측) + 제목/작가/연도(우측) -->
      <div style="display:flex;align-items:center;gap:12px;">
        ${dailyBookCoverHTML(work, { width: 56 })}
        <div style="flex:1;min-width:0;">
          <p style="margin:0;font-family:'Noto Serif KR',serif;font-size:15px;color:var(--espresso);font-weight:700;line-height:1.3;">${escapeHtml(work.title || '')}</p>
          <p style="margin:4px 0 0;font-size:12px;color:var(--walnut);">${escapeHtml(work.author || '')}${work.release_year ? ' · ' + work.release_year : ''}</p>
        </div>
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
}

// 랜덤 고양이 spawn — 오즈 카드 클릭 시 view-daily 안 랜덤 위치에 생성, 10초 후 페이드아웃.
const RANDOM_CAT_FILES = ['cat_confused.png', 'cat_empty.png', 'cat_idle.png', 'cat_shelf_few.png', 'cat_shelf_many.png', 'cat_struck.png'];
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
    <h2 style="font-family:'Noto Serif KR',serif;font-size:20px;color:var(--espresso);margin:0 0 6px;font-weight:700;">다시 만나기</h2>
    <p class="t-body-sm c-walnut" style="margin:0 0 14px;">지난주 담아둔 문장, 다시 읽어볼까요</p>
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
    if (!confirm('이 댓글을 삭제할까요?')) return;
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
    if (!confirm('이 한줄을 삭제할까요?')) return;
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
  wrap.style.cssText = 'padding:16px 0;border-bottom:0.5px solid var(--latte);';
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
  // 하이라이트는 Delete 만 (Edit 제거).
  myfeedList.querySelectorAll('.mfh-delete-btn').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('이 하이라이트를 삭제할까요?')) return;
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
  wrap.style.cssText = 'padding:16px 0;border-bottom:0.5px solid var(--latte);';
  wrap.innerHTML = `
    <p class="t-label-sm c-walnut" style="margin-bottom:6px;">${escapeHtml(meta)}</p>
    <p class="t-title-lg c-espresso" style="margin-bottom:8px;word-break:keep-all;">${escapeHtml(title)}${subtitle ? '  <span class="t-body-sm c-walnut">'+escapeHtml(subtitle)+'</span>' : ''}</p>
    <p style="font-family:'Nanum Myeongjo',Georgia,serif;font-size:15px;line-height:28px;color:var(--espresso);white-space:pre-wrap;word-break:keep-all;">“${escapeHtml(h.selected_text || '')}”</p>
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
    paintAuthIdentity();
    closeNicknameModal();
    toast('프로필이 저장됐어요');
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

signOutBtn.addEventListener('click', async () => {
  const msg = state.isAnonymous
    ? '익명 세션을 종료할까요? 다시 입장하면 새 익명 ID가 생성됩니다.'
    : '로그아웃할까요? 다음 로그인 전까지 익명 세션으로 동작합니다.';
  if (!confirm(msg)) return;
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
// 카카오: Supabase가 account_email 스코프를 강제 → 카카오 "비즈니스 앱" 필요. 그 전까진 "준비 중" 안내.
// 비즈앱 전환 후 동의항목(account_email/profile_image) 켜지면 아래 한 줄을 startOAuth('kakao')로 되돌리면 됨.
signinKakao?.addEventListener('click', () => toast('카카오 로그인은 준비 중입니다.'));

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

// 카드 첫 열람 보상 — 카드당 1회 +1 실타래 (중복 지급 없음).
//   로컬 키 ds.yarnRewarded 에 카드ID 기록 → optimistic 차단 후 RPC 호출.
const YARN_REWARDED_KEY = 'ds.yarnRewarded';
function getRewardedMap() {
  try {
    const raw = JSON.parse(safeStorageGet(YARN_REWARDED_KEY, 'null') || 'null');
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
  safeStorageSet(YARN_REWARDED_KEY, JSON.stringify(map));
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
      /* 잔액이 실제로 늘었을 때만 토스트 — 이미 보상 받은 카드면 노이즈 X */
      if (newBalance > prev) {
        try { toast('실타래 +1 (카드 첫 열람)'); } catch {}
      }
    }
  } catch (e) {
    console.warn('[m] rewardYarnForFirstView failed:', e);
  }
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
const ATTENDANCE_HISTORY_KEY = 'ds.attendance.history';
const ATTENDANCE_LAST_SHOWN_KEY = 'ds.attendance.lastShown';
const ATTENDANCE_REWARD = 5;

function getAttendanceHistory() {
  try {
    const raw = JSON.parse(safeStorageGet(ATTENDANCE_HISTORY_KEY, 'null') || 'null');
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}
function hasAttendanceToday() {
  return getAttendanceHistory().includes(todayStr());
}
function markAttendanceToday() {
  const t = todayStr();
  const h = getAttendanceHistory();
  if (h.includes(t)) return false;
  h.push(t);
  safeStorageSet(ATTENDANCE_HISTORY_KEY, JSON.stringify(h));
  return true;
}

function buildAttendanceCalendarHTML() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const history = new Set(getAttendanceHistory());
  const todayKey = todayStr();
  const yarnImg = `<img src="assets/daily-script-bar.png" alt="실타래" style="width:22px;height:22px;object-fit:cover;border-radius:50%;display:block;" />`;
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
      `<div style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:8px;${borderStyle}background:${attended ? 'rgba(216,160,90,0.14)' : 'transparent'};gap:2px;">
        <span style="font-size:11px;color:${attended ? 'var(--espresso)' : 'var(--walnut)'};font-weight:${isToday ? 700 : 500};">${d}</span>
        <div style="height:22px;display:flex;align-items:center;justify-content:center;">${attended ? yarnImg : ''}</div>
      </div>`
    );
  }
  while (cells.length % 7 !== 0) cells.push('<div></div>');
  return `
    <p style="text-align:center;font-family:'Noto Serif KR',serif;font-size:18px;color:var(--espresso);font-weight:700;margin:0 0 12px;">${year}년 ${month + 1}월</p>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;width:100%;">${head}${cells.join('')}</div>
  `;
}

// 출석현황 보기 — MY 진입용. 보상 지급 없이 달력만 띄움.
function openAttendanceModal() {
  const modal = document.getElementById('attendance-modal');
  if (!modal) return;
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
  const today = todayStr();
  if (safeStorageGet(ATTENDANCE_LAST_SHOWN_KEY) === today) return;
  safeStorageSet(ATTENDANCE_LAST_SHOWN_KEY, today);
  const newAttendance = markAttendanceToday();  // true = 오늘 출석 첫 기록 → 보상 지급
  if (newAttendance) {
    try {
      const balance = await grantYarnRpc(ATTENDANCE_REWARD);
      state.yarnPurchased = balance;
      renderYarnChip();
    } catch (e) { console.warn('[m] attendance grant failed:', e); }
    try { track('attendance_check', { date: today }); } catch {}
  }
  const modal = document.getElementById('attendance-modal');
  if (!modal) return;
  const grid = modal.querySelector('#attendance-grid');
  const reward = modal.querySelector('#attendance-reward-msg');
  if (grid) grid.innerHTML = buildAttendanceCalendarHTML();
  if (reward) reward.style.display = newAttendance ? 'block' : 'none';
  modal.style.display = 'flex';
  modal.querySelector('#attendance-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  }, { once: true });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  }, { once: true });
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

// 첫 진입 시 1회 자동 노출. 띄웠으면 true 반환 → 같은 부팅에서 랜딩 로그인 유도는 미룬다.
async function maybeShowGuide() {
  if (safeStorageGet(GUIDE_SEEN_KEY) === '1') return false;
  if (!document.querySelector('#coachmark')) return false;
  if (state.currentView !== 'home' || !state.todayCard) return false;  // 홈·오늘 카드 준비됐을 때만
  await onboardingReady;  // 동적 import 완료까지 대기 → 첫 진입 사용자에게 무조건 노출
  const started = launchTour();
  if (started) { safeStorageSet(GUIDE_SEEN_KEY, '1'); track('onboarding_start'); }
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
  // 회원가입 전용 UI(중복확인 버튼·성별·나이대) 토글 + 중복확인 상태 초기화
  const isSignup = (mode === 'signup');
  if (signupIdCheckBtn) signupIdCheckBtn.style.display = isSignup ? '' : 'none';
  if (signupExtra) signupExtra.style.display = isSignup ? 'block' : 'none';
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
  const email = idToEmail(id);
  if (!email) {
    showSigninError('아이디를 입력해주세요.');
    return;
  }
  if (!password) {
    showSigninError('비밀번호를 입력해주세요.');
    return;
  }
  if (signinMode === 'signup' && !signupIdAvailable) {
    showSigninError('아이디 중복확인을 해주세요.');
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
      // 가입 프로필 보존 — reload 후 bootstrapAuth가 새 user 행에 기록
      safeStorageSet('ds.signupProfile', JSON.stringify({
        login_id: id,
        gender: signupGender?.value || null,
        age_group: signupAge?.value || null,
      }));
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
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
  rewardYarnForFirstView(card.card_id);
  openDetailApproved(card);
}

function openDetailApproved(card) {
  if (!card) return;
  setBottomNavCat('cat_library.png', 'right-far', 'large');   // 카드 상세 — 책장 앞 자세, 우측 하단 + 크게
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
  detailMeta.style.flexDirection = 'column';
  detailMeta.innerHTML =
      `<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">`
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
  detailMeta.innerHTML =
      `<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">`
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
  if (!confirm('이 댓글을 삭제할까요?')) return;
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
    <div class="feed-quote-panel">${escapeHtml(post.body || '')}</div>
    <div class="feed-book-line">
      <p class="fb-title">${escapeHtml(title)}</p>
      ${author ? `<p class="fb-author">${escapeHtml(author)}</p>` : ''}
      ${coverHtml}
    </div>
  `;
  // 카드 탭 → 피드 글 상세(명대사 + 본문 + 댓글) — FeedPostDetailSheet 미러
  wrap.addEventListener('click', () => openFeedPostDetail(post));
  return wrap;
}

// 카테고리 칩 클릭 → state 변경 후 재렌더 + localStorage 저장 (새로고침 유지)
document.querySelectorAll('#feed-chips .a-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
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
  // 명대사 박스 복원 (하이라이트 모드에서 숨겼던 경우)
  const quoteBox = fpQuote ? fpQuote.closest('div[style*="card-warm"], div[style*="padding:32px"]') || fpQuote.parentElement : null;
  if (quoteBox) quoteBox.style.display = '';
  // 명대사 읽어보기 표시, 카드 보기 숨김 (피드 글 모드)
  const openCardBtn = document.getElementById('fp-open-card');
  const highlightCardViewBtn = document.getElementById('fp-highlight-card-view');
  if (openCardBtn) openCardBtn.style.display = '';
  if (highlightCardViewBtn) highlightCardViewBtn.style.display = 'none';
  const card = post.cards || {};
  const w = card.works || {};
  if (fpQuote) fpQuote.textContent = cleanQuote(card.quote) || '명대사 준비 중';
  const src = [displayTitle(w.title), w.author].filter(Boolean).join(' · ');
  if (fpSource) fpSource.textContent = src ? `— ${src}` : '';
  if (fpAuthor) fpAuthor.textContent = post.author_nickname || '익명';
  if (fpDate) fpDate.textContent = formatBookmarkDate(post.created_at) || formatRelativeTime(post.created_at);
  if (fpBody) fpBody.textContent = post.body || '';
  paintFeedCommentForm();
  if (fpCommentInput) fpCommentInput.value = '';
  updateFpCounter();
  state.feedPostComments = [];
  renderFeedComments();
  history.pushState({ overlay: 'feedPost' }, '');
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
  //   책표지(120x170 cover_url 또는 가죽색 폴백) + selected_text(큰 serif) + 출처 + '카드 보기' 버튼
  const quoteBox = fpQuote ? fpQuote.closest('div[style*="card-warm"], div[style*="padding:32px"]') || fpQuote.parentElement : null;
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
    quoteBox.innerHTML = `
      ${coverHTML}
      <div style="height:22px;"></div>
      <p id="fp-quote" class="t-headline-md c-espresso" style="line-height:1.6;font-family:'Noto Serif KR','Nanum Myeongjo',Georgia,serif;text-align:center;margin:0;">${escapeHtml(highlight.selected_text || '')}</p>
      ${source ? `<div style="height:16px;"></div><p id="fp-source" class="t-label-sm c-walnut" style="letter-spacing:0.1em;text-align:center;margin:0;">— ${escapeHtml(source)}</p>` : '<p id="fp-source" style="display:none;"></p>'}
      <div style="height:24px;"></div>
      <button id="fp-open-card" class="sharp-btn" style="width:100%;">카드 보기</button>
    `;
    // fp-open-card 새로 만든 요소 — 핸들러 재등록 (실타래 게이트 자동)
    quoteBox.querySelector('#fp-open-card')?.addEventListener('click', () => {
      const h = state.currentHighlight;
      if (!h) return;
      const cardObj = (state.allCards || []).find((c) => c && c.card_id === h.card_id);
      track('highlight_card_view', { highlight_id: h.highlight_id, card_id: h.card_id });
      openDetail(cardObj || { card_id: h.card_id, ...(h.cards || {}) });
    });
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
  if (!confirm('이 댓글을 삭제할까요?')) return;
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

function closeFeedPostDetailInternal() {
  if (!feedpostScreen) return;
  feedpostScreen.classList.remove('open');
  // 하단바 cat 복귀 — view 기준 (피드면 cat_pen, 그 외 cat_today)
  showBottomNavCat();
  updateBottomNavCatForView(state.currentView);
  setTimeout(() => {
    feedpostScreen.style.display = 'none';
    document.body.style.overflow = '';
    // type 리셋 — 다음 진입 시 정확히 분기되게
    state.detailType = null;
    state.currentHighlight = null;
    // 피드 탭으로 돌아가면 글쓰기 말풍선 다시 표시
    if (feedFab && state.currentView === 'feed') feedFab.style.display = 'inline-flex';
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
$('#detail-go-library')?.addEventListener('click', () => {
  const card = state.detailCard;
  if (!card) return;
  track('detail_go_library', { card_id: card.card_id });
  // 라이브러리(archive) 로 이동 + 해당 작품 책 펼침 모달
  const allWorks = groupAllCardsByWork();
  const targetWork = allWorks.find((w) => (w.cards || []).some((c) => c.card_id === card.card_id));
  closeDetail();
  setTimeout(() => {
    setView('archive');
    setTimeout(() => { if (targetWork && typeof openBookModal === 'function') openBookModal(targetWork, allWorks); }, 80);
  }, 260);
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
if (fpOpenCard) fpOpenCard.addEventListener('click', openCardFromFeedPost);
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
  // 커스텀 selection 이 활성화돼 있으면 그대로 둠
  const customText = (typeof window.__getScriptHlText === 'function') ? window.__getScriptHlText() : '';
  if (customText) { hlAddBtn.style.display = 'block'; return; }
  // native selection (데스크톱)
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
    // 표지 fallback — 작품 제목 일부를 박스 안에
    hlCoverFallback.textContent = subtitle || title || '';
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
    item.innerHTML = `
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
        <p>${escapeHtml(h.selected_text || '')}</p>
        <span class="close-q">”</span>
      </div>
      <p class="hl-card-foot">#${String(h.card_id).padStart(5,'0')}</p>
    `;
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => openHighlightDetail(h));
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
  if (view === 'feed') setBottomNavCat('cat_pen.png', 'right', 'large');             // 피드 — LIBRARY 와 동일 위치 (왼쪽)
  else if (view === 'archive') setBottomNavCat('cat_struck.png', 'right', 'large');   // LIBRARY — 카드 상세 크기와 동일
  else if (view === 'daily' || view === 'settings') setBottomNavCat('cat_empty.png', 'corner'); // daily/MY 동일
  else setBottomNavCat('cat_today.png', 'center');
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
  return lines.map((line, i) => {
    const safe = escapeHtml(line);
    const t = line.trim();
    if (!t) return safe;
    const isBlockStart = i === 0 || lines[i - 1].trim() === '';
    if (!isBlockStart) return safe;
    const namePart = t.split('(')[0].trim();
    const isSpeaker = nameSet.has(t) || nameSet.has(namePart);
    return isSpeaker ? `<strong>${safe}</strong>` : safe;
  }).join('\n');
}

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
