-- Project Gutenberg 본문 캐시
-- 외부 의존 제거 — gutenberg.org 첫 다운로드 후 Supabase 에 영구 저장.
-- 이후 같은 책 요청은 Supabase 에서 즉시 (외부 호출 0).
--
-- 용량 추정:
--   평균 책 200KB plain text. 인기 상위 1000권 캐시 시 ~200MB.
--   Supabase Free tier 500MB 한도 안. 더 필요 시 Storage 로 이관.

CREATE TABLE IF NOT EXISTS public.gutenberg_book_text (
  book_id      integer PRIMARY KEY REFERENCES public.gutenberg_books(book_id) ON DELETE CASCADE,
  raw_text     text NOT NULL,
  text_length  integer NOT NULL,
  source_url   text,                                  -- 어디서 받아왔나 (디버그용)
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()     -- LRU 정리용
);

CREATE INDEX IF NOT EXISTS idx_gutenberg_book_text_last_used
  ON public.gutenberg_book_text (last_used_at);

ALTER TABLE public.gutenberg_book_text ENABLE ROW LEVEL SECURITY;

-- service_role 만 read/write (관리자 페이지 API 만 호출)
DROP POLICY IF EXISTS "service can read gutenberg_book_text" ON public.gutenberg_book_text;
DROP POLICY IF EXISTS "service can write gutenberg_book_text" ON public.gutenberg_book_text;

CREATE POLICY "service can read gutenberg_book_text"
  ON public.gutenberg_book_text FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "service can write gutenberg_book_text"
  ON public.gutenberg_book_text FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

COMMENT ON TABLE public.gutenberg_book_text IS
  'Gutenberg 책 본문(plain text) 캐시. gutenberg.org 의존을 lazy 로 제거.';
