-- =====================================================================
-- 공유 카드지 — 계정 삭제 시 자동 소멸 (사용자 명세 2026-06-30)
--   "구매한 배경은 구매한 계정에서만 영구 소장, 계정삭제시 해당 계정의
--    구매 물품은 전부 소멸"
--
-- 046 에서 share_theme_unlocks 에 FK 가 없어서 delete_my_account 가
-- public.users 만 지워도 (user_id, theme_id) 행이 고아처럼 남았다.
-- 동일 user_id 가 재사용되면 옛 계정의 카드지가 새 계정에 노출될 수도.
--
-- ⚠️ Supabase SQL Editor 에서 1회 수동 실행. (멱등 — 재실행 안전)
-- =====================================================================

-- 1) FK CASCADE 재정의 — 기존 FK 가 있으면 떼고 CASCADE 로 다시 건다.
alter table public.share_theme_unlocks
    drop constraint if exists share_theme_unlocks_user_id_fkey;

alter table public.share_theme_unlocks
    add constraint share_theme_unlocks_user_id_fkey
    foreign key (user_id)
    references public.users(user_id)
    on delete cascade;

-- 2) FK 가 못 잡힌 환경(예: 옛 데이터로 무결성 위반) 대비 — delete_my_account
--    함수에 명시적 DELETE 한 줄 추가. CASCADE 가 정상이면 이미 비어있어 no-op.
create or replace function public.delete_my_account(p_user_id bigint)
returns void
language plpgsql security definer
set search_path = public as $$
declare
    v_auth_uid uuid;
begin
    if p_user_id is null then raise exception 'no user'; end if;

    select anonymous_id into v_auth_uid
      from public.users where user_id = p_user_id;

    -- 안전망 — FK CASCADE 실패 시에도 카드지 소유 행 정리
    delete from public.share_theme_unlocks where user_id = p_user_id;

    delete from public.users where user_id = p_user_id;

    if v_auth_uid is not null then
        delete from auth.users where id = v_auth_uid;
    end if;
end;
$$;

revoke all on function public.delete_my_account(bigint) from public;
grant execute on function public.delete_my_account(bigint) to anon, authenticated, service_role;

comment on constraint share_theme_unlocks_user_id_fkey on public.share_theme_unlocks is
    '계정 삭제 시 보유 카드지 자동 소멸 (사용자 명세 2026-06-30).';
