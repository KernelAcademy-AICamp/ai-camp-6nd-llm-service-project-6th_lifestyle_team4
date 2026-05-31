-- ============================================================================
--  work_format enum 에 'prose'(산문) 추가
--  - 기존: movie | drama | play | musical | opera | novel | poem | essay
--  - 변경: ... | novel | poem | essay | prose
--
--  배경:
--   - 소설(novel)·에세이(essay)·시(poem) 외의 '기타 일반 산문'
--     (산문시·콩트·편지·일기·잡문 등 짧은 산문 글)을 별도 카테고리로 추가하며,
--     추출 프롬프트가 work.format 으로 'prose' 를 반환한다.
--   - DB enum에 이 값이 없으면 저장 시
--     'invalid input value for enum work_format: "prose"' 로 실패하므로 추가한다.
--
--  적용 방법 (Supabase Dashboard → SQL Editor):
--    아래 ALTER TYPE 문을 실행.
-- ============================================================================

-- Postgres: ADD VALUE 는 트랜잭션 안에서 실행되면 같은 트랜잭션에서 즉시 사용할 수
-- 없으므로, 마이그레이션 도구가 트랜잭션을 자동으로 감싼다면 'COMMIT;' 을 먼저
-- 부르거나 ADD VALUE 문만 별도로 실행하세요.
ALTER TYPE work_format ADD VALUE IF NOT EXISTS 'prose';
