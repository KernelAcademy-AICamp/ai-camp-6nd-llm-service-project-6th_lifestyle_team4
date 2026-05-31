-- ============================================================================
--  notices (공지사항)
--   - 어드민(upload_web)이 작성/수정/삭제하고, 소비자 앱(web_pwa)은 읽기만 한다.
--   - works/cards 와 동일한 admin RLS 패턴(public.is_admin() — JWT app_metadata.role='admin').
--   - published = false 인 공지는 어드민에게만 보인다(임시 저장/숨김 용).
--   - tag: 'update'(주황) | 'notice'(기본) | 'event'(노랑)
-- ============================================================================

create table if not exists public.notices (
  notice_id   bigint generated always as identity primary key,
  tag         text        not null default 'notice'
                          check (tag in ('update', 'notice', 'event')),
  title       text        not null check (char_length(trim(title)) between 1 and 120),
  body        text        not null check (char_length(trim(body)) between 1 and 4000),
  pinned      boolean     not null default false,
  published   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 고정(pinned) 공지를 위로, 그다음 최신순
create index if not exists notices_order_idx
  on public.notices (pinned desc, created_at desc);

-- ---- updated_at 자동 갱신 트리거 --------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
  before update on public.notices
  for each row execute function public.set_updated_at();

-- ---- RLS -------------------------------------------------------------------
alter table public.notices enable row level security;

drop policy if exists notices_select_public on public.notices;
drop policy if exists notices_admin_insert  on public.notices;
drop policy if exists notices_admin_update  on public.notices;
drop policy if exists notices_admin_delete  on public.notices;

-- 게시된 공지는 누구나 읽기. 미게시(임시)는 어드민만.
create policy notices_select_public on public.notices
  for select to anon, authenticated
  using (published = true or public.is_admin());

-- 작성/수정/삭제는 admin 만 (app_metadata.role = 'admin')
create policy notices_admin_insert on public.notices
  for insert to authenticated
  with check (public.is_admin());

create policy notices_admin_update on public.notices
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy notices_admin_delete on public.notices
  for delete to authenticated
  using (public.is_admin());

-- ---- Realtime publication --------------------------------------------------
-- 새 공지가 소비자 앱에 실시간으로 반영되게
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notices';
  exception when duplicate_object then null;
           when others then null;
  end;
end$$;

-- ---- Seed: 기존 정적 공지(오늘 업데이트)를 DB로 이관 -------------------------
-- 테이블이 비어 있을 때만 1회 삽입 → 재실행해도 중복되지 않음.
insert into public.notices (tag, title, body)
select 'update', '사용성 개선 업데이트',
       '• 명대사 본문을 길게 눌러 하이라이트하거나 의견을 남길 때, 화면이 갑자기 새로고침되거나 닫히던 문제를 고쳤어요.' || chr(10) ||
       '• 긴 장면을 아래로 스크롤할 때 화면 아래쪽이 하얗게 보이던 현상을 수정했어요.' || chr(10) ||
       '• ‘의견 남기기’에서 이메일이 자동으로 채워지지 않도록 바꿨어요. (직접 입력할 수 있어요)' || chr(10) ||
       '• 설정에 ‘앱 사용법’ 안내 페이지를 추가했어요.'
where not exists (select 1 from public.notices);
