-- ============================================================================
-- Card Recommendation System - Supabase Schema
-- 카드 = 명대사/명장면 단위. 작품에 장르(M:N)·형식, 카드에 온도·강도.
-- 클릭 로그 → 사용자 선호 누적 → 추천(콜드스타트 / 선호 80% / 탐색 20%)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM types
-- ----------------------------------------------------------------------------
create type work_format as enum ('movie', 'drama', 'play', 'musical');
create type card_status as enum ('draft', 'review', 'published', 'archived');
create type job_status  as enum ('queued', 'running', 'done', 'failed');


-- ----------------------------------------------------------------------------
-- 2. Content domain
-- ----------------------------------------------------------------------------

create table works (
  work_id      bigint generated always as identity primary key,
  title        varchar(255) not null,
  format       work_format  not null,
  release_year smallint,
  creator      varchar(255),
  description  text,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create table genres (
  genre_id  smallint generated always as identity primary key,
  code      varchar(32) unique not null,
  name_ko   varchar(64) not null
);

create table work_genres (
  work_id    bigint   not null references works(work_id)  on delete cascade,
  genre_id   smallint not null references genres(genre_id) on delete restrict,
  is_primary boolean  not null default false,
  primary key (work_id, genre_id)
);
create index idx_work_genres_genre on work_genres(genre_id);

create table cards (
  card_id      bigint generated always as identity primary key,
  work_id      bigint   not null references works(work_id) on delete cascade,
  content      text     not null,
  scene_meta   jsonb,
  temperature  smallint not null check (temperature between 1 and 5),
  intensity    smallint not null check (intensity between 1 and 5),
  status       card_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_cards_work          on cards(work_id);
create index idx_cards_published     on cards(status) where status = 'published';
create index idx_cards_temp_published on cards(temperature, intensity) where status = 'published';

create table hashtags (
  hashtag_id  bigint generated always as identity primary key,
  tag         varchar(64) unique not null,
  usage_count int not null default 0
);

create table card_hashtags (
  card_id    bigint not null references cards(card_id)       on delete cascade,
  hashtag_id bigint not null references hashtags(hashtag_id) on delete cascade,
  primary key (card_id, hashtag_id)
);
create index idx_card_hashtags_hashtag on card_hashtags(hashtag_id);


-- ----------------------------------------------------------------------------
-- 3. Pipeline (script → card)
-- ----------------------------------------------------------------------------

create table scripts (
  script_id   bigint generated always as identity primary key,
  work_id     bigint not null references works(work_id) on delete cascade,
  source_uri  varchar(512),
  raw_text    text,
  language    varchar(8) default 'ko',
  ingested_at timestamptz not null default now()
);

create table extraction_jobs (
  job_id        bigint generated always as identity primary key,
  script_id     bigint not null references scripts(script_id) on delete cascade,
  status        job_status not null default 'queued',
  model_version varchar(32),
  started_at    timestamptz,
  finished_at   timestamptz,
  error_log     text
);
create index idx_extraction_jobs_status on extraction_jobs(status);

create table card_provenance (
  card_id     bigint primary key references cards(card_id)           on delete cascade,
  script_id   bigint not null  references scripts(script_id)         on delete restrict,
  job_id      bigint           references extraction_jobs(job_id)    on delete set null,
  source_span jsonb,
  confidence  numeric(3,2),
  reviewed_by uuid             references auth.users(id)             on delete set null,
  reviewed_at timestamptz
);


-- ----------------------------------------------------------------------------
-- 4. User domain & recommendation
-- ----------------------------------------------------------------------------

create table card_clicks (
  click_id   bigint generated always as identity primary key,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  card_id    bigint not null references cards(card_id) on delete cascade,
  clicked_at timestamptz not null default now()
);
create index idx_card_clicks_user_time on card_clicks(user_id, clicked_at desc);
create index idx_card_clicks_card      on card_clicks(card_id);

create table user_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  format_counts  jsonb not null default '{}'::jsonb,
  genre_counts   jsonb not null default '{}'::jsonb,
  temp_hist      jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  intensity_hist jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  total_clicks   int   not null default 0,
  updated_at     timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 5. Triggers
-- ----------------------------------------------------------------------------

-- 5-1. updated_at 자동 갱신
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_works_updated before update on works
  for each row execute function set_updated_at();
create trigger trg_cards_updated before update on cards
  for each row execute function set_updated_at();

-- 5-2. 해시태그 사용 횟수 자동 집계
create or replace function bump_hashtag_count() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update hashtags set usage_count = usage_count + 1
      where hashtag_id = new.hashtag_id;
    return new;
  elsif tg_op = 'DELETE' then
    update hashtags set usage_count = greatest(usage_count - 1, 0)
      where hashtag_id = old.hashtag_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger trg_card_hashtags_count
  after insert or delete on card_hashtags
  for each row execute function bump_hashtag_count();

-- 5-3. 클릭 → user_preferences 자동 집계 (4축 한꺼번에)
create or replace function aggregate_click_to_preferences() returns trigger as $$
declare
  v_format    text;
  v_temp      text;
  v_intensity text;
  r           record;
begin
  select w.format::text, c.temperature::text, c.intensity::text
    into v_format, v_temp, v_intensity
  from cards c
  join works w on w.work_id = c.work_id
  where c.card_id = new.card_id;

  insert into user_preferences (user_id) values (new.user_id)
    on conflict (user_id) do nothing;

  update user_preferences
  set format_counts  = jsonb_set(format_counts,  array[v_format],
                         to_jsonb(coalesce((format_counts ->> v_format)::int, 0) + 1)),
      temp_hist      = jsonb_set(temp_hist,      array[v_temp],
                         to_jsonb(coalesce((temp_hist     ->> v_temp)::int, 0) + 1)),
      intensity_hist = jsonb_set(intensity_hist, array[v_intensity],
                         to_jsonb(coalesce((intensity_hist->> v_intensity)::int, 0) + 1)),
      total_clicks   = total_clicks + 1,
      updated_at     = now()
  where user_id = new.user_id;

  for r in
    select g.code as code, wg.is_primary as is_primary
    from cards c
    join work_genres wg on wg.work_id = c.work_id
    join genres g       on g.genre_id = wg.genre_id
    where c.card_id = new.card_id
  loop
    update user_preferences
    set genre_counts = jsonb_set(
          genre_counts,
          array[r.code],
          to_jsonb(
            coalesce((genre_counts ->> r.code)::numeric, 0)
            + case when r.is_primary then 1.0 else 0.5 end
          )
        )
    where user_id = new.user_id;
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger trg_card_clicks_aggregate
  after insert on card_clicks
  for each row execute function aggregate_click_to_preferences();


-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------

alter table works              enable row level security;
alter table genres             enable row level security;
alter table work_genres        enable row level security;
alter table cards              enable row level security;
alter table hashtags           enable row level security;
alter table card_hashtags      enable row level security;
alter table card_clicks        enable row level security;
alter table user_preferences   enable row level security;
alter table scripts            enable row level security;
alter table extraction_jobs    enable row level security;
alter table card_provenance    enable row level security;

create policy "read works"          on works          for select using (true);
create policy "read genres"         on genres         for select using (true);
create policy "read work_genres"    on work_genres    for select using (true);
create policy "read hashtags"       on hashtags       for select using (true);
create policy "read card_hashtags"  on card_hashtags  for select using (true);

create policy "read published cards" on cards
  for select using (status = 'published');

create policy "read own clicks"   on card_clicks
  for select using (auth.uid() = user_id);
create policy "insert own clicks" on card_clicks
  for insert with check (auth.uid() = user_id);

create policy "read own prefs" on user_preferences
  for select using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 7. 추천 함수 (콜드스타트 / 선호 매칭 80% / 탐색 20%)
-- ----------------------------------------------------------------------------

create or replace function recommend_cards(
  p_user_id            uuid,
  p_limit              int     default 20,
  p_exploration_ratio  numeric default 0.20,
  p_cold_threshold     int     default 5
) returns table (
  card_id        bigint,
  score          numeric,
  is_exploration boolean
)
language plpgsql
stable
as $$
declare
  v_total_clicks  int;
  v_explore_count int;
  v_exploit_count int;
begin
  select coalesce(total_clicks, 0) into v_total_clicks
  from user_preferences where user_id = p_user_id;

  if v_total_clicks is null or v_total_clicks < p_cold_threshold then
    return query
    select c.card_id,
           (select count(*)::numeric
              from card_clicks cc where cc.card_id = c.card_id) as score,
           false as is_exploration
    from cards c
    where c.status = 'published'
      and not exists (
        select 1 from card_clicks cc
        where cc.user_id = p_user_id and cc.card_id = c.card_id
      )
    order by score desc, random()
    limit p_limit;
    return;
  end if;

  v_explore_count := ceil(p_limit * p_exploration_ratio)::int;
  v_exploit_count := p_limit - v_explore_count;

  return query
  with up as (
    select format_counts, genre_counts, temp_hist, intensity_hist
    from user_preferences where user_id = p_user_id
  )
  select c.card_id,
         (
           coalesce((up.format_counts  ->> w.format::text)::numeric, 0)
         + coalesce((
             select sum(coalesce((up.genre_counts ->> g.code)::numeric, 0))
             from work_genres wg
             join genres g on g.genre_id = wg.genre_id
             where wg.work_id = w.work_id
           ), 0) * 1.5
         + coalesce((up.temp_hist      ->> c.temperature::text)::numeric, 0)
         + coalesce((up.intensity_hist ->> c.intensity::text)::numeric, 0)
         ) as score,
         false as is_exploration
  from cards c
  join works w on w.work_id = c.work_id
  cross join up
  where c.status = 'published'
    and not exists (
      select 1 from card_clicks cc
      where cc.user_id = p_user_id and cc.card_id = c.card_id
    )
  order by score desc
  limit v_exploit_count;

  return query
  with top_genres as (
    select kv.key as code
    from user_preferences up,
         lateral jsonb_each_text(up.genre_counts) kv
    where up.user_id = p_user_id
    order by kv.value::numeric desc
    limit 3
  )
  select c.card_id,
         0::numeric as score,
         true as is_exploration
  from cards c
  join works w on w.work_id = c.work_id
  where c.status = 'published'
    and not exists (
      select 1 from card_clicks cc
      where cc.user_id = p_user_id and cc.card_id = c.card_id
    )
    and not exists (
      select 1
      from work_genres wg
      join genres g on g.genre_id = wg.genre_id
      where wg.work_id = w.work_id
        and g.code in (select code from top_genres)
    )
  order by random()
  limit v_explore_count;
end;
$$;
