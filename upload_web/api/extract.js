import Busboy from 'busboy';
// pdf-parse의 index.js는 import 시 디버그용 테스트 PDF를 읽으려고 시도하므로
// 서버리스에서는 내부 모듈을 직접 import 합니다.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runExtract } from '../lib/anthropic.js';

export const config = {
  api: { bodyParser: false },
};

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
    let pdfBuffer = null;
    let tooLarge = false;
    const fields = {};

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (_name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on('end', () => {
        if (!tooLarge) pdfBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => {
      if (tooLarge) return reject(new Error('PDF exceeds 25MB limit'));
      if (!pdfBuffer) return reject(new Error('No PDF file in request'));
      resolve({ pdf: pdfBuffer, fields });
    });

    req.pipe(bb);
  });
}

const ALLOWED_CATEGORIES = new Set(['screen', 'stage']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);

    const { pdf: pdfBuffer, fields } = await readMultipart(req);
    const rawCategory = (fields.category || '').trim();
    const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'screen';

    const parsed = await pdfParse(pdfBuffer);
    const scriptText = (parsed.text || '').trim();
    if (!scriptText) {
      return res.status(400).json({ error: 'Empty PDF or text could not be extracted' });
    }

    const result = await runExtract(scriptText, category);
    // works.full_script_text는 NOT NULL이므로 저장 단계에서 다시 필요.
    // 응답에 함께 실어 클라이언트 state에 보관 → /api/save 호출 시 다시 전송.
    return res.status(200).json({ ...result, full_script_text: scriptText });
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
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
