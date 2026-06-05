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

    private data class SpeakerResult(
        val speaker: String,
        val blocks: List<Pair<String, String>>,
        val foundIdx: Int,
    )

    /**
     * The speaker of [quote] within [scriptExcerpt], using [characters] (mirrors the PWA's
     * extractSpeaker). Returns "" when ambiguous / not found.
     */
    fun extractSpeaker(scriptExcerpt: String?, characters: List<String>, quote: String?): String {
        return extractSpeakerInternal(scriptExcerpt, characters, quote)?.speaker ?: ""
    }

    /** Label 의 별표/콜론/공백 등 잡티 제거 + 한글 음절이 있으면 빈 문자열 (EN 모드 노출 차단). */
    private fun cleanSpeakerLabel(raw: String): String {
        var t = raw.trim()
        if (t.isEmpty()) return ""
        // 양쪽 별표/마침표/콜론/세미콜론/콤마/em-dash/공백 반복 제거
        t = t.trim('*', ' ', '\t', '.', ',', ':', '：', ';', '—', '–')
        if (t.isEmpty()) return ""
        if (Regex("[가-힯]").containsMatchIn(t)) return ""
        return t
    }

    /** 영문 블록 텍스트가 quote 와 실제로 관련 있는지 검증 (cross-lang 오매칭 방어). */
    private fun blockMatchesQuote(blockText: String, quote: String?): Boolean {
        if (quote.isNullOrEmpty()) return true
        fun norm(s: String?): String = (s ?: "").replace(WS, "").replace(QUOTE_CHARS, "")
        val bn = norm(blockText)
        val qn = norm(quote)
        if (bn.isEmpty() || qn.isEmpty()) return false
        if (bn.contains(qn)) return true
        val firstWord = quote.split(Regex("\\s+")).firstOrNull { it.length >= 5 } ?: ""
        return firstWord.isNotEmpty() && bn.contains(norm(firstWord))
    }

    /**
     * EN-mode speaker — tries English script directly (quote-verified), then falls back to
     * KO block index matching with EN-side quote verification. Label cleanup strips stray
     * markdown markers and blocks Korean syllables from leaking into the EN view.
     */
    fun extractSpeakerEn(
        scriptEn: String?,
        scriptKo: String?,
        characters: List<String>,
        quoteEn: String?,
        quoteKo: String?,
    ): String {
        val en = extractSpeakerInternal(scriptEn, characters, quoteEn) ?: return ""
        // 1) EN 직접 추출
        //    - EN 블록 1개 (단독 화자 monologue) → 검증 skip, 그 화자 사용 (시인/거울의 기사 같은 케이스)
        //    - EN 블록 여러 개 → quote 매칭 블록 검증 통과해야 신뢰
        if (en.speaker.isNotEmpty() && en.foundIdx in en.blocks.indices) {
            val isSingle = en.blocks.size == 1
            val blk = en.blocks[en.foundIdx]
            if (isSingle || blockMatchesQuote(blk.second, quoteEn)) {
                val cleaned = cleanSpeakerLabel(en.speaker)
                if (cleaned.isNotEmpty()) return cleaned
            }
        }
        // 2) KO 블록 인덱스 → EN 같은 인덱스 라벨
        val ko = extractSpeakerInternal(scriptKo, characters, quoteKo) ?: return ""
        val i = ko.foundIdx
        if (i < 0 || i >= en.blocks.size) return ""
        val enBlk = en.blocks[i]
        if (en.blocks.size > 1 && !blockMatchesQuote(enBlk.second, quoteEn)) return ""
        return cleanSpeakerLabel(enBlk.first)
    }

    private fun extractSpeakerInternal(scriptExcerpt: String?, characters: List<String>, quote: String?): SpeakerResult? {
        if (scriptExcerpt.isNullOrBlank()) return null
        val names = characters.map { it.trim() }.filter { it.isNotEmpty() }.sortedByDescending { it.length }

        fun speakerOf(rawIn: String): Pair<String, String>? {
            // (전처리) 줄 앞 마커/번호 무시 — "- ANTIGONE" / "• Antigone" / "1. ANTIGONE"
            val raw = rawIn.replace(Regex("""^\s*(?:[\-•·*]\s+|\d{1,3}[.)]\s+)"""), "")
            val t = raw.trim()
            if (t.isEmpty()) return null
            // 0) **볼드 라인** 폴백 — 한쪽 ** 만 있어도 매칭 (LLM 출력 깨진 볼드 라벨 포함)
            //    "**CORDELIA" / "**Poet**" / "**Poet:**" / "**Knight of the Mirror**;" /
            //    "**Hamlet** (지문)" / "POET**" 등
            run {
                val boldLine = Regex("""^\s*\*+([^*\n]+?)(?:\*+|$)\s*(?:[:.,;—–]|$|\().*$""")
                val bm = boldLine.find(t)
                if (bm != null) {
                    val inner = bm.groupValues[1].trim()
                    val nm = inner.trim('.', ',', ':', '：', ';', '—', '–', ' ', '\t')
                    if (nm.isNotEmpty() && nm.length <= 40) {
                        val restMatch = Regex("""^\s*\*+[^*\n]+?(?:\*+|$)\s*([:.,;—–])?\s*(.*)$""").find(t)
                        val rest = restMatch?.groupValues?.get(2)?.trim().orEmpty()
                        return nm to rest
                    }
                }
            }
            // 1) 등록된 characters 매칭 (case-insensitive prefix, 다양한 종결자)
            for (name in names) {
                val len = name.length
                if (t.length < len) continue
                if (!t.substring(0, len).equals(name, ignoreCase = true)) continue
                val next = if (t.length > len) t[len] else null
                // 단어 경계 — 다음 글자가 알파/한글/숫자면 다른 단어 (prefix 잘못 잡힘)
                if (next != null && (next.isLetterOrDigit() || (next in '가'..'힯'))) continue
                val tt = t.substring(len).trim()
                if (tt.isEmpty()) return name to ""
                when (tt[0]) {
                    ':', '：' -> return name to tt.substring(1).trim()
                    '(', '（' -> return name to tt
                    '.', ',' -> return name to tt.substring(1).trim()
                    '—', '–' -> return name to tt.substring(1).trim()
                    ';' -> return name to tt.substring(1).trim()
                }
            }
            // 1.5) 대괄호 화자 — "[ANTIGONE]" / "[Antigone]" / "[안티고네] 대사"
            run {
                val bk = Regex("""^[\[【]([^\]】\n]{1,30})[\]】]\s*[:：.,—–]?\s*(.*)$""").find(t)
                if (bk != null) {
                    val nm = bk.groupValues[1].trim()
                    if (nm.isNotEmpty()) return nm to bk.groupValues[2].trim()
                }
            }
            // 2) "이름: 대사" 콜론 폴백
            val m = SPEAKER_COLON.find(t)
            if (m != null) {
                val nm = m.groupValues[1].replace(TRAILING_PAREN, "").trim()
                if (nm.isNotEmpty()) return nm to m.groupValues[2]
            }
            // 2.5) em-dash 종결자 — "ANTIGONE—대사" / "Antigone—대사"
            run {
                val dm = Regex("""^([^\n—–\-:：()\[\]【】]{1,30})\s*[—–]\s*(.*)$""").find(t)
                if (dm != null) {
                    val nm = dm.groupValues[1].trim()
                    val rest = dm.groupValues[2].trim()
                    if (nm.length >= 2 && Regex("[A-Za-z가-힯]").containsMatchIn(nm)) {
                        return nm to rest
                    }
                }
            }
            // 3) ALL-CAPS 영문 화자 폴백 — 라인 전체가 라벨일 때만 (종결자 후 라인 끝)
            if (t.length in 2..30) {
                val allCaps = Regex("""^([A-Z][A-Z .'\-]{0,28})\s*[.,—–;]?\s*$""")
                val am = allCaps.find(t)
                if (am != null) {
                    val nm = am.groupValues[1].replace(Regex("[.,]"), "").trim()
                    if (nm.length in 2..30 && Regex("""^[A-Z][A-Z .'\-]*$""").matches(nm)) {
                        return nm to ""
                    }
                }
            }
            // 4) Title Case 영문 화자 폴백 — 라인 전체가 라벨일 때만
            if (t.length <= 30) {
                val titleCase = Regex("""^([A-Z][a-zA-Z]{1,}(?:\s[A-Z][a-zA-Z]+){0,3})\s*[.,—–;]?\s*$""")
                val tm = titleCase.find(t)
                if (tm != null) {
                    val candidate = tm.groupValues[1].trim()
                    val lower = candidate.lowercase()
                    val falsePos = setOf(
                        "i", "then", "but", "and", "or", "so", "now", "yet", "thus", "still",
                        "said", "replied", "cried", "asked", "whispered", "shouted",
                        "mr", "mrs", "ms", "dr", "sir", "madam", "lord", "lady",
                        "chapter", "scene", "act", "prologue", "epilogue",
                    )
                    if (lower !in falsePos && candidate.length >= 3) {
                        return candidate to ""
                    }
                }
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
        val blockPairs: List<Pair<String, String>> = blocks.map { it.speaker to it.text }
        if (blocks.isEmpty()) return SpeakerResult("", blockPairs, -1)

        var foundIdx = -1
        val qn = norm(quote)
        if (qn.isNotEmpty()) {
            foundIdx = blocks.indexOfFirst { norm(it.text).contains(qn) }
            if (foundIdx < 0) {
                val firstLine = (quote ?: "").split("\n").map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: ""
                val fln = norm(firstLine)
                if (fln.length >= 4) {
                    foundIdx = blocks.indexOfFirst { norm(it.text).contains(fln) }
                }
            }
        }
        var speaker = if (foundIdx >= 0) blocks[foundIdx].speaker else ""
        if (speaker.isEmpty()) {
            val distinct = blocks.map { it.speaker }.toSet()
            if (distinct.size == 1) {
                speaker = blocks[0].speaker
                foundIdx = 0
            }
        }
        return SpeakerResult(speaker, blockPairs, foundIdx)
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
