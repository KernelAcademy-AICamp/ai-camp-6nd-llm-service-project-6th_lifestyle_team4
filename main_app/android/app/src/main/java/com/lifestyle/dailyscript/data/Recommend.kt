package com.lifestyle.dailyscript.data

import com.lifestyle.dailyscript.data.model.CardDto
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Card-selection logic ported from the PWA (m-app.js).
 *
 *  - Home entry restores the last-shown card (or a random one for new users) —
 *    there is no fixed "card of the day".
 *  - A refresh picks a fresh card, excluding the recently-shown queue and any
 *    already-bookmarked cards (PWA candidatesExcludingRecent, 3-tier fallback).
 *  - Taste weighting (similarity to the average temperature/intensity of the
 *    user's bookmarks) only kicks in once there are >= 10 bookmarks.
 */
object Recommend {

    private const val MIN_BOOKMARKS_FOR_TASTE = 10

    data class Taste(val avgTemperature: Double, val avgIntensity: Double, val count: Int)

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

    /** Fresh pick excluding recent + bookmarked; taste-weighted once >= 10 bookmarks. */
    fun pickRandom(
        all: List<CardDto>,
        tasteEnabled: Boolean,
        bookmarkCards: List<CardDto>,
        recentIds: List<Long>,
    ): CardDto? {
        if (all.isEmpty()) return null
        val taste = if (tasteEnabled && bookmarkCards.size >= MIN_BOOKMARKS_FOR_TASTE)
            computeTaste(bookmarkCards) else null

        // No taste profile, or a 10% variety roll → uniform random over the pool.
        if (taste == null || Random.nextDouble() < 0.1) {
            return candidates(all, recentIds, bookmarkCards).random()
        }

        // Distance-weighted: prefer cards near the taste centroid (recent + bookmarked excluded).
        val recent = recentIds.toHashSet()
        val bookmarked = bookmarkCards.mapTo(HashSet()) { it.cardId }
        var pool = all.filter { it.cardId !in recent && it.cardId !in bookmarked }
        if (pool.isEmpty()) pool = all.filter { it.cardId !in bookmarked }
        if (pool.isEmpty()) return candidates(all, recentIds, bookmarkCards).random()

        val weights = pool.map { 1.0 / (1.0 + distance(it, taste)) }
        val total = weights.sum()
        if (total <= 0.0) return pool.random()
        var r = Random.nextDouble() * total
        for (i in pool.indices) {
            r -= weights[i]
            if (r <= 0.0) return pool[i]
        }
        return pool.last()
    }
}
