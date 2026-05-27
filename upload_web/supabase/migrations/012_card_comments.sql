-- ============================================================================
--  card_comments + comment_likes
--   - 카드(명대사) 디테일에서 사용자가 댓글을 달고, 다른 사용자가 하트로 반응.
--   - 익명(is_anonymous) 사용자는 댓글 작성 / 하트 모두 차단 (읽기는 가능).
--   - 댓글 작성 시점의 닉네임을 author_nickname에 스냅샷 → 작성자 닉네임 변경되어도
--     댓글 표시는 그대로. (RLS 거치지 않고 join 없이 닉네임 표시 가능)
-- ============================================================================

-- ---- card_comments ---------------------------------------------------------
create table if not exists public.card_comments (
  comment_id        bigint generated always as identity primary key,
  card_id           bigint not null references public.cards(card_id) on delete cascade,
  user_id           bigint not null references public.users(user_id) on delete cascade,
  author_nickname   text,
  body              text   not null check (char_length(trim(body)) between 1 and 500),
  created_at        timestamptz not null default now()
);

create index if not exists card_comments_card_created_idx
  on public.card_comments (card_id, created_at desc);

alter table public.card_comments enable row level security;

drop policy if exists card_comments_select_all     on public.card_comments;
drop policy if exists card_comments_insert_self    on public.card_comments;
drop policy if exists card_comments_update_self    on public.card_comments;
drop policy if exists card_comments_delete_self    on public.card_comments;

-- 모두 읽기 가능
create policy card_comments_select_all on public.card_comments
  for select to anon, authenticated
  using (true);

-- 본인 user_id 행만 INSERT, 단 익명(is_anonymous = true) JWT는 불가
create policy card_comments_insert_self on public.card_comments
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.users u
       where u.user_id = card_comments.user_id
         and u.anonymous_id = auth.uid()
    )
  );

-- 본인 댓글만 수정/삭제
create policy card_comments_update_self on public.card_comments
  for update to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = card_comments.user_id
                    and u.anonymous_id = auth.uid()))
  with check (exists (select 1 from public.users u
                       where u.user_id = card_comments.user_id
                         and u.anonymous_id = auth.uid()));

create policy card_comments_delete_self on public.card_comments
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = card_comments.user_id
                    and u.anonymous_id = auth.uid()));

-- ---- comment_likes ---------------------------------------------------------
create table if not exists public.comment_likes (
  comment_id  bigint not null references public.card_comments(comment_id) on delete cascade,
  user_id     bigint not null references public.users(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_user_idx
  on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

drop policy if exists comment_likes_select_all  on public.comment_likes;
drop policy if exists comment_likes_insert_self on public.comment_likes;
drop policy if exists comment_likes_delete_self on public.comment_likes;

create policy comment_likes_select_all on public.comment_likes
  for select to anon, authenticated
  using (true);

create policy comment_likes_insert_self on public.comment_likes
  for insert to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.users u
       where u.user_id = comment_likes.user_id
         and u.anonymous_id = auth.uid()
    )
  );

create policy comment_likes_delete_self on public.comment_likes
  for delete to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = comment_likes.user_id
                    and u.anonymous_id = auth.uid()));

-- ---- Realtime publication --------------------------------------------------
-- 댓글 / 하트는 다른 사용자가 실시간으로 보이게
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.card_comments';
  exception when duplicate_object then null;
           when others then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.comment_likes';
  exception when duplicate_object then null;
           when others then null;
  end;
end$$;
