package com.lifestyle.dailyscript.ui.util

/** Display order + Korean labels for work formats. Mirrors the PWA (m-app.js:1501). */
val GENRE_ORDER = listOf("movie", "drama", "musical", "opera", "play", "novel", "poem", "essay", "prose")

private val GENRE_LABEL = mapOf(
    "movie" to "영화",
    "drama" to "드라마",
    "musical" to "뮤지컬",
    "opera" to "오페라",
    "play" to "연극",
    "novel" to "소설",
    "poem" to "시",
    "essay" to "에세이",
    "prose" to "산문",
)

fun genreLabel(format: String?): String =
    GENRE_LABEL[format?.lowercase()] ?: "기타"
