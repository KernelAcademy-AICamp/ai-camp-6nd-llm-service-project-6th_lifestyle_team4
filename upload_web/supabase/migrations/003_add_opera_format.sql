-- ============================================================================
--  work_format enum 에 'opera' 추가
--  - 기존: movie | drama | play | musical
--  - 변경: movie | drama | play | musical | opera
--
--  적용 방법 (Supabase Dashboard → SQL Editor):
--    1) 아래 ALTER TYPE 문 실행
--    2) (선택) 기존 musical 로 잘못 저장된 오페라 작품을 opera 로 일괄 변경하려면
--       하단 UPDATE 문의 WHERE 조건을 작품 제목 등으로 좁혀 실행
-- ============================================================================

-- Postgres: ADD VALUE 는 트랜잭션 안에서 실행되면 같은 트랜잭션에서 즉시 사용
-- 할 수 없으므로, 마이그레이션 도구가 트랜잭션을 자동으로 감싼다면
-- 'COMMIT;' 을 먼저 부르거나 ADD VALUE 문만 별도로 실행하세요.
ALTER TYPE work_format ADD VALUE IF NOT EXISTS 'opera';


-- ============================================================================
--  (선택) 기존 오페라 작품 마이그레이션 예시
--  - 리골레토 / 라 트라비아타 / 카르멘 등 musical 로 저장된 오페라를 opera 로
--  - 실제 작품 목록은 본인 DB의 works 테이블을 확인해 WHERE 조건을 좁힐 것
-- ============================================================================
-- UPDATE public.works
--   SET format = 'opera'
--   WHERE format = 'musical'
--     AND title IN ('리골레토', '라 트라비아타', '카르멘', '돈 조반니', '라 보엠');
