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
  { maxTokens = 8192, model = null, system = null, temperature = null, topP = null, prefill = null } = {}
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
    try {
      const payload = {
        model: useModel,
        max_tokens: maxTokens,
        system: system || SYSTEM_JSON_ONLY,
        messages,
      };
      if (temperature !== null) payload.temperature = temperature;
      if (topP !== null) payload.top_p = topP;
      const res = await getClient().messages.create(payload);
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      // prefill을 미리 박았으면 응답 앞에 다시 이어 붙여 완전한 JSON으로 만든다.
      // 단, 모델이 prefill을 무시하고 '{'부터 새로 출력한 경우엔 그대로 둠 (이중 헤더 방지).
      const combined =
        prefill && !text.trimStart().startsWith('{') ? prefill + text : text;
      return parseJson(combined);
    } catch (err) {
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

// cards 배열이 중간에 잘렸을 때 마지막 완성 카드까지만 살려서 복구.
function repairTruncatedCards(s) {
  const cardsIdx = s.indexOf('"cards"');
  if (cardsIdx === -1) return null;
  const arrStart = s.indexOf('[', cardsIdx);
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

  // 6) cards 배열을 마지막 완성 카드까지 잘라 복구 시도
  const truncRepaired =
    repairTruncatedCards(fixed2) ||
    repairTruncatedCards(fixed1) ||
    repairTruncatedCards(s);
  if (truncRepaired) {
    out = tryParse(escapeRawCtrlInStrings(truncRepaired), 'cards 잘림 복구');
    if (out) {
      out.__recovered = true;
      return out;
    }
  }

  console.error('[parseJson] 모든 복구 시도 실패. raw text 일부:', text.slice(0, 500));
  throw new Error('LLM did not return valid JSON (all repair attempts failed)');
}

const EXTRACT_CHUNK_TARGET_CHARS = 300000;
const EXTRACT_CHUNK_WINDOW_CHARS = 50000;
const EXTRACT_CHUNK_OVERLAP_CHARS = 3000;
const EXTRACT_FINAL_INPUT_CARDS = 80;
const EXTRACT_FINAL_OUTPUT_CARDS = 40;

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
  const prompt = tpl
    .replace('{{QUOTE_SEED_BLOCK}}', `${seedBlock || ''}${chunkNote}`)
    .replace('{{SCRIPT_TEXT}}', scriptText);
  return prompt;
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

export function splitScriptIntoChunks(
  scriptText,
  {
    targetChars = EXTRACT_CHUNK_TARGET_CHARS,
    windowChars = EXTRACT_CHUNK_WINDOW_CHARS,
    overlapChars = EXTRACT_CHUNK_OVERLAP_CHARS,
  } = {}
) {
  const text = String(scriptText || '');
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

async function runExtractSingle(scriptText, category, seedBlock, model, chunkInfo = null) {
  const prompt = buildExtractPrompt(scriptText, category, seedBlock, chunkInfo);
  return callClaude(prompt, { maxTokens: 16000, model });
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

async function finalizeChunkedExtract(merged, model) {
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

  const finalResult = await callClaude(prompt, { maxTokens: 16000, model });
  return {
    work: mergeWork(merged.work, finalResult?.work),
    cards: Array.isArray(finalResult?.cards) && finalResult.cards.length ? finalResult.cards : merged.cards,
  };
}

export async function runExtract(scriptText, category = 'screen', seedBlock = '', model = null) {
  const chunks = splitScriptIntoChunks(scriptText);
  if (chunks.length === 1) {
    return runExtractSingle(scriptText, category, seedBlock, model);
  }

  console.log(
    `[anthropic] chunked extract chars=${String(scriptText || '').length} ` +
    `chunks=${chunks.length} target=${EXTRACT_CHUNK_TARGET_CHARS} overlap=${EXTRACT_CHUNK_OVERLAP_CHARS}`
  );

  const results = [];
  for (const chunk of chunks) {
    console.log(`[anthropic] extracting chunk ${chunk.index}/${chunk.total} chars=${chunk.text.length}`);
    results.push(await runExtractSingle(chunk.text, category, seedBlock, model, {
      index: chunk.index,
      total: chunk.total,
      overlapChars: EXTRACT_CHUNK_OVERLAP_CHARS,
    }));
  }

  const merged = mergeExtractResults(results);
  let finalResult = merged;
  let finalizeFailed = false;
  try {
    finalResult = await finalizeChunkedExtract(merged, model);
  } catch (err) {
    finalizeFailed = true;
    console.warn('[anthropic] chunk finalization failed, returning deterministic merge:', err?.message || err);
  }

  return {
    ...finalResult,
    __chunked: {
      chunks: chunks.length,
      target_chars: EXTRACT_CHUNK_TARGET_CHARS,
      window_chars: EXTRACT_CHUNK_WINDOW_CHARS,
      overlap_chars: EXTRACT_CHUNK_OVERLAP_CHARS,
      finalize_failed: finalizeFailed || undefined,
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
  const result = await callClaude(prompt, {
    maxTokens: 16000,
    system: TRANSLATE_SYSTEM,
    temperature: 0.3,
    topP: 0.9,
    prefill: '{"quote":"',
  });

  if (!result || typeof result.quote !== 'string') {
    throw new Error('Translation response missing quote');
  }
  return {
    quote_translated: result.quote,
    script_excerpt_translated: result.script_excerpt,
  };
}
