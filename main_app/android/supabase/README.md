# Supabase setup

대시보드에서 한 번씩 실행하면 끝납니다.

## 1. Anonymous Auth 켜기

Authentication → **Providers** → **Anonymous** 토글 ON.
(앱이 첫 실행 시 `signInAnonymously()`로 익명 JWT를 받아옵니다.)

## 2. RLS 정책 적용 — `01_rls_policies.sql`

Supabase 대시보드 → **SQL Editor** → New query → 파일 내용 붙여넣기 → Run.

이 한 번으로:

- `users` : 자기 행만 read/insert/update
- `cards` / `works` / `genres` / `work_genres` : 익명 read 허용 (카탈로그)
- `user_bookmarks` / `user_daily_cards` / `user_card_selections` / `user_preferences` : 자기 행만 모든 작업

`auth.uid()` → `public.users.anonymous_id` 매핑을 통해 BIGINT `user_id` 키로 접근합니다.

> 이미 다른 정책이 있다면 `drop policy if exists ...` 줄이 정리해 줍니다. 정책 이름이 다른 기존 정책은 그대로 남으니, 필요하면 SQL Editor에서 먼저 정리해 주세요.

## 3. (선택) 샘플 시드 — `02_seed_sample.sql`

`cards` / `works` 가 비어 있어 앱에서 보여줄 게 없을 때만 실행. 같은 행이 이미 있으면 skip 합니다.

> `works.format` 은 USER-DEFINED enum 입니다. 시드 SQL은 `'영화' / '드라마' / '다큐멘터리'` 값을 가정합니다 — 실제 enum 라벨이 다르면 (`movie` / `drama` / `documentary` 등) `02_seed_sample.sql` 의 VALUES 절을 맞춰 수정한 뒤 실행하세요.

enum 값을 확인하려면:

```sql
select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'format';
```
