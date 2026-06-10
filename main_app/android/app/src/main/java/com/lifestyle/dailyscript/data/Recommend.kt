package com.lifestyle.dailyscript.data

import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.UserPrefs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Card-selection logic ported from the PWA (m-app.js).
 *
 *  - Home entry restores the last-shown card (or picks one for new users) —
 *    there is no fixed "card of the day".
 *  - Routing (PWA pickRandomCard): active onboarding prefs OR the taste toggle
 *    → score-based pick; otherwise uniform random over the candidate pool.
 *  - pickByScore (PWA 추천 설계문서 P1): score = w_g·장르 + w_t·주제 + w_b·온도강도
 *    + w_p·인기, blended by α = min(bookmarks/10, 1), sampled via softmax(τ=0.5).
 */
object Recommend {

    private const val MIN_BOOKMARKS_FOR_TASTE = 10
    private val TASTE_DMAX = sqrt(32.0)  // 2D(1~5) 최대 거리
    private const val SCORE_TAU = 0.5    // softmax 탐험온도 (작을수록 정확↑)

    data class Taste(val avgTemperature: Double, val avgIntensity: Double, val count: Int)

    /** 추천 결과 + 선택 경로 (KPI card_shown.source 용). */
    data class PickResult(val card: CardDto, val source: String) // "score" | "random"

    /** Average temperature/intensity of the bookmarked cards (null if none). */
    fun computeTaste(bookmarkCards: List<CardDto>): Taste? {
        if (bookmarkCards.isEmpty()) return null
        return Taste(
            avgTemperature = bookmarkCards.map { it.temperature }.average(),
            avgIntensity = bookmarkCards.map { it.intensity }.average(),
            count = bookmarkCards.size,
        )
    }

    private fun distance(card: CardDto, taste: Taste): Double {
        val dt = card.temperature - taste.avgTemperature
        val di = card.intensity - taste.avgIntensity
        return sqrt(dt * dt + di * di)
    }

    /**
     * The most-recently shown card the user hasn't since bookmarked
     * (mirrors the PWA restoreLastShownCard). null if the queue has none.
     */
    fun restoreLastShown(
        all: List<CardDto>,
        recentIds: List<Long>,
        bookmarkCards: List<CardDto>,
    ): CardDto? {
        if (recentIds.isEmpty() || all.isEmpty()) return null
        val bookmarked = bookmarkCards.mapTo(HashSet()) { it.cardId }
        for (i in recentIds.indices.reversed()) {
            val card = all.firstOrNull { it.cardId == recentIds[i] }
            if (card != null && card.cardId !in bookmarked) return card
        }
        return null
    }

    /**
     * Candidate pool excluding recently-shown + bookmarked cards, with the PWA's
     * three-tier fallback (allow recent again, then allow bookmarked again).
     */
    private fun candidates(
        all: List<CardDto>,
        recentIds: List<Long>,
        bookmarkCards: List<CardDto>,
    ): List<CardDto> {
        val recent = recentIds.toHashSet()
        val bookmarked = bookmarkCards.mapTo(HashSet()) { it.cardId }
        all.filter { it.cardId !in recent && it.cardId !in bookmarked }.let { if (it.isNotEmpty()) return it }
        all.filter { it.cardId !in bookmarked }.let { if (it.isNotEmpty()) return it }
        all.filter { it.cardId !in recent }.let { if (it.isNotEmpty()) return it }
        return all
    }

    /** 라우팅 — PWA pickRandomCard: 선호/취향이 있으면 점수 추천, 아니면 순수 랜덤. */
    fun pickCard(
        all: List<CardDto>,
        prefs: UserPrefs?,
        tasteEnabled: Boolean,
        bookmarkCards: List<CardDto>,
        recentIds: List<Long>,
        bookmarkCounts: Map<Long, Int>,
    ): PickResult? {
        if (all.isEmpty()) return null
        if (prefs?.hasActive() == true || tasteEnabled) {
            return pickByScore(all, prefs, bookmarkCards, recentIds, bookmarkCounts)
        }
        return PickResult(candidates(all, recentIds, bookmarkCards).random(), "random")
    }

    /**
     * PWA pickByScore — 온보딩 선호(장르·주제) + 행동(온도·강도) + 인기도 통합 점수 추천.
     * tasteEnabled 는 여기서 보지 않는다(PWA 동일 — 라우팅에서만 분기).
     */
    fun pickByScore(
        all: List<CardDto>,
        prefs: UserPrefs?,
        bookmarkCards: List<CardDto>,
        recentIds: List<Long>,
        bookmarkCounts: Map<Long, Int>,
    ): PickResult? {
        if (all.isEmpty()) return null

        // 8% variety — pure random (최근·북마크 제외 풀)
        if (Random.nextDouble() < 0.08) {
            return PickResult(candidates(all, recentIds, bookmarkCards).random(), "random")
        }

        val recent = recentIds.toHashSet()
        val bookmarked = bookmarkCards.mapTo(HashSet()) { it.cardId }
        var cands = all.filter { it.cardId !in recent && it.cardId !in bookmarked }
        if (cands.isEmpty()) cands = all.filter { it.cardId !in bookmarked }
        if (cands.isEmpty()) {
            return PickResult(candidates(all, recentIds, bookmarkCards).random(), "random")
        }

        val genreSet = prefs?.genres?.toHashSet() ?: emptySet()
        val themeSet = prefs?.themes?.toHashSet() ?: emptySet()
        val anyTheme = prefs == null || prefs.any || themeSet.isEmpty()
        val taste = if (bookmarkCards.size >= MIN_BOOKMARKS_FOR_TASTE) computeTaste(bookmarkCards) else null

        // α = min(북마크/10, 1): 가입 직후 온보딩 100% → 쌓일수록 행동 비중 ↑
        val a = min(bookmarkCards.size / MIN_BOOKMARKS_FOR_TASTE.toDouble(), 1.0)
        val wg = 0.55 + (0.30 - 0.55) * a
        val wt = 0.45 + (0.30 - 0.45) * a
        val wb = if (taste != null) 0.35 * a else 0.0
        val wp = 0.05

        var maxBm = 1
        for (c in cands) maxBm = max(maxBm, bookmarkCounts[c.cardId] ?: 0)
        val logMax = ln(1.0 + maxBm)

        // score → P(c) ∝ exp(score/τ)
        val exps = cands.map { c ->
            val gm = if (genreSet.isEmpty()) 1.0 else if (c.works?.format in genreSet) 1.0 else 0.15
            val tm = if (anyTheme) 1.0
            else if (CardTheme.cardThemeSet(c.keywordList()).any { it in themeSet }) 1.0 else 0.2
            val ts = if (taste != null) max(0.0, 1.0 - distance(c, taste) / TASTE_DMAX) else 0.0
            val pop = if (logMax > 0) ln(1.0 + (bookmarkCounts[c.cardId] ?: 0)) / logMax else 0.0
            exp((wg * gm + wt * tm + wb * ts + wp * pop) / SCORE_TAU)
        }
        var r = Random.nextDouble() * exps.sum()
        var picked = cands.last()
        for (i in cands.indices) {
            r -= exps[i]
            if (r <= 0) { picked = cands[i]; break }
        }
        return PickResult(picked, "score")
    }

    /**
     * KPI용 — 이 카드가 사용자의 선호(장르/주제)와 맞는지 (PWA cardMatchProps).
     * 활성 선호가 없으면 빈 맵.
     */
    fun matchProps(card: CardDto?, prefs: UserPrefs?): Map<String, Any?> {
        if (card == null || prefs == null || !prefs.hasActive()) return emptyMap()
        val out = mutableMapOf<String, Any?>()
        if (prefs.genres.isNotEmpty()) out["prefGenreMatch"] = card.works?.format in prefs.genres
        if (!prefs.any && prefs.themes.isNotEmpty()) {
            out["prefThemeMatch"] = CardTheme.cardThemeSet(card.keywordList()).any { it in prefs.themes }
        }
        return out
    }
}
