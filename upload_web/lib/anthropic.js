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
  // SDK가 이미 maxRetries=4로 재시도하므로, 외부 wrapper 는 더 시도하지 않는다.
  // 외부 재시도는 사실상 토큰만 두 번 쓰고 동일 실패를 반복하는 경우가 다수였음.
  // SDK 가 처리 못 한 에러(파싱 실패, 4xx 등)는 retry 해도 결과 같음.
  const useModel = resolveModel(model);
  console.log(`[anthropic] call model=${useModel} max_tokens=${maxTokens}`);
  const MAX_OUTER_ATTEMPTS = 1;
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
// 입력 스크립트의 주요 언어 판정 — 한·영 글자 비율 기준.
// 추출 시 source 언어 결정 → preamble 에 강한 LANGUAGE OVERRIDE 주입.
function detectScriptLanguage(scriptText) {
  const sample = String(scriptText || '').slice(0, 5000);
  const koreanChars = (sample.match(/[가-힯]/g) || []).length;
  const latinChars  = (sample.match(/[a-zA-Z]/g) || []).length;
  return koreanChars > latinChars * 0.3 ? 'ko' : 'en';
}

function buildCriticalRulesPreamble(category, sourceLang = 'ko') {
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

  // === LANGUAGE OVERRIDE — EN source 케이스에 압도적으로 강한 영문 출력 강제 ===
  // 본문 EXTRACT_PROMPTS 에는 "한국어로" 가 수십 번 반복되어 짧은 안내로는 묻힘.
  // 따라서 EN source 일 때만 ABSOLUTE PRIORITY 헤더 + 구체 ❌/✅ 예시 + 반복 강조로
  // 본문의 한국어 지시를 무력화한다.
  const languageOverride = sourceLang === 'en' ? `

[★★★★★ ABSOLUTE PRIORITY: ENGLISH OUTPUT REQUIRED ★★★★★]

THIS IS AN ENGLISH SOURCE TEXT. EVERY OUTPUT FIELD MUST BE IN ENGLISH.

The Korean template instructions below ("한국어로 작성", "자연스러운 한국어",
"한국어 명사", "한국어 산문" 등) are TEMPLATE DEFAULTS for Korean sources.
For this English source, **THOSE INSTRUCTIONS ARE OVERRIDDEN.** OUTPUT EVERY
FIELD IN ENGLISH.

[Required language per field — STRICT]
- work.title          → English (verbatim from source, e.g., "Adventures of Huckleberry Finn")
- work.subtitle       → English (from source) or null
- work.author         → English (verbatim from source, e.g., "Mark Twain")
                        ★★ DO NOT KOREANIZE. 본문 템플릿의 "영문 작가는 반드시 통용되는
                        한국어 표기로 변환" 지시는 한국어 source 전용이며, 이 영어 source 에선
                        OVERRIDDEN. author 를 "마크 트웨인" / "찰스 디킨스" 같은 한국어
                        음역으로 변환 절대 금지. 원문 그대로 영문 표기 유지.
- work.release_year   → integer (language-neutral)
- work.genres         → ★ EXCEPTION: 한국어 유지. 본문에 명시된 고정 13개 한국어 값
                        (로맨스, 코미디, 스릴러/서스펜스, 드라마, 비극, 미스터리,
                         판타지, 역사극/시대극, 가족극, 액션, 호러, 느와르, SF) 중
                        1~3개 그대로 선택. 영문 번역 금지.
- work.format         → ★ EXCEPTION: 카테고리 고정값 유지 (예: "novel"). 변경 금지.
- work.characters     → English names (e.g., ["Huck Finn", "Tom Sawyer"])
- card.quote          → English (verbatim from source)
- card.script_excerpt → English (verbatim from source, preserve line breaks)
- card.excerpt_description  → English narrative paragraph (~100-300 chars)
- card.significance         → English commentary (~80-200 chars, single distilled claim)
- card.keywords             → 3 English noun/noun-phrase tags

[❌ FORBIDDEN vs ✅ REQUIRED — concrete examples]

excerpt_description:
  ❌ "허크가 학교에 다니며 문명에 적응하는 장면이다."   ← Korean (FORBIDDEN)
  ✅ "Huck shows his discomfort with arithmetic, revealing his uneasy
     relationship with the civilizing world of formal education."

significance:
  ❌ "허크가 문명에 저항하는 개성을 드러낸다."         ← Korean (FORBIDDEN)
  ✅ "Huck selectively absorbs civilization's demands while resisting
     what conflicts with his own nature."

keywords:
  ❌ ["교육과 저항", "개인의 한계", "순응과 반발"]      ← Korean (FORBIDDEN)
  ✅ ["education", "resistance", "individuality"]

genres (★ 예외 — 한국어 유지):
  ❌ ["Drama", "Adventure"]                            ← English (FORBIDDEN, 고정 13개 값 아님)
  ✅ ["드라마", "비극", "가족극"]                       ← 본문 13개 중 1~3개 선택

title / author:
  ❌ "허클베리 핀의 모험" / "마크 트웨인"              ← Korean (FORBIDDEN)
  ✅ "Adventures of Huckleberry Finn" / "Mark Twain"

[Self-check before output]
For every text field, ask: "Is this in English?" If a field contains any
Korean characters (가-힯), REWRITE IT IN ENGLISH before outputting.

REPEAT: English source → English output for ALL fields. No Korean.

[★★★★★ END LANGUAGE OVERRIDE ★★★★★]
` : '';

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
   (e) ★ quote 와 script_excerpt 는 **완전한 문장만** 포함 — 잘린 단어, 끝나지 않은 문장,
       PDF 추출 아티팩트(페이지 끝에 잘린 텍스트)는 제외하거나 다듬는다.
5. ★ COMPLETE SENTENCES ONLY (완전한 문장 추출) ★
   PDF 텍스트는 페이지 경계·줄바꿈에서 단어/문장이 잘리는 경우가 흔하다. 다음 케이스는 카드로 만들지 않는다:
   ❌ quote 끝이 마침표·물음표·느낌표·따옴표 없이 문장 중간에서 끊긴 경우
      예: "I was so glad to see her, but I was scared, t-"   ← 잘린 단어
      예: "He looked at me and said, then he"               ← 미완 문장
   ❌ quote 시작이 소문자/접속사 등으로 문장 중간부터 시작하는 경우
      예: "and he went away forever"                        ← 시작 잘림 (앞에 잃은 문장 있음)
   ❌ script_excerpt 가 단어/문장 중간에서 시작하거나 끝나는 경우
   ✅ quote: 첫 글자가 대문자(영문) 또는 문장 시작 표시, 끝이 .!?"' 등으로 마무리.
   ✅ script_excerpt: 첫·마지막 문장 모두 완전 (시작은 문장 처음, 끝은 마침표/따옴표).

   완전성 검사 방법:
   - quote/script 의 마지막 글자가 .  ?  !  "  '  ”  ’  …  중 하나로 끝나야 한다 (대화 종결).
   - 마지막 단어가 하이픈(-)으로 끝나면 잘린 것 → 제외.
   - 첫 단어가 명백한 문장 시작(대문자 시작어, "I", 대문자 이름, 따옴표 시작)인지 확인.
   - 의심되면 앞뒤로 더 가져와서 완전한 문장으로 다듬거나, 그 카드는 출력에서 제외.
${languageOverride}
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
  // ★ source 언어 자동 감지 → preamble 에 EN OVERRIDE 주입 결정.
  const sourceLang = detectScriptLanguage(scriptText);
  const critical = buildCriticalRulesPreamble(category, sourceLang);
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
  // 추출 1청크 출력: 카드 5~10장 × 카드당 ~3000자 ≈ 8K~15K 토큰. 마진 포함 12000.
  // prefill='{' — LLM 응답을 무조건 JSON 객체로 시작하게 강제. 프롬프트 길어도
  // 설명·머리말·코드펜스 못 붙임 → "did not return valid JSON" 에러 방지.
  return callClaude(prompt, { maxTokens: 12000, model, signal, onProgress, prefill: '{' });
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

  // finalize 출력: 최대 40 카드 × script_excerpt 가 큼 — 7000 토큰으로 마진.
  // prefill='{' — JSON 시작 강제 (extract single 과 동일).
  const finalResult = await callClaude(prompt, { maxTokens: 7000, model, signal, onProgress, prefill: '{' });
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
    if (!card?.quote) return card;
    const q = _norm(card.quote);
    const s = _norm(card.script_excerpt || '');
    const isEmpty = !String(card.script_excerpt || '').trim();
    const isIdentical = q && s && (q === s || q.length / s.length >= QUOTE_RATIO_TOO_HIGH);
    const isShort = String(card.script_excerpt || '').length < minChars;
    if (!isEmpty && !isIdentical && !isShort) return card;

    const quoteStr = String(card.quote).trim();
    if (!quoteStr) return card;

    const match = findQuoteInSource(quoteStr, fullScript, collapsedSource);

    if (!match) {
      // 못 찾았어도 카드를 살린다. 본문에서 카드 인덱스 기준 위치의 청크를 떼어
      // quote 뒤에 붙여 script_excerpt 로 사용 → 검증 통과 + 어드민이 검토에서 편집 가능.
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
      // 빈/짧은 본문 카드는 무조건 채움 — 길이 조건 제거.
      // 길이 미달이어도 빈 채로 표시되는 것보다 가능한 본문 채워두고 검토에서 편집.
      if (fallback.trim().length > quoteStr.length) {
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
    // fullScript 전달 — 잘린 첫/끝 줄을 원본에서 복원.
    const validated = validateAndFilterCards(rescued.cards, category, { fullScript: scriptText });
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
  onProgress?.({ t: 'stage', m: `본문이 길어 ${chunks.length}개 청크로 분할 — 동시 6개씩 분석` });

  // 청크 병렬 처리 — Vercel 300s 한도 안에 끝내려면 동시 처리량 ↑.
  // 6 동시 처리: 20 청크면 4 라운드 × 30~60초 = 120~240초 (300s 안).
  // Anthropic Haiku Tier 1 (50 RPM) / Tier 2+ (1000 RPM) 모두 안전.
  const CHUNK_CONCURRENCY = 6;
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
  // fullScript 전달 — 잘린 첫/끝 줄을 원본에서 복원.
  const validated = validateAndFilterCards(rescued.cards, category, { fullScript: scriptText });
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

// quote 가 완전한 문장인지 검사 — PDF 추출 시 잘린 단어/문장 차단.
function isIncompleteQuote(quote) {
  if (!quote) return false;
  const q = String(quote).trim();
  if (q.length < 10) return false; // 너무 짧으면 평가 불가
  // 끝이 하이픈 → 단어 잘림 ("scared, t-")
  if (/-\s*$/.test(q)) return true;
  // 끝이 문장 종결자 아님 (.  !  ?  "  '  ”  ’  …  。  ！  ？)
  // 한국어 / 영어 모두 적용
  if (!/[.!?"'”’…。！？\)]\s*$/.test(q)) return true;
  // 영문 시작이 소문자 또는 접속사 → 문장 중간부터 시작 (cut off at beginning)
  // 한국어는 판별 어렵고 따옴표/대문자 없는 경우 많아 영문 한정
  if (/^[a-z]/.test(q) && !/^[가-힯]/.test(q)) return true;
  if (/^(and|but|or|so|nor|for|yet)\s+/i.test(q)) return true;
  return false;
}

// script_excerpt 의 첫/끝 잘린 문장을 원본 본문(fullScript) 에서 직접 가져와 복원.
// 사용자 요구: "잘린 문장의 본문을 가져와" — LLM 보강 X, 원본에서 직접 채움.
//   첫 줄 잘림: 잘린 줄의 식별 가능한 토큰을 fullScript 에서 찾아 그 앞 문장 시작점부터 prepend
//   끝 줄 잘림: 끝 줄 토큰으로 fullScript 위치 찾아 그 다음 종결자까지 append
//   복원 실패 시 — cleanScriptExcerptEdges 가 자투리 그냥 제거 (사용자 요구 대안).
function rescueScriptExcerptEdges(card, fullScript) {
  if (!card?.script_excerpt || !fullScript) return;
  const lines = card.script_excerpt.split('\n');
  if (lines.length < 1) return;

  // ── 첫 줄 검사 ──
  // 잘림 판정: 영문 소문자 1~3자 fragment 로 시작 + 일반 단어 아님
  const FIRST_FRAGMENT_RE = /^([a-z]{1,3})\b/;
  const COMMON = new Set(['a','an','i','is','it','in','on','of','to','or','no','so','we','me','my','be','by','at','as','if','do','go','up','us','he','am','oh','ah','ha','the','and','but','for','you','her','him','our','out','all','was','had','has','can','not','too','now','one','two','who','why','how','any','its']);
  for (let pass = 0; pass < 3; pass++) {
    const first = (lines[0] || '').trim();
    if (!first) { lines.shift(); continue; }
    // 라벨/한글 라인은 건드리지 않음
    if (/^\*+|:$|^\(.*\)$|^[A-Z][A-Z .'\-]*$/.test(first) || /[가-힯]/.test(first)) break;
    const m = first.match(FIRST_FRAGMENT_RE);
    if (!m || COMMON.has(m[1].toLowerCase())) break;
    // 잘림 확정 — fullScript 에서 이 줄의 의미 토큰으로 위치 찾기
    const probe = first.split(/\s+/).slice(1, 6).join(' '); // fragment 제외 다음 5단어
    if (probe.length < 8) { lines.shift(); continue; }      // 너무 짧으면 매칭 어려움
    const pos = fullScript.indexOf(probe);
    if (pos < 0) { lines.shift(); continue; }
    // 그 위치 앞쪽에서 마지막 문장 종결자(. ! ? \n) 찾기
    const window = fullScript.slice(Math.max(0, pos - 500), pos);
    const lastEnd = Math.max(
      window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '),
      window.lastIndexOf('."'), window.lastIndexOf('!"'), window.lastIndexOf('?"'),
      window.lastIndexOf('\n')
    );
    if (lastEnd < 0) { lines.shift(); continue; }
    const sentenceStart = Math.max(0, pos - 500) + lastEnd + 1;
    const prepend = fullScript.slice(sentenceStart, pos).replace(/^\s+/, '');
    // fragment 부분 잘라내고 원본 prepend
    const rest = first.replace(FIRST_FRAGMENT_RE, '').replace(/^\W+/, '');
    lines[0] = (prepend + rest).trim();
    break;
  }

  // ── 끝 줄 검사 ──
  // 잘림 판정: 종결자 없이 끝, 또는 단어 중간 (영문자-하이픈/언더스코어)
  for (let pass = 0; pass < 3; pass++) {
    const last = (lines[lines.length - 1] || '').trim();
    if (!last) { lines.pop(); continue; }
    if (/^\*+|:$|^\(.*\)$|^[A-Z][A-Z .'\-]*$/.test(last) || /[가-힯]/.test(last)) break;
    const endsClean = /[.!?"'”’…。！？\)\）\]\】]\s*$/.test(last);
    const endsHyphen = /[a-zA-Z][-_]\s*$/.test(last);
    if (endsClean) break;
    // 끝 줄의 의미 토큰으로 fullScript 위치 찾기
    const probe = endsHyphen
      ? last.replace(/[-_]\s*$/, '').split(/\s+/).slice(-5).join(' ')
      : last.split(/\s+/).slice(-5).join(' ');
    if (probe.length < 8) { lines.pop(); continue; }
    const pos = fullScript.indexOf(probe);
    if (pos < 0) { lines.pop(); continue; }
    // 그 다음 종결자까지 append
    const tail = fullScript.slice(pos + probe.length, pos + probe.length + 500);
    const m = tail.match(/^[^.!?…]*?[.!?…][")']?/);
    if (!m) { lines.pop(); continue; }
    const append = m[0];
    if (endsHyphen) {
      lines[lines.length - 1] = last.replace(/[-_]\s*$/, '') + append;
    } else {
      lines[lines.length - 1] = last + append;
    }
    break;
  }

  card.script_excerpt = lines.join('\n').replace(/^\n+|\n+$/g, '');
}

// PDF 페이지 폭에 의해 강제로 들어간 줄바꿈 정리.
// 사용자 요구: "한 문장 한 단락인데 폭 충분한데 단어가 아래줄로 내려갔다".
// 한 단락 안에서 알파벳/한글/콤마/숫자 다음 \n + 다음 줄 시작이 본문 문자면 → 공백.
// 단락 구분 \n\n, 화자 라벨 라인, 종결자(. ! ? …) 다음 \n 은 보존.
function collapsePdfLineWraps(script) {
  if (!script) return script;
  let s = String(script);
  // 1) \r\n → \n 정규화
  s = s.replace(/\r\n?/g, '\n');
  // 2) 라인별로 처리 — 종결자(. ! ? …) 로 끝나지 않은 줄 다음 줄과 합치기.
  //    단, 빈 줄 (단락 구분), 라벨 라인, 한글 라벨, 콜론 끝 라인 등은 보존.
  const lines = s.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    out.push(line);
    if (!trimmed) continue;                            // 빈 줄 (단락 구분) 보존
    if (i === lines.length - 1) continue;              // 마지막 줄
    const next = lines[i + 1];
    const nextTrim = next.trim();
    if (!nextTrim) continue;                           // 다음 빈 줄이면 단락 끝
    // 현재 줄이 라벨/지문 라인이면 다음 줄과 합치지 말 것
    const isLabel = /^\*+/.test(trimmed) || /:$/.test(trimmed)
      || /^\(.*\)$/.test(trimmed) || /^[A-Z][A-Z .'\-]*$/.test(trimmed);
    if (isLabel) continue;
    // 종결자(. ! ? … " '" 닫힘) 로 끝남 → 자연스러운 줄바꿈, 보존
    if (/[.!?…"'”’]\s*$/.test(trimmed)) continue;
    // 다음 줄이 라벨 라인으로 시작 → 보존
    const nextIsLabel = /^\*+/.test(nextTrim) || /:$/.test(nextTrim)
      || /^\(.*\)$/.test(nextTrim) || /^[A-Z][A-Z .'\-]*$/.test(nextTrim);
    if (nextIsLabel) continue;
    // 부자연스러운 줄바꿈 — 합치기. 현재 줄 끝에 공백 + 다음 줄 prepend, 다음 줄 skip.
    out.pop();
    lines[i + 1] = trimmed + ' ' + nextTrim;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 자투리 단순 제거 (fullScript 가 없는 케이스/복원 실패 시 fallback).
function cleanScriptExcerptEdges(script) {
  if (!script) return script;
  const COMMON_SHORT_EN = new Set([
    'a','an','i','is','it','in','on','of','to','or','no','so','we','me','my',
    'be','by','at','as','if','do','go','up','us','he','am','oh','ah','ha',
    'the','and','but','for','you','her','him','our','out','all','was','had',
    'has','can','not','too','now','one','two','who','why','how','any','its',
    'when','that','this','with','from','have','will','they','what','were',
    'them','then','more','said','only','some','than','also','very','just',
    'over','your','here','into','time','make','like','many','well','also',
    'know','take','come','want','look','give','find','need','feel','keep',
  ]);
  // 일반 5자 영어 단어 — fragment 오인 방지. 실제 잘린 5자 fragment ("hened" 등) 만 처리.
  const COMMON_5LETTER = new Set([
    'about','after','again','being','could','every','first','great','house',
    'might','never','other','place','right','small','still','their','there',
    'these','thing','think','those','three','under','where','which','while',
    'world','would','young','heart','found','hello','world','asked','heard',
    'death','began','came','went','look','seen','came','says','told','sees',
    'know','life','side','part','says','must','need','give','came','went',
    'made','said','rose','came','went','show','knew','done','seen','goes',
    'next','last','left','feet','head','hand','door','room','road','same',
  ]);
  const isLabelLine = (line) => {
    if (line.length > 30) return false;
    return /^\*+/.test(line)                    // ** 시작
      || /:$/.test(line)                         // 콜론으로 끝
      || /^\(.*\)$/.test(line)                   // 괄호 지문
      || /^[A-Z][A-Z .'\-]*$/.test(line);        // ALL CAPS 라벨
  };
  const lines = script.split('\n');

  // 단락별 시작 자투리 처리 — 첫 줄뿐 아니라 \n\n 뒤 모든 단락 시작에 적용.
  //  · "t the wound burning..." 같이 중간 단락 시작이 잘린 케이스도 처리.
  const cleanParaStart = (paraText) => {
    if (!paraText) return paraText;
    const paraLines = paraText.split('\n');
    const first = (paraLines[0] || '').trim();
    if (!first || isLabelLine(first) || /[가-힯]/.test(first)) return paraText;
    const firstChar = first[0] || '';
    const isProperStart = /^["'"'¡¿(\[【「『*]?[A-Z]/.test(first);
    if (isProperStart) return paraText;
    if (!/^[a-z,;:.!?]/.test(firstChar)) return paraText;
    // 자투리 확정
    const sentenceEnd = first.match(/[.!?…]["'”’]?\s+/);
    if (sentenceEnd) {
      const cutPos = sentenceEnd.index + sentenceEnd[0].length;
      paraLines[0] = first.slice(cutPos);
      return paraLines.join('\n');
    }
    // 종결자 없음 — 단락 전체 합쳐서 다시 종결자 찾기
    if (paraLines.length > 1) {
      const combined = paraLines.map((l) => l.trim()).filter(Boolean).join(' ');
      const m = combined.match(/[.!?…]["'”’]?\s+/);
      if (m) {
        const cutPos = m.index + m[0].length;
        return combined.slice(cutPos);
      }
    }
    // 그래도 종결자 없음 — fragment 만 제거
    const firstToken = (first.split(/\s+/)[0] || '').replace(/^[^\w]+/, '');
    if (
      /^[a-z]{1,5}$/.test(firstToken)
      && !COMMON_SHORT_EN.has(firstToken.toLowerCase())
      && !COMMON_5LETTER.has(firstToken.toLowerCase())
    ) {
      paraLines[0] = first.replace(/^\W*\w{1,5}\W+/, '');
    } else if (/^[,;:.!?]/.test(firstChar)) {
      paraLines[0] = first.replace(/^[,;:.!?]\s*/, '');
    }
    return paraLines.join('\n');
  };

  // 단락 분리 → 각 단락 시작 정리 → 다시 합치기
  const fullText = lines.join('\n');
  const paragraphs = fullText.split(/\n\s*\n/);
  const cleaned = paragraphs.map(cleanParaStart).filter((p) => p && p.trim());
  const newText = cleaned.join('\n\n');
  lines.length = 0;
  newText.split('\n').forEach((l) => lines.push(l));

  // 끝 줄 잘린 자투리 처리 — 마지막 종결자까지만 남김.
  //  · 종결자(. ! ? …) 없이 끝나거나 콤마로 끝나는 영문 라인 → 마지막 종결자까지
  //  · 영문 + 하이픈/언더스코어 잘림 → 마지막 종결자까지
  //  · 한글로 끝나는 라인은 그대로 (한국어는 종결자 없는 라인 많음)
  if (lines.length >= 1) {
    const lastIdx = lines.length - 1;
    const last = (lines[lastIdx] || '').trim();
    if (last && !isLabelLine(last) && !/[가-힯]\s*$/.test(last)) {
      const endsClean = /[.!?"'”’…。！？\)\）\]\】]\s*$/.test(last);
      // 콤마/세미콜론으로 끝 → 잘린 형태
      const endsWithComma = /[,;]\s*$/.test(last);
      const hyphenCut = /[a-zA-Z][-_]\s*$/.test(last);
      if (!endsClean || hyphenCut || endsWithComma) {
        // 마지막 종결자 위치 찾기
        const sentenceMatches = [...last.matchAll(/[.!?…]["'”’]?(?=\s|$)/g)];
        if (sentenceMatches.length > 0) {
          const m = sentenceMatches[sentenceMatches.length - 1];
          const cutEnd = m.index + m[0].length;
          lines[lastIdx] = last.slice(0, cutEnd);
        }
        // 종결자 못 찾으면 라인 그대로 (카드 보존 우선)
      }
    }
  }

  return lines.join('\n').replace(/^\n+|\n+$/g, '');
}

// script_excerpt 잘림 검출 — 매우 보수적 (false positive 방지):
//   "단어 중간이 명백히 잘린 경우만" drop. 그 외 (종결자 없음 등) 는 사용자가
//   편집/rescue 로 보강 가능하므로 자동 drop 하지 않음.
// 사용자 요구: "잘리는 문장만 빼야지 다 빼면 안되지"
function isIncompleteScript(script) {
  if (!script) return false;
  const s = String(script).trim();
  if (s.length < 50) return false;
  // 끝이 영문자 + 하이픈 → 단어 중간 잘림 ("we w-", "scared, t-")
  // (단순 끝 하이픈은 시 행 끝이나 무대 지시에서 자연스러움 — 영문자 + 하이픈 패턴만)
  if (/[a-zA-Z]-\s*$/.test(s)) return true;
  // 끝이 언더스코어 → PDF 추출 아티팩트로 단어 잘림
  if (/[a-zA-Z]_\s*$/.test(s)) return true;
  return false;
}

export function validateAndFilterCards(cards, category, opts = {}) {
  // opts.fullScript 있으면 잘린 첫/끝 줄을 원본에서 복원 시도 (보강).
  const fullScript = opts.fullScript || null;
  if (!Array.isArray(cards)) {
    return { cards: [], summary: { total: 0, kept: 0, dropped_identical: 0, dropped_short: 0, dropped_incomplete: 0, min_chars: 0, category } };
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
    // ★ quote 잘림 — quote 가 단어/문장 중간에서 끊긴 경우만 drop (영문 한정).
    // script_excerpt 잘림은 EXTRACT 프롬프트가 문맥 보고 보강/제외 결정하므로 자동 drop 안 함.
    // approve(검토 통과) 단계에선 사용자가 편집으로 살릴 수 있어 검사 skip.
    if (!opts.skipIncomplete) {
      if (isIncompleteQuote(c?.quote)) return { c, drop: 'incomplete' };
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
  let droppedIncomplete = 0;
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
    } else if (drop === 'incomplete') {
      // ALWAYS drop — 불완전한 문장 (PDF 아티팩트로 단어/문장 잘림)
      droppedIncomplete++;
      console.warn(`[extract] drop: incomplete sentence in quote: "${String(c?.quote || '').slice(0, 80)}"`);
    } else if (drop === 'short') {
      const slen = String(c?.script_excerpt || '').length;
      // 빈 script_excerpt 는 safety fallback 면제 — 편집 불가능한 빈 카드 항상 drop.
      // (LLM 응답 토큰 잘림/누락으로 빈 채로 추출된 카드. 편집해도 본문이 없으므로 무의미.)
      if (slen === 0) {
        droppedShort++;
        console.warn(`[extract] drop: empty script_excerpt (safety fallback 면제) qlen=${String(c?.quote || '').length}`);
      } else if (safetyFallback) {
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

  // ★ 안전망 — 모든 카드 drop 되면 (결과 0) identical 만 빼고 다 보존.
  //   사용자 요구: "문장 완성하면서 카드는 반드시 추출. 다른 조건에 걸려서 아예 카드가
  //   안 나오면 안 된다." 잘림/길이 미달 카드도 결과 0 이 되는 케이스는 살림.
  if (survivors.length === 0 && cards.length > 0) {
    console.warn(
      `[extract] all cards dropped (in=${cards.length}) — SAFETY: keep all except identical (quote≈script)`
    );
    for (const { c, drop } of verdicts) {
      if (drop !== 'identical') survivors.push(c);
    }
    // 보존된 카운트 보정 — drop 카운트는 그대로 두되 safety_fallback 표시
    droppedIncomplete = 0;
    droppedShort = 0;
  }

  // 첫/끝 줄 잘린 문장 자동 복원 — survivors 의 script_excerpt 만 손봄.
  // 사용자 요구: 잘린 문장의 본문(fullScript)을 직접 가져와 채움.
  // fullScript 가 있으면 rescue 시도, 실패하면 자투리 제거 (LLM 보강 X).
  for (const c of survivors) {
    if (!c) continue;
    // 빈 script_excerpt 인 경우 — quote 라도 채움 (빈 박스 표시 방지).
    // 사용자가 검토에서 본문 직접 편집 가능.
    if (!c.script_excerpt || !String(c.script_excerpt).trim()) {
      if (c.quote) c.script_excerpt = String(c.quote);
    }
    if (!c.script_excerpt) continue;
    if (fullScript) rescueScriptExcerptEdges(c, fullScript);
    // rescue 후에도 자투리 남아있으면 그것만 마지막 정리
    c.script_excerpt = cleanScriptExcerptEdges(c.script_excerpt);
    // PDF 페이지 폭 줄바꿈 정리 — 한 단락 안 부자연스러운 \n 은 공백으로 합침.
    // (단락 구분 \n\n 은 보존, 화자 라벨 라인도 보존)
    c.script_excerpt = collapsePdfLineWraps(c.script_excerpt);
  }

  console.log(
    `[extract] validation: in=${cards.length} out=${survivors.length} ` +
    `dropped_identical=${droppedIdentical} dropped_short=${droppedShort} dropped_incomplete=${droppedIncomplete} ` +
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
      dropped_incomplete: droppedIncomplete,
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

// 자주 등장하는 영문 작가명의 통용 한국어 표기 — LLM 호출 없이 즉시 반환.
// 키는 lowercase, "the " prefix 제거 후 매칭. 매칭 안 되면 LLM fallback.
// 추가는 안전 — 잘못 추가해도 LLM 결과로 덮어쓸 일 없음 (lookup 우선).
const AUTHOR_LOOKUP = {
  // 영미 고전·근대
  'william shakespeare': '윌리엄 셰익스피어',
  'shakespeare': '윌리엄 셰익스피어',
  'mark twain': '마크 트웨인',
  'samuel clemens': '마크 트웨인',
  'charles dickens': '찰스 디킨스',
  'jane austen': '제인 오스틴',
  'emily brontë': '에밀리 브론테',
  'emily bronte': '에밀리 브론테',
  'charlotte brontë': '샬럿 브론테',
  'charlotte bronte': '샬럿 브론테',
  'oscar wilde': '오스카 와일드',
  'arthur conan doyle': '아서 코난 도일',
  'conan doyle': '아서 코난 도일',
  'edgar allan poe': '에드거 앨런 포',
  'herman melville': '허먼 멜빌',
  'nathaniel hawthorne': '너새니얼 호손',
  'ernest hemingway': '어니스트 헤밍웨이',
  'f. scott fitzgerald': 'F. 스콧 피츠제럴드',
  'scott fitzgerald': 'F. 스콧 피츠제럴드',
  'john steinbeck': '존 스타인벡',
  'william faulkner': '윌리엄 포크너',
  'virginia woolf': '버지니아 울프',
  'james joyce': '제임스 조이스',
  'h. g. wells': 'H. G. 웰스',
  'hg wells': 'H. G. 웰스',
  'jules verne': '쥘 베른',
  'george orwell': '조지 오웰',
  'aldous huxley': '올더스 헉슬리',
  // 러시아
  'leo tolstoy': '레프 톨스토이',
  'tolstoy': '레프 톨스토이',
  'fyodor dostoevsky': '표도르 도스토옙스키',
  'dostoevsky': '표도르 도스토옙스키',
  'anton chekhov': '안톤 체호프',
  'chekhov': '안톤 체호프',
  'ivan turgenev': '이반 투르게네프',
  'alexander pushkin': '알렉산드르 푸시킨',
  'nikolai gogol': '니콜라이 고골',
  // 프랑스
  'victor hugo': '빅토르 위고',
  'gustave flaubert': '귀스타브 플로베르',
  'honoré de balzac': '오노레 드 발자크',
  'honore de balzac': '오노레 드 발자크',
  'alexandre dumas': '알렉상드르 뒤마',
  'émile zola': '에밀 졸라',
  'emile zola': '에밀 졸라',
  'guy de maupassant': '기 드 모파상',
  'antoine de saint-exupéry': '앙투안 드 생텍쥐페리',
  'antoine de saint-exupery': '앙투안 드 생텍쥐페리',
  'molière': '몰리에르',
  'moliere': '몰리에르',
  // 독일·오스트리아
  'franz kafka': '프란츠 카프카',
  'hermann hesse': '헤르만 헤세',
  'thomas mann': '토마스 만',
  'johann wolfgang von goethe': '요한 볼프강 폰 괴테',
  'goethe': '요한 볼프강 폰 괴테',
  'friedrich schiller': '프리드리히 실러',
  // 그리스
  'homer': '호메로스',
  'sophocles': '소포클레스',
  'euripides': '에우리피데스',
  'aeschylus': '아이스킬로스',
  'aristophanes': '아리스토파네스',
  // 오페라 작곡가
  'giuseppe verdi': '주세페 베르디',
  'verdi': '주세페 베르디',
  'giacomo puccini': '자코모 푸치니',
  'puccini': '자코모 푸치니',
  'wolfgang amadeus mozart': '볼프강 아마데우스 모차르트',
  'mozart': '볼프강 아마데우스 모차르트',
  'richard wagner': '리하르트 바그너',
  'wagner': '리하르트 바그너',
  'gioachino rossini': '조아키노 로시니',
  'rossini': '조아키노 로시니',
  // 시인
  'walt whitman': '월트 휘트먼',
  'emily dickinson': '에밀리 디킨슨',
  'robert frost': '로버트 프로스트',
  't. s. eliot': 'T. S. 엘리엇',
  'ts eliot': 'T. S. 엘리엇',
  'william wordsworth': '윌리엄 워즈워스',
  'lord byron': '바이런',
  'percy bysshe shelley': '퍼시 비시 셸리',
  'john keats': '존 키츠',
  // 일본
  'haruki murakami': '무라카미 하루키',
  'natsume sōseki': '나쓰메 소세키',
  'natsume soseki': '나쓰메 소세키',
  'yasunari kawabata': '가와바타 야스나리',
  'yukio mishima': '미시마 유키오',
  // 라이너 마리아 릴케 등
  'rainer maria rilke': '라이너 마리아 릴케',
  'rilke': '라이너 마리아 릴케',
};

// 영문 작가명을 통용 한국어 표기로 변환. (저장 직전 가드 + 백필용)
// - 입력이 비어있거나 이미 한글만 있으면 그대로 반환 (LLM 호출 안 함).
// - AUTHOR_LOOKUP 에 있으면 즉시 반환 (LLM 호출 안 함).
// - 그 외엔 LLM 으로 변환. 매핑 모호 시 음역. 작품 제목·역할 설명은 빼고 사람 이름만.
export async function runKoreanizeAuthor(rawAuthor) {
  const s = String(rawAuthor ?? '').trim();
  if (!s) return null;
  if (!/[A-Za-z]/.test(s)) return s;
  // Lookup 시도 — "The Brothers Grimm" 같은 "the " prefix 도 처리.
  const lookupKey = s.toLowerCase().replace(/^the\s+/i, '').trim();
  const cached = AUTHOR_LOOKUP[lookupKey];
  if (cached) {
    console.log(`[koreanizeAuthor] cache hit: "${s}" → "${cached}"`);
    return cached;
  }
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
  // TRANSLATE_PROMPT 는 {work, card} 봉투를 받아 quote / script_excerpt 두 필드 번역.
  // 출력 형식: 이전엔 JSON 이었지만 번역문 안의 따옴표·줄바꿈 escape 실수가 누적되어
  // parseJson 실패가 잦았다 → 마커 기반 plain text 로 전환. 절대 깨지지 않음.
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

  const basePrompt = TRANSLATE_PROMPT.replace('{{INPUT_JSON}}', JSON.stringify(envelope, null, 2));
  // 출력 형식 override — TRANSLATE_PROMPT 안의 JSON 출력 지시는 무시하고 마커 사용.
  // 마커 사이 텍스트는 어떤 문자(따옴표·줄바꿈·괄호 등)도 escape 없이 그대로 둠.
  const markerInstructions = `

[OUTPUT FORMAT OVERRIDE — 위 [02] 의 JSON 출력 지시는 무시하고 아래 형식을 따른다.]
다음 마커로 정확히 구분해서 출력. 각 마커는 자기 줄에 단독으로. 마커 사이 본문은 plain text — 따옴표·줄바꿈·괄호 다 그대로, escape 절대 하지 말 것.

<<<QUOTE>>>
{여기에 quote 의 한국어 번역. 한 줄, 한 호흡}
<<<SCRIPT>>>
{여기에 script_excerpt 의 한국어 번역. 원본 줄바꿈·인물명·지문 형식 유지}
<<<CONFIDENCE>>>
{high 또는 low 한 단어}
<<<NOTE>>>
{confidence 가 low 일 때만 한 줄 사유. high 면 빈 줄}
<<<END>>>

마커 밖에는 어떤 문자도 출력하지 말 것 (설명·코드펜스·라벨 금지).`;

  // 출력: quote(짧음) + script_excerpt(2000~3000자 한국어 ≈ 4000 토큰) + 마커. 6000 으로 충분.
  const result = await callClaude(basePrompt + markerInstructions, {
    maxTokens: 6000,
    system: TRANSLATE_SYSTEM,
    temperature: 0.3,
    rawText: true,
    model: 'haiku',
  });

  const text = String(result || '');
  // 마커 사이 텍스트 추출. 마커가 누락된 경우 다음 마커까지 fallback.
  function between(s, startMarker, endMarker) {
    const start = s.indexOf(startMarker);
    if (start === -1) return null;
    const valueStart = start + startMarker.length;
    const end = s.indexOf(endMarker, valueStart);
    if (end === -1) return null;
    return s.slice(valueStart, end).trim();
  }

  const quote = between(text, '<<<QUOTE>>>', '<<<SCRIPT>>>');
  const script = between(text, '<<<SCRIPT>>>', '<<<CONFIDENCE>>>')
              || between(text, '<<<SCRIPT>>>', '<<<NOTE>>>')
              || between(text, '<<<SCRIPT>>>', '<<<END>>>');
  const confRaw = between(text, '<<<CONFIDENCE>>>', '<<<NOTE>>>')
               || between(text, '<<<CONFIDENCE>>>', '<<<END>>>')
               || '';
  const noteRaw = between(text, '<<<NOTE>>>', '<<<END>>>') || '';

  if (!quote) {
    console.warn('[translate] marker QUOTE 없음. raw 앞 200자:', text.slice(0, 200));
    throw new Error('Translation response missing QUOTE marker');
  }

  return {
    quote_translated: quote,
    script_excerpt_translated: script || '',
    confidence: /low/i.test(confRaw) ? 'low' : 'high',
    note: noteRaw,
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
  // maxTokens — script_excerpt 만 큼, 짧은 필드(title/author/keywords)는 512 면 충분.
  const tokenBudget = field === 'script_excerpt' ? 5000
                    : (field === 'excerpt_description' || field === 'significance') ? 1024
                    : 512;
  const result = await callClaude(prompt, {
    maxTokens: tokenBudget,
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

// 한 카드 / 한 작품의 여러 필드를 한 LLM 호출로 일괄 번역.
// autoFillEnglishForCard 가 5+ 회 호출하던 걸 1회로 줄이는 데 사용.
//
// 입력 fields: [{ name, text, kind? }] — name 은 결과 객체의 키.
//   kind 는 선택적: 'title' | 'author' | 'quote' | 'script_excerpt' | 'excerpt_description' | 'significance' | 'keywords'
//   미지정시 일반 산문 취급.
// direction: 'en2ko' | 'ko2en'
// 응답: { [name]: translated_text } — 입력 fields 의 name 그대로. 누락 필드는 빈 문자열.
export async function runTranslateFields({ fields, direction = 'en2ko', work }) {
  const valid = (Array.isArray(fields) ? fields : [])
    .filter((f) => f && f.name && f.text != null && String(f.text).trim());
  if (!valid.length) return {};

  // 단일 필드면 기존 runTranslateField 로 위임 — 동일 결과, 동일 토큰.
  if (valid.length === 1) {
    const f = valid[0];
    const out = await runTranslateField({
      text: String(f.text),
      field: f.kind || 'excerpt_description',
      work, direction,
    });
    return { [f.name]: out };
  }

  const w = work && typeof work === 'object' ? work : {};
  const ctx = [
    w.title  ? (direction === 'ko2en' ? `Title: ${w.title}` : `작품 제목: ${w.title}`) : null,
    w.author ? (direction === 'ko2en' ? `Author: ${w.author}` : `작가: ${w.author}`)   : null,
    w.format ? (direction === 'ko2en' ? `Format: ${w.format}` : `형식: ${w.format}`)   : null,
  ].filter(Boolean).join('\n');

  // 입력 필드 블록 — 마커로 구분, 본문은 escape 없이 그대로.
  // LLM 이 응답에서 같은 name 마커로 번역문을 채워 보내도록 한다.
  const inputBlocks = valid.map((f) =>
    `<<<FIELD name=${f.name} kind=${f.kind || 'general'}>>>\n${String(f.text).trim()}\n<<<END_FIELD>>>`
  ).join('\n\n');

  const system = direction === 'ko2en'
    ? 'You are a precise Korean→English literary translator. Translate each field faithfully and literally — match source length, preserve sentence count and every detail. Output ONLY the marker-delimited format specified. No JSON, no markdown, no explanations.'
    : '너는 한국어 정전 감각을 가진 번역가다. 각 필드를 자연스럽고 정확하게 한국어로 옮긴다. 응답은 지정된 마커 형식만 — JSON·마크다운·설명 금지.';

  const directionLabel = direction === 'ko2en' ? 'Korean → English' : 'English → Korean';
  const targetLang = direction === 'ko2en' ? 'English' : 'Korean (한국어)';

  const fieldGuides = valid.map((f) => {
    const kind = f.kind || 'general';
    if (direction === 'ko2en') {
      const g = {
        title: 'title — natural English. Use canonical English title if known.',
        author: 'author — standard English spelling if known; otherwise transliterate.',
        quote: 'quote — a speakable single line of dialogue. Preserve tone.',
        script_excerpt: 'script_excerpt — preserve speaker labels and stage direction linebreaks.',
        excerpt_description: 'excerpt_description — literal narrative translation, same sentence count.',
        significance: 'significance — literal commentary translation, preserve every claim.',
        keywords: 'keywords — comma-separated short English tags. SAME count and order as input. No quotes, no Oxford commas.',
      };
      return `· ${f.name}: ${g[kind] || 'natural English, faithful to the source'}`;
    }
    const g = {
      title: '제목 — 한국 통용 표기 우선.',
      author: '작가명 — 한국 통용 표기 우선, 모호하면 음역. 한자/영문 그대로 두지 말 것.',
      quote: '명대사 — 무대 위 배우가 한 호흡에 말할 수 있게. 번역체 금지.',
      script_excerpt: '대본 발췌 — 인물명·지문·줄바꿈 형식 유지, 관계에 맞는 위계 어투.',
      excerpt_description: '장면 설명 — 자연스러운 한국어 한 단락.',
      significance: '작품 의의 — 자연스러운 한국어 산문.',
      keywords: '키워드 — 쉼표로 구분. 입력과 동일 개수·순서. 따옴표·옥스퍼드 쉼표 금지.',
    };
    return `· ${f.name}: ${g[kind] || '자연스러운 한국어로'}`;
  }).join('\n');

  // 입력 name 명시적 나열 — LLM 이 빠뜨릴 가능성 차단
  const requiredNames = valid.map((f) => `· ${f.name}`).join('\n');

  const prompt = direction === 'ko2en'
    ? `Translate ${valid.length} field(s) ${directionLabel}.

[Work context — for terminology consistency only]
${ctx || '(none)'}

[Per-field guide]
${fieldGuides}

[Input — each field is delimited by markers; content is plain text, no escaping]
${inputBlocks}

[Required output blocks — emit ALL of these, no exceptions]
${requiredNames}

[Output format — STRICT]
For each input field, emit ONE block using the SAME name. Content between markers is plain ${targetLang}.

<<<OUT name=<field_name>>>>
{translated text — keep original line breaks where they aid readability}
<<<END_OUT>>>

★ COMPLETENESS REQUIREMENTS:
1. Emit EXACTLY ${valid.length} OUT block(s), one per input FIELD, using the exact same names.
2. Translate every field FULLY — do not abbreviate or summarize.
3. Marker content is plain text — do NOT escape quotes, newlines, brackets.
4. No greetings, no JSON, no markdown, no commentary outside OUT blocks.`
    : `다음 ${valid.length} 개 필드를 ${directionLabel} 으로 옮긴다.

[작품 컨텍스트 — 용어 일관성 참고용]
${ctx || '(없음)'}

[필드별 가이드]
${fieldGuides}

[입력 — 각 필드는 마커로 구분. 본문은 plain text, escape 없음]
${inputBlocks}

[반드시 출력해야 하는 블록 — 빠뜨리지 말 것]
${requiredNames}

[출력 형식 — 엄격]
각 입력 필드마다 같은 name 으로 OUT 블록 하나씩. 마커 사이는 plain ${targetLang}.

<<<OUT name=<field_name>>>>
{번역된 본문 — 가독성에 도움이 되는 줄바꿈은 유지}
<<<END_OUT>>>

★ 완결성 요구사항:
1. 정확히 ${valid.length} 개 OUT 블록, 입력 FIELD 마다 1개씩, name 은 입력과 정확히 동일.
2. 각 필드를 완전 번역 — 축약·요약·생략 금지.
3. 마커 본문은 plain text — 따옴표·줄바꿈·괄호 escape 금지.
4. 인사·JSON·마크다운·OUT 밖 텍스트 금지.`;

  // 토큰 예산 — 입력 필드 합산의 1.5배 + 마진 (마커 오버헤드 ~50tok/field).
  const inputCharTotal = valid.reduce((sum, f) => sum + String(f.text).length, 0);
  const maxTokens = Math.max(1024, Math.min(8000, Math.floor(inputCharTotal * 1.5) + valid.length * 100));

  const text = await callClaude(prompt, {
    maxTokens,
    system,
    temperature: 0.3,
    rawText: true,
    model: 'haiku',
  });

  const raw = String(text || '');
  const out = {};
  // OUT 블록 파싱
  const blockRe = /<<<OUT\s+name=([^>]+?)>>>([\s\S]*?)<<<END_OUT>>>/g;
  let m;
  while ((m = blockRe.exec(raw)) !== null) {
    const name = m[1].trim();
    const value = m[2].trim();
    if (name && value) out[name] = value;
  }
  // 누락된 필드는 빈 문자열로 (호출자가 null 처리 가능).
  for (const f of valid) {
    if (!(f.name in out)) out[f.name] = '';
  }
  return out;
}

// "전체 번역" 최적 경로 — 카드 N장의 5필드를 한 LLM 호출로 source→target 단방향 번역.
// A1 (source-language commentary) 이후: 추출 시 모든 필드가 source 언어로 들어있음.
//   영문 원문 → 모든 필드 EN→KO
//   한국어 원문 → 모든 필드 KO→EN
//
// 응답: [{ id, source_lang, ko: {quote, script_excerpt, desc, sig, kw}, en: {...} }]
//   ko / en 각각 5필드. source 언어 값은 입력 echo, 반대 언어 값은 LLM 번역 결과.

// quote/script 의 한·영 비율로 source 언어 판정.
function detectCardSourceLang(card) {
  const sample = `${card?.quote || ''} ${card?.script_excerpt || ''}`;
  const koreanChars = (sample.match(/[가-힯]/g) || []).length;
  const latinChars  = (sample.match(/[a-zA-Z]/g) || []).length;
  return koreanChars > latinChars ? 'ko' : 'en';
}

export async function runTranslateCardBatch({ cards, work }) {
  const items = Array.isArray(cards) ? cards : [];
  if (!items.length) return [];

  // 첫 카드의 quote/script 에서 source 언어 판정. batch 는 한 작품 단위라 일관.
  const sourceLang = detectCardSourceLang(items[0]);
  const targetLang = sourceLang === 'ko' ? 'en' : 'ko';

  const w = work && typeof work === 'object' ? work : {};
  const ctx = [
    w.title    ? `Title: ${w.title}`        : null,
    w.subtitle ? `Subtitle: ${w.subtitle}`  : null,
    w.author   ? `Author: ${w.author}`      : null,
    w.format   ? `Format: ${w.format}`      : null,
  ].filter(Boolean).join('\n');

  // 작품 메타 (title/subtitle/author) 도 batch 에 포함 — 추출 직후 양 언어 모두 즉시 채워짐.
  // 비어 있거나 source 언어가 아니면 (이미 target 언어) 빼서 토큰 절약.
  function isSourceLang(text) {
    if (!text) return false;
    const s = String(text);
    const ko = (s.match(/[가-힯]/g) || []).length;
    const en = (s.match(/[a-zA-Z]/g) || []).length;
    const detected = ko > en ? 'ko' : 'en';
    return detected === sourceLang;
  }
  const workNeedsTranslate = [];
  if (w.title    && isSourceLang(w.title))    workNeedsTranslate.push('TITLE');
  if (w.subtitle && isSourceLang(w.subtitle)) workNeedsTranslate.push('SUBTITLE');
  if (w.author   && isSourceLang(w.author))   workNeedsTranslate.push('AUTHOR');
  const workBlock = workNeedsTranslate.length === 0 ? '' : `

<<<WORK>>>
${w.title    && workNeedsTranslate.includes('TITLE')    ? `<<<SRC_TITLE>>>\n${String(w.title).trim()}\n<<<END_SRC_TITLE>>>`    : ''}
${w.subtitle && workNeedsTranslate.includes('SUBTITLE') ? `<<<SRC_SUBTITLE>>>\n${String(w.subtitle).trim()}\n<<<END_SRC_SUBTITLE>>>` : ''}
${w.author   && workNeedsTranslate.includes('AUTHOR')   ? `<<<SRC_AUTHOR>>>\n${String(w.author).trim()}\n<<<END_SRC_AUTHOR>>>`   : ''}
<<<END_WORK>>>`;

  // 입력 카드 블록 — source 언어 그대로 SRC_ 접두 5필드. 빈 필드는 빼서 토큰 절약.
  const cardBlocks = items.map((c, i) => {
    const id = c.id ?? i;
    const parts = [`<<<CARD id=${id}>>>`];
    if (c.quote && String(c.quote).trim())                   parts.push(`<<<SRC_QUOTE>>>\n${String(c.quote).trim()}\n<<<END_SRC_QUOTE>>>`);
    if (c.script_excerpt && String(c.script_excerpt).trim()) parts.push(`<<<SRC_SCRIPT>>>\n${String(c.script_excerpt).trim()}\n<<<END_SRC_SCRIPT>>>`);
    if (c.excerpt_description && String(c.excerpt_description).trim()) parts.push(`<<<SRC_DESC>>>\n${String(c.excerpt_description).trim()}\n<<<END_SRC_DESC>>>`);
    if (c.significance && String(c.significance).trim())     parts.push(`<<<SRC_SIG>>>\n${String(c.significance).trim()}\n<<<END_SRC_SIG>>>`);
    if (Array.isArray(c.keywords) && c.keywords.length)      parts.push(`<<<SRC_KW>>>\n${c.keywords.map((k) => String(k).trim()).filter(Boolean).join(', ')}\n<<<END_SRC_KW>>>`);
    parts.push('<<<END_CARD>>>');
    return parts.join('\n');
  }).join('\n\n');

  const isToKorean = targetLang === 'ko';
  const system = isToKorean
    ? '너는 한국어 정전 감각을 가진 번역가다. 입력의 모든 필드(quote/script/description/significance/keywords)를 자연스러운 한국어로 옮긴다. 응답은 지정된 마커 형식만 — JSON·마크다운·설명 금지.'
    : 'You are a precise Korean→English literary translator. Translate every input field (quote/script/description/significance/keywords) into faithful, literal English. Output ONLY the marker-delimited format specified. No JSON, no markdown, no extra prose.';

  // 카드별 필수 OUT 섹션 — LLM 누락 차단
  const cardRequirements = items.map((c, i) => {
    const id = c.id ?? i;
    const need = [];
    if (c.quote && String(c.quote).trim())                   need.push('TGT_QUOTE');
    if (c.script_excerpt && String(c.script_excerpt).trim()) need.push('TGT_SCRIPT');
    if (c.excerpt_description && String(c.excerpt_description).trim()) need.push('TGT_DESC');
    if (c.significance && String(c.significance).trim())     need.push('TGT_SIG');
    if (Array.isArray(c.keywords) && c.keywords.length)      need.push('TGT_KW');
    return `· id=${id} requires: ${need.join(', ')}`;
  }).join('\n');

  const translationGuide = isToKorean ? `
[번역 규칙 — 한국어 출력]
· quote/script_excerpt: 무대 위 배우가 한 호흡에 말할 수 있는 자연스러운 한국어. 번역체 ("당신", "그/그녀", "~인 것이다") 금지. 인물 관계에 맞는 위계 어투. script 는 인물명·지문·줄바꿈 형식 그대로.
· excerpt_description: 한 단락 산문, 80~250자.
· significance: 80~200자, 작품 의의 한 문장 응축.
· keywords: 쉼표 구분, 입력과 동일 개수·순서. 각 키워드 2~6자 한국어 명사/명사구. 따옴표·옥스퍼드 쉼표 금지.` : `
[Translation rules — English output]
· quote/script_excerpt: literal English. Preserve speaker labels and stage direction linebreaks. Match tone (modern/period drama).
· excerpt_description: literal English narrative, 1 paragraph, ~80-300 chars.
· significance: literal English commentary, ~80-250 chars, single distilled claim.
· keywords: comma-separated, SAME count and order as input. Each tag a short English word or phrase. No quotes, no Oxford commas.`;

  const prompt = `Translate ${items.length} card(s) ${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()} (all fields, single direction).

[Work context — for terminology consistency]
${ctx || '(none)'}
${translationGuide}

[Input cards — markers delimit cards and fields; content is plain text, no escaping]
${cardBlocks}
${workBlock}
${workNeedsTranslate.length > 0 ? `
[Required work-meta output — emit ALL of these in <<<WORK_RESULT>>> block]
${workNeedsTranslate.map((k) => `· TGT_${k}`).join('\n')}
` : ''}
[Required output blocks per card — emit ALL of these, no exceptions]
${cardRequirements}

[Output format — STRICT]
${workNeedsTranslate.length > 0 ? `First emit work meta translation (if any):
<<<WORK_RESULT>>>
${workNeedsTranslate.includes('TITLE')    ? '<<<TGT_TITLE>>>\n{${targetLang.toUpperCase()} translation of SRC_TITLE}\n<<<END_TGT_TITLE>>>' : ''}
${workNeedsTranslate.includes('SUBTITLE') ? '<<<TGT_SUBTITLE>>>\n{...}\n<<<END_TGT_SUBTITLE>>>' : ''}
${workNeedsTranslate.includes('AUTHOR')   ? '<<<TGT_AUTHOR>>>\n{...}\n<<<END_TGT_AUTHOR>>>' : ''}
<<<END_WORK_RESULT>>>

Then for each input card,` : 'For each input card,'} emit ONE <<<RESULT id=N>>> ... <<<END_RESULT>>> block. Inside, emit EACH required TGT_ section:

<<<RESULT id=1>>>
<<<TGT_QUOTE>>>
{${targetLang.toUpperCase()} translation of SRC_QUOTE}
<<<END_TGT_QUOTE>>>
<<<TGT_SCRIPT>>>
{${targetLang.toUpperCase()} translation of SRC_SCRIPT — preserve original line breaks}
<<<END_TGT_SCRIPT>>>
<<<TGT_DESC>>>
{${targetLang.toUpperCase()} translation of SRC_DESC}
<<<END_TGT_DESC>>>
<<<TGT_SIG>>>
{${targetLang.toUpperCase()} translation of SRC_SIG}
<<<END_TGT_SIG>>>
<<<TGT_KW>>>
{${targetLang.toUpperCase()} keywords, comma-separated, same count and order as input}
<<<END_TGT_KW>>>
<<<END_RESULT>>>

★ COMPLETENESS REQUIREMENTS:
1. Emit EXACTLY ${items.length} <<<RESULT>>> block(s), one per input card, in the SAME ORDER as input.
2. Use the EXACT input id from the corresponding <<<CARD id=N>>>.
3. Within each RESULT, emit EVERY required TGT_ section listed above for that card.
${workNeedsTranslate.length > 0 ? '4. Emit <<<WORK_RESULT>>> block first if work meta is provided.' : ''}
5. Marker content is plain text — do NOT escape quotes, newlines, brackets, or any character.
6. No text outside RESULT/WORK_RESULT blocks. No greetings, no JSON, no markdown.
7. Translate every field FULLY — do not abbreviate or summarize.`;

  // 토큰 예산 — 단방향이라 양방향 대비 절감. 카드당 평균 4000 토큰. 최대 16000.
  const maxTokens = Math.min(16000, Math.max(2500, items.length * 4000));

  const startedAt = Date.now();
  const text = await callClaude(prompt, {
    maxTokens,
    system,
    temperature: 0.3,
    rawText: true,
    model: 'haiku',
  });
  const llmMs = Date.now() - startedAt;

  // RESULT 블록 파싱 — 관대한 id 매칭 (공백, "1.0" 표기 등 처리).
  // id 형식: "1", "card_1", "1.0" 등 어떤 거든 trim 후 숫자만 추출해 비교용 표준화.
  const raw = String(text || '');
  const resultRe = /<<<RESULT\s+id\s*=\s*([^>]+?)\s*>>>([\s\S]*?)<<<END_RESULT>>>/g;
  function normalizeId(id) {
    if (id == null) return '';
    const s = String(id).trim();
    // "1.0" → "1", "card_1" → "1" 등 첫 번째 정수만 추출
    const numMatch = s.match(/\d+/);
    return numMatch ? numMatch[0] : s;
  }
  const byId = new Map();
  let m;
  let blocksFound = 0;
  while ((m = resultRe.exec(raw)) !== null) {
    blocksFound++;
    const rawId = m[1];
    const id = normalizeId(rawId);
    const inside = m[2];

    function section(open, close) {
      const s = inside.indexOf(open);
      if (s === -1) return null;
      const valueStart = s + open.length;
      const e = inside.indexOf(close, valueStart);
      if (e === -1) return null;
      return inside.slice(valueStart, e).trim() || null;
    }

    const tgtQuote  = section('<<<TGT_QUOTE>>>',  '<<<END_TGT_QUOTE>>>');
    const tgtScript = section('<<<TGT_SCRIPT>>>', '<<<END_TGT_SCRIPT>>>');
    const tgtDesc   = section('<<<TGT_DESC>>>',   '<<<END_TGT_DESC>>>');
    const tgtSig    = section('<<<TGT_SIG>>>',    '<<<END_TGT_SIG>>>');
    const tgtKwRaw  = section('<<<TGT_KW>>>',     '<<<END_TGT_KW>>>');
    const tgtKw = tgtKwRaw ? tgtKwRaw.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : null;

    byId.set(id, {
      quote: tgtQuote,
      script_excerpt: tgtScript,
      excerpt_description: tgtDesc,
      significance: tgtSig,
      keywords: tgtKw && tgtKw.length ? tgtKw : null,
    });
  }

  // WORK_RESULT 블록 파싱 (있을 때만)
  let workResult = null;
  if (workNeedsTranslate.length > 0) {
    const wm = raw.match(/<<<WORK_RESULT>>>([\s\S]*?)<<<END_WORK_RESULT>>>/);
    if (wm) {
      const wInside = wm[1];
      function wSection(open, close) {
        const s = wInside.indexOf(open);
        if (s === -1) return null;
        const valueStart = s + open.length;
        const e = wInside.indexOf(close, valueStart);
        if (e === -1) return null;
        return wInside.slice(valueStart, e).trim() || null;
      }
      workResult = {
        title:    wSection('<<<TGT_TITLE>>>',    '<<<END_TGT_TITLE>>>'),
        subtitle: wSection('<<<TGT_SUBTITLE>>>', '<<<END_TGT_SUBTITLE>>>'),
        author:   wSection('<<<TGT_AUTHOR>>>',   '<<<END_TGT_AUTHOR>>>'),
      };
    }
  }
  // work 응답 구조 — source 는 echo, target 은 LLM 번역
  const sourceWork = {
    title:    w.title    || null,
    subtitle: w.subtitle || null,
    author:   w.author   || null,
  };
  const targetWork = {
    title:    workResult?.title    || null,
    subtitle: workResult?.subtitle || null,
    author:   workResult?.author   || null,
  };
  const workOut = {
    source_lang: sourceLang,
    ko: sourceLang === 'ko' ? sourceWork : targetWork,
    en: sourceLang === 'en' ? sourceWork : targetWork,
  };

  // 입력 순서대로 정렬해서 반환. { id, source_lang, ko: {...}, en: {...} } 형태.
  // 입력(source) 은 echo, 출력(target) 은 LLM 번역 결과.
  const out = items.map((c, i) => {
    const r = byId.get(normalizeId(c.id ?? i)) || {};
    const sourceFields = {
      quote: c.quote || null,
      script_excerpt: c.script_excerpt || null,
      excerpt_description: c.excerpt_description || null,
      significance: c.significance || null,
      keywords: Array.isArray(c.keywords) && c.keywords.length ? c.keywords : null,
    };
    const targetFields = {
      quote: r.quote || null,
      script_excerpt: r.script_excerpt || null,
      excerpt_description: r.excerpt_description || null,
      significance: r.significance || null,
      keywords: Array.isArray(r.keywords) ? r.keywords : null,
    };
    return {
      id: c.id ?? i,
      source_lang: sourceLang,
      ko: sourceLang === 'ko' ? sourceFields : targetFields,
      en: sourceLang === 'en' ? sourceFields : targetFields,
    };
  });

  // 진단 로그 — Vercel 함수 로그에서 batch 품질 모니터링용.
  console.log(
    `[translate-card-batch] input=${items.length} blocks=${blocksFound} ` +
    `${sourceLang}→${targetLang} workMeta=${workNeedsTranslate.join(',') || 'none'} ` +
    `maxTokens=${maxTokens} llmMs=${llmMs}`
  );
  return { results: out, work: workOut };
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

  // 출력 형식: 마커 기반 plain text. JSON 안 쓰니까 따옴표·줄바꿈 escape 문제 없음.
  // 카드별 블록 구조 — id 와 영문 필드들이 마커로 명확히 구분됨.
  const system =
    'You are a precise Korean→English literary translator. Translate each item faithfully and literally — match source length, preserve sentence count, every detail. Output ONLY the marker-delimited plain text format specified — no JSON, no markdown, no code fences, no extra prose.';

  const prompt = `Translate Korean commentary fields into English for ${payload.length} card(s).

[Translation rules — hard requirements]
1. Translate Korean directly — no paraphrase, no reinterpretation, no added context.
2. Each output sentence count = each input sentence count.
3. Length per field ≤ ~1.8x of the Korean source.
4. Preserve every detail, name, claim. Match tone (narrative commentary).
5. keywords: same count and order as input. Each tag = single English word or short phrase. No quotes, no Oxford commas.
6. If an input field is absent, omit that field's marker block from the output.
7. Match the id of each input item exactly.

[Work context — for terminology consistency]
${ctx || '(none)'}

[Input — array of cards]
${JSON.stringify(payload, null, 2)}

[Output format — STRICT]
For each card, emit one block in this exact form. Markers are on their own lines.
Between <<<DESC>>> / <<<SIG>>> / <<<KW>>> markers the content is plain English text — no escaping needed.

<<<CARD id=1>>>
<<<DESC>>>
{English description here, plain text}
<<<SIG>>>
{English significance here, plain text}
<<<KW>>>
{comma-separated English keywords, e.g. love, betrayal, faith}
<<<END_CARD>>>

<<<CARD id=2>>>
...
<<<END_CARD>>>

Rules:
- Use the EXACT input id after "id=" in <<<CARD id=N>>>.
- Omit <<<DESC>>>/<<<SIG>>>/<<<KW>>> blocks if the input doesn't have that field.
- No text outside CARD blocks. No closing JSON, no markdown, no greetings.`;

  // 출력 토큰: 카드 N장 × 평균 ~300자 영문 = ~150 tokens × 3필드 × N = N × 450 tokens.
  // 마커 오버헤드 ~50 tokens/card. 안전 마진 1200/card.
  const maxTokens = Math.max(4000, Math.min(12000, payload.length * 1200));

  const text = await callClaude(prompt, {
    maxTokens,
    system,
    temperature: 0.3,
    rawText: true,
    model: 'haiku',
  });

  // 카드 블록 파싱
  const raw = String(text || '');
  const cardBlocks = raw.split(/<<<CARD\s+id=([^>]+?)>>>/);
  // split 결과: [pre, id1, block1, id2, block2, ...]
  const byId = new Map();
  for (let i = 1; i < cardBlocks.length; i += 2) {
    const id = String(cardBlocks[i]).trim();
    const body = String(cardBlocks[i + 1] || '');
    const endIdx = body.indexOf('<<<END_CARD>>>');
    const inside = endIdx === -1 ? body : body.slice(0, endIdx);

    function block(marker, ...nextMarkers) {
      const start = inside.indexOf(marker);
      if (start === -1) return null;
      const valueStart = start + marker.length;
      let end = inside.length;
      for (const nm of nextMarkers) {
        const e = inside.indexOf(nm, valueStart);
        if (e !== -1 && e < end) end = e;
      }
      return inside.slice(valueStart, end).trim() || null;
    }

    const desc = block('<<<DESC>>>', '<<<SIG>>>', '<<<KW>>>');
    const sig  = block('<<<SIG>>>',  '<<<KW>>>');
    const kwRaw = block('<<<KW>>>');
    const kw = kwRaw ? kwRaw.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : null;

    byId.set(id, {
      description_en: desc,
      significance_en: sig,
      keywords_en: kw && kw.length ? kw : null,
    });
  }

  // 입력 순서대로 정렬해서 반환. 누락된 카드는 빈 객체.
  return payload.map((p) => {
    const r = byId.get(String(p.id)) || {};
    return {
      id: p.id,
      description_en: r.description_en || null,
      significance_en: r.significance_en || null,
      keywords_en: Array.isArray(r.keywords_en) ? r.keywords_en : null,
    };
  });
}
