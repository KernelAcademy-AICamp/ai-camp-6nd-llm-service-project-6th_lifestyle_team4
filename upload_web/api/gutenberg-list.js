// GET /api/gutenberg-list?category=<friendly name>
// Gutenberg 카테고리 피커가 호출. 응답: { works: [{ bookId, title, author, year, ... }], topic }
//
// 캐싱 — 카테고리 결과는 자주 바뀌지 않으므로 1일(brower) + Edge cache(stale-while-revalidate).
// admin 인증만 통과시키고 별도 LLM 호출은 없음.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { listGutenbergByCategory } from '../lib/sources/gutenberg.js';
import { HttpError, sendError } from '../lib/http.js';

export const config = {
  // Gutendex 가 가끔 느림 — 60s 마진
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);
    const cat = String(req.query?.category || '').trim();
    if (!cat) throw new HttpError('category is required', 400);

    const { works, topic } = await listGutenbergByCategory(cat, 60);

    // 카테고리 결과는 거의 안 변함 → 캐싱
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    );
    return res.status(200).json({
      category: cat,
      topic,
      works,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return sendError(res, err);
    }
    console.error('[gutenberg-list] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
