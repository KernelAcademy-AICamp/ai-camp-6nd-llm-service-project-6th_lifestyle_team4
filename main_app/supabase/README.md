# Account deletion — backend DRAFT (handoff)

These files are a **draft proposed by the iOS work** to satisfy App Store
Guideline 5.1.1(v) (in-app account deletion) and the privacy-policy promise of a
"서비스 내 탈퇴 기능". **Nothing here is deployed.** They live under
`main_app/supabase/` and intentionally do **not** touch `upload_web/supabase` or
`android/supabase`. The Supabase/backend owner should review, verify against the
live schema, and deploy.

## What it does
`delete-account` Edge Function (called from the iOS app via
`Supa.deleteAccount()` → `client.functions.invoke("delete-account")`):
1. resolves the caller from their JWT (service role);
2. calls `public.delete_user_data(auth_uid)` to purge every user-scoped row in
   one transaction;
3. `auth.admin.deleteUser(auth_uid)` to remove the Supabase Auth user (must be
   last — otherwise `AuthSession.bootstrap` recreates the same account on next
   launch).

## Deploy (backend owner)
1. Verify column/table names in `migrations/0001_account_deletion.sql` against
   the live schema. Add any user-scoped table not surfaced by the iOS client.
2. Apply the migration (creates `public.delete_user_data`).
3. `supabase functions deploy delete-account`
4. Set the function secret: `SUPABASE_SERVICE_ROLE_KEY` (URL is injected).
5. Smoke-test with a throwaway member account; confirm the row count goes to
   zero across all tables and the auth user is gone.

## Decisions baked in (flag if you disagree)
- **Hard delete** of the user's public content (comments/feed/highlights),
  including the denormalized `authorNickname`. Alternative: *anonymize* (keep
  the text, null the author + nickname) — change the `delete from` on
  `card_comments`/`feed_posts` to an `update ... set user_id = null,
  author_nickname = null` if community content should persist.
- **Members only.** The iOS entry point is hidden for anonymous users (no
  account yet); "Reset Anonymous" already covers them.

## Not handled here
- Atomicity across the data purge **and** the auth-user delete (two steps).
  Acceptable: data is purged transactionally; if the auth delete fails the
  function returns 500 and the client surfaces an error to retry.
- Privacy-policy retention carve-outs / App Store privacy metadata — product/legal.
- Android client (the Edge Function is shared; add the same UI later).
