-- ============================================================================
--  cards.quote 일괄 정규화 — 구두점 뒤 공백을 줄바꿈으로 치환
--   대상 구두점: , ， . 。 ? ! ？ ！ …
--   기존 library.html 의 breakQuoteByBreath 로직과 동일.
--   (구두점 뒤 \n 인 경우는 매칭 안 되므로 멱등 — 재실행 안전)
--
--  Supabase SQL Editor에서 실행. 단계별 SELECT 후 UPDATE.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인 — 패턴이 매칭되는 카드 개수
select count(*) as affected_rows
  from public.cards
 where quote ~ '[,，.。?!？！…][ \t]+';

-- 2) 변경 전/후 미리보기 — 상위 5건만
select card_id,
       quote as before,
       regexp_replace(quote, '([,，.。?!？！…])[ \t]+', E'\\1\n', 'g') as after
  from public.cards
 where quote ~ '[,，.。?!？！…][ \t]+'
 limit 5;

-- 3) 실제 일괄 UPDATE — 위 결과 확인 후 실행
update public.cards
   set quote = regexp_replace(quote, '([,，.。?!？！…])[ \t]+', E'\\1\n', 'g')
 where quote ~ '[,，.。?!？！…][ \t]+';

-- 4) 결과 확인 — 더 이상 매칭되는 row 없어야 함
select count(*) as remaining_rows
  from public.cards
 where quote ~ '[,，.。?!？！]( |\t)+';
