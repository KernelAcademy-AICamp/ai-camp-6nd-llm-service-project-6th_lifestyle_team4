-- ============================================================================
-- seed.sql — Daily Script 데모용 시드 데이터
-- Supabase SQL Editor 에 그대로 붙여넣어 실행하면 됩니다.
-- 스키마(1번 sql) + 002_user_bookmarks.sql 이 먼저 적용되어 있어야 합니다.
-- 반복 실행 안전 (on conflict / not exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 13개 장르
-- ----------------------------------------------------------------------------
insert into genres (code, name_ko) values
  ('romance',       '로맨스'),
  ('thriller',      '스릴러'),
  ('drama',         '드라마'),
  ('comedy',        '코미디'),
  ('action',        '액션'),
  ('fantasy',       '판타지'),
  ('mystery',       '미스터리'),
  ('horror',        '호러'),
  ('sf',            'SF'),
  ('historical',    '시대극'),
  ('family',        '가족'),
  ('crime',         '범죄'),
  ('coming_of_age', '성장')
on conflict (code) do nothing;


-- ----------------------------------------------------------------------------
-- 2. 작품 (works) — 영화/드라마/연극/뮤지컬 섞어서
-- ----------------------------------------------------------------------------
with seed(title, format, release_year, creator, description) as (values
  ('인타임',          'movie'::work_format,   2011, 'Andrew Niccol',  '시간이 화폐가 된 디스토피아.'),
  ('너의 이름은',     'movie'::work_format,   2016, 'Makoto Shinkai', '꿈을 통해 몸이 뒤바뀐 두 사람.'),
  ('이터널 선샤인',   'movie'::work_format,   2004, 'Michel Gondry',  '기억을 지운 후 다시 사랑에 빠지는 이야기.'),
  ('미드나잇 프로토콜','movie'::work_format,  2022, 'A. Fiction',     '도시의 밤을 배경으로 한 누아르.'),
  ('비욘드 더 호라이즌','movie'::work_format, 2021, 'B. Fiction',     '오랜 항해 끝에 마주한 진실.'),
  ('스텔라 드리프트', 'movie'::work_format,   2023, 'C. Fiction',     '기억을 잃은 우주 정거장 승무원.'),
  ('체로니클러즈',    'drama'::work_format,   2022, 'D. Fiction',     '잠 못 드는 밤마다 기록된 시대의 증인들.'),
  ('밤의 도서관',     'play'::work_format,    2020, 'E. Fiction',     '거대한 도서관에서 펼쳐지는 1인극.')
)
insert into works (title, format, release_year, creator, description)
select s.title, s.format, s.release_year, s.creator, s.description
from seed s
where not exists (
  select 1 from works w where w.title = s.title and w.format = s.format
);


-- ----------------------------------------------------------------------------
-- 3. 작품 ↔ 장르 매핑 (work_genres)
-- ----------------------------------------------------------------------------
with map(title, genre_code, is_primary) as (values
  ('인타임',           'sf',            true),
  ('인타임',           'thriller',      false),
  ('너의 이름은',      'romance',       true),
  ('너의 이름은',      'fantasy',       false),
  ('이터널 선샤인',    'romance',       true),
  ('이터널 선샤인',    'drama',         false),
  ('미드나잇 프로토콜','thriller',      true),
  ('미드나잇 프로토콜','crime',         false),
  ('비욘드 더 호라이즌','drama',        true),
  ('비욘드 더 호라이즌','coming_of_age',false),
  ('스텔라 드리프트',  'sf',            true),
  ('스텔라 드리프트',  'mystery',       false),
  ('체로니클러즈',     'historical',    true),
  ('체로니클러즈',     'drama',         false),
  ('밤의 도서관',      'drama',         true),
  ('밤의 도서관',      'fantasy',       false)
)
insert into work_genres (work_id, genre_id, is_primary)
select w.work_id, g.genre_id, m.is_primary
from map m
join works  w on w.title = m.title
join genres g on g.code  = m.genre_code
on conflict (work_id, genre_id) do nothing;


-- ----------------------------------------------------------------------------
-- 4. 카드 (cards) — 명대사 + scene_meta
-- ----------------------------------------------------------------------------
with seed(work_title, content, temperature, intensity, character_name, scene_header, narration) as (values
  ('인타임',
   '어떤 이들은 1분을 살기 위해 평생을 바쳐요.',
   3, 4, 'WILL SALAS', 'EXT. DAY - GHETTO STREETS',
   '도시의 시계가 빛으로 살아 움직이고, 시간이 유일한 화폐가 된 거리. 윌은 자신의 시간이 째깍대며 사라지는 것을 응시한다.'),

  ('인타임',
   '시간이 멈춘 곳에서 사랑은 영원할까.',
   2, 3, 'SYLVIA', 'INT. NIGHT - HOTEL SUITE',
   '창밖으로 사라지지 않는 도시의 빛. 실비아는 자신에게 남은 시간을 처음으로 의식한다.'),

  ('너의 이름은',
   '한 번도 만난 적 없는 너를, 어딘가에서 늘 그리워했어.',
   4, 2, 'TAKI', 'EXT. DUSK - TOKYO ROOFTOP',
   '도쿄의 노을이 옅게 번지고, 타키는 이름을 잊지 않으려 손바닥에 글씨를 쓴다.'),

  ('이터널 선샤인',
   '나는 너를 또 사랑할 거야. 결말을 알면서도.',
   5, 3, 'JOEL', 'INT. NIGHT - EMPTY APARTMENT',
   '기억이 지워지고 있다는 것을 알면서도 조엘은 그녀의 손을 다시 잡는다.'),

  ('이터널 선샤인',
   '잊는다는 건, 한 번 더 사랑할 자격을 얻는 일.',
   3, 2, 'CLEMENTINE', 'EXT. WINTER - FROZEN BEACH',
   '얼어붙은 해변의 바람 속에서 클레멘타인이 처음 본 사람에게 말을 건다.'),

  ('미드나잇 프로토콜',
   '이 도시의 비는 얼룩을 씻어내지 않아. 그저 더 진하게 만들 뿐이지.',
   2, 4, 'DET. KOVACS', 'EXT. NIGHT - RAIN-SOAKED ALLEY',
   '네온이 떨어진 빗물 위에서 코박스가 담배에 불을 붙인다.'),

  ('비욘드 더 호라이즌',
   '긴 항해를 견디는 유일한 방법은, 도착하지 않는다고 생각하는 거야.',
   3, 3, 'CAPT. AYALA', 'EXT. NIGHT - SHIP DECK',
   '검은 바다 위, 별이 흩어져 있다. 선장은 키를 잡은 채 오래 침묵한다.'),

  ('스텔라 드리프트',
   '기억은 살아 있는 자를 따라다니는 유일한 유령이야.',
   4, 3, 'NOA', 'INT. NIGHT - DERELICT STATION',
   '먼지가 빛 속에서 천천히 떠다닌다. 노아는 잊었던 이름을 다시 발음해 본다.'),

  ('체로니클러즈',
   '역사는 잠들지 않은 사람들에 의해 쓰인다.',
   3, 4, 'MARGOT', 'INT. DAWN - SCRIPTORIUM',
   '촛불이 흔들리는 작업실. 마고는 한 줄을 쓰기 전 오래 생각한다.'),

  ('밤의 도서관',
   '책장 사이를 걸으면, 한 번도 살아보지 못한 인생이 발끝에 닿아.',
   4, 1, 'NARRATOR', 'INT. NIGHT - GRAND LIBRARY',
   '서가 사이에 깔린 어둠. 화자는 손가락으로 책등을 천천히 훑는다.')
)
insert into cards (work_id, content, scene_meta, temperature, intensity, status)
select
  w.work_id,
  s.content,
  jsonb_build_object(
    'character',   s.character_name,
    'header',      s.scene_header,
    'description', s.narration
  ),
  s.temperature,
  s.intensity,
  'published'::card_status
from seed s
join works w on w.title = s.work_title
where not exists (
  select 1 from cards c
  where c.work_id = w.work_id and c.content = s.content
);


-- ----------------------------------------------------------------------------
-- 5. 해시태그 + 카드 ↔ 해시태그
-- ----------------------------------------------------------------------------
insert into hashtags (tag) values
  ('시간'), ('삶'), ('사랑'), ('기억'), ('밤'),
  ('도시'), ('우주'), ('침묵'), ('비'), ('책')
on conflict (tag) do nothing;

with card_tag(content_match, tag) as (values
  ('어떤 이들은 1분을 살기 위해 평생을 바쳐요.', '시간'),
  ('어떤 이들은 1분을 살기 위해 평생을 바쳐요.', '삶'),
  ('시간이 멈춘 곳에서 사랑은 영원할까.', '시간'),
  ('시간이 멈춘 곳에서 사랑은 영원할까.', '사랑'),
  ('한 번도 만난 적 없는 너를, 어딘가에서 늘 그리워했어.', '사랑'),
  ('나는 너를 또 사랑할 거야. 결말을 알면서도.', '사랑'),
  ('나는 너를 또 사랑할 거야. 결말을 알면서도.', '기억'),
  ('잊는다는 건, 한 번 더 사랑할 자격을 얻는 일.', '기억'),
  ('이 도시의 비는 얼룩을 씻어내지 않아. 그저 더 진하게 만들 뿐이지.', '비'),
  ('이 도시의 비는 얼룩을 씻어내지 않아. 그저 더 진하게 만들 뿐이지.', '도시'),
  ('긴 항해를 견디는 유일한 방법은, 도착하지 않는다고 생각하는 거야.', '밤'),
  ('기억은 살아 있는 자를 따라다니는 유일한 유령이야.', '기억'),
  ('기억은 살아 있는 자를 따라다니는 유일한 유령이야.', '우주'),
  ('역사는 잠들지 않은 사람들에 의해 쓰인다.', '책'),
  ('책장 사이를 걸으면, 한 번도 살아보지 못한 인생이 발끝에 닿아.', '책'),
  ('책장 사이를 걸으면, 한 번도 살아보지 못한 인생이 발끝에 닿아.', '침묵')
)
insert into card_hashtags (card_id, hashtag_id)
select c.card_id, h.hashtag_id
from card_tag ct
join cards    c on c.content = ct.content_match
join hashtags h on h.tag     = ct.tag
on conflict (card_id, hashtag_id) do nothing;
