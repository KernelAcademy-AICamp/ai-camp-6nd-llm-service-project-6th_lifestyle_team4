# Script & Quote Intelligence — Upload Web

대본 PDF를 업로드 → LLM으로 명대사 카드를 추출 → 관리자가 카드를 골라 Supabase에 저장하는 관리자용 웹입니다.

## 스택

- **Frontend**: 정적 HTML + Vanilla JS (Tailwind CDN)
- **Backend**: Vercel Serverless Functions (Node.js, ESM)
- **LLM**: Anthropic Claude (`@anthropic-ai/sdk`)
- **DB / Auth**: Supabase

## 디렉터리

```
public/         정적 자산 (Vercel이 자동 서빙)
  index.html    로그인
  dashboard.html 대시보드
  assets/       브라우저용 JS
api/            Vercel 서버리스 함수
  extract.js    PDF → LLM
  translate.js  카드 한 장 → 한국어 번역
  save.js       선택된 카드 → Supabase
  config.js     브라우저에 supabaseUrl/anonKey 노출
lib/            서버 전용 모듈
  prompts.js    ★ 프롬프트 단일 편집 지점 ★
  anthropic.js  Claude 호출 래퍼
  supabase-admin.js  service_role 클라이언트
  auth.js       JWT 검증
supabase/migrations/  DB 스키마
```

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. Vercel CLI 설치 (전역, 1회)
npm i -g vercel

# 3. .env 파일 작성 (.env.example 복사)
#    ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 채우기

# 4. Supabase 스키마 적용
#    Supabase 대시보드 → SQL Editor에 supabase/migrations/001_init.sql 붙여 실행

# 5. 관리자 계정 생성
#    Supabase 대시보드 → Authentication → Users → "Add user"로 이메일/비번 추가
#    (회원가입 화면 없음, 관리자가 직접 발급)

# 6. 개발 서버 실행
vercel dev
```

기본 포트: `http://localhost:3000`

## 배포 (Vercel)

```bash
vercel deploy
```

Vercel 프로젝트 설정에서 동일한 환경변수 4개를 등록하세요.

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (선택, 기본 `claude-sonnet-4-6`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 프롬프트 작성

`lib/prompts.js`만 수정하면 됩니다. 두 개의 export가 자리잡혀 있습니다.

- `EXTRACT_PROMPT`: 본문에 `{{SCRIPT_TEXT}}`를 두면 PDF 추출 텍스트로 치환됩니다. LLM은 `{ work, cards }` JSON으로 응답해야 합니다.
- `TRANSLATE_PROMPT`: 본문에 `{{CARD_JSON}}`을 두면 카드 단건 JSON 문자열로 치환됩니다. LLM은 `{ quote_translated, script_excerpt_translated, excerpt_description_translated, source_language }`로 응답해야 합니다.

`lib/anthropic.js`는 응답에서 JSON을 자동 추출(코드펜스/주변 텍스트 허용)합니다.

## End-to-end 검증

1. `vercel dev`로 로컬 실행
2. Supabase에 관리자 계정 생성
3. `/`에서 로그인 → 대시보드 진입
4. 짧은 더미 PDF 업로드 → `/api/extract` 응답 확인 (프롬프트 비어있으면 빈 JSON)
5. 실제 프롬프트 채워 넣고 대본 업로드 → 카드 렌더링 확인
6. 카드 "번역하기" → 번역본 표시
7. 카드 선택 → 하단 바의 "선택된 카드 Supabase에 저장하기" → Supabase 대시보드에서 `works`, `cards` row 확인
8. 로그아웃 후 `/api/save` 직접 호출 → 401 응답 확인

## 한계 / 메모

- Vercel **Hobby** 플랜의 함수 실행 시간 한도는 60초입니다. 100페이지 대본 + Claude 호출이 빠듯할 수 있으니, 초과 시 모델을 `claude-haiku-4-5-20251001`로 바꾸거나 Pro로 업그레이드하세요.
- `pdf-parse`는 텍스트 PDF만 처리합니다. 스캔본은 OCR 전처리 필요.
- `service_role` 키는 절대 브라우저에 노출되지 않습니다 (`lib/supabase-admin.js`는 `/api/`에서만 import).
- 사이드바의 "히스토리" 메뉴는 이번 MVP 범위 밖입니다 (disabled).
