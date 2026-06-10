package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.Serializable

/**
 * 온보딩에서 고른 선호도 (PWA ds.pref / users.pref_* 컬럼과 동일 값).
 *  - genres: 작품 format 값들 ("novel","play","essay","opera","prose")
 *  - themes: 10범주 한글 주제명 — PWA 저장값과 문자열이 정확히 일치해야 기기 간 동기화가 된다.
 *  - any: "상관없음"(모든 주제 폭넓게) 선택 여부
 */
@Serializable
data class UserPrefs(
    val genres: List<String> = emptyList(),
    val themes: List<String> = emptyList(),
    val any: Boolean = false,
) {
    /** 실제로 추천을 좁히는 선호가 있나? (PWA hasActivePrefs) */
    fun hasActive(): Boolean = genres.isNotEmpty() || (!any && themes.isNotEmpty())
}
