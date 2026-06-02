// Project Gutenberg — 영문(및 다국어) PD 문학 전체 본문 가져오기.
//
// 흐름:
//  1) searchGutenberg(query) — Gutendex (https://gutendex.com) 카탈로그 검색
//  2) fetchGutenbergText(bookId) — Gutenberg cache 의 plain-text(UTF-8) 다운로드
//     → 헤더/푸터 boilerplate 제거 → 본문만 반환
//
// 큰 작품(예: War and Peace ~3MB)은 MAX_FETCH_CHARS 로 잘라낸다 — extract 가
// 다시 400K 로 잘라내므로 의미 있는 한계.

const GUTENDEX_BASE = 'https://gutendex.com/books';
const WIKIPEDIA_KO_API = 'https://ko.wikipedia.org/w/api.php';
const UA = 'CurtaincallScraperGB/0.1 (admin tool; contact: yub)';
const FETCH_TIMEOUT_MS = 60_000;  // Gutendex /books?search 가 종종 느림 — 직접 ID 조회는 보통 5~10s.
const MAX_FETCH_CHARS = 1_000_000; // ~1MB plain text

// 입력에 한글 음절이 하나라도 있으면 Korean 으로 간주.
function containsKorean(s) {
  return /[가-힯]/.test(String(s || ''));
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`gutendex HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/plain' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`gutenberg HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 한국어 작품명 → 영어 작품명. ko.wikipedia 의 langlinks(lllang=en) 사용.
//  - 1차: action=query + titles=<query> + redirects=1 → 정확 일치 페이지의 영문 링크
//  - 2차(1차 실패시): opensearch 로 가장 가까운 ko 페이지 찾아서 다시 langlinks
//  - 모두 실패하면 null 반환 (호출자가 원문 그대로 검색)
export async function translateKoreanTitleToEnglish(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const directEn = await fetchEnLangLink(q);
  if (directEn) return directEn;

  // 정확 일치 페이지가 없으면 opensearch 로 후보를 받는다
  const osUrl = new URL(WIKIPEDIA_KO_API);
  ['action=opensearch', `search=${encodeURIComponent(q)}`, 'limit=5', 'namespace=0', 'format=json']
    .forEach((p) => { const [k, v] = p.split('='); osUrl.searchParams.set(k, v); });
  let osTitles = [];
  try {
    const osJson = await getJson(osUrl.toString());
    if (Array.isArray(osJson?.[1])) osTitles = osJson[1];
  } catch { /* swallow */ }

  for (const candidate of osTitles) {
    if (candidate === q) continue; // 이미 위에서 시도
    const en = await fetchEnLangLink(candidate);
    if (en) return en;
  }
  return null;
}

async function fetchEnLangLink(koTitle) {
  const url = new URL(WIKIPEDIA_KO_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', koTitle);
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', 'en');
  url.searchParams.set('lllimit', '1');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  try {
    const j = await getJson(url.toString());
    const pages = j?.query?.pages || {};
    for (const pid of Object.keys(pages)) {
      const page = pages[pid];
      if (page?.missing != null) continue;
      const links = Array.isArray(page?.langlinks) ? page.langlinks : [];
      const en = links.find((l) => l?.lang === 'en')?.['*'];
      if (en) return String(en);
    }
  } catch { /* swallow */ }
  return null;
}

// Gutendex 검색 → 카탈로그 항목 목록
//   author 정보까지 함께 돌려주므로 UI 에서 풍부한 리스트를 그릴 수 있다.
//   languages 가 'ko' 인 PD 한국 문학도 일부 있지만, 본 어댑터는 영문 (en) 기본.
//   한국어로 입력하면 ko.wikipedia 의 langlinks 로 자동 영문 변환 후 검색.
// 카테고리(=bookshelf 또는 subject 유사어) 로 작품 목록 조회.
//  - Gutendex /books?topic=<keyword> 가 bookshelves + subjects 둘 다 검색.
//  - 우리 UI 카테고리명(예: "Crime, Thrillers & Mystery") 은 그대로 topic 검색에
//    넣기에 너무 합성적이라 keywordsForCategory 로 간단한 매핑/정제 후 사용.
//  - 결과는 다국어 섞임 가능 — 1차로 영문(en) 우선, 동일 title+author 중복 제거.
//  - 응답은 최대 100건 (Gutendex page=1) — UI 측에서 표시.
const CATEGORY_TOPIC = {
  'adventure': 'adventure',
  'american literature': 'american fiction',
  'british literature': 'english fiction',
  'french literature': 'french fiction',
  'german literature': 'german fiction',
  'russian literature': 'russian fiction',
  'classics of literature': 'fiction',
  'biographies': 'biography',
  'novels': 'fiction',
  'short stories': 'short stories',
  'poetry': 'poetry',
  'plays/films/dramas': 'drama',
  'romance': 'love stories',
  'science-fiction & fantasy': 'science fiction',
  'crime, thrillers & mystery': 'detective',
  'mythology, legends & folklore': 'mythology',
  'humour': 'humor',
  'children & young adult reading': "children's literature",
  'literature - other': 'literature',
  // Science & Technology
  'engineering & technology': 'engineering',
  'mathematics': 'mathematics',
  'science - physics': 'physics',
  'science - chemistry/biochemistry': 'chemistry',
  'science - biology': 'biology',
  'science - earth/agricultural/farming': 'agriculture',
  'research methods/statistics/information sys': 'statistics',
  'environmental issues': 'environment',
  // History
  'history - american': 'united states history',
  'history - british': 'great britain history',
  'history - european': 'europe history',
  'history - ancient': 'ancient history',
  'history - medieval/middle ages': 'middle ages',
  'history - early modern (c. 1450-1750)': 'early modern history',
  'history - modern (1750+)': 'modern history',
  'history - religious': 'church history',
  'history - royalty': 'royalty',
  'history - warfare': 'military history',
  'history - schools & universities': 'education history',
  'history - other': 'history',
  'archaeology & anthropology': 'archaeology',
  // Social Sciences & Society
  'business/management': 'business',
  'economics': 'economics',
  'law & criminology': 'law',
  'gender & sexuality studies': 'gender',
  'psychiatry/psychology': 'psychology',
  'sociology': 'sociology',
  'politics': 'politics',
  'parenthood & family relations': 'family',
  'old age & the elderly': 'old age',
  // Arts & Culture
  'art': 'art',
  'architecture': 'architecture',
  'music': 'music',
  'fashion': 'fashion',
  'journalism/media/writing': 'journalism',
  'language & communication': 'language',
  'essays, letters & speeches': 'essays',
  // Religion & Philosophy
  'religion/spirituality': 'religion',
  'philosophy & ethics': 'philosophy',
  // Lifestyle & Hobbies
  'cooking & drinking': 'cooking',
  'sports/hobbies': 'sports',
  'how to ...': 'self-help',
  'travel writing': 'travel',
  'nature/gardening/animals': 'nature',
  'sexuality & erotica': 'erotica',
  // Health & Medicine
  'health & medicine': 'medicine',
  'drugs/alcohol/pharmacology': 'pharmacy',
  'nutrition': 'nutrition',
  // Education & Reference
  'encyclopedias/dictionaries/reference': 'reference',
  'teaching & education': 'education',
  'reports & conference proceedings': 'conferences',
  'journals': 'periodicals',
};

function keywordForCategory(name) {
  const key = String(name || '').trim().toLowerCase();
  if (CATEGORY_TOPIC[key]) return CATEGORY_TOPIC[key];
  // 매핑 없으면 안전한 fallback — 카테고리명 그대로 (Gutendex topic 이 subject 매칭 시도)
  return String(name || '').replace(/&/g, ' ').replace(/[\/,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function listGutenbergByCategory(categoryName, limit = 50) {
  const cat = String(categoryName || '').trim();
  if (!cat) return { works: [], topic: '' };
  const topic = keywordForCategory(cat);
  const url = new URL(GUTENDEX_BASE);
  url.searchParams.set('topic', topic);
  // 가능하면 영어 우선 (다국어 PD 가 섞이지만 영문 PDF 추출이 우리 흐름이라 영어가 자연스러움)
  url.searchParams.set('languages', 'en');
  const j = await getJson(url.toString());
  const items = Array.isArray(j?.results) ? j.results : [];

  // 중복 제거: 정규화된 title + 첫 작가
  const seen = new Set();
  const works = [];
  for (const b of items) {
    if (works.length >= limit) break;
    const title = String(b.title || '').trim();
    if (!title) continue;
    const authors = Array.isArray(b.authors) ? b.authors.map((a) => a?.name).filter(Boolean) : [];
    const firstAuthor = authors[0] || '';
    const normTitle = title.toLowerCase()
      .replace(/^(the |a |an )/i, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
    const key = `${normTitle}|${firstAuthor.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // 작가 사망연도 사이의 첫 작가 출생/연대 추정 — life 시작연도가 있으면 사용 (Gutendex 가 제공)
    const year = (b.authors && b.authors[0] && (b.authors[0].death_year || b.authors[0].birth_year)) || null;
    works.push({
      bookId: b.id,
      title,
      author: firstAuthor,
      authors,
      year,
      downloadCount: b.download_count ?? null,
      plainTextUrl: pickPlainTextUrl(b.formats || {}),
    });
  }
  // 다운로드 수 내림차순 — 인기작 우선
  works.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
  return { works, topic };
}

export async function searchGutenberg(query, limit = 8) {
  const original = String(query || '').trim();
  if (!original) return { results: [], originalQuery: '', effectiveQuery: '', translatedFrom: null };

  let effective = original;
  let translatedFrom = null;
  if (containsKorean(original)) {
    const en = await translateKoreanTitleToEnglish(original);
    if (en) {
      translatedFrom = original;
      effective = en;
    }
  }

  const url = new URL(GUTENDEX_BASE);
  url.searchParams.set('search', effective);
  const j = await getJson(url.toString());
  const items = Array.isArray(j?.results) ? j.results : [];
  const results = items.slice(0, Math.max(1, Math.min(20, limit))).map((b) => ({
    bookId: b.id,
    title: b.title || '',
    authors: Array.isArray(b.authors)
      ? b.authors.map((a) => a?.name).filter(Boolean)
      : [],
    languages: Array.isArray(b.languages) ? b.languages : [],
    downloadCount: b.download_count ?? null,
    url: `https://www.gutenberg.org/ebooks/${b.id}`,
    // formats 안에 다양한 mime → URL 매핑. text/plain (utf-8) 우선 선택.
    plainTextUrl: pickPlainTextUrl(b.formats || {}),
  }));
  return { results, originalQuery: original, effectiveQuery: effective, translatedFrom };
}

function pickPlainTextUrl(formats) {
  // 우선순위: text/plain; charset=utf-8 → text/plain; charset=us-ascii → text/plain
  // (HTML 본문은 boilerplate 제거가 더 까다로워서 후순위)
  const keys = Object.keys(formats);
  const utf8 = keys.find((k) => /^text\/plain;\s*charset=utf-?8$/i.test(k));
  if (utf8) return formats[utf8];
  const ascii = keys.find((k) => /^text\/plain;\s*charset=us-ascii$/i.test(k));
  if (ascii) return formats[ascii];
  const plain = keys.find((k) => /^text\/plain(?:$|;)/i.test(k));
  if (plain) return formats[plain];
  return null;
}

// 책 ID 또는 미리 알고 있는 plain-text URL 에서 본문을 가져온다.
//  - bookId 만 있으면 Gutendex 로 metadata 다시 가져와 plain-text URL 식별
//  - 가져온 텍스트는 stripGutenbergBoilerplate 로 헤더/푸터 제거
export async function fetchGutenbergText({ bookId, plainTextUrl }) {
  let textUrl = plainTextUrl || null;
  let metadata = null;

  if (!textUrl) {
    if (!bookId) throw new Error('bookId or plainTextUrl required');
    const j = await getJson(`${GUTENDEX_BASE}/${encodeURIComponent(bookId)}`);
    metadata = j || null;
    textUrl = pickPlainTextUrl(j?.formats || {});
    if (!textUrl) {
      throw new Error(`book ${bookId} has no plain-text format`);
    }
  }

  let raw = await getText(textUrl);
  if (raw.length > MAX_FETCH_CHARS) {
    raw = raw.slice(0, MAX_FETCH_CHARS);
  }
  const text = stripGutenbergBoilerplate(raw);

  return {
    bookId: bookId || (metadata?.id ?? null),
    title: metadata?.title || null,
    authors: Array.isArray(metadata?.authors)
      ? metadata.authors.map((a) => a?.name).filter(Boolean)
      : [],
    languages: Array.isArray(metadata?.languages) ? metadata.languages : [],
    text,
    length: text.length,
    sourceUrl: textUrl,
    pageUrl: bookId ? `https://www.gutenberg.org/ebooks/${bookId}` : null,
    truncated: raw.length >= MAX_FETCH_CHARS,
  };
}

// Gutenberg 텍스트의 표준 header/footer (boilerplate) 컷.
// - header: "*** START OF THE PROJECT GUTENBERG EBOOK ..." 또는 "*** START OF THIS PROJECT GUTENBERG EBOOK..."
//           직후의 줄들이 실제 본문.
// - footer: "*** END OF THE PROJECT GUTENBERG EBOOK ..."  앞까지가 본문.
// 둘 다 매치 못하면 원본 그대로 반환.
function stripGutenbergBoilerplate(raw) {
  let s = String(raw);

  // 1) header — *** START ... *** 또는 ***START OF... 등 변종 모두
  const startRe = /\*\*\*\s*START OF (?:THE |THIS )?PROJECT GUTENBERG (?:EBOOK|EBook|E[Bb]ook)[^\n]*\*\*\*/i;
  const startMatch = s.match(startRe);
  if (startMatch) {
    s = s.slice(startMatch.index + startMatch[0].length);
  }

  // 2) footer — *** END ... ***
  const endRe = /\*\*\*\s*END OF (?:THE |THIS )?PROJECT GUTENBERG (?:EBOOK|EBook|E[Bb]ook)[^\n]*\*\*\*/i;
  const endMatch = s.match(endRe);
  if (endMatch) {
    s = s.slice(0, endMatch.index);
  }

  // 3) 헤더/푸터 컷 후 종종 남는 "Produced by ...", "Updated editions ..." 한두 줄 안내
  //    너무 공격적이지 않게 — 첫 빈줄까지의 안내 문구만 제거.
  s = s.replace(/^[ \t]*Produced by[\s\S]*?\n\s*\n/i, '');
  s = s.replace(/^[ \t]*This eBook[\s\S]*?\n\s*\n/i, '');

  // 4) 공백 정리
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
