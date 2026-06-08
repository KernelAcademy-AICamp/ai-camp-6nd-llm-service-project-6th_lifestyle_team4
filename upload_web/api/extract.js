import Busboy from 'busboy';

import { requireAdmin, AuthError } from '../lib/auth.js';
import { runExtract } from '../lib/anthropic.js';
import { extractText } from '../lib/parse-document.js';
import { fetchQuoteSeeds, formatSeedBlock } from '../lib/quotes/index.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';

export const config = {
  api: { bodyParser: false },
  // Vercel 300s 한도 안에서 끝나도록 청크 병렬 처리 6 동시 (lib/anthropic.js).
  // 1MB 본문 (~20 청크) 도 4 라운드 × 30~60초 = 120~240초로 안전.
  maxDuration: 300,
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_LABEL_MB = Math.ceil(MAX_UPLOAD_BYTES / 1024 / 1024);

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers?.['content-length'] || 0);
    if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
      reject(new HttpError(`Uploaded file is too large (max ${MAX_UPLOAD_LABEL_MB}MB)`, 413));
      return;
    }

    let bb;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fields: 5,
          parts: 8,
          fieldSize: 4 * 1024,
          fileSize: MAX_UPLOAD_BYTES,
        },
      });
    } catch {
      reject(new HttpError('multipart/form-data request is required', 400));
      return;
    }
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
    bb.on('filesLimit', () => reject(new HttpError('Only one file can be uploaded', 400)));
    bb.on('fieldsLimit', () => reject(new HttpError('Too many form fields', 400)));
    bb.on('partsLimit', () => reject(new HttpError('Too many multipart fields', 400)));
    bb.on('finish', () => {
      if (tooLarge) return reject(new HttpError(`Uploaded file is too large (max ${MAX_UPLOAD_LABEL_MB}MB)`, 413));
      if (!fileBuffer) return reject(new HttpError('Uploaded file is required', 400));
      resolve({ file: fileBuffer, filename, mimetype, fields });
    });

    req.pipe(bb);
  });
}

const ALLOWED_CATEGORIES = new Set(['screen', 'opera', 'play', 'novel', 'poem', 'essay', 'prose']);

// V2: 클라이언트가 Accept: application/x-ndjson 으로 요청하면 진행 이벤트를 NDJSON 으로 stream.
// 클라이언트 연결이 끊기면 (사용자가 [중단] 클릭) AbortSignal 이 LLM 호출까지 전파되어 실제 중단.
const NDJSON_TYPE = 'application/x-ndjson';

function wantsStream(req) {
  const accept = String(req.headers?.accept || '');
  return accept.includes(NDJSON_TYPE);
}

function attachAbortFromReq(req) {
  // Vercel function 의 req 는 IncomingMessage — 'close' 이벤트가 클라이언트 연결 종료시 발생.
  const ctrl = new AbortController();
  const onClose = () => {
    if (!ctrl.signal.aborted) {
      console.log('[extract] client disconnected, aborting');
      ctrl.abort();
    }
  };
  req.on?.('close', onClose);
  // (정리는 핸들러 finally 에서)
  ctrl._unwire = () => req.off?.('close', onClose);
  return ctrl;
}

function makeStreamWriter(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', `${NDJSON_TYPE}; charset=utf-8`);
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx/proxy 가 버퍼링하지 않도록
  res.flushHeaders?.();

  const write = (event) => {
    try {
      res.write(JSON.stringify(event) + '\n');
      // node res 는 stream.Writable — push 후 즉시 flush 되도록
      res.flush?.();
    } catch (e) {
      console.warn('[extract] stream write failed:', e?.message || e);
    }
  };

  // Vercel 엣지 프록시 / HTTPS 미들박스가 작은 chunk 를 버퍼링하는 문제 회피 —
  // 초기에 ~4KB padding 을 한 번 흘려보내 client 가 응답 처리를 즉시 시작하게 한다.
  // padding 은 ping 이벤트의 __pad 필드에 실어 한 줄 유효 JSON 으로 유지.
  // 클라이언트는 t:'ping' 을 silently 무시.
  write({ t: 'ping', __pad: 'x'.repeat(4000) });

  return write;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const streaming = wantsStream(req);
  const abortCtrl = attachAbortFromReq(req);
  const signal = abortCtrl.signal;
  const writeEvent = streaming ? makeStreamWriter(res) : null;
  const emit = (event) => {
    if (streaming && writeEvent) writeEvent(event);
  };

  try {
    await requireAdmin(req);

    // 입력 두 가지 형태:
    //  (1) multipart/form-data  — 파일 업로드 (PDF/DOCX/HWP/TXT). 기존 경로.
    //  (2) application/json     — { text, category, model, title } —
    //      Wikisource KR / Gutenberg 등 외부 PD 소스에서 이미 추출된 본문.
    const contentType = String(req.headers?.['content-type'] || '');
    let scriptText = '';
    let category = 'screen';
    let titleHint = '';
    let modelKey = '';

    if (contentType.includes('application/json')) {
      emit({ t: 'stage', m: '입력 JSON 수신 중' });
      const body = await readJsonBody(req, { maxBytes: 8 * 1024 * 1024 });
      scriptText = String(body.text || '').trim();
      const rawCategory = String(body.category || '').trim();
      category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'screen';
      titleHint = String(body.title || '').trim().slice(0, 200);
      modelKey = String(body.model || '').trim().toLowerCase();
      if (!scriptText) {
        throw new HttpError('text is required (application/json body)', 400);
      }
    } else {
      emit({ t: 'stage', m: '파일 업로드 받는 중' });
      const { file: fileBuffer, filename, mimetype, fields } = await readMultipart(req);
      const rawCategory = (fields.category || '').trim();
      category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'screen';
      titleHint = (fields.title || '').trim().slice(0, 200);
      // AI 모델 ('haiku' | 'sonnet' | 'opus'). 잘못된 값은 anthropic.js 에서 fallback.
      modelKey = (fields.model || '').trim().toLowerCase();

      emit({ t: 'stage', m: `파일 텍스트 추출 중 (${filename})` });
      const extracted = await extractText(fileBuffer, filename, mimetype);
      scriptText = (extracted || '').trim();
      if (!scriptText) {
        throw new HttpError('Could not extract text from the file. Scanned PDFs may need OCR first.', 400);
      }
    }
    emit({ t: 'log', m: `본문 ${scriptText.length.toLocaleString()}자 준비됨` });

    // 폼에서 작품명을 받았으면 웹(Wikiquote 다국어 + 나무위키)에서 명대사 시드를 끌어와
    // LLM 프롬프트에 우선 검토 대상으로 주입한다. 시드가 비면 기존 동작 그대로.
    let seedBlock = '';
    let seedDebug = null;
    if (titleHint) {
      emit({ t: 'stage', m: `웹에서 "${titleHint}" 명대사 시드 가져오는 중` });
      try {
        const { quotes, debug } = await fetchQuoteSeeds(titleHint, category);
        seedBlock = formatSeedBlock(titleHint, quotes);
        seedDebug = { count: quotes.length, ...debug };
        if (quotes.length) {
          console.log(`[extract] quote seeds for "${titleHint}": ${quotes.length}개`, debug);
          emit({ t: 'log', m: `시드 ${quotes.length}개 받음` });
        } else {
          console.log(`[extract] no quote seeds for "${titleHint}"`, debug);
          emit({ t: 'log', m: '시드 없음 (본문만으로 추출 진행)' });
        }
      } catch (e) {
        console.warn('[extract] fetchQuoteSeeds 실패, 시드 없이 진행:', e.message);
        emit({ t: 'log', m: `시드 실패 — 본문만으로 추출 진행 (${e?.message || e})` });
      }
    }

    emit({ t: 'stage', m: `LLM 으로 카드 추출 시작 (모델: ${modelKey || 'haiku'})` });
    // partial_result 이벤트에는 full_script_text + seed debug 도 같이 실어 보낸다 — save.js
    // 가 full_script_text 필요 + 디버깅 정보 보존.
    const onProgressForRun = (event) => {
      if (event?.t === 'partial_result' && event.d && typeof event.d === 'object') {
        emit({
          ...event,
          d: { ...event.d, full_script_text: scriptText, _seed_debug: seedDebug },
        });
        return;
      }
      emit(event);
    };
    const result = await runExtract(scriptText, category, seedBlock, modelKey, {
      signal,
      onProgress: onProgressForRun,
    });
    const { __chunked, __validation, ...extractPayload } = result || {};
    const cardCount = Array.isArray(extractPayload.cards) ? extractPayload.cards.length : 0;
    emit({ t: 'log', m: `카드 ${cardCount}장 추출됨` });
    if (__validation) {
      if (__validation.rescued) {
        const fb = __validation.unrescuable ? ` (그중 ${__validation.unrescuable}장은 명대사 위치 못 찾아 본문 임의 청크로 대체 — 검토에서 위치 확인)` : '';
        emit({ t: 'log', m: `자동 복구: 짧거나 중복된 대본 발췌 ${__validation.rescued}장 보완${fb}` });
      }
      if (__validation.dropped_identical) {
        emit({ t: 'log', m: `검증: 명대사=대본 발췌 중복 ${__validation.dropped_identical}장 제거됨 (복구 실패)` });
      }
      if (__validation.dropped_short) {
        emit({ t: 'log', m: `검증: 대본 발췌 ${__validation.min_chars}자 미달 ${__validation.dropped_short}장 제거됨 (복구 실패)` });
      }
      if (__validation.dropped_incomplete) {
        emit({ t: 'log', m: `검증: 불완전한 문장 (잘린 단어/문장) ${__validation.dropped_incomplete}장 제거됨` });
      }
      if (__validation.safety_fallback) {
        emit({ t: 'log', m: `⚠ 길이 미달 카드 90% 이상 — LLM 이 짧게만 추출. 보존하니 검토에서 확인하세요` });
      }
    }

    // works.full_script_text는 NOT NULL이므로 저장 단계에서 다시 필요.
    // 응답에 함께 실어 클라이언트 state에 보관 → /api/save 호출 시 다시 전송.
    const responseBody = {
      ...extractPayload,
      full_script_text: scriptText,
      _seed_debug: seedDebug,
      _chunked: __chunked || undefined,
    };

    if (streaming) {
      emit({ t: 'result', d: responseBody });
      res.end();
      return;
    }
    return res.status(200).json(responseBody);
  } catch (err) {
    // Streaming 모드 응답 공통화 — 200 이 이미 나갔으므로 상태 코드 못 바꿈, error 이벤트만 emit.
    const sendErr = (status, message) => {
      if (streaming) {
        emit({ t: 'error', status, m: message });
        try { res.end(); } catch { /* noop */ }
        return;
      }
      res.status(status).json({ error: message });
    };

    // 사용자가 중단한 경우 — 에러 X, abort 이벤트 1번 emit 하고 끝.
    if (err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''))) {
      console.log('[extract] aborted');
      if (streaming) {
        emit({ t: 'aborted' });
        try { res.end(); } catch { /* noop */ }
      } else {
        res.status(499).json({ error: 'aborted' });
      }
      return;
    }

    if (err instanceof AuthError) {
      return sendErr(err.status || 401, err.message);
    }
    if (err instanceof HttpError) {
      if (streaming) return sendErr(err.status || 400, err.message);
      return sendError(res, err);
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
      return sendErr(402, `Anthropic API 사용량 한도에 도달했습니다${when}. Anthropic Console → Settings → Limits 에서 한도를 올려주세요.`);
    }
    // 1.5) 입력 길이 초과 — chunk target이 현재 모델에 비해 너무 크면 발생할 수 있다.
    if (/prompt is too long|tokens.*maximum|maximum.*tokens/i.test(msg)) {
      return sendErr(413, '대본 chunk가 모델 입력 한도를 넘었어요. 코드의 chunk 기준 글자 수를 더 작게 낮춰 다시 시도해주세요.');
    }
    // 2) 모델이 존재하지 않거나 사용 권한 없음 (404 / 400 + not_found / 403)
    //    사용자 계정에 Sonnet/Opus 액세스가 없을 때 흔히 발생.
    if (status === 404 || status === 403 ||
        /not[_ ]?found|invalid.*model|does not exist|don.?t have access/i.test(msg)) {
      return sendErr(400, `선택한 모델${modelTag}을(를) 사용할 수 없습니다. 계정에 해당 모델 액세스 권한이 없거나 모델 ID 가 변경됐을 수 있습니다. Haiku 로 다시 시도해보세요.`);
    }
    // 3) 일시 과부하·레이트리밋
    if (status === 529 || status === 429) {
      return sendErr(503, `Anthropic API${modelTag}가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.`);
    }
    // 4) 타임아웃
    if (err?.code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
      return sendErr(504, `LLM 응답 대기 시간이 너무 깁니다${modelTag}. 파일이 너무 길거나 모델이 느려진 상태일 수 있습니다. 잠시 후 다시 시도해주세요.`);
    }
    // 5) 그 외 — status 와 모델을 메시지에 노출해 디버깅 도움
    return sendErr(500, `추출 실패${modelTag}${status ? ` (status ${status})` : ''}: ${msg || 'Internal error'}`);
  } finally {
    abortCtrl._unwire?.();
  }
}
