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

private val GENRE_LABEL_EN = mapOf(
    "movie" to "Movie",
    "drama" to "Drama",
    "musical" to "Musical",
    "opera" to "Opera",
    "play" to "Play",
    "novel" to "Novel",
    "poem" to "Poem",
    "essay" to "Essay",
    "prose" to "Prose",
)

fun genreLabel(format: String?): String =
    GENRE_LABEL[format?.lowercase()] ?: "기타"

/** Genre label honoring the KO/EN toggle (mirrors GENRE_LABEL / GENRE_LABEL_EN). */
fun genreLabel(format: String?, english: Boolean): String {
    val key = format?.lowercase()
    return if (english) GENRE_LABEL_EN[key] ?: (format ?: "Etc.")
    else GENRE_LABEL[key] ?: "기타"
}
