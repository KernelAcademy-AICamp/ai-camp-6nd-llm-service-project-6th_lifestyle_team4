// Project Gutenberg — 영문(및 다국어) PD 문학 전체 본문 가져오기.
//
// 흐름:
//  1) searchGutenberg(query) — Gutendex (https://gutendex.com) 카탈로그 검색
//  2) fetchGutenbergText(bookId) — Gutenberg cache 의 plain-text(UTF-8) 다운로드
//     → 헤더/푸터 boilerplate 제거 → 본문만 반환
//
// 큰 작품(예: War and Peace ~3MB)은 MAX_FETCH_CHARS 로 잘라낸다 — extract 가
// 다시 400K 로 잘라내므로 의미 있는 한계.

// trailing slash 필수 — gutendex 가 '/books' → '/books/' 로 301 리다이렉트하면
// Node fetch 가 redirect 따라가며 응답이 8~15s 까지 늘어남 (12s timeout 자주 걸림).
// '/books/' 로 직접 호출하면 redirect 없이 곧장 200 → 1~2s.
const GUTENDEX_BASE = 'https://gutendex.com/books/';
const WIKIPEDIA_KO_API = 'https://ko.wikipedia.org/w/api.php';
const UA = 'CurtaincallScraperGB/0.1 (admin tool; contact: yub)';
// 메타 조회용 짧은 timeout — Gutendex /books JSON 은 보통 1~5s. 12s 면 충분.
// (이전 60s 는 Vercel 함수 maxDuration 60s 와 같아 한 번 느려지면 함수 강제 종료됨)
const FETCH_TIMEOUT_META_MS = 12_000;
// 본문 다운로드 — gutenberg.org 의 큰 plain text 파일은 30s 까지 허용.
const FETCH_TIMEOUT_TEXT_MS = 30_000;
const MAX_FETCH_CHARS = 1_000_000; // ~1MB plain text

// 입력에 한글 음절이 하나라도 있으면 Korean 으로 간주.
function containsKorean(s) {
  return /[가-힯]/.test(String(s || ''));
}

// gutendex.com / gutenberg.org 가 일시적으로 응답 안 할 때(Node native fetch 의 'fetch failed')
// 를 자동으로 재시도. 2회 시도, 백오프 1초/2초. Vercel 함수 timeout(60s) 안에서 안전:
//   최악의 경우 12s × 2 + 1s 백오프 = 25s (메타) / 30s × 2 + 1s = 61s (본문 — text 만 시도 1회로)
//   text 용량 큰 경우 retry 1회로 줄여 안전.
async function fetchWithRetry(url, opts = {}, label = 'gutendex', { timeoutMs = FETCH_TIMEOUT_META_MS, maxAttempts = 2 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        // 5xx 만 재시도. 4xx 는 그대로 throw (요청 오류라 재시도해도 의미 없음)
        if (res.status >= 500 && attempt < maxAttempts) {
          lastErr = new Error(`${label} HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(`${label} HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      clearTimeout(t);
      // 'fetch failed' (Node native fetch 의 underlying network 실패) — cause 에 자세한 에러
      const cause = err?.cause?.message || err?.cause?.code || '';
      const msg = err?.message || String(err);
      console.warn(`[${label}] attempt ${attempt} failed: ${msg}${cause ? ' / cause: ' + cause : ''}`);
      lastErr = err;
      if (attempt === maxAttempts) break;
      // AbortError 는 timeout — 다음 시도
      // network error 는 다음 시도 (DNS/TLS 일시 오류 흔함)
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  // 마지막 에러를 사용자가 이해할 만하게 다시 throw
  const cause = lastErr?.cause?.message || lastErr?.cause?.code;
  const friendly = cause
    ? `${label} 연결 실패 (${cause}) — gutendex.com 일시 장애일 수 있어요. 잠시 후 다시 시도해주세요.`
    : `${label} 응답 없음 — ${lastErr?.message || '네트워크 오류'}`;
  const e = new Error(friendly);
  e.status = 502;
  throw e;
}

async function getJson(url) {
  // 메타 JSON — 짧은 timeout(12s), 2회 재시도
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  }, 'gutendex', { timeoutMs: FETCH_TIMEOUT_META_MS, maxAttempts: 2 });
  return await res.json();
}

async function getText(url) {
  // 본문 — 큰 파일이므로 timeout 길게(30s), 재시도 1회 (총 30s 이내 끝나야 Vercel 함수에 마진)
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': UA, Accept: 'text/plain' },
  }, 'gutenberg', { timeoutMs: FETCH_TIMEOUT_TEXT_MS, maxAttempts: 1 });
  return await res.text();
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

// 작품명 검색 — Supabase gutenberg_books 직접 조회 (gutendex.com 의존 제거).
// 한글 입력 시 ko.wikipedia langlinks 로 영문 변환은 유지 (선택적).
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

  // Supabase RPC — search_gutenberg_by_title (마이그레이션 031)
  const { getSupabaseAdmin } = await import('../supabase-admin.js');
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('search_gutenberg_by_title', {
    p_query: effective,
    p_lang: 'en',
    p_limit: Math.max(1, Math.min(20, limit)),
  });
  if (error) {
    console.warn('[searchGutenberg] rpc failed:', error.message || error);
    return { results: [], originalQuery: original, effectiveQuery: effective, translatedFrom };
  }
  const results = (Array.isArray(data) ? data : [])
    // text_url 이 비어있거나 readme 같은 비본문 파일이면 = Sound/오디오북 등 본문이 없는 책 → 검색 결과에서 제외.
    .filter((b) => isFetchableTextUrl(b.text_url))
    .map((b) => ({
      bookId: b.book_id,
      title: b.title || '',
      authors: Array.isArray(b.authors) ? b.authors : [],
      languages: Array.isArray(b.languages) ? b.languages : [],
      downloadCount: b.download_count ?? null,
      url: `https://www.gutenberg.org/ebooks/${b.book_id}`,
      plainTextUrl: normalizeGutenbergTextUrl(b.text_url, b.book_id),
    }));
  return { results, originalQuery: original, effectiveQuery: effective, translatedFrom };
}

// 본문(plain-text) 으로 쓸 수 있는 URL 인지 — Sound/오디오북의 readme 같은 비본문 파일은 false.
function isFetchableTextUrl(url) {
  if (!url) return false;                // text/plain 메타가 없는 책 = 본문 없음
  if (/-readme\.txt$/i.test(url)) return false; // Sound 책의 readme 안내문
  return true;
}

// /ebooks/{id}.txt.utf-8 패턴은 PG가 HTTPS→HTTP 302 redirect 를 건다(Location 헤더가 http://).
// Node native fetch / Vercel runtime 은 protocol downgrade redirect 를 따라가지 못해 404 처리되는 경우가 많아,
// 동일 자원을 직접 가리키는 /cache/epub/{id}/pg{id}.txt 로 우회한다. 그 외 URL 은 원본 유지.
function normalizeGutenbergTextUrl(url, bookId) {
  if (!url) return null;
  const m = String(url).match(/\/ebooks\/(\d+)\.txt(?:\.utf-?8)?$/i);
  if (m) return `https://www.gutenberg.org/cache/epub/${m[1]}/pg${m[1]}.txt`;
  return url;
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
//  - plainTextUrl 없으면 Supabase gutenberg_books.text_url 에서 조회 (gutendex 의존 제거)
//  - 가져온 텍스트는 stripGutenbergBoilerplate 로 헤더/푸터 제거
export async function fetchGutenbergText({ bookId, plainTextUrl }) {
  let textUrl = plainTextUrl || null;
  let metadata = null;

  if (!textUrl) {
    if (!bookId) throw new Error('bookId or plainTextUrl required');
    // Supabase 의 gutenberg_books.text_url 사용 (gutendex 호출 안 함)
    const { getSupabaseAdmin } = await import('../supabase-admin.js');
    const sb = getSupabaseAdmin();
    const { data: row, error } = await sb
      .from('gutenberg_books')
      .select('book_id, title, authors, languages, text_url')
      .eq('book_id', bookId)
      .maybeSingle();
    if (error || !row) {
      throw new Error(`book ${bookId} not found in Supabase gutenberg_books`);
    }
    // RDF 인덱싱 시 plain-text 메타 못 잡힌 책 — Gutenberg 표준 URL 패턴으로 자동 생성.
    // https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt 가 거의 모든 책에 일관 적용.
    textUrl = normalizeGutenbergTextUrl(row.text_url, bookId)
      || `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
    metadata = {
      id: row.book_id,
      title: row.title,
      authors: (row.authors || []).map((name) => ({ name })),
      languages: row.languages || [],
    };
  }

  // www.gutenberg.org 메인 호스트가 일시 장애(Connect Timeout 등)일 때 공식 미러로 자동 fallback.
  // PGLaF 미러는 메인과 동일한 path 트리를 그대로 서빙한다.
  let raw;
  try {
    raw = await getText(textUrl);
  } catch (e) {
    const mirrors = ['aleph.pglaf.org', 'gutenberg.pglaf.org'];
    let lastErr = e;
    for (const host of mirrors) {
      const mirrorUrl = textUrl.replace(/^https?:\/\/www\.gutenberg\.org\//i, `https://${host}/`);
      if (mirrorUrl === textUrl) continue;
      try {
        raw = await getText(mirrorUrl);
        textUrl = mirrorUrl;
        break;
      } catch (e2) { lastErr = e2; }
    }
    if (raw == null) throw lastErr;
  }
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
