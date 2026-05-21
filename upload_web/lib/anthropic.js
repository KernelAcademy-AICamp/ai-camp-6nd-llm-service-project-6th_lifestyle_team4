import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_PROMPTS, TRANSLATE_PROMPT } from './prompts.js';

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

function parseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fenced or padded with prose — strip a leading ```json ... ``` fence first
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {}
    }
    // Last resort: grab the first {...} block
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error('LLM did not return valid JSON');
  }
}

export async function runExtract(scriptText, category = 'screen') {
  const tpl = EXTRACT_PROMPTS[category] || EXTRACT_PROMPTS.screen;
  const prompt = tpl.replace('{{SCRIPT_TEXT}}', scriptText);
  return callClaude(prompt, { maxTokens: 16000 });
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
