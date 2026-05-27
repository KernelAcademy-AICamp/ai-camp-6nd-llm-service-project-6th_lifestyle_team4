-- ============================================================================
--  '빨간 머리 연맹' / '신랑의 정체' 를 희곡(play) → 드라마(drama)로 재분류
--  (둘 다 셜록홈즈 단편 — 연극이 아닌 드라마/소설 원작이므로 카테고리 정정)
--
--  Supabase SQL Editor에서 실행. 안전하게 select로 먼저 확인하고 update 실행.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인 (실행하기 전 결과 검토)
select work_id, title, format, author
  from public.works
 where format = 'play'
   and (
     title ilike '%빨간%머리%연맹%' or
     title ilike '%신랑의 정체%' or
     title ilike '%신랑의%정체%'
   );

-- 2) 실제 업데이트 — 위 select 결과 확인 후 실행
update public.works
   set format = 'drama'
 where format = 'play'
   and (
     title ilike '%빨간%머리%연맹%' or
     title ilike '%신랑의 정체%' or
     title ilike '%신랑의%정체%'
   );

-- 3) 결과 확인
select work_id, title, format, author
  from public.works
 where title ilike '%빨간%머리%연맹%'
    or title ilike '%신랑의 정체%'
    or title ilike '%신랑의%정체%';
