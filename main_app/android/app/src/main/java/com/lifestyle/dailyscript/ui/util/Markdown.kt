package com.lifestyle.dailyscript.ui.util

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle

/**
 * Text post-processing mirrored from the PWA (m-app.js cleanQuote / renderMarkdownBold /
 * renderNoticeBodyHtml) so Android renders quotes and notices identically.
 */
object Markdown {

    private val DASHES = Regex("[—–―─━‐‑‒ㅡー﹘﹣－]")
    private val MULTI_NEWLINE = Regex("\\n{2,}")
    private val MULTI_SPACE = Regex("[ \\t]{2,}")
    // **bold** — same pattern the PWA uses (no leading * or newline inside).
    private val BOLD = Regex("""\*\*([^*\n][^*]*?)\*\*""")

    /** Mirrors the PWA cleanQuote: dashes→space, collapse blank lines + spaces, trim. Keeps single \n. */
    fun cleanQuote(s: String?): String =
        (s ?: "")
            .replace(DASHES, " ")
            .replace(MULTI_NEWLINE, "\n")
            .replace(MULTI_SPACE, " ")
            .trim()

    /** Same as cleanQuote but flattened to a single line (for 1-line list rows). */
    fun oneLine(s: String?): String = cleanQuote(s).replace('\n', ' ')

    private val PROSE_NEWLINES = Regex("\\s*\\n+\\s*")

    /** Mirrors the PWA flowProse — collapse all newlines to spaces (for 산문 설명/의의). */
    fun flowProse(s: String?): String = (s ?: "").replace(PROSE_NEWLINES, " ").trim()

    /** Prose paragraph (flowed) with **bold** rendered. */
    fun prose(s: String?): AnnotatedString = bold(flowProse(s))

    /** Render **bold** markers into an AnnotatedString. */
    fun bold(text: String): AnnotatedString = buildAnnotatedString {
        var last = 0
        for (m in BOLD.findAll(text)) {
            if (m.range.first > last) append(text.substring(last, m.range.first))
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(m.groupValues[1]) }
            last = m.range.last + 1
        }
        if (last < text.length) append(text.substring(last))
    }

    /** A prominent, display-ready quote: curly quotes + cleanQuote + **bold** (newlines preserved). */
    fun quote(s: String?): AnnotatedString = buildAnnotatedString {
        append("“")
        append(bold(cleanQuote(s)))
        append("”")
    }
}
