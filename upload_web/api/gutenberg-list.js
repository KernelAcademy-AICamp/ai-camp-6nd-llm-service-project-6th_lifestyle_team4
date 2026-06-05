// GET /api/gutenberg-list?category=<friendly name>
// Gutenberg 카테고리 피커가 호출. 응답: { works: [{ bookId, title, author, year, ... }], topic }
//
// 캐싱 전략 — 외부 의존(gutendex.com) 장애 대비 2단계:
//   1) Supabase gutendex_cache 캐시 — 신선(<= 24h)하면 즉시 반환 (gutendex 호출 0)
//   2) gutendex 시도 — 성공하면 캐시 갱신 + 반환
//   3) gutendex 실패하면 stale 캐시(<= 30d) fallback → stale: true 표시
//   4) 캐시도 없고 외부도 죽으면 503

import { requireAdmin, AuthError } from '../lib/auth.js';
import { listGutenbergByCategory } from '../lib/sources/gutenberg.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { HttpError, sendError } from '../lib/http.js';

export const config = {
  // gutendex 메타 호출 — fetchWithRetry 가 12s × 2 + 1s 백오프 = 최대 25s.
  // Vercel 함수 timeout 30s 로 마진 5s. 캐시 hit 시 거의 즉시.
  maxDuration: 30,
};

const FRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;        // 24h — 신선 기준
const STALE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30d — stale fallback 한계

async function readCache(category) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('gutendex_cache')
      .select('topic, payload, fetched_at')
      .eq('category', category)
      .maybeSingle();
    if (error || !data) return null;
    const ageMs = Date.now() - new Date(data.fetched_at).getTime();
    return { ...data, ageMs };
  } catch (e) {
    console.warn('[gutenberg-list] readCache failed:', e?.message || e);
    return null;
  }
}

async function writeCache(category, topic, payload) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('gutendex_cache').upsert(
      { category, topic, payload, fetched_at: new Date().toISOString() },
      { onConflict: 'category' }
    );
  } catch (e) {
    console.warn('[gutenberg-list] writeCache failed:', e?.message || e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireAdmin(req);
    const cat = String(req.query?.category || '').trim();
    if (!cat) throw new HttpError('category is required', 400);

    // 1) 신선 캐시 hit — 즉시 반환
    const cached = await readCache(cat);
    if (cached && cached.ageMs < FRESH_MAX_AGE_MS) {
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      return res.status(200).json({
        category: cat,
        topic: cached.topic,
        works: cached.payload?.works || [],
        cached: true,
        cacheAgeSec: Math.floor(cached.ageMs / 1000),
      });
    }

    // 2) gutendex 시도
    try {
      const { works, topic } = await listGutenbergByCategory(cat, 60);
      // 성공 → 캐시 갱신 (백그라운드 처리해도 되지만 await 해서 다음 사용자 즉시 혜택)
      await writeCache(cat, topic, { works });

      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      return res.status(200).json({
        category: cat,
        topic,
        works,
        cached: false,
      });
    } catch (fetchErr) {
      // 3) gutendex 실패 → stale 캐시 fallback
      if (cached && cached.ageMs < STALE_MAX_AGE_MS) {
        console.warn(
          `[gutenberg-list] gutendex 실패 → stale 캐시 fallback (age=${Math.floor(cached.ageMs / 3600_000)}h):`,
          fetchErr?.message
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          category: cat,
          topic: cached.topic,
          works: cached.payload?.works || [],
          cached: true,
          stale: true,
          cacheAgeSec: Math.floor(cached.ageMs / 1000),
          warning: 'gutendex.com 일시 장애로 캐시 데이터를 표시합니다.',
        });
      }
      // 4) 캐시도 없고 외부도 죽음 → 503
      throw fetchErr;
    }
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
