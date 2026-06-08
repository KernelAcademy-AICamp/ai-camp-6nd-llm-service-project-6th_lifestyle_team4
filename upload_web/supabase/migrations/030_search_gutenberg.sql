-- Gutenberg 카탈로그 검색 RPC
-- gutendex.com /books?topic=<keyword> 와 같은 동작 — bookshelves + subjects 둘 다
-- ILIKE 부분 매칭으로 topic 키워드 포함된 책을 찾고 download_count 내림차순으로 반환.
--
-- 사용:
--   select * from public.search_gutenberg_by_topic('drama', 'en', 60);

CREATE OR REPLACE FUNCTION public.search_gutenberg_by_topic(
  p_topic text,
  p_lang  text DEFAULT 'en',
  p_limit integer DEFAULT 60
) RETURNS SETOF public.gutenberg_books
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT *
  FROM public.gutenberg_books
  WHERE p_lang = ANY(languages)
    AND (
      -- bookshelves 안 어느 라벨이라도 topic 키워드 포함
      EXISTS (
        SELECT 1 FROM unnest(bookshelves) bs
        WHERE bs ILIKE '%' || p_topic || '%'
      )
      -- 또는 subjects(LCSH) 안 어느 라벨이라도 topic 키워드 포함
      OR EXISTS (
        SELECT 1 FROM unnest(subjects) sb
        WHERE sb ILIKE '%' || p_topic || '%'
      )
    )
  ORDER BY download_count DESC NULLS LAST
  LIMIT p_limit;
$$;

-- service_role 만 호출 허용 (api/gutenberg-list.js 의 supabaseAdmin 클라이언트)
REVOKE ALL ON FUNCTION public.search_gutenberg_by_topic(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_gutenberg_by_topic(text, text, integer) TO service_role;

COMMENT ON FUNCTION public.search_gutenberg_by_topic IS
  'gutendex /books?topic 와 같은 동작 — gutenberg_books 의 bookshelves + subjects 에서 ILIKE 매칭, download_count 내림차순.';
