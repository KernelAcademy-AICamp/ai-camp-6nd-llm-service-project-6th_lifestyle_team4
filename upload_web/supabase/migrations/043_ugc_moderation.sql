-- ============================================================================
--  043_ugc_moderation.sql — UGC 신고(report) + 사용자 차단(block)
--   App Store 심사 가이드라인 1.2(사용자 생성 콘텐츠) 준수:
--     · 부적절한 콘텐츠 신고 수단 (content_reports)
--     · 학대 사용자 차단 수단 (user_blocks)
--   콘텐츠 테이블(feed_posts/card_comments/card_highlights/*_comments)은 모두
--   bigint PK(post_id/comment_id/highlight_id)를 쓰므로, content_type + content_id
--   조합으로 어떤 테이블의 어떤 행인지 식별한다.
--   사용자 식별은 기존 패턴과 동일하게 users.anonymous_id = auth.uid() 로 해석.
--   (anon 로그인 세션도 users 행이 있으므로 비로그인 열람자도 신고/차단 가능)
-- ============================================================================

-- ---- content_reports -------------------------------------------------------
-- 신고 1건 = (신고자, 콘텐츠) 1행. 같은 사용자가 같은 콘텐츠를 중복 신고하면
-- UNIQUE 로 무시(ON CONFLICT DO NOTHING). 운영자는 Supabase 대시보드(service_role)
-- 에서 검토한다 — 일반/익명 사용자는 SELECT 불가(RLS 정책 없음 → 차단).
create table if not exists public.content_reports (
  report_id         bigint generated always as identity primary key,
  reporter_user_id  bigint not null references public.users(user_id) on delete cascade,
  content_type      text   not null check (content_type in
                      ('feed_post', 'card_comment', 'highlight',
                       'highlight_comment', 'feed_post_comment')),
  content_id        bigint not null,
  reason            text   not null check (char_length(trim(reason)) between 1 and 50),
  created_at        timestamptz not null default now(),
  unique (reporter_user_id, content_type, content_id)
);

create index if not exists content_reports_content_idx
  on public.content_reports (content_type, content_id);

alter table public.content_reports enable row level security;
-- 정책을 두지 않는다 → anon/authenticated 직접 read/write 모두 차단.
-- 쓰기는 아래 report_content() (SECURITY DEFINER)만, 읽기는 service_role(대시보드)만.

-- ---- user_blocks -----------------------------------------------------------
-- blocker 가 blocked 를 차단. (blocker, blocked) UNIQUE. 차단자는 자기 행을
-- SELECT 가능(클라이언트가 차단 목록을 받아 피드/댓글에서 걸러냄). 쓰기/삭제는
-- block_user()/unblock_user() RPC 로만.
create table if not exists public.user_blocks (
  blocker_user_id   bigint not null references public.users(user_id) on delete cascade,
  blocked_user_id   bigint not null references public.users(user_id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_user_id);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_self on public.user_blocks;
-- 차단자 본인만 자기 차단 목록을 읽는다 (클라이언트 필터링용).
create policy user_blocks_select_self on public.user_blocks
  for select to authenticated
  using (exists (select 1 from public.users u
                  where u.user_id = user_blocks.blocker_user_id
                    and u.anonymous_id = auth.uid()));

-- ---- RPCs ------------------------------------------------------------------
-- 모두 호출자를 auth.uid() 로 해석(클라이언트가 보낸 user_id 를 신뢰하지 않음).
-- SECURITY DEFINER 로 content_reports/user_blocks 에 직접 쓴다. search_path 고정.

-- 현재 세션의 users.user_id 를 돌려준다. 없으면 예외.
create or replace function public.report_content(
  p_content_type text,
  p_content_id   bigint,
  p_reason       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint;
begin
  select u.user_id into v_uid
    from public.users u
   where u.anonymous_id = auth.uid();
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_content_type not in
     ('feed_post','card_comment','highlight','highlight_comment','feed_post_comment') then
    raise exception 'invalid content_type: %', p_content_type;
  end if;

  insert into public.content_reports (reporter_user_id, content_type, content_id, reason)
  values (v_uid, p_content_type, p_content_id,
          left(coalesce(nullif(trim(p_reason), ''), '기타'), 50))
  on conflict (reporter_user_id, content_type, content_id) do nothing;
end;
$$;

create or replace function public.block_user(p_blocked_user_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint;
begin
  select u.user_id into v_uid
    from public.users u
   where u.anonymous_id = auth.uid();
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if v_uid = p_blocked_user_id then
    raise exception 'cannot block yourself';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (v_uid, p_blocked_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;
end;
$$;

create or replace function public.unblock_user(p_blocked_user_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint;
begin
  select u.user_id into v_uid
    from public.users u
   where u.anonymous_id = auth.uid();
  if v_uid is null then
    raise exception 'auth required';
  end if;

  delete from public.user_blocks
   where blocker_user_id = v_uid
     and blocked_user_id = p_blocked_user_id;
end;
$$;

revoke all on function public.report_content(text, bigint, text) from public;
revoke all on function public.block_user(bigint)   from public;
revoke all on function public.unblock_user(bigint) from public;
grant execute on function public.report_content(text, bigint, text) to authenticated;
grant execute on function public.block_user(bigint)   to authenticated;
grant execute on function public.unblock_user(bigint) to authenticated;
