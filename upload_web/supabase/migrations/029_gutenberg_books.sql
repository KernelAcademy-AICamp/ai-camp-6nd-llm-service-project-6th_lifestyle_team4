-- Project Gutenberg 카탈로그 로컬 인덱스
-- 목적: gutendex.com 외부 의존 제거. Gutenberg 공식 RDF dump 를 파싱해서
--       우리 Supabase 에 인덱싱 → API 가 외부 호출 없이 자체 데이터로 응답.
-- 갱신: 월 1회 정도 scripts/import-gutenberg.mjs 재실행 (upsert).

CREATE TABLE IF NOT EXISTS public.gutenberg_books (
  book_id          integer PRIMARY KEY,                  -- Gutenberg ebook ID
  title            text NOT NULL,
  subtitle         text,
  authors          text[] NOT NULL DEFAULT '{}',         -- 작가명 배열 (보통 1명)
  author_birth     integer,                              -- 첫 작가 birth_year
  author_death     integer,                              -- 첫 작가 death_year
  languages        text[] NOT NULL DEFAULT '{}',         -- ISO 639-1 (예: 'en', 'ko')
  subjects         text[] NOT NULL DEFAULT '{}',         -- LCSH subject headings
  bookshelves      text[] NOT NULL DEFAULT '{}',         -- Gutenberg bookshelf 라벨
  text_url         text,                                 -- text/plain UTF-8 URL (없으면 null)
  download_count   integer NOT NULL DEFAULT 0,           -- 인기도 정렬용
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- GIN 인덱스 — bookshelves/subjects/languages 배열 검색 빠르게
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_bookshelves ON public.gutenberg_books USING gin (bookshelves);
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_subjects ON public.gutenberg_books USING gin (subjects);
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_languages ON public.gutenberg_books USING gin (languages);
-- 인기도 정렬용 BTREE
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_download_count ON public.gutenberg_books (download_count DESC);
-- 작가 검색
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_authors ON public.gutenberg_books USING gin (authors);
-- title 검색 — pg_trgm 으로 fuzzy 검색 가능 (선택)
CREATE INDEX IF NOT EXISTS idx_gutenberg_books_title_lower ON public.gutenberg_books (lower(title));

ALTER TABLE public.gutenberg_books ENABLE ROW LEVEL SECURITY;

-- RLS — service_role 만 write. read 는 service_role 만 (관리자 페이지에서만 사용).
DROP POLICY IF EXISTS "service can read gutenberg_books" ON public.gutenberg_books;
DROP POLICY IF EXISTS "service can write gutenberg_books" ON public.gutenberg_books;

CREATE POLICY "service can read gutenberg_books"
  ON public.gutenberg_books FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "service can write gutenberg_books"
  ON public.gutenberg_books FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

COMMENT ON TABLE public.gutenberg_books IS
  'Project Gutenberg 카탈로그 로컬 인덱스. RDF dump 에서 import. gutendex.com 의존 제거.';
