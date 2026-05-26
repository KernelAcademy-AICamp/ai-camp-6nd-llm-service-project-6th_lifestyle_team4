-- ============================================================================
--  말줄임표 정규화 — '...' (3+ periods) 와 '…' (U+2026) 를 '⋯' (U+22EF) 로 통일
--   대상: cards 테이블의 텍스트 컬럼 4개
--   멱등 — 재실행 안전 ('⋯' 자체는 매칭 안 됨)
--
--  Supabase SQL Editor 에서 단계별 실행.
-- ============================================================================

-- 1) 영향 받을 row 개수 미리 확인
select
  sum(case when quote ~ '(\.{3,}|…)' then 1 else 0 end) as quote_rows,
  sum(case when script_excerpt ~ '(\.{3,}|…)' then 1 else 0 end) as excerpt_rows,
  sum(case when excerpt_description ~ '(\.{3,}|…)' then 1 else 0 end) as desc_rows,
  sum(case when significance ~ '(\.{3,}|…)' then 1 else 0 end) as sig_rows
  from public.cards;

-- 2) 미리보기 — quote 컬럼 상위 5건
select card_id,
       quote as before,
       regexp_replace(quote, '\.{3,}|…', '⋯', 'g') as after
  from public.cards
 where quote ~ '(\.{3,}|…)'
 limit 5;

-- 3) 실제 일괄 UPDATE (4개 컬럼 동시 처리)
update public.cards
   set quote               = regexp_replace(quote,               '\.{3,}|…', '⋯', 'g'),
       script_excerpt      = regexp_replace(script_excerpt,      '\.{3,}|…', '⋯', 'g'),
       excerpt_description = regexp_replace(coalesce(excerpt_description, ''), '\.{3,}|…', '⋯', 'g'),
       significance        = regexp_replace(coalesce(significance, ''),        '\.{3,}|…', '⋯', 'g')
 where quote               ~ '(\.{3,}|…)'
    or script_excerpt      ~ '(\.{3,}|…)'
    or coalesce(excerpt_description, '') ~ '(\.{3,}|…)'
    or coalesce(significance, '')        ~ '(\.{3,}|…)';

-- 4) 결과 검증 — 모두 0이어야 함
select
  sum(case when quote ~ '(\.{3,}|…)' then 1 else 0 end) as quote_remaining,
  sum(case when script_excerpt ~ '(\.{3,}|…)' then 1 else 0 end) as excerpt_remaining,
  sum(case when excerpt_description ~ '(\.{3,}|…)' then 1 else 0 end) as desc_remaining,
  sum(case when significance ~ '(\.{3,}|…)' then 1 else 0 end) as sig_remaining
  from public.cards;
