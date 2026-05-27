package com.lifestyle.dailyscript.data

import com.lifestyle.dailyscript.data.model.CardDto
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Today's-card + recommendation logic, ported from the PWA (m-app.js).
 *
 *  - Taste OFF → deterministic seed pick for "today", uniform random for refresh.
 *  - Taste ON  → weighted by similarity to the average temperature/intensity of
 *    the user's bookmarked cards. Today's pick stays deterministic per day.
 */
object Recommend {

    data class Taste(val avgTemperature: Double, val avgIntensity: Double, val count: Int)

    fun todaySeed(date: LocalDate = LocalDate.now()): Long =
        date.year * 10000L + date.monthValue * 100L + date.dayOfMonth

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

    /** Deterministic per-day pick. */
    fun pickToday(
        all: List<CardDto>,
        tasteEnabled: Boolean,
        bookmarkCards: List<CardDto>,
    ): CardDto? {
        if (all.isEmpty()) return null
        val seed = todaySeed()
        if (!tasteEnabled) return all[(abs(seed) % all.size).toInt()]
        val taste = computeTaste(bookmarkCards) ?: return all[(abs(seed) % all.size).toInt()]

        val sorted = all.sortedBy { distance(it, taste) }
        val variety = (abs(seed) % 10) == 0L
        val pool = if (variety) {
            sorted.subList((sorted.size * 0.3).toInt(), sorted.size)
        } else {
            sorted.subList(0, max(1, ceil(sorted.size * 0.3).toInt()))
        }
        return pool[(abs(seed) % pool.size).toInt()]
    }

    /** Non-deterministic refresh pick, excluding recently shown cards. */
    fun pickRandom(
        all: List<CardDto>,
        tasteEnabled: Boolean,
        bookmarkCards: List<CardDto>,
        recentIds: List<Long>,
    ): CardDto? {
        if (all.isEmpty()) return null
        val exclude = recentIds.toSet()
        fun excludingRecent(): List<CardDto> =
            all.filterNot { it.cardId in exclude }.ifEmpty { all }

        val taste = if (tasteEnabled) computeTaste(bookmarkCards) else null
        if (taste == null) return excludingRecent().random()

        // 10% variety — pure random.
        if (Random.nextDouble() < 0.1) return excludingRecent().random()

        val candidates = excludingRecent()
        val weights = candidates.map { 1.0 / (1.0 + distance(it, taste)) }
        val total = weights.sum()
        if (total <= 0.0) return candidates.random()
        var r = Random.nextDouble() * total
        for (i in candidates.indices) {
            r -= weights[i]
            if (r <= 0.0) return candidates[i]
        }
        return candidates.last()
    }
}
