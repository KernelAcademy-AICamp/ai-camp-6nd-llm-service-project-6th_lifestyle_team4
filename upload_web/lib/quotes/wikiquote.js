// Wikipedia opensearch 로 입력 작품명에 대한 정확한 페이지를 카테고리(screen/opera/play/novel/poem/essay)
// 기반으로 식별 → langlinks 로 다국어 페이지명 맵 확보 → 각 언어 Wikiquote 에서 명대사 추출.
// 외부 의존성 없음 — Node 20 글로벌 fetch + 정규식.

const UA =
  process.env.QUOTES_FETCHER_UA ||
  'LifestyleCurtaincall/1.0 (https://github.com/lifestyle-team4; admin upload pipeline)';

const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de'];
const FETCH_TIMEOUT_MS = 8000;

// 카테고리별 매칭 키워드 (opensearch 결과의 title/description 안에서 탐색).
const CATEGORY_KEYWORDS = {
  screen: [
    'film', 'movie', 'television', 'tv series', 'tv film', 'drama series', 'miniseries',
    '영화', '드라마', '방송', '연속극', '시리즈', '映画', 'テレビドラマ', 'série', 'téléfilm',
  ],
  opera: [
    'opera', 'operetta', 'musical', 'singspiel', 'comic opera',
    '오페라', '뮤지컬', 'opéra', 'opéra-comique', 'オペラ', 'ミュージカル',
  ],
  play: [
    'play', 'theatre', 'theater', 'stage play', 'tragedy', 'comedy', 'drama',
    '연극', '희곡', 'pièce', 'théâtre', '戯曲', '舞台',
  ],
  novel: [
    'novel', 'short story', 'novella', 'collection', 'book',
    '소설', '단편', '장편', 'roman', 'nouvelle', 'recueil',
    '小説', 'novela', 'cuento',
  ],
  poem: [
    'poem', 'poetry', 'verse',
    '시', '시집', '詩', 'poème', 'poésie', 'poesía',
  ],
  essay: [
    'essay', 'memoir',
    '에세이', '수필', '随筆', 'essai', 'mémoire',
  ],
  prose: [
    'prose', 'prose poem', 'letters', 'letter', 'diary', 'journal', 'sketch',
    '산문', '산문시', '편지', '서간', '일기', '콩트', 'lettres', 'prosa',
  ],
};

// 명언 섹션 헤딩 (다국어). 일부 wiki 페이지(특히 영화)는 페이지 전체가 인용 모음이라
// 이 헤딩이 없음 — 그 경우 메타 섹션만 제외하고 나머지 전체에서 추출.
const QUOTE_HEADING_RE = /^(?:quotes?|quotations?|명언|명대사|어록|名言|語錄|語録|cita(?:s|ciones)?|citations?|zitate)$/i;

// 메타 섹션 (명대사 아님) — 다국어. 페이지 전체 추출 시 이 섹션은 건너뜀.
const META_HEADING_RE = /^(?:external links?|see also|cast|notes?|references?|bibliography|further reading|sources?|taglines?|about\b|see\s+also|filmography|awards?|production|trivia|gallery|footnotes?|links?|연결|참고|각주|출처|외부\s*링크|관련\s*항목|キャスト|外部リンク)/i;

async function timedFetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// opensearch: 검색어로 페이지 후보들을 받음. 응답은 [query, titles[], descs[], urls[]].
async function opensearch(lang, query) {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  u.search = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: '10',
    namespace: '0',
    format: 'json',
    origin: '*',
  }).toString();
  const data = await timedFetchJson(u.toString());
  if (!Array.isArray(data)) return [];
  const titles = data[1] || [];
  const descs = data[2] || [];
  return titles.map((t, i) => ({ title: t, desc: descs[i] || '' }));
}

// 후보들 중 카테고리 키워드와 가장 일치하는 것을 선택. 일치 없으면 첫 번째.
function pickBestCandidate(candidates, category) {
  if (!candidates.length) return null;
  const kws = CATEGORY_KEYWORDS[category] || [];
  if (!kws.length) return candidates[0];
  for (const c of candidates) {
    const hay = `${c.title} ${c.desc}`.toLowerCase();
    if (kws.some((k) => hay.includes(k.toLowerCase()))) return c;
  }
  return candidates[0];
}

// 정확한 페이지명에 대해 langlinks 호출 → 다국어 제목 맵 반환.
async function fetchLanglinks(lang, pageTitle) {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  u.search = new URLSearchParams({
    action: 'query',
    titles: pageTitle,
    prop: 'langlinks',
    lllimit: '50',
    redirects: '1',
    format: 'json',
    origin: '*',
  }).toString();
  const data = await timedFetchJson(u.toString());
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const out = { [lang]: page.title || pageTitle };
  for (const ll of page.langlinks || []) {
    if (ll.lang && ll['*']) out[ll.lang] = ll['*'];
  }
  return out;
}

// 입력 제목 → 카테고리에 맞는 정확한 페이지를 ko/en 위키피디아에서 식별 → langlinks 로 다국어 제목 맵.
// ko 와 en 양쪽 시도 후, langlink 가 더 풍부한 쪽을 채택.
export async function resolveLangTitles(title, category) {
  const [koHits, enHits] = await Promise.all([
    opensearch('ko', title),
    opensearch('en', title),
  ]);
  const koBest = pickBestCandidate(koHits, category);
  const enBest = pickBestCandidate(enHits, category);

  const [koMap, enMap] = await Promise.all([
    koBest ? fetchLanglinks('ko', koBest.title) : Promise.resolve(null),
    enBest ? fetchLanglinks('en', enBest.title) : Promise.resolve(null),
  ]);

  // 두 맵을 합치되, 동일 언어는 더 긴 정보(괄호 disambiguation 포함)를 우선.
  const merged = {};
  for (const map of [koMap, enMap]) {
    if (!map) continue;
    for (const [lang, t] of Object.entries(map)) {
      if (!merged[lang] || t.length > merged[lang].length) merged[lang] = t;
    }
  }
  return merged;
}

// wikipedia 작품 페이지의 infobox/wikitext 에서 작가 이름 추출.
// 고전 문학·희곡은 wikiquote 에 작품 단독 페이지가 거의 없고 작가 페이지 서브섹션에 명대사가 모임.
async function fetchAuthorFromWikipedia(lang, pageTitle) {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  u.search = new URLSearchParams({
    action: 'parse', page: pageTitle, prop: 'wikitext', format: 'json',
    redirects: '1', origin: '*',
  }).toString();
  const data = await timedFetchJson(u.toString());
  const wt = data?.parse?.wikitext?.['*'];
  if (!wt) return null;

  // infobox 필드 — 다국어 키워드.
  const re = /\|\s*(?:author|writer|playwright|composer|librettist|작가|원작자|글|저자|극작가|작곡가|작사가|저작자)\s*=\s*([^\n|]+)/i;
  const m = wt.match(re);
  if (!m) return null;

  let raw = m[1]
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .trim();
  // "안톤 파블로비치 체호프" 같은 풀네임은 그대로. 단 끝에 출생/사망 연도 같은 잔재 제거.
  raw = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return raw || null;
}

// 작가 페이지 wikitext 에서 workTitle 이 들어간 서브섹션만 잘라 반환.
// 헤딩 형식 예: "=== ''The Cherry Orchard'' (1904) ===" / "== 벚꽃 동산 ==" 등.
function extractAuthorPageWorkSection(wikitext, workTitle) {
  if (!wikitext || !workTitle) return '';
  const norm = (s) => String(s)
    .toLowerCase()
    .replace(/[''""'']/g, '')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const target = norm(workTitle);
  if (!target) return '';

  const lines = wikitext.split('\n');
  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (!m) continue;
    const headText = norm(
      m[2]
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
        .replace(/''+/g, '')
    );
    if (headText.length > 0 && headText.length < 120 && headText.includes(target)) {
      startIdx = i + 1;
      startLevel = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    const m = lines[i].match(/^(={2,6})\s*.+?\s*\1\s*$/);
    if (m && m[1].length <= startLevel) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

// 작가 페이지에서 해당 작품 서브섹션 명대사를 추출.
async function fetchAuthorPageSeeds(lang, authorName, workTitle) {
  if (!authorName || !workTitle) return null;
  const wikitext = await fetchWikiquoteWikitext(lang, authorName);
  if (!wikitext) return null;
  const section = extractAuthorPageWorkSection(wikitext, workTitle);
  if (!section) return null;
  const quotes = extractQuotesFromWikitext(section);
  if (!quotes.length) return null;
  return { source: 'wikiquote', lang, srcTitle: `${authorName} → ${workTitle}`, quotes };
}

async function fetchWikiquoteWikitext(lang, pageTitle) {
  const u = new URL(`https://${lang}.wikiquote.org/w/api.php`);
  u.search = new URLSearchParams({
    action: 'parse',
    page: pageTitle,
    prop: 'wikitext',
    format: 'json',
    redirects: '1',
    origin: '*',
  }).toString();
  const data = await timedFetchJson(u.toString());
  return data?.parse?.wikitext?.['*'] || null;
}

// "Quotes" 헤딩이 있으면 그 섹션만 반환.
// 없으면(영화 등 페이지 전체가 인용 모음인 경우) 메타 섹션을 잘라낸 wikitext 반환.
function isolateQuoteSection(wikitext) {
  if (!wikitext) return '';
  const lines = wikitext.split('\n');

  // Pass 1: 명시적 Quotes 헤딩 탐색
  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (!m) continue;
    const text = m[2].replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').trim();
    if (QUOTE_HEADING_RE.test(text)) {
      startIdx = i + 1;
      startLevel = m[1].length;
      break;
    }
  }
  if (startIdx !== -1) {
    let endIdx = lines.length;
    for (let i = startIdx; i < lines.length; i++) {
      const m = lines[i].match(/^(={2,6})\s*.+?\s*\1\s*$/);
      if (m && m[1].length <= startLevel) { endIdx = i; break; }
    }
    return lines.slice(startIdx, endIdx).join('\n');
  }

  // Pass 2: Quotes 헤딩 없음 → 메타 섹션 제거. 메타 헤딩이 켜지면 다음 같은/상위 레벨 헤딩까지 skip.
  const out = [];
  let skipping = false;
  let skipLevel = 0;
  for (const raw of lines) {
    const m = raw.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) {
      const text = m[2].replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').trim();
      const level = m[1].length;
      if (skipping) {
        if (level <= skipLevel) {
          // skip 종료. 이 헤딩 자체가 또 메타면 다시 skip on.
          if (META_HEADING_RE.test(text)) { skipLevel = level; out.push(raw); continue; }
          skipping = false;
          out.push(raw);
          continue;
        }
        continue;
      }
      if (META_HEADING_RE.test(text)) {
        skipping = true;
        skipLevel = level;
        out.push(raw); // 헤딩 자체는 남겨두지만 본문은 skip
        continue;
      }
      out.push(raw);
      continue;
    }
    if (!skipping) out.push(raw);
  }
  return out.join('\n');
}

// File: thumb 캡션도 명대사로 추출 (페이지 상단의 대표 인용인 경우가 많음).
function extractThumbCaptions(wikitext) {
  if (!wikitext) return [];
  const out = [];
  const re = /\[\[(?:File|Image):[^|\]]+\|[^|\]]*thumb[^|\]]*\|([^\]]+)\]\]/gi;
  let m;
  while ((m = re.exec(wikitext)) !== null) {
    const caption = m[1].split('|').pop(); // 마지막 파트가 캡션
    out.push(caption);
  }
  return out;
}

function cleanWikitext(s) {
  let out = String(s)
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<small>([\s\S]*?)<\/small>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1');
  // 화자 프리픽스 제거: "Speaker: ..." 또는 "[화자 표기] " 형태.
  out = out.replace(/^\s*\[[^\]]{1,40}\]\s*/, '');
  out = out.replace(/^\s*[\p{L}][\p{L}\s\-.'’]{0,30}:\s+/u, '');
  // stage direction(괄호 안 지시문)이 라인 앞에 붙어있으면 제거.
  out = out.replace(/^\s*\([^)]{1,80}\)\s*/, '');
  return out
    .replace(/^[\s"'“”‘’—–\-:·•*]+|[\s"'“”‘’—–\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuotesFromWikitext(wikitext) {
  if (!wikitext) return [];
  const out = [];

  // 1) thumb 캡션 — 페이지 상단의 대표 인용인 경우가 많음.
  for (const c of extractThumbCaptions(wikitext)) {
    const cleaned = cleanWikitext(c);
    if (cleaned && cleaned.length >= 10 && cleaned.length <= 400) out.push(cleaned);
  }

  // 2) Quotes 섹션 또는 메타 제외 영역 안의 ^* 라인.
  const block = isolateQuoteSection(wikitext);
  for (const raw of block.split('\n')) {
    const m = raw.match(/^\*(?!\*)\s+(.*)$/);
    if (!m) continue;
    const cleaned = cleanWikitext(m[1]);
    if (!cleaned) continue;
    if (cleaned.length < 5 || cleaned.length > 400) continue;
    if (/^see also$/i.test(cleaned)) continue;
    if (/^\d+$/.test(cleaned)) continue;
    out.push(cleaned);
  }
  return dedupe(out);
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const key = s.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// 메인 진입점.
// title: 사용자 입력 작품명
// category: 'screen' | 'opera' | 'play' | 'novel' | 'poem' | 'essay'
// 반환: { sources: [{source, lang, srcTitle, quotes}], resolvedTitles: {lang: title} }
export async function fetchWikiquoteSeeds(title, category) {
  if (!title || !title.trim()) return { sources: [], resolvedTitles: {} };
  const t = title.trim();

  const langTitles = await resolveLangTitles(t, category);
  // resolve 실패 시 입력 자체로 직접 시도 (마이너 작품 fallback).
  if (!Object.keys(langTitles).length) langTitles.ko = t;

  const tasks = SUPPORTED_LANGS
    .filter((lang) => langTitles[lang])
    .map(async (lang) => {
      const pageTitle = langTitles[lang];
      try {
        // 1차: 작품 단독 페이지 시도.
        const wt = await fetchWikiquoteWikitext(lang, pageTitle);
        const quotes = extractQuotesFromWikitext(wt);
        if (quotes.length) return { source: 'wikiquote', lang, srcTitle: pageTitle, quotes };

        // 2차: 작가 페이지 fallback — 고전 문학·희곡은 작품 단독 페이지가 거의 없고
        // 작가 페이지 서브섹션에 모임 (예: en.wikiquote/Anton_Chekhov → '=== The Cherry Orchard (1904) ===').
        const author = await fetchAuthorFromWikipedia(lang, pageTitle);
        if (!author) return null;
        return await fetchAuthorPageSeeds(lang, author, pageTitle);
      } catch {
        return null;
      }
    });

  const results = await Promise.all(tasks);
  return { sources: results.filter(Boolean), resolvedTitles: langTitles };
}
