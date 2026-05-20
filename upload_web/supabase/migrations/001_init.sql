-- ============================================================================
--  REFERENCE ONLY — 실제 스키마는 이미 Supabase 프로젝트에 배포되어 있습니다.
--  이 파일은 upload_web이 어떤 컬럼을 기대하는지 보여주는 참고 자료입니다.
--
--  새 프로젝트에서 처음부터 세팅하려면 이 파일을 직접 실행하지 말고
--  먼저 work_format enum과 users 테이블 등 외부 의존성을 만들어야 합니다.
-- ============================================================================

-- 사용자 정의 enum (이미 존재한다고 가정)
-- CREATE TYPE work_format AS ENUM ('movie', 'drama', 'play', 'musical');

CREATE TABLE IF NOT EXISTS public.works (
  work_id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title             varchar NOT NULL,
  format            work_format NOT NULL,
  author            varchar,
  release_year      integer,
  full_script_text  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cards (
  card_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id              bigint NOT NULL REFERENCES public.works(work_id),
  quote                text NOT NULL,
  script_excerpt       text NOT NULL,
  excerpt_description  varchar,
  keywords             jsonb NOT NULL,
  temperature          smallint NOT NULL CHECK (temperature BETWEEN 1 AND 5),
  intensity            smallint NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.genres (
  genre_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS public.work_genres (
  work_id   bigint  NOT NULL REFERENCES public.works(work_id),
  genre_id  integer NOT NULL REFERENCES public.genres(genre_id),
  PRIMARY KEY (work_id, genre_id)
);
