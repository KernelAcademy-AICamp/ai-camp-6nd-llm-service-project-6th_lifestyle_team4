-- =====================================================================
-- content_likes 보안 강화 — PR #171 리뷰 P1 지적 반영.
--   문제(043_content_likes.sql):
--     1) toggle_content_like 가 호출자가 보낸 p_user_id 를 그대로 신뢰
--        → 아무 user_id 로나 좋아요 위조 가능(스푸핑).
--     2) anon 롤에 EXECUTE 가 열려 있고, 함수도 익명 세션을 거부하지 않음.
--     3) content_likes 에 FOR ALL USING(true) 직접 쓰기 정책
--        → RPC 를 우회해 테이블에 직접 insert/delete 가능.
--     4) EXISTS→INSERT 순서라 동시 호출 시 PK 충돌 예외 가능(연타 레이스).
--   변경:
--     · 호출자는 auth.uid() 에서 도출(users.anonymous_id 매핑, 045_attendance 컨벤션).
--       p_user_id 는 하위호환용으로 유지하되 도출값과 다르면 예외(스푸핑 차단).
--       — Android/PWA 는 본인 user_id 를 넘기므로 호출부 변경 없이 그대로 동작.
--     · 익명 세션(auth.jwt() is_anonymous) + 미인증 거부. anon 롤 EXECUTE 회수.
--     · 직접 쓰기 정책 제거 — 쓰기는 SECURITY DEFINER RPC 로만(읽기 정책은 유지).
--     · DELETE-first + ON CONFLICT DO NOTHING 으로 토글을 예외 없이 처리.
-- ⚠️ Supabase SQL Editor 에서 1회 수동 실행. (멱등 — 재실행 안전)
-- ⚠️ iOS PR #171 머지 전에 적용할 것 — 적용 순서 무관하게 세 클라이언트 모두
--    기존 호출 형태(p_user_id 포함) 그대로 동작한다.
-- =====================================================================

-- 1) 직접 쓰기 정책 제거 — 좋아요 쓰기는 RPC 전용. (읽기 read-all 은 유지:
--    게스트도 카운트는 본다. content_like_counts 뷰 권한도 그대로.)
drop policy if exists "content_likes write via rpc" on public.content_likes;
-- 벨트+서스펜더 — 테이블 레벨 쓰기 GRANT 도 회수. RLS 무정책이 이미 직접 쓰기를
-- 막지만, 훗날 RLS 해제/허용 정책 추가 실수가 있어도 이 revoke 가 한 겹 더 막는다.
-- (SECURITY DEFINER RPC 는 소유자 권한으로 실행되므로 영향 없음.)
revoke insert, update, delete on public.content_likes from anon, authenticated;

-- 2) 토글 RPC 강화 — 시그니처는 043 과 동일(3-인자)하게 유지해 Android/PWA
--    하위호환. 대상 사용자는 서버가 auth.uid() 로 도출하고 p_user_id 는 검증만.
create or replace function public.toggle_content_like(
  p_user_id     bigint,
  p_target_type text,
  p_target_id   bigint
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_uid     uuid;
  v_user_id bigint;
  v_liked   boolean;
  v_count   int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'signin required'; end if;
  -- 익명 세션 거부(클라이언트도 게이트하지만 서버에서도 방어 — 045 컨벤션).
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'anonymous not allowed';
  end if;
  if p_target_type not in ('feed_post', 'highlight') then
    raise exception 'invalid target_type: %', p_target_type;
  end if;

  select user_id into v_user_id
    from public.users where anonymous_id = v_uid
    order by user_id limit 1;   -- 방어: 중복 행이 있어도 1개로 고정(045 와 동일)
  if v_user_id is null then raise exception 'user row not found'; end if;
  -- 하위호환 파라미터 검증 — 본인 외 user_id 로는 토글 불가(스푸핑 차단).
  if p_user_id is not null and p_user_id <> v_user_id then
    raise exception 'user mismatch';
  end if;

  -- DELETE-first 토글 — EXISTS→INSERT 레이스로 인한 PK 충돌 예외 제거.
  -- 동시 중복 호출도 각 statement 가 원자적이라 예외 없이 순차 토글로 수렴한다.
  delete from public.content_likes
   where user_id = v_user_id and target_type = p_target_type and target_id = p_target_id;
  if found then
    v_liked := false;
  else
    insert into public.content_likes (user_id, target_type, target_id)
    values (v_user_id, p_target_type, p_target_id)
    on conflict do nothing;
    v_liked := true;
  end if;

  select count(*) into v_count
    from public.content_likes
   where target_type = p_target_type and target_id = p_target_id;

  return jsonb_build_object('liked', v_liked, 'count', v_count);
end;
$$;

-- 3) 실행 권한 — anon(무세션) 회수, 인증 세션만. (익명 '세션'은 authenticated
--    롤 + is_anonymous 클레임이라 위 함수 내부 검사로 거부된다.)
revoke all on function public.toggle_content_like(bigint, text, bigint) from public;
revoke execute on function public.toggle_content_like(bigint, text, bigint) from anon;
grant execute on function public.toggle_content_like(bigint, text, bigint)
  to authenticated, service_role;

comment on function public.toggle_content_like is
  '좋아요 토글(강화판) — 호출자는 auth.uid() 에서 도출, p_user_id 는 검증용(불일치 시 예외). 익명 세션 거부. DELETE-first 로 연타 레이스에도 예외 없음. 반환: {liked, count}.';
