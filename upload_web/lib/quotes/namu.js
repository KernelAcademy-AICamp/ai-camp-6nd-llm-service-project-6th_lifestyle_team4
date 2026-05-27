// 나무위키 작품 페이지에서 "명대사" 헤딩 섹션 텍스트를 추출.
// 외부 의존성 없음 — 정규식 HTML 파싱.
// namu.wiki 는 Cloudflare 보호가 있어 서버 fetch 가 막힐 수 있음.
// 실패 시 null 을 반환해 상위(dispatcher) 가 조용히 fallback 한다.

const NAMU_BASE = 'https://namu.wiki/w/';
// 일반 브라우저 UA — namu.wiki 가 봇 차단을 거는 경우가 있어 보편 UA 로 위장.
const UA = process.env.NAMU_FETCHER_UA ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10000;

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&apos;|&#39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// "동음이의어 문서입니다" 같은 disambiguation 마커가 본문에 있으면 잘못된 페이지로 판단.
function isDisambiguationPage(html) {
  const stripped = stripTags(html).slice(0, 3000);
  return /동음이의어\s*문서|동음이의\s*문서|이 문서는 .*?에 대해 다룹니다/.test(stripped);
}

function extractMyeongdaesaSection(html) {
  if (!html) return null;
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [];
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    headings.push({ level: Number(m[1]), text: stripTags(m[2]), start: m.index, end: m.index + m[0].length });
  }
  const idx = headings.findIndex((h) => /명대사|명장면|어록/.test(h.text));
  if (idx === -1) return null;
  const start = headings[idx].end;
  const level = headings[idx].level;
  let end = html.length;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= level) { end = headings[i].start; break; }
  }
  return html.slice(start, end);
}

function extractQuotesFromSection(html) {
  if (!html) return [];
  const out = [];
  const re = /<(li|blockquote|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const txt = stripTags(m[2]);
    if (!txt) continue;
    if (txt.length < 5 || txt.length > 400) continue;
    if (/^(?:출처|주석|참고|각주)\b/.test(txt)) continue;
    if (/^[*\d.\s]+$/.test(txt)) continue;
    out.push(txt);
  }
  return dedupe(out);
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const key = s.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// fallback: "명대사" 헤딩이 없는 페이지(주로 소설·에세이) 에서
// 본문 blockquote 안의 **따옴표 인용**만 시드 후보로 사용.
// 줄거리 요약(서술체) 은 따옴표가 없어 자연 필터되고, 진짜 인용(외부 평·작품 인용) 만 남는다.
function extractFallbackBlockquotes(html) {
  if (!html) return [];
  const metaRe = /<h([1-6])[^>]*>[\s\S]{0,300}?(?:외부\s*링크|관련\s*문서|둘러보기|각주|참고\s*문헌|External\s*links)[\s\S]{0,300}?<\/h\1>/i;
  const metaMatch = html.match(metaRe);
  const body = metaMatch ? html.slice(0, metaMatch.index) : html;

  const out = [];
  const bqRe = /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi;
  // 따옴표로 둘러싼 인용 — 영문 "..." / 한국식 "..." / 단일 '...' / 「...」 / 『...』
  const quoteRe = /(?:"([^"\n]{10,300})"|"([^"\n]{10,300})"|「([^」\n]{10,300})」|『([^』\n]{10,300})』)/g;
  let m;
  while ((m = bqRe.exec(body)) !== null) {
    const txt = stripTags(m[1]);
    if (!txt) continue;
    if (/^(?:출처|주석|참고|각주|관련\s*문서)\b/.test(txt)) continue;
    let q;
    while ((q = quoteRe.exec(txt)) !== null) {
      const inner = (q[1] || q[2] || q[3] || q[4] || '').trim();
      if (inner.length < 10 || inner.length > 300) continue;
      out.push(inner);
    }
    quoteRe.lastIndex = 0;
  }
  return dedupe(out).slice(0, 15);
}

async function tryFetchOne(pageTitle) {
  const url = NAMU_BASE + encodeURIComponent(pageTitle);
  const html = await fetchHtml(url);
  if (!html) return null;
  if (isDisambiguationPage(html)) return null;

  // 1차: "명대사" 섹션이 명시된 페이지 (영화·드라마·고전 위주)
  const section = extractMyeongdaesaSection(html);
  if (section) {
    const quotes = extractQuotesFromSection(section);
    if (quotes.length) return { source: 'namu', lang: 'ko', srcTitle: pageTitle, quotes };
  }

  // 2차 fallback: 본문 blockquote (소설·에세이·기타)
  const fallback = extractFallbackBlockquotes(html);
  if (fallback.length) return { source: 'namu', lang: 'ko', srcTitle: pageTitle, quotes: fallback };

  return null;
}

// namu 페이지명 규칙: 공백 없음 ("기생충(영화)"). wikipedia 는 공백 있음 ("기생충 (영화)").
// 이 차이로 인한 404 회피 — 변형 후보를 모아 순차 시도.
function variations(title) {
  const t = title.trim();
  const set = new Set([t]);
  set.add(t.replace(/\s+/g, ''));
  set.add(t.replace(/\s+/g, '_'));
  return [...set];
}

// 메인 진입점.
// title: 사용자가 입력한 작품명
// preferTitle: ko.wikipedia 에서 카테고리 매칭으로 식별한 정확한 페이지명 (있으면 우선 시도)
export async function fetchNamuSeeds(title, preferTitle) {
  if (!title || !title.trim()) return null;
  const ordered = [];
  if (preferTitle && preferTitle.trim()) ordered.push(...variations(preferTitle));
  ordered.push(...variations(title));
  const seen = new Set();
  for (const cand of ordered) {
    if (seen.has(cand)) continue;
    seen.add(cand);
    const res = await tryFetchOne(cand);
    if (res) return res;
  }
  return null;
}
