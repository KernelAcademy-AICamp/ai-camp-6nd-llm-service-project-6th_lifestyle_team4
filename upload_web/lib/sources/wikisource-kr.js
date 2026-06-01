// 한국어 위키문헌 (ko.wikisource.org) — PD 한국 문학의 전체 본문 가져오기.
//
// 흐름:
//  1) searchWikisourceKr(query) — opensearch 로 후보 페이지명 + URL 목록
//  2) fetchWikisourceKrPage(title) — action=parse 로 렌더된 HTML 받아 본문만 추출
//
// 챕터 분할된 작품(예: 전집·총서)은 v1 에서 main page 만 가져온다 — 어드민이 직접
// 챕터 페이지명을 지정해 다시 호출할 수 있다.
// 모든 fetch 는 server-side (Vercel function) 에서 일어나므로 CORS 무관.

const BASE = 'https://ko.wikisource.org/w/api.php';
const UA = 'CurtaincallScraperKR/0.1 (admin tool; contact: yub)';
const FETCH_TIMEOUT_MS = 15_000;

async function apiGet(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(k, String(v));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`wikisource-kr HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// opensearch 결과 형식: [query, [titles], [descriptions], [urls]]
export async function searchWikisourceKr(query, limit = 8) {
  if (!query || !String(query).trim()) return [];
  const j = await apiGet({
    action: 'opensearch',
    search: String(query).trim(),
    limit: String(Math.max(1, Math.min(20, limit))),
    namespace: '0',
  });
  if (!Array.isArray(j)) return [];
  const titles = Array.isArray(j[1]) ? j[1] : [];
  const descs  = Array.isArray(j[2]) ? j[2] : [];
  const urls   = Array.isArray(j[3]) ? j[3] : [];
  return titles.map((t, i) => ({
    title: t,
    description: descs[i] || '',
    url: urls[i] || `https://ko.wikisource.org/wiki/${encodeURIComponent(t)}`,
  }));
}

export async function fetchWikisourceKrPage(title) {
  if (!title || !String(title).trim()) {
    throw new Error('title required');
  }
  const j = await apiGet({
    action: 'parse',
    page: String(title).trim(),
    prop: 'text|displaytitle|categories',
    redirects: '1',
  });
  if (j?.error) {
    throw new Error(j.error.info || j.error.code || 'wikisource parse error');
  }
  const html = j?.parse?.text?.['*'];
  if (!html) throw new Error('no content returned');

  const text = stripBoilerplate(htmlToPlainText(html));
  const cats = Array.isArray(j.parse.categories)
    ? j.parse.categories.map((c) => c['*']).filter(Boolean)
    : [];

  // displaytitle 에 HTML wrapping(<span class="mw-page-title-main">...) 이 있어 태그 제거
  const rawTitle = j.parse.displaytitle || j.parse.title || title;
  const cleanTitle = String(rawTitle).replace(/<[^>]+>/g, '').trim();

  return {
    title: cleanTitle,
    pageId: j.parse.pageid || null,
    pageUrl: `https://ko.wikisource.org/wiki/${encodeURIComponent(title)}`,
    text,
    length: text.length,
    categories: cats,
  };
}

// 본문 텍스트에서 위키문헌 공통 boilerplate 를 제거.
// - "라이선스" 헤더 이후 (저작권 안내 블록) 통째로 컷
// - "자매 프로젝트:" 로 시작하는 단락 제거 (위키백과/인용/위키데이터 링크 줄)
// - 장식 문자열·작품 메타 위젯 정리
function stripBoilerplate(text) {
  let s = String(text);

  // 1) 끝부분 라이선스 / Public domain 블록 — "라이선스" 헤더가 보이면 그 앞까지만 살림
  const licIdx = s.search(/\n\s*라이선스\s*\n|\nPublic domain/);
  if (licIdx > 0) s = s.slice(0, licIdx);

  // 2) "자매 프로젝트:" 로 시작하는 줄 제거 (위키 sister-project 모듈)
  s = s.replace(/^\s*자매 프로젝트:.*$/gm, '');
  // sister-project hint box ("위키백과에 이 글과 관련된 자료가 있습니다.") 도 흔히 등장
  s = s.replace(/\n*위키백과에 이 글과 관련된\s*\n?\s*자료가 있습니다\.\s*\n*/g, '\n');

  // 3) 장식 문자 단독 라인 (→, 🙝🙟 등)
  s = s.replace(/^\s*[→←↗↘🙝🙟❀❁❄️•·▪▫■□]+\s*$/gm, '');

  // 4) 작품 페이지 첫 부분의 "2370현진건" 같은 카운터+저자 한줄 (숫자만 있는 라인 또는
  //    숫자+한글 한줄) — 페이지 ID + 저자명 위젯의 흔적. 너무 공격적이 되지 않게 짧은
  //    라인만 (20자 이하) 가운데 숫자 4자리 + 한글 패턴 매칭.
  s = s.replace(/^\s*\d{2,5}[가-힣]{1,10}\s*$/gm, '');

  // 5) 다시 공백 정리
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  return s;
}

// 위키문헌 렌더 HTML → 본문 텍스트.
// 보존: 단락 줄바꿈, 헤더(작품 안의 챕터·연 구분에 유용).
// 제거: 편집 링크, 각주 마커, 인포박스/네브박스, 목차 테이블, 라이선스 메시지박스.
function htmlToPlainText(html) {
  let s = String(html);

  // 1) script/style 통째 제거
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 2) MediaWiki 표시 요소 — 편집 [편집] 링크, 각주 marker, 인용 출처
  s = s.replace(/<span class="mw-editsection[^>]*>[\s\S]*?<\/span>/gi, '');
  s = s.replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*(reflist|noprint|sistersitebox|mbox-text|metadata|hatnote)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // 표 형태로 그려진 인포박스·내비박스·목차
  s = s.replace(/<table[^>]*class="[^"]*(infobox|navbox|metadata|toc|wikitable)[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '');
  // 이미지 캡션
  s = s.replace(/<div[^>]*class="[^"]*thumb[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // 카테고리 목록(맨 아래)
  s = s.replace(/<div[^>]*id="catlinks"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 3) 블록 요소를 줄바꿈으로 — 단락 / 헤더 / 리스트 행
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, '\n');

  // 4) 남은 모든 태그 제거
  s = s.replace(/<[^>]+>/g, '');

  // 5) HTML 엔티티 디코드 — 자주 쓰는 것만
  const entities = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  };
  s = s.replace(/&([a-z]+);/gi, (m, name) => entities[name.toLowerCase()] ?? m);
  s = s.replace(/&#(\d+);/g, (m, n) => {
    const code = parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
  s = s.replace(/&#x([0-9a-f]+);/gi, (m, h) => {
    const code = parseInt(h, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

  // 6) 공백 정리 — 단락 사이 빈줄 한 줄로
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
