# 추천 알고리즘 설계 — 현재(As-is) & 제안(To-be)

> 작성 2026-06-08 · 대상: `web_pwa/public/m/assets/m-app.js` 의 오늘의 명대사 추천
> 시각 요약 대시보드: [`recommendation-dashboard.html`](../public/m/recommendation-dashboard.html)
>
> **구현 상태(2026-06-09):** P0(선호 수집 `preferences.js`) · P1(점수식+blend+softmax) · 선호 **DB 저장**(마이그레이션 033, users 컬럼) · **KPI 이벤트** 반영 완료.
> 키워드→주제 분류는 DB 컬럼 대신 런타임 분류기 `assets/card-theme.js` 로 처리(새 카드 자동 대응).
> 핵심: `pickRandomCard`→`pickByScore` ([m-app.js](../public/m/assets/m-app.js)).
>
> **선호 저장:** localStorage `ds.pref` + Supabase `users.pref_genres/pref_themes/pref_any`(033). 부팅 시 DB→로컬 동기화(`syncPrefsFromDb`), 완료 시 양쪽 저장(`savePreferencesToDb`).
> **KPI 이벤트(Amplitude):** `card_shown`{source: score|random|restore, prefGenreMatch, prefThemeMatch}, `preferences_set`{genreCount,themeCount,any,skipped}, 기존 `script_opened`·`bookmark_added`에 `prefGenreMatch/prefThemeMatch` 추가 → 추천 클릭률·북마크 전환율·커버리지 산출 가능.
> **DB 적용 필요:** 마이그레이션 `033_user_preferences.sql` 을 Supabase 에 실행해야 DB 저장이 동작(미적용 시 localStorage 로만 폴백).

---

## 1. 현재 실제로 돌아가는 방식 (As-is)

추천 진입점은 `pickRandomCard()` ([m-app.js:1304](../public/m/assets/m-app.js)) 하나다. 홈 진입·새로고침 때마다 호출된다.

```
pickRandomCard()
 ├─ ds.taste !== '1'  →  pure random  (최근 10개 + 북마크 제외)        ← 기본값
 └─ ds.taste === '1'  →  pickByTasteRandom()
        ├─ 북마크 < 10개            →  pure random 으로 폴백
        ├─ 10% 확률               →  pure random (variety)
        └─ 90%                    →  거리 역수 가중 랜덤
```

### 1-1. 취향 벡터 (`computeTasteProfile`)
- 사용자가 **북마크한 카드들의 `temperature`·`intensity` 평균** → 2D 벡터 `(avgT, avgI)`.
- 북마크 **10개 이상**(`MIN_BOOKMARKS_FOR_TASTE = 10`)일 때만 생성, 미만이면 `null`.

### 1-2. 거리·가중 (`tasteDistance`, `pickByTasteRandom`)
- 거리 = 2D 유클리드: `d = √((Tc−avgT)² + (Ic−avgI)²)`
- 가중치 = `1 / (1 + d)` → 거리가 가까울수록 큰 가중 → **가중 랜덤** 추출.
- 제외: 최근 본 10개(`RECENT_EXCLUDE_SIZE = 10`) + 북마크한 카드.
- 후보 풀: 최신 **500장**(`loadAllCards` limit) 중 `temperature`/`intensity` 가 숫자인 카드.

### 1-3. 지금 **쓰지 않는** 것
- ❌ **장르(format)** — 추천에 전혀 반영 안 됨.
- ❌ **주제(keywords/테마)** — 반영 안 됨. (애초에 테마는 DB에 저장도 안 됨)
- ❌ 인기도(bookmark_count), 조회수, 스킵/새로고침(부정 신호), 체류시간.
- ❌ 온보딩 선호 입력 — **현재 온보딩에 선호 수집 단계 자체가 없음.**

---

## 2. 진단 — "추천이 잘 되고 있나?"  → **현재는 사실상 '랜덤'에 가깝다**

실데이터(322장) 기준:

| 항목 | 측정값 | 해석 |
|---|---|---|
| 기본 상태 | `ds.taste` 기본 OFF | 대다수 사용자는 **순수 랜덤**만 경험 |
| 콜드스타트 | 북마크 10개 필요 | 신규/라이트 유저는 개인화 **0** |
| 신호 차원 | 온도·강도 2개(각 1~5) | 표현 공간 5×5=25칸, 그중 **20칸만 사용** |
| 분산 | 온도 σ=1.22, 강도 σ=1.05 | 좁음. 평균벡터(2.5,3.5) **거리 1 안에 32%** 밀집 |
| 가중 차별력 | `1/(1+d)` 범위 **[0.15, 1.0]** | 최악 매칭 카드도 최선의 15% 확률 → 변별 약함 |
| 개인화 강도 | 상위 10% 근접카드가 확률질량 **22%** | 균등(10%) 대비 **약 2.2배**에 불과 |
| 장르/주제 | 미사용 | 가장 강한 콘텐츠 신호를 **버리고 있음** |

**결론:** 켜져 있어도 "온도·강도가 비슷한 쪽으로 살짝 기우는" 정도이고, 기본은 꺼져 있어 **개인화라 부르기 어렵다.** 반면 우리가 가진 가장 강한 신호(장르·주제)는 안 쓰고 있다 → 개선 여지가 크다.

---

## 3. 제안 설계 (To-be) — 온보딩(장르·주제) + 행동(온도·강도) 가중 합

### 3-0. 사전 작업 (Prerequisite)
1. **온보딩 선호 수집** — 장르(복수) + 주제(복수 또는 "상관없음"). 미리보기: [`preference-preview.html`](../public/m/preference-preview.html). 저장: `user_preferences(user_id, genres jsonb, themes jsonb)` 또는 로컬 `ds.pref`.
2. **카드 테마 부여** — 테마가 DB에 없으므로, 카드별 대표 테마를 (a) `cards.theme` 컬럼으로 사전 계산하거나 (b) 클라이언트에서 키워드→10범주 매핑으로 산출. 권장: **배치로 컬럼화**(추천·필터·집계 재사용).

### 3-1. 점수 함수
카드 `c`, 사용자 `u` 에 대해:

```
score(c) =  w_g · genreMatch(c)
          + w_t · themeMatch(c)
          + w_b · tasteSim(c)        // 행동 기반 (북마크 충분할 때만)
          + w_p · popularity(c)      // 약한 타이브레이커
```

| 신호 | 정의 | 비고 |
|---|---|---|
| `genreMatch` | `c.format ∈ u.genres → 1`, 아니면 `0.15` | 0 대신 소프트값으로 완전 배제 방지 |
| `themeMatch` | 주제 선택 시 `c.theme ∈ u.themes → 1` 아니면 `0.2`; "상관없음"이면 `1` | 키워드 다중매칭 비율로 부분점수도 가능 |
| `tasteSim` | `1 − d/d_max`, `d`=온도·강도 유클리드, `d_max=√32` | 북마크<10이면 0(미적용) |
| `popularity` | `bookmark_count` 정규화(0~1), `log1p` 스케일 권장 | 가중 작게 |

### 3-2. 콜드스타트 → 행동 전환 (blend)
북마크가 쌓일수록 행동 신호 비중을 키운다.

```
α = min(bookmarkCount / 10, 1)          // 0 → 1
w_g = (1−α)·0.55 + α·0.30
w_t = (1−α)·0.45 + α·0.30
w_b =        α·0.35
w_p = 0.05  (고정, 약하게)
```
- 가입 직후(α=0): **온보딩 장르·주제 100%** 로 추천 → 콜드스타트 해결.
- 북마크 10개 이상(α=1): 온보딩 60% + 행동 35% + 인기 5% 로 균형.

### 3-3. 선택(샘플링) — 약한 `1/(1+d)` 대신 **softmax 탐험온도 τ**
```
P(c) ∝ exp(score(c) / τ)
```
- `τ` 작을수록 정확도↑(상위 집중), 클수록 다양성↑. 권장 시작값 `τ=0.5`.
- 여전히 **최근 K개 제외**(중복 방지) + **ε=5~10% 순수 랜덤**(발견성) 유지.
- 부정 신호: "새로고침으로 넘긴 카드"의 테마/장르에 단기 감점(세션 한정) 추가 가능.

### 3-4. 파라미터 기본값
| 파라미터 | 값 | 의미 |
|---|---|---|
| `MIN_BOOKMARKS_FOR_TASTE` | 10 (유지) | 행동신호 활성 임계 |
| `RECENT_EXCLUDE_SIZE` | 10 (유지) | 중복 방지 윈도 |
| `ε` (순수 랜덤) | 0.08 | 발견성 |
| `τ` (softmax) | 0.5 | 탐험-활용 균형 |
| `genreMatch` soft floor | 0.15 | 완전 배제 방지 |
| `themeMatch` soft floor | 0.2 | 완전 배제 방지 |
| 기본 활성 | **ON** | (현재 OFF) 온보딩 선호가 있으면 켜는 것을 권장 |

---

## 4. 단계적 적용 로드맵
1. **P0** ✅ — 온보딩 선호 수집 + 저장(`preferences.js`, `ds.pref`). 카드 테마는 컬럼화 대신 런타임 분류기(`card-theme.js`)로 대체.
2. **P1** ✅ — `pickByScore()`에 `genreMatch`+`themeMatch`+blend(α) 도입, 선호 있으면 자동 ON.
3. **P2** ✅(일부) — softmax(τ=0.5) 샘플링, 인기도 약가중(0.05) 반영. △ 새로고침 부정신호는 미구현.
4. **P3** ✅(계기판) — KPI 이벤트 + 선호 DB 저장 완료. ☐ 남은 것: 이벤트 데이터 쌓인 뒤 τ·floor·가중치 튜닝, A/B. (상수로 모아둠 — 튜닝 용이)

## 5. 성공 지표 (KPI)
- **추천 클릭률**(카드 → 전문 열람), **북마크 전환율**, 세션당 새로고침 횟수(낮을수록 첫 카드가 잘 맞음).
- **테마/장르 커버리지** — 추천이 사용자가 고른 선호 안에서 나오는 비율.
- **다양성** — 세션 내 추천의 고유 작품/테마 수(획일화 방지).

---

### 부록 — 현재 코드 레퍼런스
- `pickRandomCard` [m-app.js:1304](../public/m/assets/m-app.js) · `pickByTasteRandom` :1174 · `computeTasteProfile` :1134 · `tasteDistance` :1155
- 상수: `MIN_BOOKMARKS_FOR_TASTE=10`, `RECENT_EXCLUDE_SIZE=10` (:535–536)
- 활성 플래그: `ds.taste` (`isTasteEnabled` :1122, 토글 :2706)
