-- Gutenberg 작품명 검색 RPC
-- title ILIKE 부분 매칭 + download_count 내림차순, 자동완성용.
--
-- 사용:
--   select * from public.search_gutenberg_by_title('hamlet', 'en', 10);

CREATE OR REPLACE FUNCTION public.search_gutenberg_by_title(
  p_query text,
  p_lang  text DEFAULT 'en',
  p_limit integer DEFAULT 10
) RETURNS SETOF public.gutenberg_books
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT *
  FROM public.gutenberg_books
  WHERE p_lang = ANY(languages)
    AND title ILIKE '%' || p_query || '%'
  ORDER BY
    -- 정확 일치 우선
    CASE WHEN lower(title) = lower(p_query) THEN 0 ELSE 1 END,
    -- 그 다음 prefix 매칭
    CASE WHEN lower(title) LIKE lower(p_query) || '%' THEN 0 ELSE 1 END,
    -- 마지막으로 인기도
    download_count DESC NULLS LAST
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.search_gutenberg_by_title(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_gutenberg_by_title(text, text, integer) TO service_role;

COMMENT ON FUNCTION public.search_gutenberg_by_title IS
  '작품명 ILIKE 부분 매칭. 정확 일치 > prefix 매칭 > download_count 순.';
