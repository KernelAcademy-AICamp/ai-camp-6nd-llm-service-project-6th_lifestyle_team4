# API 명세서 (API Specification)

> 백엔드 = **Supabase 프로젝트**. 클라이언트는 anon JWT로 **PostgREST(REST) · RPC · Storage · GoTrue(Auth)**를 직접 호출한다. 추가로 **Vercel 서버리스 함수**(소비자 BFF 2 + 관리자 파이프라인 12)가 보조 HTTP API를 제공한다.
> 출처: `upload_web/supabase/migrations/*`(파일 57개 · 번호 047까지 · 10개 번호 중복) + `main_app/android/supabase/*`(14) 정합 + 3 클라이언트 실제 호출. 동반: [01_분리_요구사항.md](01_분리_요구사항.md), [02_기능_명세서.md](02_기능_명세서.md).

---

## 1. 개요

| 항목 | 값 |
|---|---|
| 백엔드 종류 | Supabase (PostgreSQL + PostgREST + GoTrue + Storage + Realtime) |
| REST 베이스 | `https://<project-ref>.supabase.co/rest/v1` |
| Auth 베이스 | `https://<project-ref>.supabase.co/auth/v1` |
| Storage 베이스 | `https://<project-ref>.supabase.co/storage/v1` |
| RPC 호출 | `POST /rest/v1/rpc/<function>` (SDK `.rpc()`) |
| 공개 키 | `SUPABASE_ANON_KEY` (클라이언트 내장 가능) |
| 서버 전용 키 | `SUPABASE_SERVICE_ROLE_KEY` (서버리스에서만, RLS 우회) |
| 스키마 | 별도 표기 없으면 모두 `public` |

> 각 클라이언트는 보통 Supabase SDK(supabase-kt / supabase-swift / supabase-js)를 사용하므로, REST 경로보다 **테이블명·컬럼·RPC 시그니처·RLS**가 실질 계약이다. iOS 위젯과 일부 경로만 raw REST를 직접 호출한다.

---

## 2. 공통 규약

### 2.1 인증 헤더 (PostgREST/RPC/Storage 공통)
```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <user_access_token | SUPABASE_ANON_KEY>
Content-Type: application/json
```
- 비로그인(게스트)은 `Authorization`에 anon 키 사용 → 공개 SELECT만 통과.
- 로그인 사용자는 GoTrue access token(JWT) 사용 → RLS가 `auth.uid()`/`auth.jwt()`로 평가.

### 2.2 PostgREST 관례
- 필터: `?col=eq.<v>`, `in.(...)`, `order=col.desc`, `limit`, 범위는 `Range` 헤더(`range(from,to)`).
- 리소스 임베딩: `select=*,works(*,work_genres(genres(name)))`.
- INSERT 반환: `Prefer: return=representation`.
- UPSERT: `Prefer: resolution=merge-duplicates`, `on_conflict=<cols>`.

### 2.3 식별 모델 (필수 이해)
- 사용자별 테이블의 `user_id`(bigint)는 `users.user_id`. 인증 매칭은 `users.anonymous_id = auth.uid()`(uuid).
- 직접 `auth.users(id)`(uuid) FK를 갖는 예외: `quiz_rankings.user_id`, `card_candidates.{claimed_by,reviewer_id,extracted_by}`.

### 2.4 오류 형식
- **PostgREST**: HTTP 4xx/5xx + `{ code, message, details, hint }`(Postgres SQLSTATE). 대표:
  - `401` 인증 누락/만료, `403` RLS 위배(`42501` / "new row violates row-level security policy"),
  - `409` UNIQUE/PK 충돌(`23505`), `23503` FK 위배, `23514` CHECK 위배, `22P02` 잘못된 입력.
- **RPC**: 함수가 던지는 `RAISE`는 4xx로 매핑되거나, **음수/특수 반환값으로 비즈니스 오류를 표현**(아래 각 RPC의 "오류" 열 참조). 호출자는 **반환값을 반드시 확인**해야 한다.
- **GoTrue**: `{ error, error_description }` 또는 `{ code, msg }`(예: `invalid_credentials`, `user_already_exists`, `email_not_confirmed`).

---

## 3. 인증 API (GoTrue)

| 동작 | SDK | REST | 비고 |
|---|---|---|---|
| 이메일 가입 | `signUp({email,password})` | `POST /auth/v1/signup` | ID→합성이메일(`<id>@user.local`) |
| 이메일 로그인 | `signInWithPassword` | `POST /auth/v1/token?grant_type=password` | |
| OAuth(Google/Kakao) | `signInWithOAuth({provider})` | `GET /auth/v1/authorize?provider=` | redirect: Android `com.lifestyle.dailyscript://login-callback`, iOS `curtaincall://login-callback`, Web `<origin>/m/` |
| IDToken(Google 네이티브/Apple) | `signInWithIdToken({provider,idToken,nonce})` | `POST /auth/v1/token?grant_type=id_token` | Android Google, iOS Apple |
| 세션 갱신 | `refreshSession` | `POST /auth/v1/token?grant_type=refresh_token` | |
| 로그아웃 | `signOut` | `POST /auth/v1/logout` | |
| 현재 사용자 | `getUser(token)` | `GET /auth/v1/user` | 서버리스 `requireUser`가 사용 |

- **익명 로그인 비활성**(전 클라이언트). 대시보드 Auth → Anonymous OFF 권장.
- **프로바이더 설정 필요**: Google, Kakao(비즈앱+redirect), Apple(iOS — **현재 미설정**). redirect URL 등록 필수.
- 가입 직후 세션 미발급(이메일 확인 모드) 시 클라이언트가 `signInWithPassword`로 후속 로그인.

---

## 4. 데이터 모델 (테이블)

> 표기: 🔑PK, →FK(ON DELETE), ⚙️RLS, 📡Realtime 퍼블리케이션 포함. 타입은 PostgreSQL.
> ⚠️ `users / user_bookmarks / user_daily_cards / user_card_selections / user_preferences` 5종은 리포지토리에 `CREATE TABLE`이 없고 ALTER·클라이언트 모델로 재구성된 **[추정]**. 분리 시 라이브 DB `pg_dump`로 확정 필요(§부록 A).

### 4.1 콘텐츠 (관리자 쓰기 / 공개 읽기)

#### `works`
| 컬럼 | 타입 | NULL | 기본 | 비고 |
|---|---|---|---|---|
| `work_id` | bigint | N | IDENTITY | 🔑 |
| `title` | varchar | N | | |
| `format` | `work_format`(enum) | N | | §9 |
| `author` | varchar | Y | | |
| `release_year` | integer | Y | | |
| `full_script_text` | text | N | | 원문 전문 |
| `characters` | jsonb | Y | | 등장인물 배열 |
| `subtitle` | varchar | Y | | |
| `title_original` / `subtitle_original` / `author_original` | text | Y | | 원어 |
| `cover_url` | text | Y | | 표지 공개 URL |
| `intro` | text | Y | | 작품 소개 |
| `created_at` / `updated_at` | timestamptz | N | now() | |

⚙️ SELECT 공개(anon+auth), INSERT/UPDATE/DELETE 관리자(`is_admin()`). 📡. 인덱스 `works_has_original_idx (work_id) WHERE title_original IS NOT NULL`.

#### `cards`
| 컬럼 | 타입 | NULL | 기본 | 비고 |
|---|---|---|---|---|
| `card_id` | bigint | N | IDENTITY | 🔑 |
| `work_id` | bigint | N | | →`works(work_id)` (NO ACTION) |
| `quote` | text | N | | 명대사 |
| `script_excerpt` | text | N | | 극본 발췌 |
| `excerpt_description` | varchar | Y | | 장면 설명 |
| `keywords` | jsonb | N | | 키워드 배열 |
| `temperature` | smallint | N | | **CHECK 1–5** |
| `intensity` | smallint | N | | **CHECK 1–5** |
| `significance` | text | Y | | 의의 |
| `quote_original` / `script_excerpt_original` / `excerpt_description_original` / `significance_original` | text | Y | | 원어 |
| `keywords_original` | jsonb | Y | | 원어 키워드 |
| `share_count` | integer | N | 0 | |
| `text_align` / `text_align_original` | text | Y | | 'left'\|'center'\|'right' (CHECK 없음·COMMENT 규약) |
| `comment_count` | integer | N | 0 | 트리거 동기화 |
| `created_at` / `updated_at` | timestamptz | N | now() | |

⚙️ SELECT 공개, 쓰기 관리자. 📡. 인덱스 `cards_has_original_idx (card_id) WHERE quote_original IS NOT NULL`.

#### `genres`
`genre_id` integer IDENTITY 🔑 · `name` varchar N. ⚙️ SELECT 공개, 쓰기 관리자.

#### `work_genres`
`work_id` bigint →`works`, `genre_id` integer →`genres`, 🔑`(work_id,genre_id)`. ⚙️ SELECT 공개, 쓰기 관리자.

### 4.2 사용자/계정

#### `users` [추정 베이스]
| 컬럼 | 타입 | NULL | 기본 | 비고 |
|---|---|---|---|---|
| `user_id` | bigint | N | IDENTITY | 🔑 |
| `anonymous_id` | uuid | | | = `auth.uid()`; **UNIQUE INDEX** `users_anonymous_id_unique`(android 14·전체컬럼·부분아님) |
| `nickname` | text | Y | | |
| `session_id` | text | Y | | 단일세션 가드(009) |
| `login_id` | text | Y | | **UNIQUE** `lower(login_id)` 부분 |
| `gender` | text | Y | | CHECK ∈ {male,female,other} |
| `age_group` | text | Y | | CHECK ∈ {10s…90s} |
| `yarn_balance` | int | N | 0 | 실타래 잔액 |
| `pref_genres` / `pref_themes` | jsonb | Y | | 선호 |
| `pref_any` | boolean | Y | | |
| `pref_updated_at` | timestamptz | Y | | |

⚙️ SELECT/INSERT/UPDATE **본인만**(`anonymous_id = auth.uid()`). DELETE 정책 없음(탈퇴 RPC로 처리).

#### `user_bookmarks` [추정 베이스]
`bookmark_id`🔑 · `user_id` bigint →`users` · `card_id` bigint →`cards` · `created_at` timestamptz. **UNIQUE 제약 `user_bookmarks_user_card_unique (user_id,card_id)`**(android 03). ⚙️ owner-only ALL. 📡.
> ⚠️ `bookmark_id` PK·컬럼 타입·FK ON DELETE 동작은 리포에 정의 없음([추정], §부록 A).

#### `user_daily_cards`, `user_card_selections`, `user_preferences` [추정 베이스]
`user_id` bigint →`users` 키. ⚙️ owner-only. **정확한 컬럼은 라이브 DB 확인 필요**(§부록 A).

#### `quiz_rankings`
`id` bigserial🔑 · `name` text N · `score` int N · `correct` int N(0) · `played` int N(0) · `user_id` uuid →`auth.users(id)` **SET NULL** · `created_at` timestamptz N now(). 인덱스 `(score desc, created_at desc)`. ⚙️ SELECT 공개, INSERT 본인(`auth.uid()=user_id`), UPDATE/DELETE 본인-또는-관리자.

### 4.3 소셜 — 피드/하이라이트/댓글/좋아요

#### `feed_posts`
`post_id`🔑 · `card_id` →`cards`(CASCADE) · `user_id` →`users`(CASCADE) · `author_nickname` text · `body` text N **CHECK trim 1–300** · `created_at`. ⚙️ SELECT 공개, INSERT 본인+비익명, UPDATE/DELETE 본인. 📡.

#### `card_highlights`
`highlight_id`🔑 · `card_id` →`cards`(CASCADE) · `user_id` →`users`(CASCADE) · `selected_text` text N **CHECK trim 1–2000** · `user_note` text **CHECK NULL 또는 ≤500** · `author_nickname` text · `created_at`. ⚙️ 동일 패턴. 📡.

#### `card_comments`
`comment_id`🔑 · `card_id` →`cards`(CASCADE) · `user_id` →`users`(CASCADE) · `author_nickname` text · `body` text N **CHECK trim 1–500** · `parent_comment_id` →`card_comments`(CASCADE, 자기참조) · `created_at`. ⚙️ SELECT 공개, INSERT 본인+비익명, UPDATE/DELETE 본인. 📡. 트리거 `sync_card_comment_count`.

#### `feed_post_comments`
`comment_id`🔑 · `post_id` →`feed_posts`(CASCADE) · `user_id` →`users`(CASCADE) · `author_nickname` · `body` **CHECK 1–500** · `parent_comment_id` →self(CASCADE) · `created_at`. ⚙️ 동일. 트리거 `trg_notify_feed_post_comment`.

#### `card_highlight_comments`
`comment_id`🔑 · `highlight_id` →`card_highlights`(CASCADE) · `user_id` →`users`(CASCADE) · `author_nickname` · `body` **CHECK 1–500** · `parent_comment_id` →self(CASCADE) · `created_at`. ⚙️ 동일. 트리거 `trg_notify_highlight_comment`.

#### `comment_likes` / `feed_post_comment_likes` / `card_highlight_comment_likes`
각각 `comment_id` →(해당 댓글테이블, CASCADE) · `user_id` →`users`(CASCADE) · `created_at` · 🔑`(comment_id,user_id)`. ⚙️ SELECT 공개, INSERT 본인+비익명, DELETE 본인(UPDATE 없음). `comment_likes`는 📡.

#### `content_likes`
`user_id` bigint N · `target_type` text N **CHECK ∈ {feed_post,highlight}** · `target_id` bigint N · `created_at` · 🔑`(user_id,target_type,target_id)`. 인덱스 `(target_type,target_id)`. ⚙️ SELECT `using(true)`, ALL `using(true)/check(true)`(**정책은 완전 개방**; 쓰기는 관례상 RPC `toggle_content_like` 경유이나 정책이 RPC-only를 강제하진 않음). → 집계 view §5.

### 4.4 게이미피케이션 / 공유

#### `attendance`
`user_id` bigint N · `attended_date` date N · `created_at` timestamptz N now() · 🔑`(user_id,attended_date)`. FK 없음. ⚙️ SELECT 본인만; 쓰기 정책 없음(RPC `check_in_attendance`로만).

#### `yarn_card_rewards`
`user_id` bigint N · `card_id` bigint N · `rewarded_at` timestamptz N now() · 🔑`(user_id,card_id)`. FK 없음. ⚙️ service_role(=DEFINER RPC `reward_yarn_first_view` 경유).

#### `share_backgrounds`
`slug` text🔑 · `name` text N · `tier` text N **CHECK ∈ {premium,royal}** · `price` int N(0) · `image_url` text N · `ink` text N('#3B2A1A') · `work_id` bigint →`works` **SET NULL** · `work_title` text · `sort_order` int N(0) · `is_active` boolean N(true) · `created_at`/`updated_at`. 인덱스 `(is_active,tier,sort_order)`. ⚙️ SELECT anon+auth(`is_active=true`)+관리자전체, 쓰기 관리자.

#### `share_theme_unlocks`
`user_id` bigint N →`users`(CASCADE, **047에서 FK 추가**·046 생성 시 FK 없음) · `theme_id` text N · `unlocked_at` timestamptz N now() · 🔑`(user_id,theme_id)`. ⚙️ SELECT 본인 행만(**anon+authenticated 모두** — 비회원도 자기 행 읽기); 쓰기 정책 없음(RPC `purchase_share_theme`로만).

#### `oz_theme_unlocks` (레거시)
`user_id` bigint N · `theme_id` text N · `unlocked_at` · 🔑`(user_id,theme_id)`. FK 없음. ⚙️ service_role(RPC `purchase_oz_theme`).

#### `share_links`
`short_id` text🔑 · `referrer_id` bigint · `card_id` bigint · `bg_id` text · `quote_b64` text · `created_at` timestamptz N now(). 인덱스 `(created_at desc)`, `(referrer_id) WHERE NOT NULL`. ⚙️ SELECT `using(true)`(공개 읽기), INSERT `check(true)`, UPDATE/DELETE 없음. (생성은 RPC `create_share_link`.)

#### `referrals`
`referee_id` bigint N🔑 · `referrer_id` bigint N · `redeemed_at` timestamptz N now(). 인덱스 `(referrer_id)`. ⚙️ service_role(RPC `redeem_referral`).

### 4.5 알림 / 공지 / 모더레이션

#### `notifications`
`notification_id`🔑 · `recipient_user_id` bigint N · `actor_user_id` bigint N · `actor_nickname` text · `kind` text N(∈ {post_comment,comment_reply,highlight_comment,highlight_comment_reply}) · `target_post_id` bigint · `target_highlight_id` bigint · `target_comment_id` bigint · `body_preview` text · `is_read` boolean N(false) · `created_at`. FK 없음(loose). 인덱스 `(recipient_user_id,is_read,created_at desc)`. ⚙️ SELECT/UPDATE/INSERT 모두 `using(true)/check(true)`(관대; 클라이언트가 `recipient_user_id` 필터, INSERT는 DEFINER 트리거에서만 실제 발생). DELETE 정책 없음.

#### `notices`
`notice_id`🔑 · `tag` text N('notice', CHECK ∈ {update,notice,event}) · `title` text N **CHECK 1–120** · `body` text N **CHECK 1–4000** · `pinned` boolean N(false) · `published` boolean N(true) · `created_at`/`updated_at`. 인덱스 `(pinned desc,created_at desc)`. 트리거 `notices_set_updated_at`. ⚙️ SELECT published-또는-관리자, 쓰기 관리자. 📡.

#### `content_reports`
`report_id`🔑 · `reporter_user_id` bigint N →`users`(CASCADE) · `content_type` text N(CHECK ∈ {feed_post,card_comment,highlight,highlight_comment,feed_post_comment}) · `content_id` bigint N · `reason` text N **CHECK 1–50** · `created_at` · **UNIQUE `(reporter_user_id,content_type,content_id)`**. 인덱스 `(content_type,content_id)`. ⚙️ **RLS 정책 없음 → 직접접근 전면차단**(RPC `report_content`로만 기록, 열람은 service_role).

#### `user_blocks`
`blocker_user_id` bigint N →`users`(CASCADE) · `blocked_user_id` bigint N →`users`(CASCADE) · `created_at` · 🔑`(blocker_user_id,blocked_user_id)` · **CHECK blocker ≠ blocked**. 인덱스 `(blocker_user_id)`. ⚙️ SELECT 본인(blocker)만; 쓰기 정책 없음(RPC `block_user`/`unblock_user`).

### 4.6 관리자 / 콘텐츠 파이프라인

#### `card_candidates`
검수 큐. 주요 컬럼: `candidate_id`🔑 · `work_id` →`works` · `quote`/`script_excerpt` text N · `excerpt_description`/`significance` text · `keywords` jsonb N('[]') · `temperature`/`intensity` smallint **CHECK 1–5** · `status` text N('pending', CHECK ∈ {pending,approved,rejected,needs_edit}) · `source_kind` text(CHECK ∈ {uploaded_doc,web_seed,manual}) · `source_url`/`source_text` text · `quote_verbatim_verified` boolean N(false) · `claimed_by`/`reviewer_id`/`extracted_by` uuid →`auth.users(id)` · `claimed_at`/`reviewed_at`/`extracted_at` timestamptz · `notes` text · `original_payload` jsonb · `promoted_card_id` bigint →`cards` **SET NULL** · `*_original`(quote/script_excerpt/excerpt_description/significance/keywords) · `created_at`/`updated_at`. 인덱스 `(status,extracted_at)`,`(claimed_at)`. 트리거 `card_candidates_set_updated_at`. ⚙️ **관리자 전용**(anon/비관리자는 SELECT도 불가).

#### `gutenberg_books`
`book_id` integer🔑 · `title` text N · `subtitle` text · `authors`/`languages`/`subjects`/`bookshelves` text[] N('{}') · `author_birth`/`author_death` integer · `text_url` text · `download_count` integer N(0) · `fetched_at`/`updated_at`. GIN 인덱스(bookshelves/subjects/languages/authors) + btree(download_count desc, lower(title)). ⚙️ **service_role 전용**.

#### `gutenberg_book_text`
`book_id` integer🔑 →`gutenberg_books`(CASCADE) · `raw_text` text N · `text_length` integer N · `source_url` text · `fetched_at`/`last_used_at` timestamptz N now(). 인덱스 `(last_used_at)`. ⚙️ service_role 전용.

#### `gutendex_cache`
`category` text🔑 · `topic` text N · `payload` jsonb N · `fetched_at` timestamptz N now(). 인덱스 `(fetched_at desc)`. ⚙️ service_role 전용.

---

## 5. 뷰 (Views)

#### `card_bookmark_counts` [추정 — 리포에 CREATE VIEW 없음]
카드별 북마크 수 집계. SELECT 컬럼 `card_id, bookmark_count`(클라이언트 호출로 재구성). 공개 읽기. **뷰 정의·grant는 라이브 DB에만 존재**(§부록 A). (클라이언트: `in.(card_id…)` 또는 전체 `limit 2000`.)

#### `content_like_counts`
`SELECT target_type, target_id, COUNT(*) AS like_count FROM content_likes GROUP BY target_type, target_id`. SELECT 권한 anon/authenticated/service_role.

---

## 6. RPC API

> 호출: `POST /rest/v1/rpc/<fn>` 본문 `{ 인자 }`. **반환값/오류코드 규약을 반드시 확인**. Sec=보안컨텍스트(DEFINER는 RLS 우회·내부에서 `auth.uid()`로 대상 결정).

### 6.1 사용자/계정

| 함수 | 인자 | 반환 | Sec | 오류/규약 | 호출 |
|---|---|---|---|---|---|
| `ensure_user_row` | `p_nickname text DEFAULT ''` | bigint(`user_id`) | DEFINER | `UNIQUE(anonymous_id)` 의존 원자 get-or-create | A·W |
| `email_available` | `p_email text` | boolean | DEFINER | 동일 이메일 없으면 true(대소문자무시) | A·W |
| `find_email_by_login_id` | `p_login_id text` | text(email) | DEFINER | 없으면 NULL | W |
| `delete_account` | (없음) | void | DEFINER | `auth.uid()`로 대상; 종속 콘텐츠+`public.users`+`auth.users` 삭제 | A·i |
| `delete_my_account` | `p_user_id bigint` | void | DEFINER | `share_theme_unlocks`+`public.users`+`auth.users` 삭제(최종=047) | W |

### 6.2 카드/공유

| 함수 | 인자 | 반환 | Sec | 오류/규약 | 호출 |
|---|---|---|---|---|---|
| `increment_card_view` | `p_card_id bigint` | (void/무시) | — | fire-and-forget. ⚠️리포에 정의 없음(§부록 A) | A·i·W |
| `increment_share_count` | `p_card_id bigint` | integer | DEFINER | 새 share_count, **-1**=인자 NULL | A·i·W |
| `create_share_link` | `p_referrer_id bigint, p_card_id bigint, p_bg_id text, p_quote_b64 text` | text(short_id) | DEFINER | 6자 id, 충돌 시 재시도 | A·W |
| `purchase_share_theme` | `p_theme_id text, p_price int` | int(잔액) | DEFINER | `auth.uid()` 대상; **-1**=인자 NULL/`p_price<0`, **-2**=잔액부족(미차감), **-3**=user행 없음 | A·W |
| `purchase_oz_theme`(레거시) | `p_user_id bigint, p_theme_id text, p_price int` | int(잔액) | DEFINER | **-1** NULL, **-2** 부족 | W |

### 6.3 실타래 / 출석

| 함수 | 인자 | 반환 | Sec | 오류/규약 | 호출 |
|---|---|---|---|---|---|
| `consume_yarn` | (없음) | int(잔액) | DEFINER | >0이면 -1 차감, 아니면 **-1** | A·i·W |
| `spend_yarn` | `p_amount int` | int(잔액) | DEFINER | 충분하면 차감, 아니면 **-1** | A·W |
| `grant_yarn` | `p_n int` | int(잔액) | DEFINER | QA 충전(`+= p_n`) | A·i·W |
| `reward_yarn_first_view` | `p_user_id bigint, p_card_id bigint` | integer(잔액) | DEFINER | 첫열람 **+300**(dedup `yarn_card_rewards`), **-1**=인자 NULL (최종=038) | i·W |
| `check_in_attendance` | `p_reward int DEFAULT 100` | json `{rewarded,balance,today}` | DEFINER | KST 당일 첫 출석만 보상; 익명 차단 | A·i·W |
| `redeem_referral` | `p_referrer_id bigint, p_referee_id bigint` | integer(referee 잔액) | DEFINER | 양측 **+600**(referee dedup), **-1/-2/-3** 오류 | W |

### 6.4 좋아요 / 모더레이션

| 함수 | 인자 | 반환 | Sec | 오류/규약 | 호출 |
|---|---|---|---|---|---|
| `toggle_content_like` | `p_user_id bigint, p_target_type text, p_target_id bigint` | jsonb `{liked,count}` | DEFINER | `target_type`∈{feed_post,highlight}; NULL user/잘못된 타입 시 RAISE | A·i·W |
| `report_content` | `p_content_type text, p_content_id bigint, p_reason text` | void | DEFINER | `auth.uid()`→user; dedup UNIQUE | i |
| `block_user` | `p_blocked_user_id bigint` | void | DEFINER | 회원만(익명 차단) | i |
| `unblock_user` | `p_blocked_user_id bigint` | void | DEFINER | 회원만 | i |

### 6.5 관리자 / 콘텐츠 파이프라인

| 함수 | 인자 | 반환 | Sec | 비고 |
|---|---|---|---|---|
| `promote_candidate` | `p_candidate_id bigint` | bigint(새 `card_id`) | DEFINER | 승인 후보→`cards` 복사(`*_original` 포함), `promoted_card_id` 기록. 내부 관리자체크 없음(최종=026) |
| `search_gutenberg_by_topic` | `p_topic text, p_lang text DEFAULT 'en', p_limit int DEFAULT 60` | SETOF `gutenberg_books` | DEFINER(STABLE) | service_role only |
| `search_gutenberg_by_title` | `p_query text, p_lang text DEFAULT 'en', p_limit int DEFAULT 10` | SETOF `gutenberg_books` | DEFINER(STABLE) | service_role only |

### 6.6 내부/트리거/운영 함수

| 함수 | 인자 | 반환 | Sec | 비고 |
|---|---|---|---|---|
| `is_admin` | (없음) | boolean | INVOKER(STABLE) | `auth.jwt().app_metadata.role='admin'` |
| `set_updated_at` | (없음) | trigger | INVOKER | `NEW.updated_at=now()` |
| `sync_card_comment_count` | (없음) | trigger | DEFINER | `cards.comment_count` 동기화 |
| `notify_on_feed_post_comment` | (없음) | trigger | DEFINER | `notifications` insert |
| `notify_on_highlight_comment` | (없음) | trigger | DEFINER | `notifications` insert |
| `_gen_short_id` | `p_len int DEFAULT 6` | text | INVOKER | base62 랜덤 id |
| `purge_stale_anonymous_users` | `p_days int DEFAULT 30, p_dry_run boolean DEFAULT true` | integer(건수) | DEFINER | **public/anon/authenticated에서 REVOKE**(cron/postgres 전용) |

> 참고: `_merge_dup_user`(android 14)는 일회성 헬퍼로 마이그레이션 말미에 **DROP**되어 최종 스키마에 없음.

---

## 7. Storage 버킷

| 버킷 | 공개 | 읽기 | 쓰기 | 용도 |
|---|---|---|---|---|
| `notice-images` | public=true | 누구나 | 관리자(`is_admin()`) | 공지 이미지 |
| `share-backgrounds` | public=true | 누구나 | 관리자 | 프리미엄/로열 공유 배경 |

- 접근: `GET /storage/v1/object/public/<bucket>/<path>`(읽기). 쓰기는 `storage.objects` RLS(관리자 + bucket 매칭).
- ⚠️ `works.cover_url`이 가리키는 `covers` 경로용 버킷은 SQL에 생성문이 없음(외부/수동 추정 — §부록 A).
- 클라이언트(Android/iOS)는 Storage SDK 미사용, 전부 **공개 URL 직접 로드**(Coil/이미지).

---

## 8. 트리거 / Realtime

**트리거**
| 트리거 | 테이블 | 시점/이벤트 | 함수 |
|---|---|---|---|
| `notices_set_updated_at` | notices | BEFORE UPDATE | `set_updated_at` |
| `card_candidates_set_updated_at` | card_candidates | BEFORE UPDATE | `set_updated_at` |
| `trg_notify_feed_post_comment` | feed_post_comments | AFTER INSERT | `notify_on_feed_post_comment` |
| `trg_notify_highlight_comment` | card_highlight_comments | AFTER INSERT | `notify_on_highlight_comment` |
| `trg_card_comments_count_ins` | card_comments | AFTER INSERT | `sync_card_comment_count` |
| `trg_card_comments_count_del` | card_comments | AFTER DELETE | `sync_card_comment_count` |

**Realtime 퍼블리케이션 `supabase_realtime`**: `cards, works, user_bookmarks, card_comments, comment_likes, feed_posts, card_highlights, notices`.
> 카드 댓글에는 알림 트리거가 없다(피드/하이라이트 댓글만 알림 생성).

---

## 9. Enum / CHECK 부록

**Enum `work_format`**(외부 정의, 마이그레이션이 `ADD VALUE IF NOT EXISTS`로 확장):
최종 멤버 = `movie, drama, play, musical, opera, novel, poem, essay, prose`.
> android 02_seed는 '영화','드라마' 등 한글 리터럴을 다른/별칭 `format` 타입에 캐스팅 — 웹 정본은 영문 `work_format`.

**CHECK 제약 모음**
- `cards`, `card_candidates`: temperature 1–5, intensity 1–5.
- `card_candidates`: status ∈ {pending,approved,rejected,needs_edit}; source_kind ∈ {uploaded_doc,web_seed,manual}.
- `users`: gender ∈ {male,female,other}; age_group ∈ {10s…90s}.
- `notices`: tag ∈ {update,notice,event}; title 1–120; body 1–4000.
- `card_comments`/`feed_post_comments`/`card_highlight_comments`: body trim 1–500. `feed_posts`: body trim 1–300.
- `card_highlights`: selected_text trim 1–2000; user_note NULL 또는 ≤500.
- `share_backgrounds`: tier ∈ {premium,royal}.
- `content_reports`: content_type ∈ {feed_post,card_comment,highlight,highlight_comment,feed_post_comment}; reason 1–50.
- `content_likes`: target_type ∈ {feed_post,highlight}.
- `user_blocks`: blocker_user_id ≠ blocked_user_id.

---

## 10. 서버리스 HTTP API (Vercel)

> 이 절만 **진짜 REST 엔드포인트**(method/path 고정). 위 1–9는 Supabase SDK 계약.

### 10.1 소비자 BFF (web_pwa/api — 인증 없음)

#### `GET /api/config`
- 인증: 없음. 응답: `{ supabaseUrl, supabaseAnonKey, amplitudeApiKey, clarityProjectId }` (env, 분석키는 기본 폴백). `Cache-Control: public, max-age=300`. anon 키만.

#### `POST /api/feedback`
- 인증: 없음. 비-POST→**405**, 본문>64KB→**413**.
- 본문(JSON, 각 길이 캡): `gender,age,rating,liked,improve,message,email,page`.
- 동작: `x-www-form-urlencoded`로 Google Apps Script(`FEEDBACK_ENDPOINT`)에 전달(10s 타임아웃).
- 응답: `{ ok:true }` / 실패 `{ ok:false, error }`(**502** upstream). Supabase 미사용.

### 10.2 관리자 파이프라인 (upload_web/api — `requireAdmin` 가드)

> 인증: `Authorization: Bearer <admin access token>` → `auth.getUser` + `app_metadata.role==='admin'`(아니면 **403**, 토큰없음 **401**). DB 쓰기는 **service_role**. LLM=Anthropic. 모델 별칭 `haiku→claude-haiku-4-5-20251001`(기본), `sonnet→claude-sonnet-4-6`, `opus→claude-opus-4-7`.

| Method · Path | 입력 | 동작/외부 | 응답 |
|---|---|---|---|
| `GET /api/config` | — | env(자체 런타임 설정) | `{ supabaseUrl, supabaseAnonKey }` |
| `POST /api/extract` *(max 300s)* | multipart(파일≤50MB + `category,title,model`) **또는** JSON(`{text,category,model,title}`). `category`∈{screen,opera,play,novel,poem,essay,prose} | 문서 텍스트추출→Anthropic 카드추출(+Wikiquote/Wikipedia/namu 시드). NDJSON 스트리밍 지원 | `{ cards, work, full_script_text, _seed_debug, _chunked? }` |
| `POST /api/save` *(max 60s, ≤30MB)* | `{ work{title,format,author,subtitle,release_year,characters,genres,*_original}, full_script_text, cards[] }` | `works` insert·`genres` upsert·`work_genres` 링크·**`card_candidates`(pending) 대량 insert**·작가명 한글화(Anthropic) | `{ work_id, candidate_count, verbatim_verified_count, pending_review:true, validation }` |
| `GET/POST /api/candidates` *(max 120s)* | GET `?status=&limit=`; POST `{action: claim\|release\|decide\|save\|delete, candidateId, ...}` | 검수 큐 관리. `decide(approved)`→RPC `promote_candidate`→`cards`. claim=10분 TTL | 목록/결과 JSON |
| `POST /api/translate-field` | `{text,field,direction(en2ko\|ko2en),work?,model?}` field∈{quote,script_excerpt,title,subtitle,author,excerpt_description,significance,keywords} | Anthropic 단일필드 번역 | `{ translated }` |
| `POST /api/translate-fields` *(max 90s)* | `{fields:[{name,text,kind?}]≤12, direction, work?, model?}` | Anthropic 다필드 번역 | `{ translations:{name:text} }` |
| `POST /api/translate-card-batch` *(max 120s)* | `{cards[]≤10, work?, model?}` | Anthropic 카드 5필드 양방향 일괄 | `{ results[], work }` |
| `POST /api/classify-keywords` *(max 60s)* | `{keywords[]≤1000, 각≤80자}` | Anthropic 키워드 분류 | `{ assignments }` |
| `POST /api/backfill-characters` *(max 300s)* | `?limit=`(1–10, 기본3) | `works.characters IS NULL`→Anthropic 추출→update | `{ processed, remaining, results }` |
| `POST /api/backfill-intro` *(max 300s)* | `?limit=`(1–10) | `works.intro IS NULL`→Anthropic 생성→update | `{ processed, remaining, results }` |
| `POST /api/fetch-source` | `{kind: wikisource_kr\|gutenberg, op: search\|fetch, ...}` | ko.wikisource / Gutendex+gutenberg.org(+`gutenberg_book_text/books` 캐시) | 검색결과/본문 |
| `GET /api/gutenberg-list` *(max 10s)* | `?category=` 또는 `?q=` | RPC `search_gutenberg_by_topic` / `search_gutenberg_by_title`(`gutenberg_books`만, 외부호출 없음) | `{ works[], category\|q, source }` |

**외부 서비스**: Anthropic Claude, Gutendex(`gutendex.com`), Project Gutenberg(`gutenberg.org`), ko.wikisource, Wikiquote/Wikipedia/namu.wiki, Google Apps Script(피드백), Amplitude·Clarity(클라이언트).
**서버 env**: `SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, FEEDBACK_ENDPOINT, AMPLITUDE_API_KEY, CLARITY_PROJECT_ID, QUOTES_FETCHER_UA, NAMU_FETCHER_UA`.

---

## 부록 A. 분리 전 라이브 DB에서 확정해야 할 항목

1. **베이스 테이블 DDL**(`CREATE TABLE`이 리포에 없음): `users`, `user_bookmarks`, `user_daily_cards`, `user_card_selections`, `user_preferences` — `pg_dump --schema-only`로 정확한 컬럼/타입/기본값/제약 추출.
2. **`covers` Storage 버킷** 실제 존재 여부(`works.cover_url` 참조처).
3. **실제 적용된 마이그레이션 상태**(수동 실행 이력) — 문서 SQL과 라이브의 드리프트 확인.
4. **함수 GRANT/REVOKE 실상태**(특히 `purge_stale_anonymous_users`, service_role 전용 함수).
5. **Realtime 퍼블리케이션** 실제 등록 테이블 목록.
6. **뷰 정의**: `card_bookmark_counts`는 리포에 `CREATE VIEW`가 없음(컬럼만 클라이언트 호출로 재구성). `content_like_counts`는 043에 정의됨.
7. **`increment_card_view` 함수**: 3 클라이언트가 모두 호출하나 리포 SQL에 `CREATE FUNCTION`이 없음 — 라이브 DB에서 시그니처/반환 확정 필요.

## 부록 B. 호출 클라이언트 약어
- **A** = Android, **i** = iOS, **W** = Web PWA. (관리자 파이프라인은 upload_web 전용.)
