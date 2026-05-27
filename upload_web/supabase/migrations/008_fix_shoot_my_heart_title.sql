-- ============================================================================
--  work_id=19 ('내심장을쏴라' 영화) 메타데이터 정정
--   1) 제목 띄어쓰기: '내심장을쏴라' → '내 심장을 쏴라'
--   2) author: '이준익' → '' (이준익은 감독, 원작 작가 아님)
--
--  Supabase SQL Editor에서 실행. 안전하게 select로 먼저 확인 후 update 실행.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인
select work_id, title, format, author
  from public.works
 where work_id = 19;

-- 2) 실제 업데이트 — work_id=19 1건만 매칭
update public.works
   set title = '내 심장을 쏴라',
       author = ''
 where work_id = 19;

-- 3) 결과 확인
select work_id, title, format, author
  from public.works
 where work_id = 19;
