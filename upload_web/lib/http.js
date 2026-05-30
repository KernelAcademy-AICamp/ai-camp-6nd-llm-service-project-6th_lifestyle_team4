export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(req, { maxBytes = 1024 * 1024 } = {}) {
  const limit = maxBytes > 0 ? maxBytes : Number.POSITIVE_INFINITY;
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (contentLength > limit) {
    throw new HttpError('Request body is too large', 413);
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return parseJson(req.body);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      throw new HttpError('Request body is too large', 413);
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? parseJson(raw) : {};
}

function parseJson(raw) {
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError('JSON object body is required', 400);
    }
    return body;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError('Malformed JSON body', 400);
  }
}

export function sendError(res, err, fallbackStatus = 500) {
  const status = err?.status || fallbackStatus;
  return res.status(status).json({ error: err?.message || 'Internal error' });
}
