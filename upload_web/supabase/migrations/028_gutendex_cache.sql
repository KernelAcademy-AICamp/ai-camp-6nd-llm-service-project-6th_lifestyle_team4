-- Gutendex 카테고리 응답 캐시
-- 목적: gutendex.com 외부 장애 시에도 마지막 성공 응답을 stale-while-down 으로 서빙.
-- 정책: api/gutenberg-list.js 가 service_role 로만 read/write — 클라이언트 접근 불필요.

CREATE TABLE IF NOT EXISTS public.gutendex_cache (
  category    text PRIMARY KEY,
  topic       text NOT NULL,
  payload     jsonb NOT NULL,           -- { works: [...] }
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gutendex_cache_fetched_at
  ON public.gutendex_cache (fetched_at DESC);

ALTER TABLE public.gutendex_cache ENABLE ROW LEVEL SECURITY;

-- RLS — service_role 만 쓰기/읽기. 일반 사용자/anon 차단.
DROP POLICY IF EXISTS "service can read gutendex_cache" ON public.gutendex_cache;
DROP POLICY IF EXISTS "service can write gutendex_cache" ON public.gutendex_cache;

CREATE POLICY "service can read gutendex_cache"
  ON public.gutendex_cache FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "service can write gutendex_cache"
  ON public.gutendex_cache FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

COMMENT ON TABLE public.gutendex_cache IS
  '카테고리별 gutendex.com /books 응답 캐시. 외부 장애 시 stale fallback.';
