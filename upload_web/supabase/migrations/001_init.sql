-- Script & Quote Intelligence — initial schema
-- Run with: supabase db push   (or paste into Supabase SQL editor)

create table if not exists works (
  id           bigserial primary key,
  title        text not null,
  format       text not null check (format in ('movie','drama','play','musical')),
  author       text,
  release_year smallint,
  genres       text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create table if not exists cards (
  id                              bigserial primary key,
  work_id                         bigint not null references works(id) on delete cascade,
  quote                           text not null,
  script_excerpt                  text not null,
  excerpt_description             text,
  keywords                        text[] not null default '{}',
  temperature                     smallint not null check (temperature between 1 and 5),
  intensity                       smallint not null check (intensity between 1 and 5),

  -- Translated fields (filled only when source is not Korean and user clicks 번역하기)
  quote_translated                text,
  script_excerpt_translated       text,
  excerpt_description_translated  text,
  source_language                 text,

  created_at                      timestamptz not null default now()
);

create index if not exists cards_work_id_idx on cards (work_id);

-- RLS: authenticated users (admins) can read/write everything
alter table works enable row level security;
alter table cards enable row level security;

drop policy if exists works_authed on works;
drop policy if exists cards_authed on cards;

create policy works_authed on works
  for all to authenticated
  using (true) with check (true);

create policy cards_authed on cards
  for all to authenticated
  using (true) with check (true);
