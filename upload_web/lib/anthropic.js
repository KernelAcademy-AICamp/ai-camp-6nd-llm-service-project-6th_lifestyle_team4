import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_PROMPTS, TRANSLATE_PROMPT, CHARACTERS_PROMPT } from './prompts.js';

// SDK 기본 재시도(2회)에 더해 우리도 직접 백오프 재시도를 한 번 더 감쌉니다.
// 529(overloaded) / 429(rate limit) / 5xx 는 일시적인 경우가 많아 재시도가 효과적.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,
});
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_JSON_ONLY =
  'You must respond with a single JSON object only. ' +
  'No prose, no markdown fences, no explanations — JSON only.';

function isRetryable(err) {
  const s = err?.status;
  return s === 408 || s === 409 || s === 429 || s === 529 || (s >= 500 && s < 600);
}

async function callClaude(prompt, { maxTokens = 8192 } = {}) {
  // SDK가 이미 maxRetries=4로 재시도하므로, 외부 wrapper는 1회 추가 시도까지만 (총 ≤2회).
  // 외부 재시도 횟수가 많으면 Vercel 함수 timeout(300s)을 잡아먹어 전체 실패.
  const MAX_OUTER_ATTEMPTS = 2;
  let lastErr;
  for (let attempt = 0; attempt < MAX_OUTER_ATTEMPTS; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: SYSTEM_JSON_ONLY,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parseJson(text);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_OUTER_ATTEMPTS - 1) break;
      // 3s 백오프 + jitter (SDK가 이미 자체 백오프 했음)
      const delayMs = 3000 + Math.floor(Math.random() * 500);
      console.warn(`[anthropic] retryable ${err.status} on attempt ${attempt + 1}; waiting ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
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

export async function runExtract(scriptText, category = 'screen') {
  const tpl = EXTRACT_PROMPTS[category] || EXTRACT_PROMPTS.screen;
  const prompt = tpl.replace('{{SCRIPT_TEXT}}', scriptText);
  return callClaude(prompt, { maxTokens: 16000 });
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

export async function runTranslate(card) {
  // TRANSLATE_PROMPT는 {work, cards:[...]} 봉투를 기대합니다.
  // 단일 카드 번역 요청을 그 형식에 맞춰 감싸고, 응답의 cards[0]에서 번역된 quote/script_excerpt를 꺼냅니다.
  const envelope = {
    work: {
      title: 'unknown',
      format: 'movie',
      author: null,
      release_year: null,
      genres: [],
    },
    cards: [
      {
        quote: card.quote ?? '',
        script_excerpt: card.script_excerpt ?? '',
        excerpt_description: card.excerpt_description ?? '',
        keywords: Array.isArray(card.keywords) ? card.keywords : [],
        temperature: card.temperature ?? 3,
        intensity: card.intensity ?? 3,
      },
    ],
  };

  const prompt = TRANSLATE_PROMPT.replace('{{INPUT_JSON}}', JSON.stringify(envelope, null, 2));
  const result = await callClaude(prompt, { maxTokens: 4096 });

  const translated = result?.cards?.[0];
  if (!translated || typeof translated.quote !== 'string') {
    throw new Error('Translation response missing cards[0]');
  }
  return {
    quote_translated: translated.quote,
    script_excerpt_translated: translated.script_excerpt,
  };
}
