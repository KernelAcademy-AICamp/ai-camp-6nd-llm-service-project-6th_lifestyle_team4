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
const UA = 'CurtaincallScraperGB/0.1 (admin tool; contact: yub)';
const FETCH_TIMEOUT_MS = 60_000;  // Gutendex /books?search 가 종종 느림 — 직접 ID 조회는 보통 5~10s.
const MAX_FETCH_CHARS = 1_000_000; // ~1MB plain text

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

// Gutendex 검색 → 카탈로그 항목 목록
//   author 정보까지 함께 돌려주므로 UI 에서 풍부한 리스트를 그릴 수 있다.
//   languages 가 'ko' 인 PD 한국 문학도 일부 있지만, 본 어댑터는 영문 (en) 기본.
export async function searchGutenberg(query, limit = 8) {
  if (!query || !String(query).trim()) return [];
  const url = new URL(GUTENDEX_BASE);
  url.searchParams.set('search', String(query).trim());
  const j = await getJson(url.toString());
  const results = Array.isArray(j?.results) ? j.results : [];
  return results.slice(0, Math.max(1, Math.min(20, limit))).map((b) => ({
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
