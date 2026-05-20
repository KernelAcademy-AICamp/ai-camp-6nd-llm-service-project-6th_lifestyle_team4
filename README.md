[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/lRhLQRK0)

# Daily Script

영화/드라마/연극/뮤지컬의 명대사 카드를 매일 한 장씩 추천하는 시네마틱 Flutter 앱입니다.
Supabase 를 백엔드로 사용하며, 클릭 로그가 사용자 선호로 자동 누적되어 `recommend_cards` RPC 가 추천을 돌립니다.

## 화면

- **Home** — 오늘의 각본 글래스 카드 + 지난 기록
- **Archive** — 컬렉션(북마크) 그리드 + 장르 필터 + 검색
- **Card Detail** — 장면 헤더 / 지문 / 캐릭터 / 인용구 + Collect 버튼
- **Settings** — 프로필, 푸시 토글, 테마/약관/버전, 사인아웃

## 디렉토리

```
lib/
  core/             SupabaseConfig (init + 익명 로그인)
  theme/            AppColors / AppTypography / AppSpacing / AppTheme
  widgets/          GlassCard, AppTopBar, AppBottomNav, AtmosphericBackground
  models/           Work / Genre / ScriptCard
  data/             CardRepository (recommend_cards RPC, 클릭/북마크)
  providers/        Riverpod 프로바이더 (today / recent / bookmarks / detail)
  routing/          go_router + ShellRoute
  screens/          home / archive / card_detail / settings

supabase/
  migrations/
    001_init.sql              # 사용자가 제공한 원본 스키마
    002_user_bookmarks.sql    # 컬렉션(북마크) 테이블 + RLS
  seed.sql                    # 장르 13 + 작품 8 + 카드 10 + 해시태그/매핑
```

## 셋업

### 1. 의존성 설치

```powershell
flutter pub get
```

### 2. Supabase 준비

Supabase 대시보드의 SQL Editor 에서 아래 순서로 실행하세요.

1. `supabase/migrations/001_init.sql` (이미 실행했다면 건너뛰기)
2. `supabase/migrations/002_user_bookmarks.sql`
3. `supabase/seed.sql`

그리고 **익명 로그인 활성화**:
Authentication → Providers → "Anonymous Sign-Ins" 토글 ON.

### 3. `.env` 채우기

`.env.example` 를 참고해 프로젝트 루트의 `.env` 를 채웁니다.

```
SUPABASE_URL=https://xxxxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
```

> `.env` 는 `.gitignore` 에 포함되어 있어 커밋되지 않습니다.

### 4. 실행

```powershell
flutter run
```

첫 실행 시 자동으로 익명 세션이 생성됩니다. Home 의 "전체 각본 읽기" 버튼이 클릭되면
`card_clicks` 에 로그가 쌓이고, 트리거가 `user_preferences` 를 갱신하며,
5번째 클릭부터 콜드스타트가 종료되고 `recommend_cards` 가 선호 기반으로 동작합니다.

## 디자인 토큰 출처

`stitch_daily_script_card/cinematic_script/DESIGN.md` 의 컬러/타이포/스페이싱을 그대로
`lib/theme/*.dart` 로 옮겼습니다. 글래스카드는 5% 흰색 fill + 15% 흰색 stroke + 20px 백드롭 블러.

## 알려진 사항

- 카드 이미지는 `cards.scene_meta.image_url` 또는 `cover_image` 가 있으면 Archive/Detail
  배경으로 사용합니다. 시드에는 이미지 URL 이 없어 Archive 카드 썸네일은 단색 배경으로 보입니다.
- 푸시 알림 토글은 현재 UI 상태만 갱신합니다 (FCM 연동은 후속 작업).
- `withOpacity` 관련 deprecation 경고가 정적 분석에 다수 나오지만 동작에는 영향 없습니다.

