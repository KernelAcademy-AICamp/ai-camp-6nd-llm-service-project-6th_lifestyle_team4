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

    const extracted = await extractText(fileBuffer, filename, mimetype);
    const scriptText = (extracted || '').trim();
    if (!scriptText) {
      return res.status(400).json({ error: '파일에서 텍스트를 추출하지 못했습니다. (스캔본 PDF는 OCR이 필요할 수 있습니다)' });
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

    const result = await runExtract(scriptText, category, seedBlock);
    // works.full_script_text는 NOT NULL이므로 저장 단계에서 다시 필요.
    // 응답에 함께 실어 클라이언트 state에 보관 → /api/save 호출 시 다시 전송.
    return res.status(200).json({ ...result, full_script_text: scriptText, _seed_debug: seedDebug });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    console.error('[extract] error:', err);
    if (err?.status === 529 || err?.status === 429) {
      return res.status(503).json({
        error: 'Anthropic API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      });
    }
    if (err?.code === 'ETIMEDOUT' || /timeout/i.test(err?.message || '')) {
      return res.status(504).json({
        error: 'LLM 응답 대기 시간이 너무 깁니다. 파일이 너무 길거나 모델이 느려진 상태일 수 있습니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
