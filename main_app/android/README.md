# Daily Script — Android

매일 한 장의 명대사/명장면 카드를 보여주는 안드로이드 앱.
Kotlin + Jetpack Compose, Supabase 백엔드.

## 빠른 시작

1. **Android Studio (Hedgehog 2023.1.1+ 권장)** 으로 `main_app/android` 폴더를 연다.
2. Studio가 처음 열릴 때 Gradle wrapper(`gradle/wrapper/gradle-wrapper.jar`)가 자동 생성된다.
   - CLI에서 작업하려면 한 번만 `gradle wrapper --gradle-version 8.7` 을 실행해서 wrapper를 만든다.
3. 프로젝트 루트(`main_app/android/`)에 `local.properties` 파일을 만들고 Supabase 키를 넣는다 — `local.properties.sample` 파일을 복사해 채우면 된다.
   ```
   sdk.dir=<Android SDK 경로>
   SUPABASE_URL=https://<프로젝트>.supabase.co
   SUPABASE_ANON_KEY=<public anon key>
   ```
4. Sync → Run.

> `local.properties` 는 git에 커밋되지 않는다. 빌드 시 `BuildConfig.SUPABASE_URL` / `BuildConfig.SUPABASE_ANON_KEY` 상수로 주입된다.

## Supabase 사전 작업

- **Anonymous Auth 활성화** — Supabase 대시보드 → Authentication → Providers → Anonymous toggle on.
- **`users` 행 자동 생성** — 앱은 `auth.signInAnonymously()` 후 `users(anonymous_id = auth.uid())` 가 존재하는지 확인하고 없으면 insert 한다. 이를 위해 `users` 테이블에 대해 anon 키로 SELECT/INSERT 가 가능해야 한다. RLS 예시:
  ```sql
  alter table public.users enable row level security;
  create policy "self read" on public.users
    for select using (anonymous_id = auth.uid());
  create policy "self insert" on public.users
    for insert with check (anonymous_id = auth.uid());
  create policy "self update" on public.users
    for update using (anonymous_id = auth.uid());
  ```
- **`cards`, `works`** 는 anon SELECT 만 허용하면 충분.
- **`user_bookmarks`** 는 자기 행만 다룰 수 있도록:
  ```sql
  alter table public.user_bookmarks enable row level security;
  create policy "owner all" on public.user_bookmarks
    for all using (
      user_id in (select user_id from public.users where anonymous_id = auth.uid())
    );
  ```

## 폴더 구조

```
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/libs.versions.toml         # 버전 카탈로그
├── local.properties.sample           # 복사해서 local.properties 로 사용
└── app/
    ├── build.gradle.kts              # Compose + Supabase + BuildConfig 주입
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/values/{themes,colors,strings}.xml
        └── java/com/lifestyle/dailyscript/
            ├── DailyScriptApp.kt     # Application — Supabase init
            ├── MainActivity.kt
            ├── data/
            │   ├── SupabaseProvider.kt
            │   ├── model/             # @Serializable DTO들
            │   └── repo/              # Auth / Card / Bookmark
            └── ui/
                ├── theme/             # Color, Type, Shape, Theme
                ├── components/        # TopBar, BottomNav, SharpButton, ChipTag
                ├── home/              # 오늘의 각본 + 지난 기록
                ├── detail/            # 스크린플레이 본문
                ├── settings/          # 프로필 + 옵션
                ├── archive/           # placeholder
                ├── nav/Routes.kt
                ├── AppSession.kt
                └── DailyScriptRoot.kt
```

## 디자인 시스템 (LongBlack Editorial)

- 컬러: paper-white `#FFFFFF`, ink-black `#1A1A1A`, signature-orange `#FF5126`, border-subtle `#E2E2E4`
- 셰이프: 모서리 0px (sharp & architectural)
- 폰트: **한글 = 시스템 기본 폰트** (`FontFamily.Default`, Claude 기본 UI와 동일한 느낌). 라틴 글자는 Roboto. 스크린플레이만 Monospace. 실제 디자인 폰트로 교체하려면 아래 안내.

### 실제 폰트로 교체하기

원 디자인은 **EB Garamond** (헤드라인) + **Hanken Grotesk** (본문) + **Courier Prime** (스크린플레이) 조합이다. 다음 중 하나의 방법으로 교체:

**옵션 A — TTF 임베드 (권장, 가장 안정적)**

1. Google Fonts에서 OFL 라이선스로 ttf 파일을 받는다:
   - https://fonts.google.com/specimen/EB+Garamond
   - https://fonts.google.com/specimen/Hanken+Grotesk
   - https://fonts.google.com/specimen/Courier+Prime
2. 파일명을 lowercase + 언더스코어로 변경 (예: `eb_garamond_regular.ttf`, `eb_garamond_medium.ttf`, `eb_garamond_italic.ttf`, `hanken_grotesk_regular.ttf`, `hanken_grotesk_bold.ttf`, `courier_prime_regular.ttf`) 후 `app/src/main/res/font/` 에 배치.
3. `ui/theme/Type.kt` 에서 다음을 교체:
   ```kotlin
   val EditorialSerif = FontFamily(
       Font(R.font.eb_garamond_regular, FontWeight.Normal),
       Font(R.font.eb_garamond_medium,  FontWeight.Medium),
       Font(R.font.eb_garamond_italic,  FontWeight.Normal, FontStyle.Italic),
   )
   val EditorialSans = FontFamily(
       Font(R.font.hanken_grotesk_regular, FontWeight.Normal),
       Font(R.font.hanken_grotesk_bold,    FontWeight.Bold),
   )
   val ScreenplayMono = FontFamily(Font(R.font.courier_prime_regular))
   ```

**옵션 B — Downloadable Fonts (Google Fonts provider, 런타임 로드)**

- `androidx-ui-text-google-fonts` 라이브러리는 이미 의존성에 포함되어 있다.
- `GoogleFont.Provider` 와 인증서 array 리소스가 추가로 필요하다. 자세한 가이드: https://developer.android.com/jetpack/compose/text/fonts#downloadable-fonts
- 첫 표시 시 한 번 깜빡임이 발생할 수 있다.

## 빌드 & 검증

```bash
# 디버그 APK 빌드
./gradlew :app:assembleDebug

# 에뮬레이터/디바이스에 설치
./gradlew :app:installDebug
```

검증 시나리오는 `~/.claude/plans/c-users-udown-downloads-stitch-longblac-proud-sunset.md` 의 "검증 (end-to-end)" 섹션 참고.

## 이번 MVP 범위

- ✅ 홈 화면 (오늘의 각본 랜덤 1개 + 북마크 리스트)
- ✅ 상세 화면 (script_excerpt + excerpt_description, Collect 토글)
- ✅ 설정 화면 (프로필 + Push 토글(로컬) + Sign Out)
- ✅ Supabase Anonymous Auth + `users` 행 부트스트랩
- ✅ 북마크 추가/삭제 토글
- ⬜ Archive 탭 (placeholder)
- ⬜ FCM 푸시
- ⬜ Dark mode
- ⬜ user_preferences 기반 추천 로직
