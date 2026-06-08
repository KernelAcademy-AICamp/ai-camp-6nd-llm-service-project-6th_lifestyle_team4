-- =====================================================================
-- Daily Script — cards.comment_count (카드별 댓글 수, 답글 포함).
-- Run once in Supabase SQL Editor.
--
-- view_count 와 동일하게 cards 행에 카운트를 들고 있어, 카드 조회 시
-- 댓글 수가 추가 쿼리 없이 함께 따라온다. card_comments 의 insert/delete
-- 를 트리거가 받아 cards.comment_count 를 자동 동기화한다.
-- =====================================================================

-- 1) 컬럼 추가
alter table public.cards
    add column if not exists comment_count integer not null default 0;

-- 2) 기존 데이터 백필
update public.cards c
set comment_count = coalesce(sub.cnt, 0)
from (
    select card_id, count(*) as cnt
    from public.card_comments
    group by card_id
) sub
where sub.card_id = c.card_id;

-- 3) 동기화 함수.
--    security definer: anon/authenticated 역할은 cards 에 SELECT 권한만 있으므로
--    (01_rls_policies.sql), 트리거 함수가 소유자(postgres) 권한으로 cards 를 갱신한다.
create or replace function public.sync_card_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        update public.cards
        set comment_count = comment_count + 1
        where card_id = new.card_id;
    elsif (tg_op = 'DELETE') then
        update public.cards
        set comment_count = greatest(comment_count - 1, 0)
        where card_id = old.card_id;
    end if;
    return null;
end;
$$;

-- 4) 트리거 (insert / delete)
drop trigger if exists trg_card_comments_count_ins on public.card_comments;
drop trigger if exists trg_card_comments_count_del on public.card_comments;

create trigger trg_card_comments_count_ins
    after insert on public.card_comments
    for each row execute function public.sync_card_comment_count();

create trigger trg_card_comments_count_del
    after delete on public.card_comments
    for each row execute function public.sync_card_comment_count();
