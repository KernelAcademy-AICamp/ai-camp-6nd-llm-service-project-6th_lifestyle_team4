-- =====================================================================
-- Daily Script — OPTIONAL sample seed for local development.
-- Run once if your `cards` / `works` tables are empty so the Android app
-- has something to show. Idempotent: skips when rows already exist.
-- =====================================================================

-- works.format is a USER-DEFINED enum. Adjust the literal values below
-- if your enum has different members.

insert into public.works (title, format, author, release_year, full_script_text)
select
    v.title, v.format::format, v.author, v.release_year, v.full_script_text
from (values
    ('Pulp Fiction',  '영화',     'Quentin Tarantino', 1994,
     'INT. COFFEE SHOP - MORNING\n\nThe Coffee Shop is a typical Los Angeles establishment.\n\n    PUMPKIN\nNo, forget it, it''s too risky.\n\n    HONEY BUNNY\nYou always say that.'),
    ('기억의 밤',     '드라마',   '미상',              2017,
     '누구에게나 지우고 싶은 밤이 있다.\n\n    형\n네가 정말 내 동생이 맞아?\n\n    동생\n형, 나야. 진짜 나야.'),
    ('기록자의 시선', '다큐멘터리','미상',             2021,
     '세상은 보는 방식에 따라 달라진다.\n\n카메라가 도시의 새벽을 천천히 비춘다.\n\n    내레이션\n우리가 기록하는 것은 풍경이 아니라, 시선이다.')
) as v(title, format, author, release_year, full_script_text)
where not exists (select 1 from public.works w where w.title = v.title);

-- Cards reference works by title -> work_id.
insert into public.cards (work_id, quote, script_excerpt, excerpt_description, keywords, temperature, intensity)
select
    w.work_id, v.quote, v.script_excerpt, v.excerpt_description, v.keywords::jsonb, v.temperature, v.intensity
from (values
    (
        'Pulp Fiction',
        '“우리는 과거를 기억하는 것이 아니라, 그때의 감정을 기억하는 거야.”',
        E'INT. COFFEE SHOP - MORNING\n\nThe Coffee Shop is a typical Los Angeles establishment.\nIt''s busy, but not packed. PUMPKIN and HONEY BUNNY sit in a booth.\n\n                    PUMPKIN\n          No, forget it, it''s too risky.\n          I''m through doin'' that shit.\n\n                  HONEY BUNNY\n          You always say that, the same\n          thing every time.\n\n                    PUMPKIN\n          I know that''s what I always say.\n          I''m always right too.',
        '아침 식사를 마친 두 사람이 코앞의 결심을 두고 망설인다.',
        '["시간","삶","기억"]',
        3, 4
    ),
    (
        '기억의 밤',
        '“형이 정말 내가 알던 형 맞아?”',
        E'INT. 거실 - 밤\n\n어두운 거실. 동생이 형을 마주본다.\n\n                    동생\n          형이 정말 내가 알던 형 맞아?\n\n                    형\n          무슨 소리야. 나야, 나.',
        '오랜만에 재회한 형제가 마주 앉아 서로를 시험한다.',
        '["가족","의심","기억"]',
        2, 5
    ),
    (
        '기록자의 시선',
        '“우리가 기록하는 것은 풍경이 아니라, 시선이다.”',
        E'EXT. 도시 - 새벽\n\n도시의 옅은 안개 위로 카메라가 천천히 흐른다.\n\n                  내레이션 (V.O.)\n          우리가 기록하는 것은 풍경이 아니라,\n          시선이다.',
        '관찰자의 시선이 도시의 새벽을 길어 올린다.',
        '["관찰","도시","시선"]',
        4, 2
    )
) as v(work_title, quote, script_excerpt, excerpt_description, keywords, temperature, intensity)
join public.works w on w.title = v.work_title
where not exists (
    select 1 from public.cards c where c.work_id = w.work_id and c.quote = v.quote
);
