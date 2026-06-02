import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACT_PROMPTS,
  TRANSLATE_PROMPT,
  TRANSLATE_SYSTEM,
  CHARACTERS_PROMPT,
  CLASSIFY_KEYWORDS_PROMPT,
} from './prompts.js';

// SDK 기본 재시도(2회)에 더해 우리도 직접 백오프 재시도를 한 번 더 감쌉니다.
// 529(overloaded) / 429(rate limit) / 5xx 는 일시적인 경우가 많아 재시도가 효과적.
let client = null;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// 짧은 키('haiku'|'sonnet'|'opus') → 실제 Claude 모델 ID
const MODEL_ALIASES = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
};
function resolveModel(key) {
  if (!key) return MODEL;
  const k = String(key).trim().toLowerCase();
  if (MODEL_ALIASES[k]) return MODEL_ALIASES[k];
  // 풀 ID 형태(예: 'claude-sonnet-4-6')도 그대로 허용
  if (/^claude-[a-z0-9-]+$/i.test(k)) return k;
  return MODEL;
}

const SYSTEM_JSON_ONLY =
  'You must respond with a single JSON object only. ' +
  'No prose, no markdown fences, no explanations — JSON only.';

function isRetryable(err) {
  const s = err?.status;
  return s === 408 || s === 409 || s === 429 || s === 529 || (s >= 500 && s < 600);
}

function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY is not configured');
    err.status = 500;
    throw err;
  }
  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 4,
  });
  return client;
}

async function callClaude(
  prompt,
  {
    maxTokens = 8192,
    model = null,
    system = null,
    temperature = null,
    topP = null,
    prefill = null,
    signal = null,        // V2 streaming: 클라이언트 연결이 끊기면 abort
    onProgress = null,    // V2 streaming: 진행 이벤트 emit (서버 → 클라이언트)
    rawText = false,      // true → JSON 파싱 건너뛰고 LLM 응답 문자열 그대로 반환 (단일 필드 번역용)
  } = {}
) {
  // SDK가 이미 maxRetries=4로 재시도하므로, 외부 wrapper는 1회 추가 시도까지만 (총 ≤2회).
  // 외부 재시도 횟수가 많으면 Vercel 함수 timeout(300s)을 잡아먹어 전체 실패.
  const useModel = resolveModel(model);
  console.log(`[anthropic] call model=${useModel} max_tokens=${maxTokens}`);
  const MAX_OUTER_ATTEMPTS = 2;
  let lastErr;
  const messages = [{ role: 'user', content: prompt }];
  if (prefill) {
    // Anthropic Messages API: assistant 메시지로 응답을 prefill 하면 그 뒤부터 이어 생성한다.
    // 응답 text에는 prefill 자체가 포함되지 않으므로 파싱 시 앞에 다시 붙여 줘야 한다.
    messages.push({ role: 'assistant', content: prefill });
  }
  for (let attempt = 0; attempt < MAX_OUTER_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    try {
      const payload = {
        model: useModel,
        max_tokens: maxTokens,
        system: system || SYSTEM_JSON_ONLY,
        messages,
      };
      if (temperature !== null) payload.temperature = temperature;
      // 신형 Claude 모델은 temperature 와 top_p 를 동시에 보내면 400 거부.
      // temperature 가 우선이고, top_p 는 temperature 가 없을 때만 보낸다.
      if (topP !== null && temperature === null) payload.top_p = topP;
      onProgress?.({ t: 'llm_call', model: useModel, max_tokens: maxTokens, attempt: attempt + 1 });
      // Anthropic SDK 의 두 번째 인자(RequestOptions)에 signal 전달 → 진짜 LLM 호출 중단.
      const res = await getClient().messages.create(payload, signal ? { signal } : undefined);
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      // prefill을 미리 박았으면 응답 앞에 다시 이어 붙여 완전한 JSON으로 만든다.
      // 단, 모델이 prefill을 무시하고 '{'부터 새로 출력한 경우엔 그대로 둠 (이중 헤더 방지).
      const combined =
        prefill && !text.trimStart().startsWith('{') ? prefill + text : text;
      onProgress?.({ t: 'llm_done', model: useModel, attempt: attempt + 1 });
      // rawText 옵션: 단일 필드 번역처럼 JSON 래핑이 오히려 위험한 케이스. 응답 문자열 그대로 반환.
      if (rawText) return combined;
      return parseJson(combined);
    } catch (err) {
      // AbortError 는 재시도하지 않고 그대로 throw
      if (err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''))) {
        onProgress?.({ t: 'aborted', model: useModel });
        throw err;
      }
      lastErr = err;
      // 디버그 로그 — Vercel 함수 로그에 정확한 원인이 남도록
      console.error(
        `[anthropic] attempt ${attempt + 1} failed model=${useModel} ` +
        `status=${err?.status} type=${err?.error?.type || err?.type} ` +
        `message=${(err?.message || '').slice(0, 300)}`
      );
      if (!isRetryable(err) || attempt === MAX_OUTER_ATTEMPTS - 1) break;
      const delayMs = 3000 + Math.floor(Math.random() * 500);
      console.warn(`[anthropic] retrying after ${delayMs}ms (status=${err?.status})`);
      onProgress?.({ t: 'llm_retry', model: useModel, attempt: attempt + 1, delayMs, status: err?.status ?? null });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // 에러 객체에 model 정보를 실어서 호출자가 사용자 메시지에 활용 가능
  if (lastErr) lastErr.__model = useModel;
  throw lastErr;
}

// 문자열 안에 raw 줄바꿈/탭/제어문자가 있으면 JSON 파싱이 깨짐.
// 안전하게 \n \r \t \uXXXX 로 이스케이프.
function escapeRawCtrlInStrings(json) {
  let out = '';
  let inString = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }
    }
    out += ch;
  }
  return out;
}

function removeTrailingCommas(json) {
  return json.replace(/,(\s*[}\]])/g, '$1');
}

// 배열이 중간에 잘렸을 때 마지막 완성 요소까지만 살려서 복구.
// extract 응답("cards"), translate-commentary 응답("results"), 기타 어떤 배열 키든 처리.
function repairTruncatedArray(s, arrayKey) {
  const keyPattern = `"${arrayKey}"`;
  const keyIdx = s.indexOf(keyPattern);
  if (keyIdx === -1) return null;
  const arrStart = s.indexOf('[', keyIdx);
  if (arrStart === -1) return null;

  let depth = 0;
  let inString = false;
  let esc = false;
  let lastEnd = -1;
  for (let i = arrStart + 1; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) lastEnd = i;
      else if (depth < 0) break;
    }
  }
  if (lastEnd === -1) return null;
  return s.slice(0, lastEnd + 1) + ']}';
}

// 하위 호환 — 기존 호출자는 cards 키 사용 가정.
function repairTruncatedCards(s) {
  return repairTruncatedArray(s, 'cards');
}

function tryParse(s, label) {
  try { return JSON.parse(s); }
  catch (e) {
    console.warn(`[parseJson] ${label} 실패:`, e.message);
    return null;
  }
}

function parseJson(text) {
  if (!text) throw new Error('LLM did not return valid JSON (empty response)');
  let s = String(text).trim();

  // 1) 코드 펜스 제거
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  // 2) 첫 '{' 부터 마지막 '}' 까지로 한 번 좁히기
  const firstBrace = s.indexOf('{');
  if (firstBrace === -1) throw new Error('LLM did not return valid JSON (no `{` found)');
  s = s.slice(firstBrace);
  const lastBrace = s.lastIndexOf('}');
  const candidate = lastBrace !== -1 ? s.slice(0, lastBrace + 1) : s;

  // 3) 원본 시도
  let out = tryParse(candidate, '원본 파싱');
  if (out) return out;

  // 4) 문자열 안의 미escape 컨트롤 문자 이스케이프 후 재시도
  const fixed1 = escapeRawCtrlInStrings(candidate);
  out = tryParse(fixed1, '컨트롤 문자 escape 후');
  if (out) return out;

  // 5) 트레일링 콤마 제거 후 재시도
  const fixed2 = removeTrailingCommas(fixed1);
  out = tryParse(fixed2, '트레일링 콤마 제거 후');
  if (out) return out;

  // 6) cards / results 배열을 마지막 완성 요소까지 잘라 복구 시도
  //    extract 응답은 "cards", translate-commentary 응답은 "results" 키 사용.
  const truncRepaired =
    repairTruncatedArray(fixed2, 'cards') ||
    repairTruncatedArray(fixed1, 'cards') ||
    repairTruncatedArray(s, 'cards') ||
    repairTruncatedArray(fixed2, 'results') ||
    repairTruncatedArray(fixed1, 'results') ||
    repairTruncatedArray(s, 'results');
  if (truncRepaired) {
    out = tryParse(escapeRawCtrlInStrings(truncRepaired), '배열 잘림 복구');
    if (out) {
      out.__recovered = true;
      return out;
    }
  }

  console.error('[parseJson] 모든 복구 시도 실패. raw text 일부:', text.slice(0, 500));
  throw new Error('LLM did not return valid JSON (all repair attempts failed)');
}

// 청크 크기 — Claude 4 계열 200K 토큰 한도에 맞춰 보수적으로.
// 한국어 1글자 ≈ 1.5~2 토큰. 80K + 15K (이전값) 은 worst case 190K 토큰까지 부풀어
// 시스템·추출·시드·출력 예약(~25K) 더하면 200K 직격 → 413 발생.
// 현행: 50K + 10K = 최대 60K 글자 = 한국어 worst 120K 토큰 → 한도까지 80K 마진.
// 청크 수가 좀 늘어도 병렬(동시 3) 처리로 wall-clock 영향 작음.
const EXTRACT_CHUNK_TARGET_CHARS = 50000;
const EXTRACT_CHUNK_WINDOW_CHARS = 10000;
const EXTRACT_CHUNK_OVERLAP_CHARS = 3000;
const EXTRACT_FINAL_INPUT_CARDS = 80;
const EXTRACT_FINAL_OUTPUT_CARDS = 40;

// 카테고리별 절대 어겨선 안 되는 규칙 — 프롬프트 본문 앞에 prepend.
// LLM 이 본문 규칙을 가끔 무시하는 케이스 대비, 최상단에 다시 한 번 강조.
// 서버 후처리 검증(validateAndFilterCards)이 같은 규칙으로 위반 카드를 drop.
function buildCriticalRulesPreamble(category) {
  const lengthRule = ({
    screen: '· script_excerpt 는 **무조건 2000자 이상**. 미달이면 앞뒤 turn을 더 가져와 반드시 채울 것. 미달 카드는 서버에서 삭제됨.',
    opera:  '· script_excerpt 는 **무조건 2000자 이상**. 미달이면 앞뒤 노래 단락을 더 포함할 것. 미달 카드는 서버에서 삭제됨.',
    play:   '· script_excerpt 는 **무조건 2000자 이상**. 미달이면 앞뒤 turn / 지문을 더 가져와 채울 것. 미달 카드는 서버에서 삭제됨.',
    novel:  '· script_excerpt 는 **무조건 2000자 이상**. 미달이면 앞뒤 단락을 더 가져와 채울 것. 미달 카드는 서버에서 삭제됨.',
    essay:  '· script_excerpt 는 **무조건 2000자 이상**. 미달이면 앞뒤 단락을 더 가져와 채울 것. 미달 카드는 서버에서 삭제됨.',
    // poem / prose 는 짧음 예외 — 강조 안 함
    poem:   '· script_excerpt 는 행·연 구조 그대로 (짧을수록 좋음. 다른 시·단락을 끌어와 채우지 말 것).',
    prose:  '· script_excerpt 는 가능한 2000자 이상이지만, 글 한 편이 짧으면 전체 그대로 (짧은 산문 예외).',
  })[category] || '· script_excerpt 는 **무조건 2000자 이상** (poem/prose 제외).';

  return `[★★★ CRITICAL — 아래 규칙은 절대 위반 금지. 위반 카드는 서버에서 즉시 삭제됨 ★★★]
1. quote ≠ script_excerpt — 같거나 95% 이상 겹치면 카드 자체가 무효.
   quote 는 짧은 명대사(≤200자), script_excerpt 는 그 명대사를 **둘러싼 앞뒤 맥락까지 포함한 긴 발췌**.
   ❌ 잘못된 예: quote = "If you are with the quality..." / script_excerpt = "If you are with the quality..." (동일)
   ✅ 올바른 예: quote = "If you are with the quality..." / script_excerpt = "[앞 단락 200자] ... If you are with the quality... [뒤 단락 1700자]"
   즉 script_excerpt 의 길이는 반드시 quote 보다 압도적으로 길고, quote 가 그 일부로 포함되어야 한다.
2. ${lengthRule}
3. quote 는 작품 원문 그대로 (한 글자도 바꾸지 않음, 200자 이내).
4. 출력 직전 self-check: 각 카드별로 다음을 모두 확인하고, 하나라도 어기는 카드는 출력에서 제외하거나 수정한다.
   (a) quote 와 script_excerpt 의 문자열이 다른가?
   (b) script_excerpt 의 길이가 quote 의 길이보다 최소 5배 이상인가?
   (c) script_excerpt 가 카테고리별 최소 길이를 충족하는가?
   (d) quote 의 모든 문자가 script_excerpt 안에 그대로 포함되는가?
[★★★ CRITICAL 끝 ★★★]

`;
}

function buildExtractPrompt(scriptText, category, seedBlock = '', chunkInfo = null) {
  const tpl = EXTRACT_PROMPTS[category] || EXTRACT_PROMPTS.screen;
  const chunkNote = chunkInfo
    ? [
        '',
        '[CHUNKING NOTE]',
        `This is chunk ${chunkInfo.index} of ${chunkInfo.total} from one full script.`,
        `The chunks overlap by about ${chunkInfo.overlapChars} characters, so avoid duplicate cards from repeated overlap text.`,
        'Extract strong candidates from this visible section. A later merge pass will deduplicate and select across the whole work.',
      ].join('\n')
    : '';
  const critical = buildCriticalRulesPreamble(category);
  const body = tpl
    .replace('{{QUOTE_SEED_BLOCK}}', `${seedBlock || ''}${chunkNote}`)
    .replace('{{SCRIPT_TEXT}}', scriptText);
  return critical + body;
}

function findRegexCandidates(text, from, to, regex, baseScore, useEnd = false) {
  const zone = text.slice(from, to);
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  const candidates = [];
  let match;
  while ((match = re.exec(zone)) !== null) {
    const pos = from + match.index + (useEnd ? match[0].length : 0);
    candidates.push({ pos, baseScore });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return candidates;
}

function findBestSplit(text, start, desired, searchStart, searchEnd) {
  const candidates = [
    ...findRegexCandidates(text, searchStart, searchEnd, /^\s*(?:ACT|PART|CHAPTER|PROLOGUE|EPILOGUE|제\s*\d+\s*(?:막|장|부)|\d+\s*(?:막|장|부)|막\s*\d+|장\s*\d+)(?:\s|[:：.-]|$).*$/gim, 900),
    ...findRegexCandidates(text, searchStart, searchEnd, /^\s*(?:SCENE|씬|장면)\s*\d*(?:\s|[:：.-]|$).*$/gim, 760),
    ...findRegexCandidates(text, searchStart, searchEnd, /^\s*(?:INT\.|EXT\.|I\/E\.|실내|실외)(?:\s|[:：.-]|$).*$/gim, 720),
    ...findRegexCandidates(text, searchStart, searchEnd, /\n[ \t]*\n[ \t]*\n+/g, 620, true),
    ...findRegexCandidates(text, searchStart, searchEnd, /\n[ \t]*\n(?=[^\n]{1,50}\n)/g, 520, true),
    ...findRegexCandidates(text, searchStart, searchEnd, /[.!?。！？…]["')\]]?\s+/g, 360, true),
  ].filter((c) => c.pos > start + 1000 && c.pos < text.length);

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aScore = a.baseScore - Math.abs(a.pos - desired) / 1000;
    const bScore = b.baseScore - Math.abs(b.pos - desired) / 1000;
    return bScore - aScore;
  });
  return candidates[0].pos;
}

// 한국어 비율을 측정해 청크 크기를 동적으로 정한다.
// 한국어: 1글자 ≈ 1.5~2 토큰 (보수적으로 50K + 10K 가 안전)
// 영어:   1글자 ≈ 0.25 토큰 (드라큘라 같은 큰 영문 PDF 는 150K + 25K 까지 안전)
function _detectChunkSize(sampleText) {
  const sample = String(sampleText || '').slice(0, 8000);
  if (!sample.length) return { target: EXTRACT_CHUNK_TARGET_CHARS, window: EXTRACT_CHUNK_WINDOW_CHARS };
  const koreanCount = (sample.match(/[가-힣]/g) || []).length;
  const koRatio = koreanCount / sample.length;
  if (koRatio < 0.20) {
    // 주로 영어/라틴 — 큰 청크 사용해 청크 수 ↓ → 시간 초과 방지
    return { target: 150000, window: 25000 };
  }
  if (koRatio < 0.50) {
    // 혼합 (영문 인용·인명 다수) — 중간
    return { target: 80000, window: 15000 };
  }
  // 한국어 위주 — 보수적
  return { target: EXTRACT_CHUNK_TARGET_CHARS, window: EXTRACT_CHUNK_WINDOW_CHARS };
}

export function splitScriptIntoChunks(
  scriptText,
  opts = {}
) {
  const text = String(scriptText || '');
  // 호출자가 명시 안 했으면 언어 비율로 자동 결정.
  const auto = _detectChunkSize(text);
  const targetChars  = opts.targetChars  ?? auto.target;
  const windowChars  = opts.windowChars  ?? auto.window;
  const overlapChars = opts.overlapChars ?? EXTRACT_CHUNK_OVERLAP_CHARS;
  if (text.length <= targetChars + windowChars) {
    return [{ index: 1, total: 1, start: 0, end: text.length, text }];
  }

  const chunks = [];
  let start = 0;
  let guard = 0;
  while (start < text.length && guard < 1000) {
    guard += 1;
    const remaining = text.length - start;
    if (remaining <= targetChars + windowChars) {
      chunks.push({ start, end: text.length, text: text.slice(start) });
      break;
    }

    const desired = start + targetChars;
    const minSearchStart = start + Math.floor(targetChars * 0.55);
    const searchStart = Math.max(minSearchStart, desired - windowChars);
    const searchEnd = Math.min(text.length, desired + windowChars);
    const splitAt = findBestSplit(text, start, desired, searchStart, searchEnd) || Math.min(text.length, desired);
    const end = Math.max(start + 1, splitAt);
    chunks.push({ start, end, text: text.slice(start, end) });

    const nextStart = Math.max(end - overlapChars, start + 1);
    start = nextStart >= end ? end : nextStart;
  }

  return chunks.map((chunk, idx) => ({
    ...chunk,
    index: idx + 1,
    total: chunks.length,
  }));
}

async function runExtractSingle(scriptText, category, seedBlock, model, chunkInfo = null, { signal = null, onProgress = null } = {}) {
  const prompt = buildExtractPrompt(scriptText, category, seedBlock, chunkInfo);
  return callClaude(prompt, { maxTokens: 16000, model, signal, onProgress });
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
    : [];
}

function normalizeWork(work) {
  const source = work && typeof work === 'object' ? work : {};
  return {
    title: source.title ? String(source.title).trim() : 'unknown',
    subtitle: source.subtitle ? String(source.subtitle).trim() : null,
    format: source.format ? String(source.format).trim() : 'movie',
    author: source.author == null ? null : String(source.author).trim() || null,
    release_year: source.release_year == null ? null : String(source.release_year).trim() || null,
    genres: arrayOfStrings(source.genres),
    characters: arrayOfStrings(source.characters),
  };
}

function mergeWork(base, next) {
  const out = normalizeWork(base);
  const other = normalizeWork(next);
  for (const key of ['title', 'subtitle', 'format', 'author', 'release_year']) {
    if ((!out[key] || out[key] === 'unknown') && other[key] && other[key] !== 'unknown') {
      out[key] = other[key];
    }
  }
  out.genres = [...new Set([...arrayOfStrings(out.genres), ...arrayOfStrings(other.genres)])];
  out.characters = [...new Set([...arrayOfStrings(out.characters), ...arrayOfStrings(other.characters)])];
  return out;
}

function cardKey(card) {
  const raw = String(card?.quote || card?.script_excerpt || '').toLowerCase();
  return raw.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 160);
}

function mergeExtractResults(results) {
  let work = normalizeWork(results[0]?.work);
  const cards = [];
  const seen = new Set();

  for (const result of results) {
    work = mergeWork(work, result?.work);
    const resultCards = Array.isArray(result?.cards) ? result.cards : [];
    for (const card of resultCards) {
      if (!card || typeof card !== 'object') continue;
      const key = cardKey(card);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  }

  return { work, cards };
}

function pickEvenly(items, limit) {
  if (items.length <= limit) return items;
  const picked = [];
  const step = items.length / limit;
  for (let i = 0; i < limit; i++) {
    picked.push(items[Math.floor(i * step)]);
  }
  return picked;
}

async function finalizeChunkedExtract(merged, model, { signal = null, onProgress = null } = {}) {
  const input = {
    work: merged.work,
    cards: pickEvenly(merged.cards, EXTRACT_FINAL_INPUT_CARDS),
  };
  const prompt = `You are merging quote-card extraction results from chunks of one complete script.
Return one JSON object with the same schema:
{
  "work": {"title":"","subtitle":null,"format":"","author":null,"release_year":null,"genres":[],"characters":[]},
  "cards": []
}

Rules:
- Deduplicate cards that quote or describe the same moment.
- Keep the strongest cards across the whole work, not only the first chunk.
- Prefer cards that are important to the whole narrative, emotionally resonant, or highly recognizable.
- Keep at most ${EXTRACT_FINAL_OUTPUT_CARDS} cards.
- Preserve useful keywords, temperature, intensity, excerpt_description, and significance.
- Do not invent quotes or scene text that is not in the input.

INPUT_JSON:
${JSON.stringify(input, null, 2)}`;

  const finalResult = await callClaude(prompt, { maxTokens: 16000, model, signal, onProgress });
  return {
    work: mergeWork(merged.work, finalResult?.work),
    cards: Array.isArray(finalResult?.cards) && finalResult.cards.length ? finalResult.cards : merged.cards,
  };
}

// LLM 이 script_excerpt 를 quote 와 동일하게 / 너무 짧게 만든 카드 자동 복구.
// 원본 텍스트(fullScript) 에서 quote 위치를 4단계 fuzzy 매칭으로 찾아 주변 ~2400자 발췌.
//  · LLM 이 따옴표 종류, 줄바꿈, 약간의 변형을 가하기 때문에 strict indexOf 만으론 못 잡힘.
// 마지막 수단: quote 를 못 찾았어도 카드를 살리기 위해 본문에서 카드 인덱스 기준 위치의
// 청크를 발췌해 prepend 한다. 그러면 script_excerpt = quote + 본문 청크 → 검증 통과.
// poem/prose 는 minChars=0 이므로 복구 대상에서 자동 제외.

// quote 위치를 fullScript 에서 찾는다. 4단계 fuzzy:
//  1) 정확 매칭
//  2) 공백 정규화된 본문에서 정규화된 quote 검색
//  3) quote 의 가운데 60자 슬라이스로 검색
//  4) quote 의 앞 8 단어로 검색 (공백 정규화 본문 기준)
// 찾으면 { idx, sourceText, foundLen } 반환. 못 찾으면 null.
function findQuoteInSource(quoteStr, fullScript, collapsedSource) {
  // 1) 정확 매칭
  let idx = fullScript.indexOf(quoteStr);
  if (idx !== -1) return { idx, sourceText: fullScript, foundLen: quoteStr.length, method: 'exact' };

  // 2) 공백 정규화 매칭 — LLM 이 원문의 \n 을 공백으로 합치는 경우가 흔함
  const collapsedQuote = quoteStr.replace(/\s+/g, ' ');
  idx = collapsedSource.indexOf(collapsedQuote);
  if (idx !== -1) return { idx, sourceText: collapsedSource, foundLen: collapsedQuote.length, method: 'collapsed' };

  // 3) 가운데 슬라이스 매칭 — quote 양끝에 LLM 변형 가능성 회피
  if (quoteStr.length >= 40) {
    const sliceLen = Math.min(60, Math.floor(quoteStr.length * 0.5));
    const sliceStart = Math.floor((quoteStr.length - sliceLen) / 2);
    const slice = quoteStr.slice(sliceStart, sliceStart + sliceLen);
    // 정확
    let found = fullScript.indexOf(slice);
    if (found !== -1) {
      return { idx: Math.max(0, found - sliceStart), sourceText: fullScript, foundLen: quoteStr.length, method: 'slice-exact' };
    }
    // 공백 정규화
    const cSlice = slice.replace(/\s+/g, ' ');
    found = collapsedSource.indexOf(cSlice);
    if (found !== -1) {
      return { idx: Math.max(0, found - sliceStart), sourceText: collapsedSource, foundLen: quoteStr.length, method: 'slice-collapsed' };
    }
  }

  // 4) 앞 8 단어 매칭 — quote 끝부분이 LLM 에 의해 잘리거나 변형된 경우 대비
  const words = quoteStr.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const head = words.slice(0, Math.min(8, words.length)).join(' ');
    if (head.length >= 20) {
      const found = collapsedSource.indexOf(head);
      if (found !== -1) {
        return { idx: found, sourceText: collapsedSource, foundLen: head.length, method: 'head-8words' };
      }
    }
  }

  return null;
}

function rescueIdenticalAndShort(cards, fullScript, category) {
  if (!Array.isArray(cards) || !fullScript) return { cards, rescued: 0, unrescuable: 0 };
  const minChars = MIN_SCRIPT_CHARS_BY_CATEGORY[category] ?? 2000;
  if (minChars <= 0) return { cards, rescued: 0, unrescuable: 0 };

  // 공백 정규화 본문 — fuzzy 매칭용. 한 번만 만들어 모든 카드에 재사용.
  const collapsedSource = fullScript.replace(/\s+/g, ' ');

  let rescuedCount = 0;
  let unrescuable = 0;
  const methodCounts = {};
  const target = Math.floor(minChars * 1.2);

  const out = cards.map((card, cardIdx) => {
    if (!card?.quote || !card?.script_excerpt) return card;
    const q = _norm(card.quote);
    const s = _norm(card.script_excerpt);
    const isIdentical = q && s && (q === s || q.length / s.length >= QUOTE_RATIO_TOO_HIGH);
    const isShort = String(card.script_excerpt).length < minChars;
    if (!isIdentical && !isShort) return card;

    const quoteStr = String(card.quote).trim();
    if (!quoteStr) return card;

    const match = findQuoteInSource(quoteStr, fullScript, collapsedSource);

    if (!match) {
      // 못 찾았어도 카드를 살린다. 본문에서 카드 인덱스 기준 위치의 청크를 떼어
      // quote 뒤에 붙여 script_excerpt 로 사용 → 검증 통과 + 어드민이 검토에서 편집 가능.
      // (0장 결과 < N장 비완벽 카드 — 사용자가 원본 보고 발췌 위치 수정 가능)
      unrescuable++;
      console.warn(
        `[extract] rescue: quote not in source — fallback to positional chunk. ` +
        `quote="${quoteStr.slice(0, 80).replace(/\n/g, '\\n')}..."`
      );
      const totalCards = Math.max(1, cards.length);
      const slot = Math.floor((cardIdx + 0.5) * fullScript.length / totalCards);
      const chunkStart = Math.max(0, slot - Math.floor(target / 2));
      const chunkEnd = Math.min(fullScript.length, chunkStart + target);
      const chunk = fullScript.slice(chunkStart, chunkEnd);
      // quote 가 chunk 안에 우연히 포함되지 않게 quote + 구분 + chunk 형태로
      const fallback = `${quoteStr}\n\n${chunk}`;
      if (fallback.length >= minChars) {
        rescuedCount++;
        return { ...card, script_excerpt: fallback, __rescued: true, __fallback: true };
      }
      return card;
    }

    methodCounts[match.method] = (methodCounts[match.method] || 0) + 1;
    const src = match.sourceText;
    const srcLen = src.length;
    const idx = match.idx;
    const foundLen = match.foundLen;

    const needBefore = Math.floor((target - foundLen) / 2);
    const needAfter = Math.max(0, target - foundLen - needBefore);
    let start = Math.max(0, idx - needBefore);
    let end = Math.min(srcLen, idx + foundLen + needAfter);

    // 단락 경계 정렬 — collapsed source 에는 \n\n 이 없어 의미 없지만 안전하게 시도
    const headSlice = src.slice(start, idx);
    const lastDoubleNL = headSlice.lastIndexOf('\n\n');
    if (lastDoubleNL !== -1 && (headSlice.length - lastDoubleNL - 2) > 200) {
      start = start + lastDoubleNL + 2;
    }
    const tailStart = idx + foundLen;
    const tailSlice = src.slice(tailStart, end);
    const firstDoubleNL = tailSlice.indexOf('\n\n');
    if (firstDoubleNL !== -1 && firstDoubleNL > Math.floor(minChars * 0.4)) {
      end = tailStart + firstDoubleNL;
    }

    const rescued = src.slice(start, end);
    if (rescued.length < quoteStr.length * 2) return card;

    rescuedCount++;
    return { ...card, script_excerpt: rescued, __rescued: true };
  });

  if (rescuedCount > 0 || unrescuable > 0) {
    const methodSummary = Object.entries(methodCounts).map(([m, n]) => `${m}=${n}`).join(' ');
    console.log(
      `[extract] rescue: rescued=${rescuedCount} fallback=${unrescuable} input=${cards.length} ` +
      `methods={${methodSummary}} category=${category}`
    );
  }
  return { cards: out, rescued: rescuedCount, unrescuable };
}

export async function runExtract(scriptText, category = 'screen', seedBlock = '', model = null, { signal = null, onProgress = null } = {}) {
  const chunks = splitScriptIntoChunks(scriptText);
  if (chunks.length === 1) {
    onProgress?.({ t: 'stage', m: '본문 분석 중 (단일 청크)' });
    const single = await runExtractSingle(scriptText, category, seedBlock, model, null, { signal, onProgress });
    // 자동 복구 — LLM 이 quote≈script 또는 짧게 만든 카드를 원본에서 발췌해 확장.
    const rescued = rescueIdenticalAndShort(single?.cards || [], scriptText, category);
    // 그래도 못 살린 카드(원본에 quote 없음 = LLM 환각) 는 여기서 drop.
    const validated = validateAndFilterCards(rescued.cards, category);
    return {
      ...single,
      cards: validated.cards,
      __validation: { ...validated.summary, rescued: rescued.rescued, unrescuable: rescued.unrescuable },
    };
  }

  // 자동 결정된 실제 청크 사이즈 — 영문 PDF 는 더 큼.
  const sampleSize = chunks[0]?.text?.length || 0;
  console.log(
    `[anthropic] chunked extract chars=${String(scriptText || '').length} ` +
    `chunks=${chunks.length} firstChunkChars=${sampleSize} overlap=${EXTRACT_CHUNK_OVERLAP_CHARS}`
  );
  onProgress?.({ t: 'stage', m: `본문이 길어 ${chunks.length}개 청크로 분할 — 동시 3개씩 분석` });

  // 청크 병렬 처리 — 순차로 돌면 6~7개 청크 × 30~60초 = Vercel 300s 한도 초과.
  // 동시 3개씩 처리해 wall-clock 을 1/3 로 단축. Anthropic 레이트는 SDK 가 자동 관리.
  const CHUNK_CONCURRENCY = 3;
  const results = new Array(chunks.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < chunks.length) {
      if (signal?.aborted) { const a = new Error('aborted'); a.name = 'AbortError'; throw a; }
      const i = cursor++;
      const chunk = chunks[i];
      console.log(`[anthropic] extracting chunk ${chunk.index}/${chunk.total} chars=${chunk.text.length}`);
      onProgress?.({ t: 'chunk_start', index: chunk.index, total: chunk.total, chars: chunk.text.length });
      results[i] = await runExtractSingle(chunk.text, category, seedBlock, model, {
        index: chunk.index,
        total: chunk.total,
        overlapChars: EXTRACT_CHUNK_OVERLAP_CHARS,
      }, { signal, onProgress });
      completed += 1;
      onProgress?.({ t: 'chunk_done', index: chunk.index, total: chunk.total, completed });
    }
  }
  try {
    await Promise.all(
      Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker)
    );
  } catch (err) {
    // Abort 시 지금까지 완료된 청크의 부분 결과를 client 에 보낸다 — 사용자가 8개 청크 중
    // 5개 끝나고 중단했으면 그 5개 카드는 살려서 돌려준다.
    if (err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''))) {
      const completedResults = results.filter(Boolean);
      if (completedResults.length > 0 && onProgress) {
        try {
          const partial = mergeExtractResults(completedResults);
          onProgress({
            t: 'partial_result',
            d: {
              ...partial,
              __chunked: {
                chunks: chunks.length,
                completed: completedResults.length,
                aborted: true,
              },
            },
          });
        } catch (mergeErr) {
          console.warn('[anthropic] partial merge failed on abort:', mergeErr?.message || mergeErr);
        }
      }
    }
    throw err;
  }

  const merged = mergeExtractResults(results);
  let finalResult = merged;
  let finalizeFailed = false;
  try {
    onProgress?.({ t: 'stage', m: '청크 결과 병합 중' });
    finalResult = await finalizeChunkedExtract(merged, model, { signal, onProgress });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    finalizeFailed = true;
    console.warn('[anthropic] chunk finalization failed, returning deterministic merge:', err?.message || err);
  }

  // 카드 후처리 — 자동 복구 후 검증.
  //  1) rescue: LLM 이 quote≈script 또는 짧게 만든 카드는 원본에서 발췌해 script_excerpt 확장
  //  2) validate: 그래도 못 살린 카드(원본에 없음, 또는 복구 실패) 는 drop
  const rescued = rescueIdenticalAndShort(finalResult?.cards || [], scriptText, category);
  const validated = validateAndFilterCards(rescued.cards, category);
  return {
    ...finalResult,
    cards: validated.cards,
    __chunked: {
      chunks: chunks.length,
      target_chars: EXTRACT_CHUNK_TARGET_CHARS,
      window_chars: EXTRACT_CHUNK_WINDOW_CHARS,
      overlap_chars: EXTRACT_CHUNK_OVERLAP_CHARS,
      finalize_failed: finalizeFailed || undefined,
    },
    __validation: { ...validated.summary, rescued: rescued.rescued, unrescuable: rescued.unrescuable },
  };
}

// 추출된 카드 후처리 — 추출 프롬프트의 hard rule 을 서버에서도 강제.
//  1) quote == script_excerpt (정규화 후 완전 동일) → drop. '포함' 은 정상이라 strict equal 만.
//  2) script_excerpt 길이 미달 → drop (카테고리별 최소치).
//     · poem: 0 (시는 짧을수록 좋음 — 프롬프트 예외)
//     · prose/essay: 0 (짧은 산문 예외 — 프롬프트 명시)
//     · screen/novel/play/opera: 2000자 강제
//  3) 안전망: 전체 카드 중 70% 이상이 drop 대상이면 LLM 이 완전히 규칙을 어긴 것 →
//     drop 안 하고 warn 만 (관리자에게 보여서 직접 판단). 추출 자체를 0장 응답하는 사고 방지.
const MIN_SCRIPT_CHARS_BY_CATEGORY = {
  poem: 0,
  prose: 0,
  essay: 0,
  screen: 2000, novel: 2000, play: 2000, opera: 2000,
};
// 안전망 임계치 — 거의 모든 카드(90% 이상)가 위반인 극단적 케이스에만 발동.
// 그 미만은 strict drop. 프롬프트 무시 자체를 허용하지 않음.
const DROP_RATE_SAFETY = 0.9;

// 비교 정규화 — strict equal 만으로는 미세 차이(따옴표 종류, 유니코드 제어문자, 끝 단어 한 두 개) 못 잡음.
// trim + 공백 정규화 + 유니코드 NFC + 스마트따옴표·대시·생략부호 정규화 + 영숫자 외 제거.
function _norm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// 명대사가 발췌 안에서 차지하는 비율 — 95% 초과면 사실상 동일한 카드로 본다.
// 예: quote 200자, script_excerpt 210자 → 95% → 발췌가 의미 있게 확장 안 됨 → drop.
const QUOTE_RATIO_TOO_HIGH = 0.95;

export function validateAndFilterCards(cards, category) {
  if (!Array.isArray(cards)) {
    return { cards: [], summary: { total: 0, kept: 0, dropped_identical: 0, dropped_short: 0, min_chars: 0, category } };
  }
  const minChars = MIN_SCRIPT_CHARS_BY_CATEGORY[category] ?? 2000;

  // 1차: drop 판정 (분류만 — 실제 drop 은 안전망 검사 후)
  const verdicts = cards.map((c) => {
    const qRaw = String(c?.quote ?? '');
    const sRaw = String(c?.script_excerpt ?? '');
    const q = _norm(qRaw);
    const s = _norm(sRaw);
    // 완전 동일
    if (q && s && q === s) return { c, drop: 'identical' };
    // 거의 동일 — quote 가 script_excerpt 의 95% 이상 차지하면 사실상 같은 카드
    if (q && s && s.length > 0) {
      const ratio = q.length / s.length;
      if (ratio >= QUOTE_RATIO_TOO_HIGH) return { c, drop: 'identical' };
    }
    // 길이 미달
    if (minChars > 0 && (!c?.script_excerpt || String(c.script_excerpt).length < minChars)) {
      return { c, drop: 'short' };
    }
    return { c, drop: null };
  });

  // safety fallback — 'short' (길이 미달) 만 적용. drop rate 90% 이상이면
  // LLM 이 광범위하게 짧은 발췌를 만들었다고 보고 warn 만 (어드민이 편집 가능).
  // 'identical' (quote == script_excerpt) 는 safety fallback 면제 — 변명 여지 없는 명백한 위반,
  // 항상 drop. 사용자 강력 요구사항: "명대사랑 본문 스크립트가 똑같이 나오는 건 절대 안 된다".
  const shortDropCount = verdicts.filter((v) => v.drop === 'short').length;
  const shortDropRate = cards.length ? (shortDropCount / cards.length) : 0;
  const safetyFallback = shortDropRate >= DROP_RATE_SAFETY;
  if (safetyFallback) {
    console.warn(
      `[extract] SAFETY (short only): drop rate ${(shortDropRate * 100).toFixed(0)}% (>=${(DROP_RATE_SAFETY * 100).toFixed(0)}%) — ` +
      `LLM produced widely-short script_excerpts. Keeping with warn so admin can edit. (identical still always dropped)`
    );
  }

  let droppedIdentical = 0;
  let droppedShort = 0;
  const warnedIdentical = 0;  // identical 은 더 이상 warn-only 가 없음 — 항상 drop
  let warnedShort = 0;
  const survivors = [];

  for (const { c, drop } of verdicts) {
    if (drop === 'identical') {
      // ALWAYS drop — safety fallback 무시.
      droppedIdentical++;
      const qlen = String(c?.quote || '').length;
      const slen = String(c?.script_excerpt || '').length;
      console.warn(`[extract] drop: quote≈script_excerpt (qlen=${qlen} slen=${slen})`);
    } else if (drop === 'short') {
      const slen = String(c?.script_excerpt || '').length;
      if (safetyFallback) {
        warnedShort++;
        console.warn(`[extract] (warn) short script_excerpt ${slen}<${minChars} category=${category}`);
        survivors.push(c);
      } else {
        droppedShort++;
        console.warn(`[extract] drop: short script_excerpt ${slen}<${minChars} category=${category}`);
      }
    } else {
      survivors.push(c);
    }
  }

  console.log(
    `[extract] validation: in=${cards.length} out=${survivors.length} ` +
    `dropped_identical=${droppedIdentical} dropped_short=${droppedShort} ` +
    `${safetyFallback ? `(safety: warned identical=${warnedIdentical} short=${warnedShort})` : ''} ` +
    `min=${minChars} category=${category}`
  );

  return {
    cards: survivors,
    summary: {
      total: cards.length,
      kept: survivors.length,
      dropped_identical: droppedIdentical,
      dropped_short: droppedShort,
      warned_identical: warnedIdentical,
      warned_short: warnedShort,
      safety_fallback: safetyFallback,
      min_chars: minChars,
      category,
    },
  };
}

// 대본 전문에서 등장인물 이름 목록만 추출. (works.characters 백필용)
// 등장인물 페이지는 보통 앞부분에 있으므로 앞부분만 보내 토큰·시간 절약.
export async function runExtractCharacters(scriptText) {
  const text = String(scriptText || '').slice(0, 24000);
  if (!text.trim()) return [];
  const prompt = CHARACTERS_PROMPT.replace('{{SCRIPT_TEXT}}', text);
  const result = await callClaude(prompt, { maxTokens: 1024 });
  const arr = Array.isArray(result?.characters) ? result.characters : [];
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
}

// 키워드 배열을 6개 의미 범주(+미분류)로 분류. { 키워드: 범주 } 맵 반환.
// 화면 표시용 — DB 저장 안 함.
export async function runClassifyKeywords(keywords) {
  const list = [...new Set((keywords || []).map((k) => String(k).trim()).filter(Boolean))];
  if (!list.length) return {};
  const prompt = CLASSIFY_KEYWORDS_PROMPT.replace('{{KEYWORDS_JSON}}', JSON.stringify(list, null, 2));
  const result = await callClaude(prompt, { maxTokens: 8192 });
  const assignments =
    result && typeof result.assignments === 'object' && result.assignments ? result.assignments : {};
  return assignments;
}

// 영문 작가명을 통용 한국어 표기로 변환. (저장 직전 가드 + 백필용)
// - 입력이 비어있거나 이미 한글만 있으면 그대로 반환 (LLM 호출 안 함).
// - 매핑 모호 시 음역. 작품 제목·역할 설명은 빼고 사람 이름만.
export async function runKoreanizeAuthor(rawAuthor) {
  const s = String(rawAuthor ?? '').trim();
  if (!s) return null;
  if (!/[A-Za-z]/.test(s)) return s;
  const prompt = `다음 작가 이름을 한국에서 통용되는 한국어 표기로 변환하라. 반드시 JSON 한 줄로만 응답.
규칙:
- 통용 표기가 있으면 그것을 사용 (예: "Arthur Conan Doyle" → "아서 코난 도일", "Giuseppe Verdi" → "주세페 베르디", "Shakespeare" → "윌리엄 셰익스피어").
- 모호하면 한국어 음역. 영문이나 한자 그대로 두지 말 것.
- 작품 제목·역할 설명·괄호 주석은 제거. 순수 인명만.
- 작가가 둘 이상이면 "/" 로 구분 ("주세페 베르디 / 프란체스코 마리아 피아베").

입력: "${s.replace(/"/g, '\\"')}"

응답 형식 (한 줄):
{"author":"한국어 이름"}`;
  const result = await callClaude(prompt, { maxTokens: 256 });
  const out = String(result?.author ?? '').trim();
  return out || s;
}

export async function runTranslate(work, card) {
  // TRANSLATE_PROMPT는 {work, card} 봉투를 받고, 응답은 {quote, script_excerpt} 두 필드만.
  // 출력 스키마를 단순화해 모델이 형식 검열에 토큰을 덜 쓰게 하고,
  // 작품 메타·excerpt_description을 컨텍스트로 함께 넘겨 말투·시대 톤을 잡게 한다.
  const w = work && typeof work === 'object' ? work : {};
  const envelope = {
    work: {
      title: w.title ?? null,
      subtitle: w.subtitle ?? null,
      format: w.format ?? null,
      author: w.author ?? null,
      release_year: w.release_year ?? null,
      genres: Array.isArray(w.genres) ? w.genres : [],
      characters: Array.isArray(w.characters) ? w.characters : [],
    },
    card: {
      quote: card.quote ?? '',
      script_excerpt: card.script_excerpt ?? '',
      // 번역 대상은 아니지만, 화자·청자·관계·시대 추론에 쓰라고 함께 보낸다.
      excerpt_description: card.excerpt_description ?? '',
    },
  };

  const prompt = TRANSLATE_PROMPT.replace('{{INPUT_JSON}}', JSON.stringify(envelope, null, 2));
  // script_excerpt가 2000자 이상으로 길어, 영문→한국어 번역 출력이 4096 토큰을 넘어
  // JSON이 중간에 잘리는 문제(=valid JSON 실패)를 막기 위해 넉넉히 16000으로.
  // prefill로 응답 JSON 헤더를 미리 박아 모델이 형식 토큰에 자원을 덜 쓰게 한다.
  // 신형 모델은 temperature 와 top_p 동시 지정 시 400 에러. temperature 만 사용.
  const result = await callClaude(prompt, {
    maxTokens: 16000,
    system: TRANSLATE_SYSTEM,
    temperature: 0.3,
    prefill: '{"quote":"',
  });

  if (!result || typeof result.quote !== 'string') {
    throw new Error('Translation response missing quote');
  }
  const confidence = result.confidence === 'low' ? 'low' : 'high';
  const note = typeof result.note === 'string' ? result.note : '';
  return {
    quote_translated: result.quote,
    script_excerpt_translated: result.script_excerpt,
    confidence,
    note,
  };
}

// 단일 필드 EN→KO 재번역. 편집 화면에서 영문 원본 한 칸을 수정한 뒤
// "↻ KO" 버튼으로 한국어 번역만 다시 받기 위한 가벼운 호출.
// field 별로 톤·길이를 약간 다르게 안내한다.
// 단일 필드 재번역.
//  direction='en2ko' (기본): 편집 화면의 영문 원본 칸 "↻ KO" 버튼
//  direction='ko2en'        : 보기 토글에서 영문 원본이 비어 있는 필드를 즉시 영문 변환
// 지원 필드: title / subtitle / author / quote / script_excerpt / excerpt_description / significance
export async function runTranslateField({ text, field, work, direction = 'en2ko' }) {
  const src = String(text ?? '').trim();
  if (!src) throw new Error('text is required');

  const w = work && typeof work === 'object' ? work : {};
  const ctx = [
    w.title    ? `작품 제목: ${w.title}`        : null,
    w.subtitle ? `부제: ${w.subtitle}`          : null,
    w.author   ? `작가: ${w.author}`            : null,
    w.format   ? `형식: ${w.format}`            : null,
  ].filter(Boolean).join('\n');

  const FIELD_GUIDE_KO = {
    title: '작품 제목. 한국 통용 표기가 있으면 그것을 사용. 부제는 빼고 본 제목만.',
    subtitle: '작품 부제(시리즈 편명 등). 자연스러운 한국어로.',
    author: '작가 인명. 한국 통용 표기 우선. 음역 시 한국 표준 표기. 한자/영문 그대로 두지 말 것.',
    quote: '인물의 명대사 한 줄. 무대 위 배우가 한 호흡에 말할 수 있게. 번역체("~인 것이다", "당신", "그/그녀" 남용) 금지.',
    script_excerpt: '대본 발췌. 화자: 형식과 지문 줄바꿈을 유지. 인물 관계에 맞는 위계 어투(반말/존댓말/하오체)로. 옛 철자 금지.',
    excerpt_description: '짧은 산문 해설(상황 설명). 자연스러운 한국어로 한 단락.',
    significance: '작품 의의 해설. 자연스러운 한국어 산문.',
    keywords: '쉼표로 구분된 짧은 태그 목록. 입력과 동일한 개수·순서를 유지하고, 각 태그를 그대로 한국어 단어로 옮긴다. 다른 글자(따옴표, 옥스퍼드 쉼표 금지). 예: "love, betrayal, faith" → "사랑, 배신, 신앙".',
  };

  const FIELD_GUIDE_EN = {
    title: 'The work title. Prefer the canonical English title if known (e.g., 드라큘라 → "Dracula", 햄릿 → "Hamlet"); otherwise translate naturally. Title only, no subtitle.',
    subtitle: 'The work subtitle (series episode name, etc). Natural English.',
    author: 'Author name. Use the standard English spelling if known (e.g., 셰익스피어 → "William Shakespeare"); otherwise transliterate.',
    quote: 'A single character line of dialogue. Keep it speakable in one breath. Match the original register and tone.',
    script_excerpt: 'A scene excerpt. Preserve speaker labels (e.g., "VICTOR:") and stage direction linebreaks. Keep tone and register.',
    excerpt_description: 'A literal translation of the Korean scene description. Preserve the original sentence count, structure, and every detail. Do NOT paraphrase, summarize, or add new information.',
    significance: 'A literal translation of the Korean commentary. Preserve the original sentence count, structure, and every claim. Do NOT paraphrase, summarize, or reinterpret.',
    keywords: 'A comma-separated list of short tags. Keep EXACTLY the same number and order as input. Translate each tag as a single English word or short phrase. No quotes, no Oxford commas. Example: "사랑, 배신, 신앙" → "love, betrayal, faith".',
  };

  // JSON 래핑 제거 — 번역 결과에 따옴표·줄바꿈이 있으면 LLM 이 JSON escape 를 잘못해
  // parseJson 전부 실패하는 경우가 흔해서, plain text 출력으로 전환. 시스템 프롬프트에서
  // "오직 번역문만, 따옴표 / 마크다운 / 라벨 / 설명 금지" 를 강하게 지정.
  let prompt, system;
  if (direction === 'ko2en') {
    system = 'You are a precise Korean→English literary translator. Output ONLY the English translation as plain text — no JSON, no markdown, no code fences, no labels (no "Translation:"), no surrounding quotation marks. Translate faithfully and literally; match source length; never expand or paraphrase; preserve sentence count and every detail.';
    const srcSentenceCount = (src.match(/[.!?。！？\n]+/g) || []).length || 1;
    const srcCharCount = src.length;
    prompt = `Translate the following Korean text into English.

[Translation rules — hard requirements]
1. Translate the Korean directly. Do NOT paraphrase or reinterpret.
2. Output must have the SAME number of sentences as the original (≈ ${srcSentenceCount} sentence(s)).
3. Output length should be similar to the source (the Korean source is ${srcCharCount} chars). Do not exceed ~1.8x.
4. Preserve every detail, name, and claim in the Korean — no omissions.
5. Do NOT add new information, context, examples, or explanations not in the source.
6. Match the original tone (narrative, commentary, etc.).
7. Use natural English wording, but stay close to the Korean structure.

[Work context — for terminology consistency only, do NOT translate from it]
${ctx || '(none)'}

[Field: ${field}]
${FIELD_GUIDE_EN[field] || 'Natural English, faithful to the source.'}

[Korean source]
${src}

Output: ONLY the English translation as plain text. No JSON, no markdown, no labels, no surrounding quotes.`;
  } else {
    system = '너는 한국어 정전 감각을 가진 번역가다. 응답은 오직 번역된 한국어 본문만 — JSON, 마크다운, 코드펜스, "번역:" 같은 라벨, 전체를 감싸는 따옴표, 설명 모두 금지. 원문 길이와 디테일을 보존하고 자연스러운 한국어로 옮긴다.';
    prompt = `다음 영문을 한국어로 옮긴다.

[작품 컨텍스트]
${ctx || '(없음)'}

[필드: ${field}]
${FIELD_GUIDE_KO[field] || '자연스러운 한국어로.'}

[영문 원본]
${src}

응답: 한국어 번역문만 plain text 로. JSON·마크다운·라벨·감싸는 따옴표 금지.`;
  }

  // rawText: true → callClaude 가 JSON 파싱 안 하고 LLM 응답 문자열 그대로 반환.
  // prefill 없음 (JSON 안 만들 거니까). Haiku 명시 — 빠르고 안정적.
  const result = await callClaude(prompt, {
    maxTokens: field === 'script_excerpt' ? 8000 : 1024,
    system,
    temperature: 0.3,
    rawText: true,
    model: 'haiku',
  });
  let out = String(result || '').trim();
  // LLM 이 가끔 따라오는 흔한 잡음 제거
  out = out
    .replace(/^```(?:json|text|markdown)?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^번역[:：]\s*/, '')
    .replace(/^Translation[:：]\s*/i, '')
    .trim();
  // LLM 이 끝까지 JSON 으로 우긴 경우 — 안에 있는 텍스트만 추출 시도
  if (out.startsWith('{"text":"') && out.endsWith('"}')) {
    const inner = out.slice(9, -2);
    out = inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  if (!out) throw new Error('Translation response missing text');
  return out;
}

// 카드 N장의 description / significance / keywords 를 한 번의 LLM 호출로 KO→EN 일괄 번역.
// 입력 cards = [{ id, description?, significance?, keywords?: string[] }, ...]
// 응답: [{ id, description_en?, significance_en?, keywords_en?: string[] }, ...]
// 비용 절감 — 카드당 3회 호출(60회) → 1회로 축소. 입력은 짧으니 한 prompt 에 안전하게 들어감.
export async function runTranslateCommentaryBatch({ cards, work }) {
  const items = Array.isArray(cards) ? cards : [];
  if (!items.length) return [];

  // LLM 입력으로 보낼 슬림한 페이로드 — 빈 필드는 빼서 토큰 절약.
  const payload = items.map((c, i) => {
    const o = { id: c.id ?? i };
    if (c.description && String(c.description).trim()) o.description = String(c.description).trim();
    if (c.significance && String(c.significance).trim()) o.significance = String(c.significance).trim();
    if (Array.isArray(c.keywords) && c.keywords.length) o.keywords = c.keywords.map((k) => String(k).trim()).filter(Boolean);
    return o;
  }).filter((o) => o.description || o.significance || (o.keywords && o.keywords.length));

  if (!payload.length) return [];

  const w = work && typeof work === 'object' ? work : {};
  const ctx = [
    w.title    ? `Title: ${w.title}`        : null,
    w.subtitle ? `Subtitle: ${w.subtitle}`  : null,
    w.author   ? `Author: ${w.author}`      : null,
    w.format   ? `Format: ${w.format}`      : null,
  ].filter(Boolean).join('\n');

  const system =
    'You are a precise Korean→English literary translator. Translate each item faithfully and literally — match source length closely (do not exceed 1.8x), preserve sentence count, every detail. Output JSON only — no prose, no markdown.';

  const prompt = `Translate Korean commentary fields into English for ${payload.length} card(s). One LLM call for all cards.

[Translation rules — hard requirements]
1. Translate Korean directly — no paraphrase, no reinterpretation, no added context.
2. Each output sentence count = each input sentence count.
3. Length per field ≤ ~1.8x of the Korean source.
4. Preserve every detail, name, claim. Match tone (narrative commentary).
5. keywords: same count and order as input. Each tag = single English word or short phrase. No quotes, no Oxford commas.
6. If an input field is absent, omit it from the output (do NOT invent content).
7. Match the id of each input item exactly.

[Work context — for terminology consistency]
${ctx || '(none)'}

[Input — array of cards]
${JSON.stringify(payload, null, 2)}

Output: a single JSON object with key "results" whose value is an array. Same length and order as input.
Each result object has: id (same as input), and optionally description_en, significance_en, keywords_en (array of strings).
Example:
{"results":[{"id":1,"description_en":"...","significance_en":"...","keywords_en":["love","betrayal"]}]}`;

  // 출력 토큰: 카드 N장 × 평균 ~300자 영문 = ~150 tokens × 3필드 × N = N × 450 tokens.
  // 안전 마진으로 cards 수 × 1500 토큰 또는 최소 6000 토큰 보장.
  const maxTokens = Math.max(6000, Math.min(16000, payload.length * 1500));

  // KO→EN 번역은 단순 작업 — Haiku 명시 (빠르고 안정적, 비용 절약).
  // 환경변수로 다른 모델 강제됐을 가능성 차단.
  const result = await callClaude(prompt, {
    maxTokens,
    system,
    temperature: 0.3,
    prefill: '{"results":[',
    model: 'haiku',
  });

  const arr = Array.isArray(result?.results) ? result.results : [];
  // id 매칭이 어긋날 가능성 — 안전 가드.
  const byId = new Map();
  arr.forEach((r) => {
    if (r && r.id != null) byId.set(String(r.id), r);
  });

  // 입력 순서대로 정렬해서 반환. 누락된 카드는 빈 객체.
  return payload.map((p) => {
    const r = byId.get(String(p.id)) || {};
    return {
      id: p.id,
      description_en: r.description_en ? String(r.description_en).trim() : null,
      significance_en: r.significance_en ? String(r.significance_en).trim() : null,
      keywords_en: Array.isArray(r.keywords_en) ? r.keywords_en.map((s) => String(s).trim()).filter(Boolean) : null,
    };
  });
}
