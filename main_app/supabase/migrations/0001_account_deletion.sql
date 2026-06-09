-- DRAFT — account-deletion data purge. Backend owner: verify table/column names
-- against the LIVE schema before applying (contracts may have drifted).
--
-- Atomically deletes every user-scoped row for one account, keyed by the auth
-- user's UUID (users.anonymous_id). SECURITY DEFINER so the `delete-account`
-- Edge Function (service_role) can call it in a single transaction; revoked from
-- anon/authenticated so no client can invoke it directly.

create or replace function public.delete_user_data(p_anonymous_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id bigint;
begin
  select user_id into v_user_id
    from public.users
   where anonymous_id = p_anonymous_id;

  if v_user_id is null then
    return;  -- nothing to purge
  end if;

  -- FK-safe order (children before parents). Confirm each table actually keys
  -- on user_id, and add any user-scoped tables not surfaced in the iOS client
  -- (e.g. server-side feedback/analytics) before shipping.
  delete from public.comment_likes   where user_id = v_user_id;
  delete from public.card_comments   where user_id = v_user_id;
  delete from public.card_highlights where user_id = v_user_id;
  delete from public.feed_posts      where user_id = v_user_id;
  delete from public.user_bookmarks  where user_id = v_user_id;
  delete from public.users           where user_id = v_user_id;
end;
$$;

revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
-- service_role (function owner, used by the Edge Function) keeps execute.
