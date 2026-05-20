import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from './prompts.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_JSON_ONLY =
  'You must respond with a single JSON object only. ' +
  'No prose, no markdown fences, no explanations — JSON only.';

async function callClaude(prompt, { maxTokens = 8192 } = {}) {
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

export async function runExtract(scriptText) {
  const prompt = EXTRACT_PROMPT.replace('{{SCRIPT_TEXT}}', scriptText);
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
