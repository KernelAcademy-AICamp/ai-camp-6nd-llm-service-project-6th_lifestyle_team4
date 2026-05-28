-- ============================================================================
--  work_format enum 에 'novel', 'poem', 'essay' 추가
--  - 기존: movie | drama | play | musical | opera
--  - 변경: movie | drama | play | musical | opera | novel | poem | essay
--
--  배경:
--   - 1a9caad 커밋에서 literature(소설/시/에세이) 추출 카테고리가 추가되며
--     프롬프트가 novel/poem/essay 를 work.format 으로 반환하지만,
--     DB enum에는 이 값들이 없어 저장 시
--     'invalid input value for enum work_format: "novel"' 로 실패함.
--
--  적용 방법 (Supabase Dashboard → SQL Editor):
--    아래 ALTER TYPE 문들을 (한 줄씩 또는 전체) 실행.
-- ============================================================================

-- Postgres: ADD VALUE 는 트랜잭션 안에서 실행되면 같은 트랜잭션에서 즉시 사용할 수
-- 없으므로, 마이그레이션 도구가 트랜잭션을 자동으로 감싼다면 'COMMIT;' 을 먼저
-- 부르거나 ADD VALUE 문만 별도로 실행하세요.
ALTER TYPE work_format ADD VALUE IF NOT EXISTS 'novel';
ALTER TYPE work_format ADD VALUE IF NOT EXISTS 'poem';
ALTER TYPE work_format ADD VALUE IF NOT EXISTS 'essay';
