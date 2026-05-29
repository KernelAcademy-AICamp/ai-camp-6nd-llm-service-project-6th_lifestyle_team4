import Busboy from 'busboy';

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runExtract } from '../lib/anthropic.js';
import { extractText } from '../lib/parse-document.js';
import { fetchQuoteSeeds, formatSeedBlock } from '../lib/quotes/index.js';

export const config = {
  api: { bodyParser: false },
};

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
    let fileBuffer = null;
    let filename = '';
    let mimetype = '';
    let tooLarge = false;
    const fields = {};

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (_name, stream, info) => {
      filename = info?.filename || '';
      mimetype = info?.mimeType || '';
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on('end', () => {
        if (!tooLarge) fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => {
      if (tooLarge) return reject(new Error('파일 크기가 25MB를 초과합니다.'));
      if (!fileBuffer) return reject(new Error('업로드된 파일이 없습니다.'));
      resolve({ file: fileBuffer, filename, mimetype, fields });
    });

    req.pipe(bb);
  });
}

const ALLOWED_CATEGORIES = new Set(['screen', 'opera', 'play', 'literature']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const { file: fileBuffer, filename, mimetype, fields } = await readMultipart(req);
    const rawCategory = (fields.category || '').trim();
    const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'screen';
    const titleHint = (fields.title || '').trim();
    // AI 모델 ('haiku' | 'sonnet' | 'opus'). 잘못된 값은 anthropic.js 에서 fallback.
    const modelKey = (fields.model || '').trim().toLowerCase();

    const extracted = await extractText(fileBuffer, filename, mimetype);
    let scriptText = (extracted || '').trim();
    if (!scriptText) {
      return res.status(400).json({ error: '파일에서 텍스트를 추출하지 못했습니다. (스캔본 PDF는 OCR이 필요할 수 있습니다)' });
    }

    // Claude 입력 한도(200K 토큰) 보호 — 한국어는 대략 1글자 ≈ 0.5~1 토큰.
    // 프롬프트 본문(~10K 토큰)·시드 블록·출력 여유(16K 토큰)를 빼고 안전한 상한을 400K 글자(약 130~160K 토큰)로 둔다.
    const MAX_SCRIPT_CHARS = 400000;
    let truncated = false;
    if (scriptText.length > MAX_SCRIPT_CHARS) {
      console.warn(`[extract] script too long ${scriptText.length} → trimming to ${MAX_SCRIPT_CHARS}`);
      scriptText = scriptText.slice(0, MAX_SCRIPT_CHARS);
      truncated = true;
    }

    // 폼에서 작품명을 받았으면 웹(Wikiquote 다국어 + 나무위키)에서 명대사 시드를 끌어와
    // LLM 프롬프트에 우선 검토 대상으로 주입한다. 시드가 비면 기존 동작 그대로.
    let seedBlock = '';
    let seedDebug = null;
    if (titleHint) {
      try {
        const { quotes, debug } = await fetchQuoteSeeds(titleHint, category);
        seedBlock = formatSeedBlock(titleHint, quotes);
        seedDebug = { count: quotes.length, ...debug };
        if (quotes.length) {
          console.log(`[extract] quote seeds for "${titleHint}": ${quotes.length}개`, debug);
        } else {
          console.log(`[extract] no quote seeds for "${titleHint}"`, debug);
        }
      } catch (e) {
        console.warn('[extract] fetchQuoteSeeds 실패, 시드 없이 진행:', e.message);
      }
    }

    const result = await runExtract(scriptText, category, seedBlock, modelKey);
    // works.full_script_text는 NOT NULL이므로 저장 단계에서 다시 필요.
    // 응답에 함께 실어 클라이언트 state에 보관 → /api/save 호출 시 다시 전송.
    return res.status(200).json({
      ...result,
      full_script_text: scriptText,
      _seed_debug: seedDebug,
      _truncated: truncated || undefined,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    // 자세한 에러 로그 — Vercel 함수 로그로 원인 추적
    console.error(
      `[extract] error model=${err?.__model || '?'} status=${err?.status} ` +
      `type=${err?.error?.type || err?.type} message=${(err?.message || '').slice(0, 300)}`
    );

    const msg = err?.message || '';
    const status = err?.status;
    const modelName = err?.__model || '';
    const modelTag = modelName ? ` (${modelName})` : '';

    // 1) 결제/사용량 한도
    if (/usage limits|reached your specified/i.test(msg)) {
      const dateMatch = msg.match(/regain access on (\d{4}-\d{2}-\d{2})/i);
      const when = dateMatch ? ` (${dateMatch[1]}에 자동 복구)` : '';
      return res.status(402).json({
        error: `Anthropic API 사용량 한도에 도달했습니다${when}. Anthropic Console → Settings → Limits 에서 한도를 올려주세요.`,
      });
    }
    // 1.5) 입력 길이 초과 — 보통 우리가 400K 글자로 잘라 보내므로 발생하지 않지만, 시드 블록 등이 폭증하면 가능.
    if (/prompt is too long|tokens.*maximum|maximum.*tokens/i.test(msg)) {
      return res.status(413).json({
        error: '대본이 너무 깁니다. 모델 입력 한도(200K 토큰)를 넘었어요. 파일을 둘로 나눠 따로 추출해주세요.',
      });
    }
    // 2) 모델이 존재하지 않거나 사용 권한 없음 (404 / 400 + not_found / 403)
    //    사용자 계정에 Sonnet/Opus 액세스가 없을 때 흔히 발생.
    if (status === 404 || status === 403 ||
        /not[_ ]?found|invalid.*model|does not exist|don.?t have access/i.test(msg)) {
      return res.status(400).json({
        error: `선택한 모델${modelTag}을(를) 사용할 수 없습니다. 계정에 해당 모델 액세스 권한이 없거나 모델 ID 가 변경됐을 수 있습니다. Haiku 로 다시 시도해보세요.`,
      });
    }
    // 3) 일시 과부하·레이트리밋
    if (status === 529 || status === 429) {
      return res.status(503).json({
        error: `Anthropic API${modelTag}가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.`,
      });
    }
    // 4) 타임아웃
    if (err?.code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
      return res.status(504).json({
        error: `LLM 응답 대기 시간이 너무 깁니다${modelTag}. 파일이 너무 길거나 모델이 느려진 상태일 수 있습니다. 잠시 후 다시 시도해주세요.`,
      });
    }
    // 5) 그 외 — status 와 모델을 메시지에 노출해 디버깅 도움
    return res.status(500).json({
      error: `추출 실패${modelTag}${status ? ` (status ${status})` : ''}: ${msg || 'Internal error'}`,
    });
  }
}
