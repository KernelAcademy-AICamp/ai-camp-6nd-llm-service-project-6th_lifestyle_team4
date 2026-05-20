// ============================================================================
//  PROMPTS — 이 파일이 프롬프트 단일 편집 지점입니다.
//  추후 실제 프롬프트를 이 자리에 채워 넣으세요. 코드 다른 곳을 건드릴 필요 없습니다.
// ============================================================================

// ---------------------------------------------------------------------------
//  EXTRACT_PROMPT
//  대본 전문(텍스트)을 받아 work + cards JSON을 생성.
//  - 본문에서 `{{SCRIPT_TEXT}}`를 자동으로 PDF 추출 텍스트로 치환합니다.
//  - 모델이 반드시 아래 형식의 JSON만 응답하도록 마지막에 지시문을 두는 것을 권장.
//
//  기대 출력 형식:
//  {
//    "work": {
//      "title": string,
//      "format": "movie" | "drama" | "play" | "musical",
//      "author": string | null,
//      "release_year": number | null,
//      "genres": string[]
//    },
//    "cards": [{
//      "quote": string,
//      "script_excerpt": string,
//      "excerpt_description": string,
//      "keywords": string[],
//      "temperature": 1 | 2 | 3 | 4 | 5,
//      "intensity": 1 | 2 | 3 | 4 | 5
//    }, ...]
//  }
// ---------------------------------------------------------------------------
export const EXTRACT_PROMPT = `
TODO: 추출 프롬프트를 여기에 작성하세요.

대본 전문:
"""
{{SCRIPT_TEXT}}
"""
`;

// ---------------------------------------------------------------------------
//  TRANSLATE_PROMPT
//  한 장의 카드(비한국어)를 한국어로 번역.
//  - 본문에서 `{{CARD_JSON}}`을 카드 단건 JSON 문자열로 치환합니다.
//
//  기대 출력 형식:
//  {
//    "quote_translated": string,
//    "script_excerpt_translated": string,
//    "excerpt_description_translated": string,
//    "source_language": string   // 예: "en", "ja"
//  }
// ---------------------------------------------------------------------------
export const TRANSLATE_PROMPT = `
TODO: 번역 프롬프트를 여기에 작성하세요.

원본 카드 (JSON):
{{CARD_JSON}}
`;
