// 작품명 + 카테고리 → 다중 소스(Wikiquote 다국어 + 나무위키)에서 명대사 시드를 수집.
// 같은 명대사가 여러 언어/소스에 있으면 한국어 표기 우선.
// 어느 소스도 실패해도 다른 소스 결과로 진행 — 모두 실패 시 빈 배열.

import { fetchWikiquoteSeeds } from './wikiquote.js';
import { fetchNamuSeeds } from './namu.js';

const MAX_QUOTES_PER_SOURCE = 30;
const MAX_TOTAL_QUOTES = 50;

export async function fetchQuoteSeeds(title, category = 'screen') {
  if (!title || !title.trim()) {
    return { quotes: [], debug: { reason: 'empty title' } };
  }

  // 1) wikiquote 먼저 — opensearch + 카테고리 매칭으로 정확한 페이지명을 식별하고
  //    그 결과의 ko 페이지명을 namu 호출에 전달해 동음이의어 회피.
  let wqResult = { sources: [], resolvedTitles: {} };
  try {
    wqResult = await fetchWikiquoteSeeds(title, category);
  } catch (e) {
    wqResult.error = String(e?.message || e);
  }

  // 2) namu — wikiquote 가 식별한 ko 페이지명 우선, 없으면 입력 그대로.
  let namuResult = null;
  try {
    namuResult = await fetchNamuSeeds(title, wqResult.resolvedTitles?.ko);
  } catch (e) {
    namuResult = { error: String(e?.message || e) };
  }

  const all = [];
  const debug = {
    resolvedTitles: wqResult.resolvedTitles || {},
    wikiquote: wqResult.sources?.map((s) => ({
      lang: s.lang, srcTitle: s.srcTitle, count: s.quotes.length,
    })) || [],
    namu: namuResult && !namuResult.error
      ? { srcTitle: namuResult.srcTitle, count: namuResult.quotes.length }
      : null,
    errors: [],
  };
  if (wqResult.error) debug.errors.push({ source: 'wikiquote', message: wqResult.error });
  if (namuResult?.error) debug.errors.push({ source: 'namu', message: namuResult.error });

  for (const src of wqResult.sources || []) {
    for (const q of src.quotes.slice(0, MAX_QUOTES_PER_SOURCE)) {
      all.push({ text: q, source: src.source, lang: src.lang, srcTitle: src.srcTitle });
    }
  }
  if (namuResult && !namuResult.error && namuResult.quotes) {
    for (const q of namuResult.quotes.slice(0, MAX_QUOTES_PER_SOURCE)) {
      all.push({ text: q, source: namuResult.source, lang: namuResult.lang, srcTitle: namuResult.srcTitle });
    }
  }

  const merged = mergeSeeds(all).slice(0, MAX_TOTAL_QUOTES);
  return { quotes: merged, debug };
}

// 같은 명대사가 여러 소스/언어에 있을 때 한국어 표기 우선 채택.
function mergeSeeds(arr) {
  const byKey = new Map();
  for (const item of arr) {
    const key = normalizeKey(item.text);
    if (!byKey.has(key)) { byKey.set(key, item); continue; }
    const existing = byKey.get(key);
    if (existing.lang !== 'ko' && item.lang === 'ko') byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

function normalizeKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/["'“”‘’`]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// LLM 프롬프트에 끼울 시드 블록 텍스트. 시드 0개면 빈 문자열 — 프롬프트가 시드 섹션을 통째로 생략.
export function formatSeedBlock(title, seeds) {
  if (!seeds || !seeds.length) return '';
  const lines = seeds
    .map((s, i) => `${i + 1}. "${s.text}"  [${s.source}/${s.lang}]`)
    .join('\n');
  return `
[웹 인용 시드 — 우선 검토 대상]
다음은 작품 "${title}"에 대해 웹(나무위키·Wikiquote 등)에서 자주 인용되는 명대사/명문 후보입니다.
- 본문에서 이 대사/문장이 등장하는 장면을 찾아 카드로 우선 채택하세요.
- script_excerpt 는 본문에서 해당 대사가 나오는 부분을 원문 그대로 발췌하세요 (시드 텍스트를 그대로 넣지 말 것 — 시드는 표기가 다를 수 있음).
- 시드 중 본문에서 찾을 수 없는 항목은 무시하세요 (잘못된 출처 가능성).
- 시드에 없는 명장면도 본문 전체를 보고 추가 발굴해도 됩니다.

${lines}
`;
}
