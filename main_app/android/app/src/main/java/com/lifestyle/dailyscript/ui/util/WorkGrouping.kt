package com.lifestyle.dailyscript.ui.util

import com.lifestyle.dailyscript.data.model.WorkDto

// --- Work grouping mirrored from the PWA (m-app.js workGroupKey / resolveSeriesSubtitle /
// extractSeries). Books are grouped by series + subtitle + author, NOT by work_id, so cards
// from duplicate work rows of the same title merge into a single book. Shared by the library
// catalog (LibraryViewModel) and the bookmark shelf (ArchiveScreen) so both fold the same way. ---

private val TITLE_DISPLAY_ALIASES = mapOf(
    "titanic" to "타이타닉",
    "아저씨" to "아저씨",
)

/** Normalize a raw title via the alias map (mirrors the PWA displayTitle). */
private fun normalizeTitle(raw: String?): String {
    val t = (raw ?: "").trim()
    if (t.isEmpty()) return t
    val lc = t.lowercase()
    TITLE_DISPLAY_ALIASES[lc]?.let { return it }
    val stripped = lc.filter { it.isLetterOrDigit() }
    if (stripped.isNotEmpty()) TITLE_DISPLAY_ALIASES[stripped]?.let { return it }
    return t
}

private class SeriesPattern(val name: String, val detect: Regex, val authorDetect: Regex?, val strip: List<Regex>)

private val SERIES_PATTERNS = listOf(
    SeriesPattern(
        name = "셜록홈즈",
        detect = Regex("(?:셜록|홈즈|sherlock|holmes)", RegexOption.IGNORE_CASE),
        authorDetect = Regex("(?:코난\\s*도일|conan\\s*doyle|아서\\s*코난|arthur\\s*conan)", RegexOption.IGNORE_CASE),
        strip = listOf(
            Regex("셜록\\s*홈즈", RegexOption.IGNORE_CASE), Regex("sherlock\\s*holmes", RegexOption.IGNORE_CASE),
            Regex("셜록"), Regex("홈즈"), Regex("sherlock", RegexOption.IGNORE_CASE), Regex("holmes", RegexOption.IGNORE_CASE),
        ),
    ),
)

private val SERIES_TRIM = Regex("^[\\s\\-:·,—–의와과]+|[\\s\\-:·,—–의와과]+$")
private val MULTI_SPACE = Regex("\\s+")

/** Split a title/author into series + subtitle (mirrors the PWA extractSeries). */
private fun extractSeries(title: String, author: String): Pair<String, String> {
    val t = title.trim()
    val a = author.trim()
    if (t.isEmpty() && a.isEmpty()) return "" to ""
    for (sp in SERIES_PATTERNS) {
        val titleMatch = sp.detect.containsMatchIn(t)
        val authorMatch = sp.authorDetect?.let { a.isNotEmpty() && it.containsMatchIn(a) } ?: false
        if (titleMatch || authorMatch) {
            var subtitle = t
            if (titleMatch) for (re in sp.strip) subtitle = re.replace(subtitle, "")
            subtitle = MULTI_SPACE.replace(SERIES_TRIM.replace(subtitle, ""), " ").trim()
            return sp.name to subtitle
        }
    }
    return t to ""
}

/** (series, subtitle) honoring DB subtitle first (mirrors the PWA resolveSeriesSubtitle). */
fun resolveSeriesSubtitle(title: String?, subtitle: String?, author: String?): Pair<String, String> {
    val dbSubtitle = subtitle?.trim().orEmpty()
    if (dbSubtitle.isNotEmpty()) return normalizeTitle(title) to dbSubtitle
    return extractSeries(normalizeTitle(title), author ?: "")
}

fun resolveSeriesSubtitle(work: WorkDto?): Pair<String, String> =
    resolveSeriesSubtitle(work?.title, work?.subtitle, work?.author)

/** Grouping key — series__subtitle__author, lowercased (mirrors the PWA workGroupKey). */
fun workGroupKey(title: String?, subtitle: String?, author: String?): String {
    val (series, sub) = resolveSeriesSubtitle(title, subtitle, author)
    val a = (author ?: "").lowercase().trim()
    return "${series.lowercase()}__${sub.lowercase()}__$a"
}

fun workGroupKey(work: WorkDto?): String = workGroupKey(work?.title, work?.subtitle, work?.author)
