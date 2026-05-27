-- =====================================================================
-- Daily Script — RLS policies for the Android client (anon role).
-- Run once in Supabase SQL Editor after enabling Anonymous Auth.
--
-- Auth model recap:
--   - The app calls signInAnonymously() -> Supabase issues a JWT with
--     auth.uid() = a stable uuid for that anon user.
--   - We mirror that uuid into public.users.anonymous_id (BIGINT user_id).
--   - All per-user tables key off user_id, but RLS checks via the mapping
--     to auth.uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- users: each anon user owns exactly one row, keyed by anonymous_id.
-- ---------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists "users self read"   on public.users;
drop policy if exists "users self insert" on public.users;
drop policy if exists "users self update" on public.users;

create policy "users self read" on public.users
    for select
    using (anonymous_id = auth.uid());

create policy "users self insert" on public.users
    for insert
    with check (anonymous_id = auth.uid());

create policy "users self update" on public.users
    for update
    using (anonymous_id = auth.uid())
    with check (anonymous_id = auth.uid());

-- ---------------------------------------------------------------------
-- cards / works / genres / work_genres: read-only catalogue, public to anon.
-- ---------------------------------------------------------------------
alter table public.cards       enable row level security;
alter table public.works       enable row level security;
alter table public.genres      enable row level security;
alter table public.work_genres enable row level security;

drop policy if exists "cards anon read"       on public.cards;
drop policy if exists "works anon read"       on public.works;
drop policy if exists "genres anon read"      on public.genres;
drop policy if exists "work_genres anon read" on public.work_genres;

create policy "cards anon read"       on public.cards       for select using (true);
create policy "works anon read"       on public.works       for select using (true);
create policy "genres anon read"      on public.genres      for select using (true);
create policy "work_genres anon read" on public.work_genres for select using (true);

-- ---------------------------------------------------------------------
-- user_bookmarks: each user can read/write only their own rows.
-- ---------------------------------------------------------------------
alter table public.user_bookmarks enable row level security;

drop policy if exists "bookmarks owner all" on public.user_bookmarks;

create policy "bookmarks owner all" on public.user_bookmarks
    for all
    using (
        user_id in (
            select u.user_id from public.users u where u.anonymous_id = auth.uid()
        )
    )
    with check (
        user_id in (
            select u.user_id from public.users u where u.anonymous_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- user_daily_cards / user_card_selections / user_preferences:
-- same owner-only pattern, included for completeness even though the
-- Android MVP does not write to them yet.
-- ---------------------------------------------------------------------
alter table public.user_daily_cards      enable row level security;
alter table public.user_card_selections  enable row level security;
alter table public.user_preferences      enable row level security;

drop policy if exists "daily_cards owner all"      on public.user_daily_cards;
drop policy if exists "card_selections owner all"  on public.user_card_selections;
drop policy if exists "preferences owner all"      on public.user_preferences;

create policy "daily_cards owner all" on public.user_daily_cards
    for all
    using (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    )
    with check (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    );

create policy "card_selections owner all" on public.user_card_selections
    for all
    using (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    )
    with check (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    );

create policy "preferences owner all" on public.user_preferences
    for all
    using (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    )
    with check (
        user_id in (select u.user_id from public.users u where u.anonymous_id = auth.uid())
    );

-- ---------------------------------------------------------------------
-- Grants — make sure the anon role can actually touch the tables it owns.
-- (RLS still enforces row-level access; grants gate which verbs the role
-- can attempt at all.)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select               on public.cards, public.works, public.genres, public.work_genres to anon, authenticated;
grant select, insert, update on public.users                          to anon, authenticated;
grant select, insert, delete on public.user_bookmarks                 to anon, authenticated;
grant select, insert, update, delete on public.user_daily_cards       to anon, authenticated;
grant select, insert, update, delete on public.user_card_selections   to anon, authenticated;
grant select, insert, update, delete on public.user_preferences       to anon, authenticated;

-- identity sequences need usage so insert can pick a value
grant usage, select on all sequences in schema public to anon, authenticated;
