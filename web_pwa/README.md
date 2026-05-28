# Daily Script — Consumer PWA

일반 사용자용 "오늘의 명대사" 모바일 웹앱(PWA). 원래 `upload_web/public/m/`에 있던 소비자 앱을 별도 배포 단위로 분리한 것이다. 관리자(업로드) 웹은 `../upload_web`에 그대로 있다.

## 구조

```
web_pwa/
├── api/config.js              # 브라우저에 공개 Supabase 설정(anon) 노출
├── public/
│   ├── m/                     # PWA 본체 (scope /m/)
│   │   ├── index.html
│   │   ├── assets/m-app.js    # 앱 로직
│   │   └── icons/
│   ├── assets/
│   │   ├── pwa.js             # 서비스워커 등록 + 설치 프롬프트
│   │   └── supabase-client.js # /api/config로 anon 키 로드 후 createClient
│   ├── sw.js                  # 서비스워커 (PWA 자산만 캐시)
│   └── manifest.webmanifest
├── package.json
└── vercel.json
```

앱 진입점은 `/m/` (manifest의 `start_url`은 `/m/?app=user`).

## 실행

```bash
cd web_pwa
npx vercel dev
```

`/api/config`가 동작하려면 다음 환경변수가 필요하다(Vercel 프로젝트 환경변수 또는 `.env`):

```
SUPABASE_URL=https://<프로젝트>.supabase.co
SUPABASE_ANON_KEY=<public anon key>
```

> anon 키는 공개값이므로, 서버리스 함수 없이 순수 정적 배포를 원하면
> `public/assets/supabase-client.js`에서 `/api/config` fetch 대신 값을 직접 인라인해도 된다.

## 분석 (Amplitude · Microsoft Clarity)

`public/assets/analytics.js`가 `/api/config`에서 아래 공개 키를 받아 두 도구를 초기화한다.
키를 설정하지 않으면 모든 추적 호출이 조용히 no-op 처리되어 앱은 그대로 동작한다.

```
AMPLITUDE_API_KEY=<Amplitude 프로젝트 API 키>
CLARITY_PROJECT_ID=<Clarity 프로젝트 ID>
```

전송 이벤트: `nav`, `today_refreshed`, `script_opened`, `bookmark_added`/`bookmark_removed`,
`comment_submitted`, `archive_genre_filtered`, `archive_searched`.
Amplitude는 페이지뷰·세션을 자동 수집하고, 로그인 시 익명 `user_id`로 사용자를 식별한다.

## 백엔드 / DB

같은 Supabase 프로젝트를 admin 웹·Android·iOS 네이티브 앱과 공유한다.
DB 스키마(테이블·RLS·마이그레이션)는 `../upload_web/supabase/migrations`를 참조.
