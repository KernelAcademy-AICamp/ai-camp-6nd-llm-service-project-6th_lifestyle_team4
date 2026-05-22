-- Long Black design system: editorial-card data extensions.
-- All columns nullable so existing app keeps working pre-migration.
-- Apply in Supabase SQL editor (Project → SQL editor → New query).

alter table public.cards
    add column if not exists expires_at   timestamptz,
    add column if not exists publish_at   timestamptz,
    add column if not exists rating       numeric(2,1),
    add column if not exists rating_count integer,
    add column if not exists image_url    text,
    add column if not exists category     text;

comment on column public.cards.expires_at   is 'Today''s Note: when this card stops being "today" and is moved to the archive.';
comment on column public.cards.publish_at   is 'Future-dated cards for the D-day preview row on Home. Null = already published.';
comment on column public.cards.rating       is 'Star rating 0.0–5.0 (one decimal). Null = no rating yet.';
comment on column public.cards.rating_count is 'Number of ratings aggregated into `rating`.';
comment on column public.cards.image_url    is 'Hero image for the card. Recommended aspect 16:10.';
comment on column public.cards.category     is 'Short category code rendered as a top-right pill (e.g. C, B, K, L).';

-- Optional seed examples (uncomment + adjust as needed):
-- update public.cards set expires_at = (current_date + interval '1 day') where card_id = (select max(card_id) from public.cards);
-- update public.cards set rating = 4.6, rating_count = 2643 where card_id is not null;
