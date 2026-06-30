# 백엔드 분리 산출물 (Backend Separation Deliverables)

`android / ios`를 **`android_frontend / ios_frontend / backend`**(같은 백엔드 공유, 프론트 분리)로 재편하기 위한 분석·명세 문서 모음. **코드는 수정하지 않았으며**, 현재 코드베이스를 정밀 분석해 작성한 문서다.

## 문서

| # | 문서 | 내용 |
|---|---|---|
| 1 | [01_분리_요구사항.md](01_분리_요구사항.md) | **무엇이 필요한가** — 백엔드의 실체(Supabase BaaS) 진단, 목표 디렉터리, 작업 항목 7종, 단계별 계획, 리스크, web_pwa/upload_web 위치 권고 |
| 2 | [02_기능_명세서.md](02_기능_명세서.md) | **기능 명세** — 17개 기능 도메인, 클라이언트(Android/iOS/Web) 커버리지 매트릭스, 기능별 상세(규칙·제약·백엔드 객체), 관리자 콘텐츠 파이프라인 |
| 3 | [03_API_명세서.md](03_API_명세서.md) | **API 명세** — 테이블 25+종(컬럼·타입·FK·RLS), RPC 30개 정확 시그니처, Storage 2버킷, 트리거/Realtime, enum/CHECK, 서버리스 14개 라우트 I/O, 오류 코드 |

## 핵심 결론 (3줄)

1. 이 프로젝트의 "백엔드"는 별도 API 서버가 아니라 **Supabase 프로젝트 자체**다. 3 클라이언트가 anon 키로 PostgREST/RPC/Storage/Auth를 **직접 호출**한다.
2. 따라서 분리 작업의 본질은 **(a) 흩어진 백엔드 자산(SQL 47번호/57파일 + 서버리스 14개)을 `backend/`로 통합, (b) 본 명세를 계약으로 고정, (c) 프론트의 SQL 보유(안티패턴) 제거**다.
3. 분리 실행 전 **반드시** 라이브 DB에서 확정할 항목이 있다 → [03 §부록 A](03_API_명세서.md#부록-a-분리-전-라이브-db에서-확정해야-할-항목) (베이스 테이블 5종·`card_bookmark_counts` 뷰·`increment_card_view` 함수의 정의가 리포에 없음).

## 정확도 보증

문서 작성 후, API 명세서(03)의 모든 구체적 주장을 **원본 SQL/JS 파일과 1:1 대조하는 적대적 검증**(8개 검증 에이전트)을 수행해, 발견된 부정확 항목(13건)을 반영했다. 단, **리포에 정의가 없는 객체**(베이스 테이블·일부 뷰/함수)는 `[추정]`으로 명시했으며 라이브 DB 확인이 필요하다.

## 작성 기준
- 분석 대상: `main_app/android`(Kotlin 106파일), `main_app/ios`(Swift 67파일), `web_pwa`(PWA), `upload_web`(admin), `upload_web/supabase/migrations`(57파일) + `main_app/android/supabase`(14파일).
- 작성일 기준 브랜치: `main`.
