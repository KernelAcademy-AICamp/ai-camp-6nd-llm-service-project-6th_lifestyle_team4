// ---------------------------------------------------------------------------
//  keyword-utils — admin 카드 키워드 파싱·검증·인라인 힌트 공통 유틸
//  정책:
//   · 정확히 3개 (미만/초과면 저장 막음)
//   · 쉼표로 구분
//   · 각 항목 공백 제외 8자 이하 권장 (초과 시 경고만, 저장은 허용)
//  dashboard.js(추출 리뷰 편집)·library.js(저장 카드 편집) 양쪽에서 공용.
// ---------------------------------------------------------------------------

export const KEYWORD_COUNT = 3;
export const KEYWORD_MAX_LEN = 8; // 공백 제외 권장 상한

// "a, b, c" → ['a','b','c'] (빈 항목 제거, slice 하지 않음 — 초과 감지 위해 전부 보존)
export function parseKeywords(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function visibleLen(kw) {
  return kw.replace(/\s+/g, '').length;
}

// 저장 가능 여부 — 개수가 정확히 3개가 아니면 막는다.
export function validateKeywords(list) {
  if (list.length !== KEYWORD_COUNT) {
    return {
      ok: false,
      message: `키워드는 정확히 ${KEYWORD_COUNT}개여야 합니다 (현재 ${list.length}개). 쉼표로 구분해 ${KEYWORD_COUNT}개만 입력하세요.`,
    };
  }
  return { ok: true };
}

// 8자(공백 제외) 초과 항목 — 경고용. 저장은 막지 않는다.
export function overLongKeywords(list) {
  return list.filter((k) => visibleLen(k) > KEYWORD_MAX_LEN);
}

// 입력 필드 바로 아래에 실시간 힌트(개수/길이 경고)를 붙인다.
//  · 개수 ≠ 3 → 빨강(저장 막힘)
//  · 8자 초과만 있음 → 주황(경고, 저장 가능)
//  · 정상 → 회색
export function attachKeywordHint(inputEl) {
  if (!inputEl) return null;
  const hint = document.createElement('p');
  hint.className = 'kw-hint text-xs mt-1';

  const update = () => {
    const list = parseKeywords(inputEl.value);
    const over = overLongKeywords(list);
    const countOk = list.length === KEYWORD_COUNT;
    const parts = [`${list.length}/${KEYWORD_COUNT}개`];
    if (over.length) parts.push(`8자 초과: ${over.join(', ')}`);
    else if (countOk) parts.push('OK');
    hint.textContent = parts.join(' · ');
    if (!countOk) hint.style.color = '#dc2626';        // red — 저장 막힘
    else if (over.length) hint.style.color = '#d97706'; // amber — 경고
    else hint.style.color = '';                         // 기본(회색은 클래스로)
    hint.classList.toggle('text-on-surface-variant', countOk && !over.length);
  };

  inputEl.insertAdjacentElement('afterend', hint);
  inputEl.addEventListener('input', update);
  update();
  return hint;
}
