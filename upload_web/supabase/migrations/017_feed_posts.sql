-- ============================================================================
--  feed_posts
--   - 피드("오늘의 한줄") — 사용자가 북마크한 카드(명대사)에 300자 이내 한줄 리뷰를
--     남기면 피드에 올라간다.
--   - 익명(is_anonymous) 사용자는 작성 불가 (읽기는 가능).
--   - 작성 시점의 닉네임을 author_nickname에 스냅샷 → 닉네임 변경되어도 표시 유지.
--   - card_comments(012)와 동일한 RLS 패턴.
-- ============================================================================

create table if not exists public.feed_posts (
  post_id           bigint generated always as identity primary key,
  card_id           bigint not null references public.cards(card_id) on delete cascade,
  user_id           bigint not null references public.users(user_id) on delete cascade,
  author_nickname   text,
  body              text   not null check (char_length(trim(body)) between 1 and 300),
  created_at        timestamptz not null default now()
);

create index if not exists feed_posts_created_idx
  on public.feed_posts (created_at desc);

alter table public.feed_posts enable row level security;

drop policy if exists feed_posts_select_all  on public.feed_posts;
drop policy if exists feed_posts_insert_self on public.feed_posts;
drop policy if exists feed_posts_update_self on public.feed_posts;
drop policy if exists feed_posts_delete_self on public.feed_posts;

-- 모두 읽기 가능
create policy feed_posts_select_all on public.feed_posts
  for select to anon, authenticated
  using (true);

-- 본인 user_id 행만 INSERT, 단 익명(is_anonymous = true) JWT는 불가
create policy feed_posts_insert_self on public.feed_posts
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.users u
       where u.user_id = feed_posts.user_id
         and u.anonymous_id = auth.uid()
    )
  );

-- 본인 글만 수정/삭제
create policy feed_posts_update_self on public.feed_posts
  for update to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = feed_posts.user_id
                    and u.anonymous_id = auth.uid()))
  with check (exists (select 1 from public.users u
                       where u.user_id = feed_posts.user_id
                         and u.anonymous_id = auth.uid()));

create policy feed_posts_delete_self on public.feed_posts
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = feed_posts.user_id
                    and u.anonymous_id = auth.uid()));

-- ---- Realtime publication --------------------------------------------------
-- 다른 사용자가 올린 한줄이 실시간으로 보이게
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.feed_posts';
  exception when duplicate_object then null;
           when others then null;
  end;
end$$;
