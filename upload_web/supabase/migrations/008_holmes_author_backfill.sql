-- ============================================================================
--  셜록홈즈 단편들에 작가 = '아서 코난 도일' 일괄 설정
--  사용자 앱 / 관리자 페이지가 작가로 시리즈를 인식하므로 이 백필이 필요.
--
--  Supabase SQL Editor에서 실행. 1) 확인 2) 업데이트 3) 검증 3단계.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인 — 작가가 비어있거나 다르게 들어간 셜록홈즈 단편들
select work_id, title, author, format
  from public.works
 where (
   title ilike '%셜록%' or title ilike '%홈즈%' or
   title ilike '%sherlock%' or title ilike '%holmes%' or
   title ilike '%빨간%머리%연맹%' or
   title ilike '%신랑의%정체%' or
   title ilike '%보헤미아%' or
   title ilike '%주홍색%연구%' or
   title ilike '%네 사람의 서명%' or
   title ilike '%바스커빌%' or
   title ilike '%다섯%개의 오렌지%' or
   title ilike '%푸른 카벙클%' or
   title ilike '%얼룩 끈%'
 );

-- 2) 업데이트 — author 가 비어있거나 코난 도일이 아닌 셜록홈즈 단편 전부에 작가 설정
update public.works
   set author = '아서 코난 도일'
 where (author is null or author = '' or author not ilike '%코난%도일%' and author not ilike '%conan%doyle%')
   and (
     title ilike '%셜록%' or title ilike '%홈즈%' or
     title ilike '%sherlock%' or title ilike '%holmes%' or
     title ilike '%빨간%머리%연맹%' or
     title ilike '%신랑의%정체%' or
     title ilike '%보헤미아%' or
     title ilike '%주홍색%연구%' or
     title ilike '%네 사람의 서명%' or
     title ilike '%바스커빌%' or
     title ilike '%다섯%개의 오렌지%' or
     title ilike '%푸른 카벙클%' or
     title ilike '%얼룩 끈%'
   );

-- 3) 결과 확인
select work_id, title, author, format
  from public.works
 where author ilike '%코난%도일%'
    or author ilike '%conan%doyle%';
