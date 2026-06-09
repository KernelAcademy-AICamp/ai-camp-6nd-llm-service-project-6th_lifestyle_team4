-- ============================================================================
--  users 선호도 필드 — 온보딩에서 고른 장르·주제 (추천 가중에 사용)
--  - pref_genres : 선호 장르 format 배열. 예: ["novel","play"]
--  - pref_themes : 선호 주제(10범주 한글명) 배열. 예: ["관계·사랑","욕망·집착"]
--  - pref_any    : "상관없음"(모든 주제 폭넓게) 선택 여부
--  - pref_updated_at : 마지막 저장 시각
--  지금까진 localStorage(ds.pref)에만 저장 → 기기/브라우저 바뀌면 소실되던 것을
--  서버에도 보관(기기 간 동기화·서버측 추천/분석 가능).
--  기존 RLS 정책(users self read/insert/update)을 그대로 사용 — 행 단위라 컬럼 추가만으로 충분.
-- ============================================================================

alter table public.users
  add column if not exists pref_genres     jsonb,
  add column if not exists pref_themes     jsonb,
  add column if not exists pref_any        boolean,
  add column if not exists pref_updated_at timestamptz;
