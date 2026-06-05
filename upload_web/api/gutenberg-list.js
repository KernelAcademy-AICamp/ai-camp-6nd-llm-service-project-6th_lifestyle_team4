// GET /api/gutenberg-list?category=<friendly name>
// Gutenberg 카테고리 피커가 호출. 응답: { works: [{ bookId, title, author, year, ... }], topic }
//
// 캐싱 전략 (외부 의존 gutendex.com 장애 대비):
//   0) public/gutendex-cache/<id>.json 정적 캐시 — 빌드 시점에 prefetch 한 데이터.
//      한 번 받으면 영구. 외부 장애와 무관하게 즉시 응답.
//   1) Supabase gutendex_cache 신선(<= 24h) — gutendex 호출 0
//   2) gutendex 시도 → 성공이면 Supabase 캐시 갱신 + 반환
//   3) gutendex 실패 → Supabase stale 캐시(<= 30d) fallback
//   4) 정적 캐시라도 있으면 stale 표시로 반환
//   5) 다 없으면 503

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAdmin, AuthError } from '../lib/auth.js';
import { listGutenbergByCategory } from '../lib/sources/gutenberg.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { HttpError, sendError } from '../lib/http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_CACHE_DIR = resolve(__dirname, '..', 'public', 'gutendex-cache');

export const config = {
  maxDuration: 30,
};

const FRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STALE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function categoryToFilename(cat) {
  return String(cat).toLowerCase()
    .replace(/[\/,]/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '.json';
}

async function readStaticCache(category) {
  try {
    const fname = categoryToFilename(category);
    const buf = await readFile(resolve(STATIC_CACHE_DIR, fname), 'utf8');
    const j = JSON.parse(buf);
    if (!Array.isArray(j?.works) || j.works.length === 0) return null;
    return { topic: j.topic || '', works: j.works };
  } catch {
    return null;
  }
}

async function readSupabaseCache(category) {
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
    console.warn('[gutenberg-list] readSupabaseCache failed:', e?.message || e);
    return null;
  }
}

async function writeSupabaseCache(category, topic, payload) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('gutendex_cache').upsert(
      { category, topic, payload, fetched_at: new Date().toISOString() },
      { onConflict: 'category' }
    );
  } catch (e) {
    console.warn('[gutenberg-list] writeSupabaseCache failed:', e?.message || e);
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

    // 0) 정적 캐시 hit — 빌드에 포함된 prefetch 데이터. 외부 의존 0, 즉시 응답.
    const staticHit = await readStaticCache(cat);

    // 1) Supabase 신선 캐시 — 24h 이내 성공 응답
    const fresh = await readSupabaseCache(cat);
    if (fresh && fresh.ageMs < FRESH_MAX_AGE_MS) {
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({
        category: cat,
        topic: fresh.topic,
        works: fresh.payload?.works || [],
        cached: true,
        cacheAgeSec: Math.floor(fresh.ageMs / 1000),
        source: 'supabase',
      });
    }

    // 2) gutendex 시도
    try {
      const { works, topic } = await listGutenbergByCategory(cat, 60);
      await writeSupabaseCache(cat, topic, { works });
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({
        category: cat,
        topic,
        works,
        cached: false,
        source: 'gutendex',
      });
    } catch (fetchErr) {
      // 3) Supabase stale 캐시
      if (fresh && fresh.ageMs < STALE_MAX_AGE_MS) {
        console.warn(
          `[gutenberg-list] gutendex 실패 → Supabase stale fallback (age=${Math.floor(fresh.ageMs / 3600_000)}h):`,
          fetchErr?.message
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          category: cat,
          topic: fresh.topic,
          works: fresh.payload?.works || [],
          cached: true,
          stale: true,
          cacheAgeSec: Math.floor(fresh.ageMs / 1000),
          source: 'supabase-stale',
          warning: 'gutendex.com 일시 장애로 캐시 데이터를 표시합니다.',
        });
      }
      // 4) 정적 캐시 fallback — 빌드 시점 데이터지만 정확함
      if (staticHit) {
        console.warn(`[gutenberg-list] gutendex 실패 → 정적 캐시 fallback:`, fetchErr?.message);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          category: cat,
          topic: staticHit.topic,
          works: staticHit.works,
          cached: true,
          stale: true,
          source: 'static',
          warning: 'gutendex.com 일시 장애로 사전 캐시 데이터를 표시합니다.',
        });
      }
      // 5) 다 없음 → 503
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
    if (err?.status === 502 || /연결 실패|응답 없음/.test(err?.message || '')) {
      return res.status(503).json({
        error: 'Gutenberg 카탈로그(gutendex.com) 가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
