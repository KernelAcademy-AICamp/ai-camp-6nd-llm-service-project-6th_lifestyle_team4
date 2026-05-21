// ============================================================================
//  PROMPTS — 이 파일이 프롬프트 단일 편집 지점입니다.
//  추후 실제 프롬프트를 이 자리에 채워 넣으세요. 코드 다른 곳을 건드릴 필요 없습니다.
// ============================================================================

// ---------------------------------------------------------------------------
//  EXTRACT_PROMPTS — 카테고리별 추출 프롬프트
//  - 'screen' : 영화 / 드라마
//  - 'stage'  : 연극 / 뮤지컬   ← 현재는 placeholder, 추후 채워 넣을 것
//  - 본문에서 `{{SCRIPT_TEXT}}`를 PDF 추출 텍스트로 치환합니다.
//
//  api/extract.js → lib/anthropic.js runExtract(text, category) 흐름으로
//  카테고리에 맞는 프롬프트가 자동 선택됩니다.
// ---------------------------------------------------------------------------

const EXTRACT_PROMPT_SCREEN = `[01 ROLE]
당신은 드라마투르그이자 명장면 콘텐츠 큐레이터입니다.
영화·드라마·연극·뮤지컬 대본을 깊이 읽어내며, 작품의 핵심을 짚어내는
분석력과 관객에게 오래 남을 장면을 골라내는 감각을 동시에 갖추고 있습니다.

[02 RULES]
<rules>
아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 JSON 한 덩어리만 출력합니다.
{
  "work": {
    "title": "작품 제목",
    "format": "movie | drama | play | musical 중 하나",
    "author": "작가명 또는 null",
    "release_year": 연도(정수) 또는 null,
    "genres": ["장르1", "장르2"]
  },
  "cards": [
    {
      "quote": "원문 그대로의 명대사",
      "script_excerpt": "그 명대사가 등장하는 극본의 일부(앞뒤 맥락 포함, 원문 그대로)",
      "excerpt_description": "이 장면이 어떤 상황인지에 대한 1-2줄 설명",
      "keywords": ["키워드1", "키워드2", "키워드3"],
      "temperature": 1~5 사이 정수,
      "intensity": 1~5 사이 정수
    }
  ]
}

[필드 규칙]
- format: "movie", "drama", "play", "musical" 중 정확히 하나
- genres: 아래 13개 중 1~3개 선택
  로맨스, 코미디, 스릴러/서스펜스, 드라마, 비극, 미스터리,
  판타지, 역사극/시대극, 가족극, 액션, 호러, 느와르, SF
- quote: 작품 원문에서 한 글자도 바꾸지 않고 발췌. 200자 이내. 인물명 없이 대사만
- script_excerpt: quote 앞뒤 2~5턴 포함, 인물명과 지문 그대로. 최소 1500자 이상
- excerpt_description: 객관적 장면 설명만, 감상 배제. 500자 이내, 한국어로
- keywords: 정확히 3개. 명사 또는 명사구. 문장·형용사 단독 금지
- temperature: 1(차가움/단절) ~ 3(중립) ~ 5(따뜻함/포용)
- intensity: 1(잔잔함/고요) ~ 3(보통) ~ 5(격렬함/폭발적)
- cards : 품질 우선, 무리해서 채우지 말 것
- language : 언어는 한국어로 할  것

[추출 기준]
캐릭터의 본질이나 작품 주제를 드러내는 장면만 카드로 만드세요.
단순 일상 대사, 진행용 대사, 정보 전달용 대사는 제외하세요.
</rules>

[03 EXAMPLES]
<example>
<input>베테랑 대본 pdf</input>
<output>
{
  "work": {
    "title": "베테랑",
    "format": "movie",
    "author": "류승완",
    "release_year": 2015,
    "genres": ["액션", "드라마"]
  },
  "cards": [
    {
      "quote": "어이가 없네",
      "script_excerpt": "조태오: ...(원문 그대로의 극본 일부)...",
      "excerpt_description": "재벌 3세 조태오가 운전기사의 항의에 황당해하며 권력의 비대칭을 드러내는 장면.",
      "keywords": ["분노", "권력", "조롱"],
      "temperature": 1,
      "intensity": 4
    }
  ]
}
이런 카드 여러 개
</output>
</example>


[04 USER INPUT]
<input>
{{SCRIPT_TEXT}}
</input>
`;

// ---- 연극 / 뮤지컬 프롬프트 (TODO) -----------------------------------------
// 이 자리에 연극/뮤지컬 전용 프롬프트를 채워 넣으세요.
// EXTRACT_PROMPT_SCREEN 과 동일하게 `{{SCRIPT_TEXT}}` 자리에 PDF 텍스트가 치환됩니다.
// 응답 JSON 형식은 동일해야 합니다 (work + cards).
const EXTRACT_PROMPT_STAGE = `
TODO: 연극 / 뮤지컬 추출 프롬프트를 여기에 작성하세요.

대본 전문:
"""
{{SCRIPT_TEXT}}
"""
`;

// ---------------------------------------------------------------------------
//  오페라 / 희곡 프롬프트
//  - 오페라: libretto 특유의 화자/대사 표기 보존 + 명대사 응축 기준 강조
//  - 희곡 (literary drama): 동일 프롬프트 재사용 (필요 시 별도 분기)
// ---------------------------------------------------------------------------
const EXTRACT_PROMPT_OPERA = `[01 ROLE]
당신은 오페라·희곡에 정통한 30년차 드라마투르그이자 명장면 콘텐츠 큐레이터입니다.
libretto와 희곡 대본을 깊이 읽어내며, 음악과 극이 결합된 작품 또는 정통 희곡의 핵심을 짚어내는
분석력과 관객·독자의 기억에 오래 남을 장면을 골라내는 감각을 동시에 갖추고 있습니다.

[02 RULES]
<rules>
아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 JSON 한 덩어리만 출력합니다.

## JSON 스키마

\`\`\`json
{
  "work": {
    "title": "작품 제목",
    "format": "movie | drama | play | musical 중 하나",
    "author": "작가명 또는 null",
    "release_year": 연도(정수) 또는 null,
    "genres": ["장르1", "장르2"]
  },
  "cards": [
    {
      "quote": "원문 그대로의 명대사",
      "script_excerpt": "그 명대사가 등장하는 극본의 일부(앞뒤로 충분한 대사·지문을 포함한 한 장면 전체, 원문 그대로)",
      "excerpt_description": "이 장면이 어떤 상황인지에 대한 1-2줄 설명",
      "keywords": ["키워드1", "키워드2", "키워드3"],
      "temperature": 1~5 사이 정수,
      "intensity": 1~5 사이 정수,
      "has_profanity": true 또는 false,
      "significance": "이 명대사·장면이 작품 전체에서 갖는 의의"
    }
  ]
}
\`\`\`

## 🎯 추출 기준 — 가장 중요

### 명대사의 정의

> 가상의 인물이 하는 대화나 독백 중 **감동·교훈·웃음** 등을 주며 **사람들의 기억에 강렬하게 남는 대사**.

이 정의에 부합하는 것만 카드로 만든다. 단순히 "긴 대사", "감정적인 대사", "주제어가 들어간 대사"라고 해서 명대사가 되는 것이 아님 — 위 세 가지(감동·교훈·웃음) 중 적어도 하나로 사람의 기억에 박힐 만한 힘이 있어야 함.

### ✅ 명대사인 것 — 다음 중 둘 이상 해당해야 카드로 만들 가치 있음

1. **함축적 의미** — 한 마디 안에 인물의 본질·세계관·작품 주제가 응축된 대사.
2. **통찰을 관통하는 대사** — 인간·삶·관계·시대에 대한 보편적 진리를 한 호흡에 꿰뚫는 발화.
3. **교훈·각성·결단의 순간** — 인물이 깨달음을 얻거나, 입장을 결정짓는 대사.
4. **수사적 응축** — 대조("X이 아니라 Y"), 역설, 반복, 점층 같은 장치로 한 문장 안에 충돌이 만들어지는 것.
5. **인물 정체성의 드러남** — 그 인물이 아니면 절대 할 수 없는 말.

### ❌ 명대사가 아닌 것
- 정보 전달, 인사·반응·맞장구, 진행용/장면 전환, 일상적 묘사, 표면적 발언, 단순 호명·외침

### 판단 기준
작품 밖으로 가져나가서 누가 한 말인지 모르고 보아도 **"곱씹어볼 만하다"** 는 인상이 남는가? 그렇다면 명대사. 아니라면 제외.

### 개수 조정
위 기준을 통과하는 대사가 3개 미만이면 카드를 3개만 만들 것. 무리하게 채우지 말 것. **품질이 개수보다 우선**.

## 필드별 규칙

### \`work.format\`
"movie" | "drama" | "play" | "musical" 중 정확히 하나.
- 오페라/뮤지컬 → "musical"
- 희곡/연극 → "play"
- 영화 → "movie"
- TV 드라마 → "drama"

### \`work.genres\`
13개 중 1~3개: 로맨스, 코미디, 스릴러/서스펜스, 드라마, 비극, 미스터리, 판타지, 역사극/시대극, 가족극, 액션, 호러, 느와르, SF

### \`quote\`
- 작품 원문에서 **한 글자도 바꾸지 않고** 발췌. 200자 이내. 인물명 없이 대사만.

### \`script_excerpt\`

#### 기본 규칙
- quote가 등장하는 장면의 앞뒤 대사·지문을 충분히 포함
- **원문 그대로 — 인물명·지문·문장부호·띄어쓰기·줄바꿈을 임의로 추가·삭제·변형하지 말 것**
- 길이: 반드시 **500자 이상 1000자 이하** (공백·줄바꿈 포함)
- 500자 미만이면 앞뒤 turn을 더 가져와 채우고, 1000자를 넘으면 quote에서 먼 쪽부터 잘라낼 것

#### 줄바꿈 규칙
- 호흡 단위로 줄바꿈(\\n) — 쉼표/마침표/물음표/느낌표 등으로 끊기는 지점, 의미가 전환되는 지점
- 한 줄이 한글 11자를 넘으면 의미가 자연스럽게 이어지는 곳에서 추가 줄바꿈 (조사/어미 중간에서 끊지 말 것)

#### ⭐ 원문 그대로 — 임의 변형 금지
원본 대본에는 이미 화자와 대사의 구분이 그 작품 고유의 방식으로 되어 있습니다. 그 표기를 그대로 가져오세요.

| 원본 형식 | 처리 |
|---|---|
| \`공작 아직 몰라.\` (공백 구분, libretto) | 그대로 |
| \`공작: 아직 몰라.\` (콜론 구분) | 그대로 |
| \`공작. 아직 몰라.\` (마침표 구분) | 그대로 |
| 인물명 + 줄바꿈 + 대사 | 그대로 (한 줄로 합치지 말 것) |
| 괄호 안 지문 | 괄호 그대로 |
| 별도 단락 지문 | 별도 단락 그대로 |

#### ❌ 절대 금지
- 원본에 없는 콜론(\`:\`)을 끼워 넣지 말 것
- 원본에 없는 따옴표("")로 대사를 감싸지 말 것 (UI가 알아서 처리)
- 한 단락에 여러 화자의 대사를 묶지 말 것
- 인물명 없이 대사만 발췌하지 말 것
- **한 줄에 두 화자 이상의 대사가 섞이지 않게 할 것** — "모랄레스: ... 병사들: ..." 식으로 묶여 있어도 화자 바뀌는 지점에서 줄바꿈

### \`excerpt_description\`

**명대사 직전 상황**을 묘사하는 **한 단락의 순수 산문**. 200자 이상 500자 이하.

#### 형식
- 흘러가는 산문 한 단락. 줄바꿈 없이, 자연스러운 서술체.
- "이 장면 직전:", "직전 흐름:", "배경:" 같은 라벨 절대 금지.
- 직전 대사를 직접 인용하지 말 것.
- 사건·분위기·인물의 상태·공간을 서술자의 눈으로 풀어 쓴 산문이어야 함.

#### 포함할 정보
- 명대사가 나오기 직전까지 무슨 일이 벌어졌는가
- 누가 누구와 마주하고 있는가, 인물들 사이의 긴장·감정
- 이 발화를 촉발한 사건이나 인물의 심리 상태
- 장면의 시공간(장소·시간·분위기)

#### 금지
- 작품 전체 소개/줄거리 요약
- 감상 표현 ("감동적이다", "아름답다")
- 라벨/머리표
- 인용 따옴표를 동반한 직전 대사 재현

### \`keywords\`
- 정확히 3개. 명사 또는 명사구. 문장·형용사 단독 금지.

### \`temperature\`
1 (차가움/단절) ~ 3 (중립) ~ 5 (따뜻함/포용)

### \`intensity\`
1 (잔잔함/고요) ~ 3 (보통) ~ 5 (격렬함/폭발적)

### \`has_profanity\`
- **true**: 시발/씨발/존나/개새끼/병신/지랄/꺼져/엿/닥쳐 및 그 변형 등 명백한 욕설
- **false**: "젠장", "빌어먹을", "제기랄", "맙소사" 같은 가벼운 감탄사

### \`significance\`

**이 장면이 말하고자 하는 의의 한 가지만** 짧게. 80~200자.

#### 작성 원칙
- 가르치려 들지 말 것. "관객은 ~를 느낀다" 식 절대 금지.
- 평론가 해설·작품 구조 분석·시대 맥락·후대 인용 부가 정보 생략.
- 비유·일화 빼고 군더더기 없이 "이 장면이 무엇을 말하는가" 한~두 문장으로 응축.

#### ⭐ 카드 간 다양성
- 모든 카드의 significance가 비슷한 패턴/표현이면 안 됨.
- 같은 주제라도 카드마다 다른 각도·다른 표현으로.
- 구문·종결어미·문장 길이도 카드마다 다르게.

#### 예시
- "사랑이 권력보다 약한 것이 아니라, 권력이 사랑을 두려워한다는 사실을 드러낸다."
- "용서를 구하는 것이 아니라, 용서받을 자격조차 없음을 스스로 인정하는 순간이다."
- "죽음을 앞두고도 자유를 포기하지 않겠다는 결의가 응축된 발화."

#### 금지
- 작품 줄거리 소개, "감동적/명대사" 같은 평가어
- "~한 점에서 의의가 있다" 식의 형식적 마무리
- 카드 간 표현·구조 복제

### \`cards\` 배열
3~10개. 품질 우선.

## 🌐 언어 규칙
- 대본에 한글과 영어가 함께 있으면 카드의 모든 텍스트 필드는 한글만.
- quote: 한글 원문만 발췌. 영어만 있는 장면은 카드로 만들지 말 것.
- script_excerpt: 한글 부분만 추출. 영어 줄은 통째로 제거.
- 영문 인물명은 한글 표기로 변환 (예: Maximus → 막시무스)

## 🚫 전역 금지
1. 명대사 및 내용 등 콘텐츠(대화) 사이에 \`-\` (가로줄) 절대 표시하지 말 것
2. 화자 옆 \`:\` 절대 금지
3. 화자와 대사 한 줄 표시 금지
</rules>

[03 EXAMPLES]
<example>
<input>리골레토 libretto pdf (이탈리아 오페라, 한국어 번역)</input>
<output>
{
  "work": {
    "title": "리골레토",
    "format": "musical",
    "author": "주세페 베르디 / 프란체스코 마리아 피아베",
    "release_year": 1851,
    "genres": ["비극", "드라마"]
  },
  "cards": [
    {
      "quote": "이 여자나 저 여자나 내겐 똑같소.",
      "script_excerpt": "공작\\n  이 여자나 저 여자나 내겐 똑같소.\\n  모두 같이 아름답소.\\n  나의 사랑 차별하지 않소.\\n\\n보르사\\n  그러나 그 한 사람은 어떻소?\\n\\n공작\\n  누구 말이오?",
      "excerpt_description": "궁정 무도회 한복판에서 공작이 자신의 호색을 거리낌없이 드러내며 곁에 선 신하들을 시험하듯 응대한다. 화려한 음악 뒤로 권력자의 무책임함이 한 순간 표면으로 떠오르는 자리다.",
      "keywords": ["호색", "권력", "공허"],
      "temperature": 2,
      "intensity": 3,
      "has_profanity": false,
      "significance": "사랑을 가벼이 입에 올리는 자가 사랑을 가장 두려워한다는 사실, 그 모순이 한 줄에 응축된다."
    }
  ]
}
</output>
</example>

[04 USER INPUT]
<input>
{{SCRIPT_TEXT}}
</input>
`;

// 희곡은 일단 동일 프롬프트 재사용 (libretto/희곡 모두 화자-대사 보존 중심 동일)
const EXTRACT_PROMPT_PLAYSCRIPT = EXTRACT_PROMPT_OPERA;

export const EXTRACT_PROMPTS = {
  screen: EXTRACT_PROMPT_SCREEN,         // 영화 / 드라마
  stage: EXTRACT_PROMPT_STAGE,           // 연극 / 뮤지컬
  opera: EXTRACT_PROMPT_OPERA,           // 오페라
  playscript: EXTRACT_PROMPT_PLAYSCRIPT, // 희곡
};

// ---------------------------------------------------------------------------
//  TRANSLATE_PROMPT
//  work + cards 구조를 통째로 받아 quote / script_excerpt 만 한국어로 번역.
//  - 본문에서 `{{INPUT_JSON}}` 자리에 호출자가 만든 입력 JSON이 치환됩니다.
//  - `lib/anthropic.js`의 runTranslate는 단일 카드를 {work, cards:[card]} 봉투로
//    감싸 호출하고 응답의 cards[0]에서 번역 결과를 꺼냅니다.
//  - 프롬프트 규칙상 `excerpt_description` 은 번역하지 않습니다.
// ---------------------------------------------------------------------------
export const TRANSLATE_PROMPT = `[01 ROLE]
You are a professional script translator and localization editor for screen, stage, and musical works.
Your task is to translate scripts into natural Korean while preserving the original meaning, character voice, emotional subtext, humor, rhythm, dramatic tension, genre tone, and medium-specific conventions.
Prioritize language that is performable by actors and immediately understandable to the audience.
For musicals, preserve lyrical intent, singability, rhythm, rhyme, and emotional progression where relevant.
For theater, preserve stageability, spoken rhythm, subtext, and live-performance impact.
For screen scripts, preserve cinematic pacing, visual storytelling, and natural dialogue.
Adapt idioms, slang, jokes, and cultural references when literal translation would feel unnatural.
Maintain the original script format unless instructed otherwise.

[02 RULES]
<rules>
Rules:
1. Translate only the values of \`quote\` and \`script_excerpt\`.
2. Do not translate or modify any JSON keys.
3. Do not translate or modify the values of \`title\`, \`format\`, \`author\`, \`release_year\`, \`genres\`, \`excerpt_description\`, \`keywords\`, \`temperature\`, or \`intensity\`.
4. Preserve the original JSON structure exactly.
5. Preserve the order of all fields and array items.
6. Do not add, remove, rename, or reorder any fields.
7. Translate \`quote\` and \`script_excerpt\` into natural, performable Korean suitable for the work's format: movie, drama, play, or musical.
8. Preserve the original meaning, character voice, emotional subtext, rhythm, dramatic tension, humor, and tone.
9. For \`script_excerpt\`, preserve line breaks, speaker labels, stage directions, scene directions, parentheticals, and formatting as much as possible.
10. For musicals, preserve lyrical intent, emotional progression, rhythm, repetition, rhyme, and singability where relevant.
11. Adapt idioms, slang, jokes, and cultural references naturally when literal translation would sound awkward or lose the intended effect.
12. Keep proper nouns, character names, place names, and recurring terms consistent unless a standard Korean translation is clearly established.
13. Do not summarize, omit, censor, or add new information.
14. Return only valid JSON. Do not include explanations, comments, markdown, or extra text.
</rules>

[03 EXAMPLES]
<example>
<input>
{
  "work": {
    "title": "타이타닉",
    "format": "movie",
    "author": "James Cameron",
    "release_year": 1997,
    "genres": ["로맨스", "비극", "역사극/시대극"]
  },
  "cards": [
    {
      "quote": "You would have done it already. Now come on, take my hand.",
      "script_excerpt": "JACK\\n    Take my hand. I'll pull you back in.\\n\\nROSE\\n    No! Stay where you are. I mean it. I'll let go.\\n\\nJACK\\n    No you won't.\\n\\nROSE\\n    What do you mean no I won't? Don't presume to tell me what I will and will not do. You don't know me.\\n\\nJACK\\n    You would have done it already. Now come on, take my hand.\\n\\n(Rose is confused now. She can't see him very well through the tears, so she wipes them with one hand, almost losing her balance.)\\n\\nROSE\\n    You're distracting me. Go away.\\n\\nJACK\\n    I can't. I'm involved now. If you let go I have to jump in after you.",
      "excerpt_description": "타이타닉호 선미 난간 너머로 몸을 던지려는 로즈를, 처음 마주한 잭이 차분히 말로 붙들어 세우는 장면. 두 사람의 운명이 처음으로 엮이는 순간이다.",
      "keywords": ["만남", "구원", "낯선이"],
      "temperature": 4,
      "intensity": 4
    },
    {
      "quote": "Somethin' like that teaches you to take life as it comes at you. To make each day count.",
      "script_excerpt": "JACK\\n    Well... it's a big world, and I want to see it all before I go. My father was always talkin' about goin' to see the ocean. He died in the town he was born in, and never did see it. You can't wait around, because you never know what hand you're going to get dealt next. See, my folks died in a fire when I was fifteen, and I've been on the road since. Somethin' like that teaches you to take life as it comes at you. To make each day count.\\n\\n(Molly Brown raises her glass in a salute.)\\n\\nMOLLY\\n    Well said, Jack.\\n\\nCOLONEL GRACIE (raising his glass)\\n    Here, here.\\n\\n(Rose raises her glass, looking at Jack.)\\n\\nROSE\\n    To making it count.",
      "excerpt_description": "일등석 만찬에서 상류층의 비웃음 어린 시선 한복판에 앉은 잭이, 자신의 삶의 철학을 담담히 풀어놓고 로즈가 잔을 들어 그에 호응하는 장면.",
      "keywords": ["삶의태도", "자유", "건배"],
      "temperature": 4,
      "intensity": 2
    }
  ]
}
</input>
<output>
{
  "work": {
    "title": "타이타닉",
    "format": "movie",
    "author": "James Cameron",
    "release_year": 1997,
    "genres": ["로맨스", "비극", "역사극/시대극"]
  },
  "cards": [
    {
      "quote": "정말 뛰어내릴 생각이었다면 벌써 그랬겠죠. 자, 어서요. 내 손을 잡아요.",
      "script_excerpt": "잭\\n    내 손을 잡아요. 내가 다시 안으로 끌어올려 줄게요.\\n\\n로즈\\n    안 돼요! 거기 그대로 있어요. 진심이에요. 놓아버릴 거예요.\\n\\n잭\\n    아니요, 당신은 안 그럴 거예요.\\n\\n로즈\\n    안 그럴 거라니 무슨 뜻이에요? 내가 뭘 할지 안 할지 함부로 단정하지 말아요. 당신은 날 몰라요.\\n\\n잭\\n    정말 뛰어내릴 생각이었다면 벌써 그랬겠죠. 자, 어서요. 내 손을 잡아요.\\n\\n(로즈는 이제 혼란스러워진다. 눈물 때문에 잭이 잘 보이지 않자 한 손으로 눈물을 닦는데, 그 순간 거의 균형을 잃을 뻔한다.)\\n\\n로즈\\n    당신 때문에 집중이 안 되잖아요. 가버려요.\\n\\n잭\\n    못 가요. 이제 나도 끼어들었으니까요. 당신이 놓아버리면 나도 뒤따라 뛰어들어야 하거든요.",
      "excerpt_description": "타이타닉호 선미 난간 너머로 몸을 던지려는 로즈를, 처음 마주한 잭이 차분히 말로 붙들어 세우는 장면. 두 사람의 운명이 처음으로 엮이는 순간이다.",
      "keywords": ["만남", "구원", "낯선이"],
      "temperature": 4,
      "intensity": 4
    },
    {
      "quote": "그런 일을 겪고 나면 삶이 던져주는 대로 받아들이는 법을 배우게 돼요. 하루하루를 의미 있게 사는 법도요.",
      "script_excerpt": "잭\\n    음... 세상은 넓잖아요. 그리고 난 떠나기 전에 그 세상을 전부 보고 싶어요. 아버지는 늘 바다를 보러 가고 싶다고 말하셨죠. 하지만 태어난 마을에서 돌아가셨고, 결국 바다는 한 번도 보지 못하셨어요. 그냥 기다리고만 있을 수는 없어요. 다음에 어떤 패가 들어올지는 아무도 모르니까요. 보세요, 제 부모님은 제가 열다섯 살 때 화재로 돌아가셨고, 그때부터 전 떠돌며 살았어요. 그런 일을 겪고 나면 삶이 던져주는 대로 받아들이는 법을 배우게 돼요. 하루하루를 의미 있게 사는 법도요.\\n\\n(몰리 브라운이 경의를 표하듯 잔을 들어 올린다.)\\n\\n몰리\\n    멋진 말이네요, 잭.\\n\\n그레이시 대령 (잔을 들며)\\n    옳은 말이오.\\n\\n(로즈가 잭을 바라보며 잔을 들어 올린다.)\\n\\n로즈\\n    의미 있게 사는 삶을 위하여.",
      "excerpt_description": "일등석 만찬에서 상류층의 비웃음 어린 시선 한복판에 앉은 잭이, 자신의 삶의 철학을 담담히 풀어놓고 로즈가 잔을 들어 그에 호응하는 장면.",
      "keywords": ["삶의태도", "자유", "건배"],
      "temperature": 4,
      "intensity": 2
    }
  ]
}
</output>
</example>


[04 USER INPUT]
<input>
{{INPUT_JSON}}
</input>
`;
