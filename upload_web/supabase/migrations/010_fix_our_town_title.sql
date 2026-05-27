-- ============================================================================
--  손튼 와일더 희곡 제목 표기 정정
--   '우리읍내' → '우리 읍내' (어절 분리)
--
--  Supabase SQL Editor에서 실행. 안전하게 select로 먼저 확인 후 update 실행.
-- ============================================================================

-- 1) 영향 받을 row 미리 확인 — '우리읍내'(공백 없음)만 매칭
select work_id, title, format, author
  from public.works
 where title = '우리읍내';

-- 2) 실제 업데이트
update public.works
   set title = '우리 읍내'
 where title = '우리읍내';

-- 3) 결과 확인
select work_id, title, format, author
  from public.works
 where title = '우리 읍내';
