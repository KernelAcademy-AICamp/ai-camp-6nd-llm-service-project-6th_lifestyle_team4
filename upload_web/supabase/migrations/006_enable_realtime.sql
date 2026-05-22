-- ============================================================================
--  사용자 앱(/m/) 실시간 동기화 활성화
--  - 관리자가 cards/works/user_bookmarks 수정 시 사용자 앱에 즉시 반영
--  - Supabase 'supabase_realtime' publication에 테이블을 추가
--
--  실행: Supabase SQL Editor에서 한 번만 실행 (재실행 안전)
-- ============================================================================

-- supabase_realtime publication에 테이블 추가
-- (이미 있으면 무시되도록 DO 블록으로 감쌈)

do $$
begin
  begin
    alter publication supabase_realtime add table public.cards;
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.works;
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.user_bookmarks;
  exception when duplicate_object then null;
  end;
end $$;

-- 확인:
--   select schemaname, tablename from pg_publication_tables
--    where pubname = 'supabase_realtime'
--      and tablename in ('cards','works','user_bookmarks');
