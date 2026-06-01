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

// Genre badge fill colors (leather tones) for the filled format chip. Mirrors the PWA .chip.filled.g-*.
private val GENRE_CHIP_COLOR = mapOf(
    "movie" to 0xFF4A2A18L,
    "drama" to 0xFF6B4A2AL,
    "musical" to 0xFF5A2818L,
    "opera" to 0xFF4A2B1AL,
    "play" to 0xFF5A2A24L,
    "novel" to 0xFF3E585AL,
    "poem" to 0xFF27393BL,
    "essay" to 0xFF3A4030L,
)

/** ARGB color (Long) for the genre badge, or null → use the default filled (espresso) chip. */
fun genreChipColor(format: String?): Long? = GENRE_CHIP_COLOR[format?.lowercase()]

/** Genre label honoring the KO/EN toggle (mirrors GENRE_LABEL / GENRE_LABEL_EN). */
fun genreLabel(format: String?, english: Boolean): String {
    val key = format?.lowercase()
    return if (english) GENRE_LABEL_EN[key] ?: (format ?: "Etc.")
    else GENRE_LABEL[key] ?: "기타"
}
