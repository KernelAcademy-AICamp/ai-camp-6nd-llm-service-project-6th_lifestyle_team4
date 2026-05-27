-- ============================================================================
--  work_id=17 셰익스피어 희곡 제목 표기 정정
--   '맥베드' → '맥베스' (표준 한국어 표기)
--
--  Supabase SQL Editor에서 실행. 안전하게 select로 먼저 확인 후 update 실행.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인
select work_id, title, format, author
  from public.works
 where work_id = 17;

-- 2) 실제 업데이트 — work_id=17 1건만 매칭
update public.works
   set title = '맥베스'
 where work_id = 17;

-- 3) 결과 확인
select work_id, title, format, author
  from public.works
 where work_id = 17;
