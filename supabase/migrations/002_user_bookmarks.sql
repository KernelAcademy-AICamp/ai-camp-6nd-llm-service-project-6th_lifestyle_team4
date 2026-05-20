-- ============================================================================
-- 002_user_bookmarks.sql
-- 카드 북마크 = "컬렉션에 추가". 현재 1번 스키마에는 없는 테이블이므로 추가.
-- ============================================================================

create table if not exists user_bookmarks (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  card_id    bigint not null references cards(card_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists idx_user_bookmarks_user_time
  on user_bookmarks(user_id, created_at desc);

alter table user_bookmarks enable row level security;

drop policy if exists "read own bookmarks"  on user_bookmarks;
drop policy if exists "insert own bookmark" on user_bookmarks;
drop policy if exists "delete own bookmark" on user_bookmarks;

create policy "read own bookmarks"  on user_bookmarks
  for select using (auth.uid() = user_id);

create policy "insert own bookmark" on user_bookmarks
  for insert with check (auth.uid() = user_id);

create policy "delete own bookmark" on user_bookmarks
  for delete using (auth.uid() = user_id);
