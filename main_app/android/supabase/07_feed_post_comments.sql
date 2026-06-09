-- ============================================================================
--  feed_post_comments
--   - 피드("오늘의 한줄") 글 상세에서 사용자가 댓글을 단다. 글마다 독립.
--   - 익명(is_anonymous) 사용자는 댓글 작성 차단 (읽기는 가능).
--   - 작성 시점의 닉네임을 author_nickname에 스냅샷 → 닉네임 변경되어도 표시 유지.
--   - 012_card_comments.sql 의 card_comments 와 동일한 RLS 패턴(card_id→post_id).
--   - 좋아요(comment_likes)·답글(parent_comment_id)은 이번 범위에서 제외.
--
--  Run once in Supabase SQL Editor. (멱등 — 재실행 안전)
-- ============================================================================

create table if not exists public.feed_post_comments (
  comment_id        bigint generated always as identity primary key,
  post_id           bigint not null references public.feed_posts(post_id) on delete cascade,
  user_id           bigint not null references public.users(user_id) on delete cascade,
  author_nickname   text,
  body              text   not null check (char_length(trim(body)) between 1 and 500),
  created_at        timestamptz not null default now()
);

create index if not exists feed_post_comments_post_created_idx
  on public.feed_post_comments (post_id, created_at desc);

alter table public.feed_post_comments enable row level security;

drop policy if exists feed_post_comments_select_all  on public.feed_post_comments;
drop policy if exists feed_post_comments_insert_self on public.feed_post_comments;
drop policy if exists feed_post_comments_update_self on public.feed_post_comments;
drop policy if exists feed_post_comments_delete_self on public.feed_post_comments;

-- 모두 읽기 가능
create policy feed_post_comments_select_all on public.feed_post_comments
  for select to anon, authenticated
  using (true);

-- 본인 user_id 행만 INSERT, 단 익명(is_anonymous = true) JWT는 불가
create policy feed_post_comments_insert_self on public.feed_post_comments
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.users u
       where u.user_id = feed_post_comments.user_id
         and u.anonymous_id = auth.uid()
    )
  );

-- 본인 댓글만 수정/삭제
create policy feed_post_comments_update_self on public.feed_post_comments
  for update to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = feed_post_comments.user_id
                    and u.anonymous_id = auth.uid()))
  with check (exists (select 1 from public.users u
                       where u.user_id = feed_post_comments.user_id
                         and u.anonymous_id = auth.uid()));

create policy feed_post_comments_delete_self on public.feed_post_comments
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = feed_post_comments.user_id
                    and u.anonymous_id = auth.uid()));
