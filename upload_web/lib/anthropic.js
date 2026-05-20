import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from './prompts.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

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
  const prompt = TRANSLATE_PROMPT.replace('{{CARD_JSON}}', JSON.stringify(card, null, 2));
  return callClaude(prompt, { maxTokens: 2048 });
}
