// 외부 PD 소스에서 작품 본문(또는 후보 목록) 을 가져온다.
//
// POST /api/fetch-source  { kind, op?, title|query }
//   kind = 'wikisource_kr'  (현재 유일)
//   op   = 'search' | 'fetch'   (기본 'search'; 페이지명을 정확히 안다면 'fetch')
//
// 'search' → [{ title, description, url }, ...] (opensearch 결과)
// 'fetch'  → { title, text, length, url, categories }
//
// 추후 'gutenberg' 등 추가 시 같은 패턴으로 분기.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { HttpError, readJsonBody, sendError } from '../lib/http.js';
import { searchWikisourceKr, fetchWikisourceKrPage } from '../lib/sources/wikisource-kr.js';
import { searchGutenberg, fetchGutenbergText } from '../lib/sources/gutenberg.js';

const MAX_BODY = 8 * 1024;

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const body = await readJsonBody(req, { maxBytes: MAX_BODY });
    const kind = String(body.kind || '');
    const op = String(body.op || 'search');

    if (kind === 'wikisource_kr') {
      if (op === 'search') {
        const query = String(body.query || body.title || '').trim();
        if (!query) throw new HttpError('query (or title) required', 400);
        const results = await searchWikisourceKr(query, body.limit || 8);
        return res.status(200).json({ kind, op, query, results });
      }
      if (op === 'fetch') {
        const title = String(body.title || '').trim();
        if (!title) throw new HttpError('title required', 400);
        const r = await fetchWikisourceKrPage(title);
        return res.status(200).json({
          kind, op,
          title: r.title,
          text: r.text,
          length: r.length,
          url: r.pageUrl,
          categories: r.categories,
        });
      }
      throw new HttpError(`unknown op: ${op} (expected search | fetch)`, 400);
    }

    if (kind === 'gutenberg') {
      if (op === 'search') {
        const query = String(body.query || body.title || '').trim();
        if (!query) throw new HttpError('query (or title) required', 400);
        const results = await searchGutenberg(query, body.limit || 8);
        return res.status(200).json({ kind, op, query, results });
      }
      if (op === 'fetch') {
        const bookId = body.bookId != null
          ? Number.parseInt(String(body.bookId).replace(/^#/, ''), 10)
          : null;
        const plainTextUrl = body.plainTextUrl ? String(body.plainTextUrl) : null;
        if (!Number.isInteger(bookId) && !plainTextUrl) {
          throw new HttpError('bookId or plainTextUrl required', 400);
        }
        const r = await fetchGutenbergText({ bookId, plainTextUrl });
        return res.status(200).json({
          kind, op,
          bookId: r.bookId,
          title: r.title,
          authors: r.authors,
          languages: r.languages,
          text: r.text,
          length: r.length,
          truncated: r.truncated,
          url: r.pageUrl,
          sourceUrl: r.sourceUrl,
        });
      }
      throw new HttpError(`unknown op: ${op} (expected search | fetch)`, 400);
    }

    throw new HttpError(`unknown kind: ${kind} (supported: wikisource_kr | gutenberg)`, 400);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[fetch-source] error:', err);
    return res.status(500).json({ error: err.message || 'internal_error' });
  }
}
