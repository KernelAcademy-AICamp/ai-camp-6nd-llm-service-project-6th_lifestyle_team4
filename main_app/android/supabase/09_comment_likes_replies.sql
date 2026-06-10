-- ============================================================================
--  피드 글/하이라이트 댓글에 대댓글(parent_comment_id) + 하트(좋아요) 추가.
--   - 07_feed_post_comments.sql / 08_highlight_comments.sql 의 후속 — 당시 "좋아요·답글 제외"
--     했던 범위를 PWA(web_pwa)와 동일하게 확장한다.
--   - 카드 댓글(card_comments.parent_comment_id + comment_likes)과 동일한 패턴을 피드/하이라이트로.
--   - 좋아요 테이블 PK = (comment_id, user_id) 복합키. 익명(is_anonymous) JWT는 INSERT 불가(읽기 가능).
--
--  Run once in Supabase SQL Editor. (멱등 — 재실행 안전. PWA가 이미 만들었다면 변화 없음)
-- ============================================================================

-- 1) 대댓글 컬럼 — 자기 참조. parent_comment_id null = top-level.
alter table public.feed_post_comments
  add column if not exists parent_comment_id bigint
  references public.feed_post_comments(comment_id) on delete cascade;

alter table public.card_highlight_comments
  add column if not exists parent_comment_id bigint
  references public.card_highlight_comments(comment_id) on delete cascade;

create index if not exists feed_post_comments_parent_idx
  on public.feed_post_comments (parent_comment_id);
create index if not exists card_highlight_comments_parent_idx
  on public.card_highlight_comments (parent_comment_id);

-- 2) feed_post_comment_likes — 피드 글 댓글 좋아요.
create table if not exists public.feed_post_comment_likes (
  comment_id  bigint not null references public.feed_post_comments(comment_id) on delete cascade,
  user_id     bigint not null references public.users(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.feed_post_comment_likes enable row level security;

drop policy if exists feed_post_comment_likes_select_all  on public.feed_post_comment_likes;
drop policy if exists feed_post_comment_likes_insert_self on public.feed_post_comment_likes;
drop policy if exists feed_post_comment_likes_delete_self on public.feed_post_comment_likes;

create policy feed_post_comment_likes_select_all on public.feed_post_comment_likes
  for select to anon, authenticated using (true);

create policy feed_post_comment_likes_insert_self on public.feed_post_comment_likes
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.users u
                 where u.user_id = feed_post_comment_likes.user_id
                   and u.anonymous_id = auth.uid())
  );

create policy feed_post_comment_likes_delete_self on public.feed_post_comment_likes
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = feed_post_comment_likes.user_id
                    and u.anonymous_id = auth.uid()));

-- 3) card_highlight_comment_likes — 하이라이트 댓글 좋아요.
create table if not exists public.card_highlight_comment_likes (
  comment_id  bigint not null references public.card_highlight_comments(comment_id) on delete cascade,
  user_id     bigint not null references public.users(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.card_highlight_comment_likes enable row level security;

drop policy if exists card_highlight_comment_likes_select_all  on public.card_highlight_comment_likes;
drop policy if exists card_highlight_comment_likes_insert_self on public.card_highlight_comment_likes;
drop policy if exists card_highlight_comment_likes_delete_self on public.card_highlight_comment_likes;

create policy card_highlight_comment_likes_select_all on public.card_highlight_comment_likes
  for select to anon, authenticated using (true);

create policy card_highlight_comment_likes_insert_self on public.card_highlight_comment_likes
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.users u
                 where u.user_id = card_highlight_comment_likes.user_id
                   and u.anonymous_id = auth.uid())
  );

create policy card_highlight_comment_likes_delete_self on public.card_highlight_comment_likes
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = card_highlight_comment_likes.user_id
                    and u.anonymous_id = auth.uid()));
