# 커튼콜 — C-level 데모 영상 산출물

> 로컬 전용 산출물입니다. `_deliverables/`는 `.gitignore`에 추가되어 커밋되지 않습니다.

## 파일

- `curtaincall_demo_90s.mp4` — **제품 데모 + 사용자 여정 + PM 개발기** (약 91.5초)
- `curtaincall_prd_100s.mp4` — **PRD 기반 제품 정의서 영상** (보너스, 약 101초)

사양: 1920×1080 · H.264 · 30fps · 무음(자막 중심) · 한국어 + 영어 병기

## 1) 제품 데모 영상 — 구성

1. 타이틀 — 커튼콜 / 매일, 한 편의 명대사
2. 문제 (PROBLEM) — 명대사는 흩어져 있고 맥락 없이 잊힌다
3. 제품 (PRODUCT) — 큐레이션 · 매일 한 장 · 개인화 추천 · 커뮤니티
4. 사용자 여정 (USER JOURNEY) — 폰 목업 6단계
   · 취향 온보딩 → 오늘의 명대사 → 카드 상세·전문 읽기 → 감상평 커뮤니티 → 서재 카탈로그 → 내 서재·출석
5. 개발 여정 (PM VIEW) — 5주 타임라인: 기반 구축 → 로그인·추천 P0 → LLM 파이프라인 → 추천 P1–P3 → 크로스플랫폼 패리티 → 안전·신뢰 → TestFlight 1.1
6. 측정 (METRICS) — Amplitude/Supabase 이벤트 기반 KPI
7. 클로징 — iOS · Android · Web PWA · TestFlight 1.1 LIVE

## 2) PRD 영상 — 구성

비전 → 문제와 기회 → 타깃 사용자 → 핵심 기능 6 → 데이터 모델 & 명대사 품질 기준(5개 중 2개 이상) → 추천 엔진(콜드스타트→웜 블렌드→softmax 샘플링) → 아키텍처(3 클라이언트 + Supabase + 큐레이션 파이프라인) → 성공 지표 → 원칙·제약 → 로드맵 → 클로징

## 비고

- 실제 브랜드 자산 사용: 고양이 마스코트(cat_*), NanumMyeongjo/Pretendard 폰트, 실제 도서 표지, DESIGN.md 컬러 토큰.
- 콘텐츠/마일스톤은 git 히스토리와 docs(AGENTS.md/DESIGN.md/system-prompt.md/recommendation-design.md)에서 도출.
- KPI는 실측치를 지어내지 않고 "측정 프레임워크 + 이벤트명"으로 정직하게 표현.

## 재생성 방법

소스: 세션 스크래치패드 `…/scratchpad/video/`
- `main.html`, `prd.html` (장면 정의) · `engine.js`, `styles.css` (공용 엔진)
- `node render.js <html> <framesDir> 30` → 프레임 캡처(Puppeteer)
- `bash encode.sh <framesDir> <out.mp4> 30` → ffmpeg 인코딩
