package com.lifestyle.dailyscript.ui.util

import com.lifestyle.dailyscript.data.model.CardDto

/**
 * Detail script_excerpt formatting, ported from the PWA (m-app.js):
 *  - poem            → formatPoemScript (preserve line/verse structure)
 *  - novel/essay/prose → flowProseScript (one sentence per line, paragraphs)
 *  - else (plays…)   → cleanForDisplay (structure speaker blocks; bolded separately)
 */
object ScriptFormat {

    private val PROSE_FORMATS = setOf("novel", "essay", "prose")
    private val DASH = Regex("[—–―─━‐‑‒ㅡー﹘﹣－]")
    private val DASH_PLUS = Regex("[—–―─━‐‑‒ㅡー﹘﹣－]+")
    private val CRLF = Regex("\\r\\n?")

    fun isProse(format: String?): Boolean = (format ?: "").lowercase() in PROSE_FORMATS

    /** Speaker-line bolding applies to plays/dialogue, not poem or prose. */
    fun usesSpeakerBold(format: String?): Boolean {
        val f = (format ?: "").lowercase()
        return f != "poem" && !isProse(f)
    }

    /** The display string for the detail script, by work format + EN toggle. */
    fun displayScript(card: CardDto, english: Boolean): String {
        val raw = card.scriptFor(english)
        val format = (card.works?.format ?: "").lowercase()
        return when {
            format == "poem" -> formatPoem(raw)
            isProse(format) -> flowProse(raw)
            else -> cleanForDisplay(raw, card.works?.characterList().orEmpty())
        }
    }

    private fun formatPoem(text: String): String =
        text.replace(CRLF, "\n")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim('\n')

    private fun flowProse(text: String): String {
        val s = text.replace(CRLF, "\n")
            .replace("「", "“").replace("」", "”")
            .replace(DASH_PLUS, " ")
            .replace(Regex("-{2,}"), " ")
        return s.split(Regex("\\n{2,}")).map { p ->
            val flowed = p
                .replace(Regex("[ \\t]*\\n[ \\t]*"), " ")
                .replace(Regex("[ \\t]{2,}"), " ")
                .trim()
                .replace(Regex("\\s*([“\"][^”\"]*[.!?…][”\"])\\s*"), "\n\n$1\n\n")
            flowed.split("\n")
                .joinToString("\n") { line -> line.trim().replace(Regex("([.!?…])\\s+"), "$1\n") }
                .replace(Regex("\\n{3,}"), "\n\n")
                .trim('\n')
        }.filter { it.isNotBlank() }.joinToString("\n\n")
    }

    private val PARTICLE_END =
        Regex("(가|이|은|는|을|를|도|의|에|에게|에서|와|과|으로|로|만|보다|처럼|마저|조차|밖에|께|께서|께선)$")
    private val CONNECTIVE_DENY = setOf(
        "그리고", "그러나", "그래서", "하지만", "그런데", "그러면", "그러니까", "그러므로", "따라서",
        "또한", "또는", "그래도", "그럼에도", "한편", "결국", "마침내", "다만", "물론", "사실",
        "아무튼", "그때", "이때", "이윽고", "갑자기", "천천히", "잠시", "다시", "이미", "이제",
        "지금", "드디어", "문득", "잠깐", "순간",
    )
    private val HEAD = Regex("^([가-힣A-Za-z]{2,7}[0-9]?)(?=\\s|$)")
    private val COLON_LINE = Regex("^([^:：()\\n]{1,14})[:：][ \\t]*", RegexOption.MULTILINE)
    private val COLON_LINE_NL = Regex("^([^:：()\\n]{1,14})[:：][ \\t]*\\n?", RegexOption.MULTILINE)

    private val SPEAKER_COLON = Regex("^([^\\n:：—\\-]{1,20})[:：]\\s*(.*)$")
    private val TRAILING_PAREN = Regex("\\s*[(（].*?[)）]\\s*$")
    private val WS = Regex("\\s+")
    private val QUOTE_CHARS = Regex("[\"“”'`’]")

    /**
     * The speaker of [quote] within [scriptExcerpt], using [characters] (mirrors the PWA's
     * extractSpeaker). Returns "" when ambiguous / not found.
     */
    fun extractSpeaker(scriptExcerpt: String?, characters: List<String>, quote: String?): String {
        if (scriptExcerpt.isNullOrBlank()) return ""
        val names = characters.map { it.trim() }.filter { it.isNotEmpty() }.sortedByDescending { it.length }

        fun speakerOf(raw: String): Pair<String, String>? {
            val t = raw.trim()
            if (t.isEmpty()) return null
            for (name in names) {
                if (!t.startsWith(name)) continue
                val tt = t.substring(name.length).trim()
                if (tt.isEmpty()) return name to ""
                when (tt[0]) {
                    ':', '：' -> return name to tt.substring(1).trim()
                    '(', '（' -> return name to tt
                }
            }
            val m = SPEAKER_COLON.find(t)
            if (m != null) {
                val nm = m.groupValues[1].replace(TRAILING_PAREN, "").trim()
                if (nm.isNotEmpty()) return nm to m.groupValues[2]
            }
            return null
        }

        fun norm(s: String?): String = (s ?: "").replace(WS, "").replace(QUOTE_CHARS, "")

        data class Block(val speaker: String, var text: String)
        val blocks = mutableListOf<Block>()
        var cur: Block? = null
        for (raw in scriptExcerpt.split("\n")) {
            val sp = speakerOf(raw)
            if (sp != null) {
                cur = Block(sp.first, sp.second)
                blocks.add(cur)
            } else if (cur != null) {
                cur.text += "\n" + raw
            }
        }
        if (blocks.isEmpty()) return ""

        val qn = norm(quote)
        if (qn.isNotEmpty()) {
            for (b in blocks) if (norm(b.text).contains(qn)) return b.speaker
            val firstLine = (quote ?: "").split("\n").map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: ""
            val fln = norm(firstLine)
            if (fln.length >= 4) {
                for (b in blocks) if (norm(b.text).contains(fln)) return b.speaker
            }
        }
        val distinct = blocks.map { it.speaker }.toSet()
        return if (distinct.size == 1) blocks[0].speaker else ""
    }

    private fun cleanForDisplay(s: String, characterNames: List<String>): String {
        var text = s.replace(DASH, " ")
        val speakers = mutableSetOf<String>()
        COLON_LINE.findAll(text).forEach { m ->
            val name = m.groupValues[1].trim()
            if (name.isNotEmpty()) speakers.add(name)
        }
        val characterSet = characterNames.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        val headCounts = HashMap<String, Int>()
        for (raw in text.split(Regex("\\r?\\n"))) {
            val line = raw.trim()
            if (line.isEmpty() || line.length > 60) continue
            val word = HEAD.find(line)?.groupValues?.get(1) ?: continue
            if (PARTICLE_END.containsMatchIn(word)) continue
            headCounts[word] = (headCounts[word] ?: 0) + 1
        }
        headCounts.forEach { (word, count) ->
            if (count < 2) return@forEach
            if (word in CONNECTIVE_DENY) return@forEach
            if (characterSet.isNotEmpty() && word !in characterSet) return@forEach
            speakers.add(word)
        }
        text = text.replace(COLON_LINE_NL, "$1\n")
        val sortedSpeakers = speakers.sortedByDescending { it.length }
        val out = mutableListOf<String>()
        var firstSpeakerSeen = false
        fun pushBoundary() {
            if (firstSpeakerSeen && out.isNotEmpty() && out.last().trim().isNotEmpty()) out.add("")
        }
        for (raw in text.split("\n")) {
            val line = raw.trim()
            if (line.isEmpty()) { out.add(""); continue }
            if (line in speakers) {
                pushBoundary(); out.add(line); firstSpeakerSeen = true; continue
            }
            var matched = false
            for (name in sortedSpeakers) {
                if (line.length <= name.length + 1) continue
                if (line.startsWith("$name ") || line.startsWith("$name\t")) {
                    val rest = line.substring(name.length).trim()
                    if (rest.isNotEmpty()) {
                        pushBoundary(); out.add(name); out.add(rest); firstSpeakerSeen = true; matched = true; break
                    }
                }
            }
            if (matched) continue
            out.add(raw)
        }
        return out.joinToString("\n")
            .replace(Regex("[ \\t]{2,}"), " ")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim()
    }
}
