-- =====================================================================
-- Daily Script - prevent duplicate bookmarks per user/card.
--
-- Run once in Supabase SQL Editor. This script is safe to re-run:
--   1. It removes duplicate bookmark rows, keeping the oldest row.
--   2. It adds a unique constraint on (user_id, card_id) if missing.
-- =====================================================================

with ranked_bookmarks as (
    select
        bookmark_id,
        row_number() over (
            partition by user_id, card_id
            order by created_at asc, bookmark_id asc
        ) as duplicate_rank
    from public.user_bookmarks
)
delete from public.user_bookmarks ub
using ranked_bookmarks rb
where ub.bookmark_id = rb.bookmark_id
  and rb.duplicate_rank > 1;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'user_bookmarks_user_card_unique'
          and conrelid = 'public.user_bookmarks'::regclass
    ) then
        alter table public.user_bookmarks
            add constraint user_bookmarks_user_card_unique unique (user_id, card_id);
    end if;
end $$;
