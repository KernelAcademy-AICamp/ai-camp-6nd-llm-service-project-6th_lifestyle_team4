package com.lifestyle.dailyscript.ui.util

import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.WorkDto
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.roundToInt

/**
 * Compact count formatting — mirrors the PWA's formatCount (m-app.js:1420).
 *  < 1000 → as-is; otherwise "k" with one decimal below 10k ("1.2k", "12k").
 */
fun formatCount(n: Int?): String {
    val v = (n ?: 0).coerceAtLeast(0)
    if (v < 1000) return v.toString()
    val k = v / 1000.0
    val rounded = if (k >= 10) k.roundToInt().toString() else ((k * 10).roundToInt() / 10.0).toString()
    return "${rounded}k"
}

/**
 * Work title with optional subtitle appended ("<제목> 부제"-style, minus the angle
 * brackets the PWA uses for its meta line). Honors the EN toggle.
 * Mirrors the PWA's titleBlock (m-app.js:1325).
 */
fun WorkDto?.displayTitle(useEnglish: Boolean = false): String {
    val w = this ?: return ""
    val title = (if (useEnglish) w.titleOriginal?.ifBlank { null } else null) ?: w.title
    val subtitle = (if (useEnglish) w.subtitleOriginal?.ifBlank { null } else null) ?: w.subtitle
    val t = title.trim()
    val s = subtitle?.trim().orEmpty()
    return if (s.isNotEmpty()) "$t $s" else t
}

/** Author honoring the EN toggle. */
fun WorkDto?.displayAuthor(useEnglish: Boolean = false): String? {
    val w = this ?: return null
    return (if (useEnglish) w.authorOriginal?.ifBlank { null } else null) ?: w.author
}

// --- Per-card field selectors honoring the KO/EN toggle (mirror m-app.js applyDetailLang). ---
// English falls back to Korean whenever the *_original field is missing.

fun CardDto.quoteFor(useEnglish: Boolean): String =
    (if (useEnglish) quoteOriginal?.ifBlank { null } else null) ?: quote

fun CardDto.scriptFor(useEnglish: Boolean): String =
    (if (useEnglish) scriptExcerptOriginal?.ifBlank { null } else null) ?: scriptExcerpt

fun CardDto.descriptionFor(useEnglish: Boolean): String? =
    (if (useEnglish) excerptDescriptionOriginal?.ifBlank { null } else null) ?: excerptDescription

fun CardDto.significanceFor(useEnglish: Boolean): String? =
    (if (useEnglish) significanceOriginal?.ifBlank { null } else null) ?: significance

fun CardDto.keywordsFor(useEnglish: Boolean): List<String> {
    if (useEnglish) {
        val en = keywordListOriginal()
        if (en.isNotEmpty()) return en
    }
    return keywordList()
}

/**
 * Absolute "<월>. <일>  오전/오후 h:mm" stamp used by the bookmark/feed/comment lists.
 * Mirrors the PWA's formatBookmarkDate (m-app.js:1481). Returns "" on unparseable input.
 */
fun formatBookmarkDate(iso: String): String {
    val instant = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()
        ?: runCatching { Instant.parse(iso) }.getOrNull()
        ?: runCatching { LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC) }.getOrNull()
        ?: return ""
    val dt = OffsetDateTime.ofInstant(instant, ZoneId.systemDefault())
    var h = dt.hour
    val min = "%02d".format(dt.minute)
    val ampm = if (h < 12) "오전" else "오후"
    h %= 12
    if (h == 0) h = 12
    return "${dt.monthValue}. ${dt.dayOfMonth}  $ampm $h:$min"
}
