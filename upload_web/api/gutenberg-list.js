// GET /api/gutenberg-list?category=<friendly name>
// Gutenberg 카테고리 피커가 호출. 응답: { works: [{ bookId, title, author, year, ... }], topic }
//
// 캐싱 — 카테고리 결과는 자주 바뀌지 않으므로 1일(brower) + Edge cache(stale-while-revalidate).
// admin 인증만 통과시키고 별도 LLM 호출은 없음.

import { requireAdmin, AuthError } from '../lib/auth.js';
import { listGutenbergByCategory } from '../lib/sources/gutenberg.js';
import { HttpError, sendError } from '../lib/http.js';

export const config = {
  // Gutendex 메타 호출 — fetchWithRetry 가 12s × 2 + 1s 백오프 = 최대 25s 안에 끝남.
  // Vercel 함수 timeout 은 30s 로 마진 5s. 이걸 넘기면 504 → 사용자에게 친절한 에러로 변환.
  maxDuration: 30,
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
    // gutendex 502 (응답 없음) 는 사용자에게 친절한 메시지로
    if (err?.status === 502 || /연결 실패|응답 없음/.test(err?.message || '')) {
      return res.status(503).json({
        error: 'Gutenberg 카탈로그(gutendex.com) 가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
