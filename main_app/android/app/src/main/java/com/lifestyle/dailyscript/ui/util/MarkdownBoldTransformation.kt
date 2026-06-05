package com.lifestyle.dailyscript.ui.util

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation

/**
 * BasicTextField VisualTransformation that:
 *  1) Hides **markdown bold** markers and applies FontWeight.Bold to the content between them.
 *  2) Optionally bolds entire speaker lines (mirrors the PWA's boldSpeakerLines).
 *
 * Mirrors the PWA renderMarkdownBold + applyMarkdownBoldOnHtml flow so that
 * "**text**" entered in the admin editor renders as bold in the native script body.
 *
 * Offsets: provides proper OffsetMapping so text selection / cursor / highlight
 * extraction continue to work after the ** characters are visually removed.
 * TextFieldValue.selection stays in the ORIGINAL coordinate space (with `**`).
 * When callers substring scriptTfv.text[a..b], they still get the raw text — but
 * that's the source-of-truth from the DB, which is desirable (we want highlights
 * stored exactly as in the DB).
 */
class MarkdownBoldTransformation(
    private val speakerNames: List<String> = emptyList(),
) : VisualTransformation {

    private val BOLD = Regex("""\*\*([^*\n][^*]*?)\*\*""")

    override fun filter(text: AnnotatedString): TransformedText {
        val src = text.text
        val matches = BOLD.findAll(src).toList()

        // Fast path — no bold markers: only speaker bold needs to apply.
        if (matches.isEmpty()) {
            val styled = if (speakerNames.isNotEmpty()) boldSpeakerLines(src, speakerNames) else AnnotatedString(src)
            return TransformedText(styled, OffsetMapping.Identity)
        }

        // Build transformed text + per-original-offset → transformed-offset table.
        val builder = AnnotatedString.Builder()
        val origToTransformed = IntArray(src.length + 1)
        var srcIdx = 0
        var dstIdx = 0

        for (m in matches) {
            // 1) Plain text before the match — copy verbatim.
            while (srcIdx < m.range.first) {
                origToTransformed[srcIdx] = dstIdx
                builder.append(src[srcIdx])
                srcIdx++
                dstIdx++
            }
            // 2) Opening "**" — collapsed (both chars map to current dst position).
            origToTransformed[srcIdx] = dstIdx
            origToTransformed[srcIdx + 1] = dstIdx
            srcIdx += 2

            // 3) Bold content — m.range.last - 1 is position of last content char.
            val contentStart = dstIdx
            val contentEndExclusive = m.range.last - 1 // exclusive; the next 2 chars are closing **
            while (srcIdx < contentEndExclusive) {
                origToTransformed[srcIdx] = dstIdx
                builder.append(src[srcIdx])
                srcIdx++
                dstIdx++
            }
            builder.addStyle(SpanStyle(fontWeight = FontWeight.Bold), contentStart, dstIdx)

            // 4) Closing "**" — collapsed too.
            origToTransformed[srcIdx] = dstIdx
            origToTransformed[srcIdx + 1] = dstIdx
            srcIdx += 2
        }
        // 5) Trailing plain text after last match.
        while (srcIdx < src.length) {
            origToTransformed[srcIdx] = dstIdx
            builder.append(src[srcIdx])
            srcIdx++
            dstIdx++
        }
        origToTransformed[src.length] = dstIdx

        // Apply speaker bold ON TOP of markdown bold.
        val withMarkdown = builder.toAnnotatedString()
        val finalStyled = if (speakerNames.isNotEmpty()) {
            mergeSpeakerBold(withMarkdown, speakerNames)
        } else {
            withMarkdown
        }

        // Reverse mapping: smallest original offset whose origToTransformed >= transformed offset.
        val transformedLen = dstIdx
        val transformedToOrig = IntArray(transformedLen + 1)
        var origCursor = 0
        for (t in 0..transformedLen) {
            while (origCursor <= src.length && origToTransformed[origCursor] < t) origCursor++
            transformedToOrig[t] = origCursor.coerceAtMost(src.length)
        }

        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int =
                origToTransformed[offset.coerceIn(0, src.length)]

            override fun transformedToOriginal(offset: Int): Int =
                transformedToOrig[offset.coerceIn(0, transformedLen)]
        }

        return TransformedText(finalStyled, mapping)
    }

    /**
     * Re-create the speaker-line boldening on top of an already-styled AnnotatedString.
     * (We can't call the existing boldSpeakerLines(String,...) because we'd lose markdown spans.)
     */
    private fun mergeSpeakerBold(base: AnnotatedString, names: List<String>): AnnotatedString {
        val text = base.text
        val nameSet = names.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (nameSet.isEmpty()) return base
        // Build a new AnnotatedString carrying all existing styles plus speaker bold spans.
        val builder = AnnotatedString.Builder(base)
        val lines = text.split("\n")
        var pos = 0
        lines.forEachIndexed { index, line ->
            val trimmed = line.trim()
            val namePart = trimmed.substringBefore("(").trim()
            val isBlockStart = index == 0 || lines[index - 1].trim().isEmpty()
            val isSpeaker = isBlockStart && trimmed.isNotEmpty() && (trimmed in nameSet || namePart in nameSet)
            if (isSpeaker) {
                builder.addStyle(SpanStyle(fontWeight = FontWeight.Bold), pos, pos + line.length)
            }
            pos += line.length + 1 // +1 for the '\n' between lines
        }
        return builder.toAnnotatedString()
    }

    /** Plain-string speaker-bolding (same logic as DetailScreen.boldSpeakerLines). */
    private fun boldSpeakerLines(text: String, characterNames: List<String>): AnnotatedString {
        val nameSet = characterNames.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (nameSet.isEmpty()) return AnnotatedString(text)
        val builder = AnnotatedString.Builder()
        val lines = text.split("\n")
        lines.forEachIndexed { index, line ->
            val trimmed = line.trim()
            val namePart = trimmed.substringBefore("(").trim()
            val isBlockStart = index == 0 || lines[index - 1].trim().isEmpty()
            val isSpeaker = isBlockStart && trimmed.isNotEmpty() && (trimmed in nameSet || namePart in nameSet)
            if (isSpeaker) {
                builder.pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
                builder.append(line)
                builder.pop()
            } else {
                builder.append(line)
            }
            if (index < lines.lastIndex) builder.append("\n")
        }
        return builder.toAnnotatedString()
    }
}
