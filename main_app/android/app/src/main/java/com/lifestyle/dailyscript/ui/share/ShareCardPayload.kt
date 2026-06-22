package com.lifestyle.dailyscript.ui.share

import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.genreLabel
import com.lifestyle.dailyscript.ui.util.quoteFor

/**
 * 공유 카드 이미지에 그릴 텍스트 묶음.
 * 명대사(quote)·화자(speaker)는 EN 토글을 따르고, 하단 작품 메타는 항상 한/영 2줄([metaKo]/[metaEn]).
 * 디자인 시안(편지지 카드지) 기준: "{장르} <{제목}>, {작가}" 형태.
 */
data class ShareCardPayload(
    val cardId: Long,
    val quote: String,
    val speaker: String,
    /** KO 제목 — 카드지 매칭(normalizeWorkTitle)·공유 텍스트용. */
    val work: String,
    /** 하단 메타 1줄(한글): "연극 <로미오와 줄리엣>, 윌리엄 셰익스피어". */
    val metaKo: String,
    /** 하단 메타 2줄(영문): "play <Romeo and Juliet>, William Shakespeare". 영문 원본 없으면 "". */
    val metaEn: String,
)

/**
 * 카드 + (화면에서 추출한) 화자로 공유 페이로드 생성. quote/speaker 는 [english] 토글을 존중하고,
 * 메타는 한/영 모두 만들어 카드에 두 줄로 표시한다(영문 원본 없으면 EN 줄 생략).
 * [quoteOverride] 가 있으면(하이라이트 공유) 그 선택 텍스트를 명대사 자리에 쓴다.
 */
fun CardDto.toSharePayload(
    english: Boolean,
    speaker: String,
    quoteOverride: String? = null,
): ShareCardPayload {
    val w = works
    val titleKo = w?.title?.trim().orEmpty()
    val authorKo = w?.author?.trim().orEmpty()
    val titleEn = w?.titleOriginal?.trim().orEmpty()
    val authorEn = w?.authorOriginal?.trim().orEmpty()
    val fmt = w?.format
    val metaKo = shareMetaLine(genreLabel(fmt), titleKo, authorKo)
    // EN 장르는 시안처럼 소문자(play). 영문 원본(제목/작가)이 있을 때만 노출.
    val metaEn = if (titleEn.isNotBlank() || authorEn.isNotBlank()) {
        shareMetaLine(genreLabel(fmt, english = true).lowercase(), titleEn, authorEn)
    } else {
        ""
    }
    return ShareCardPayload(
        cardId = cardId,
        quote = Markdown.cleanQuote(quoteOverride ?: quoteFor(english)),
        speaker = if (quoteOverride != null) "" else speaker,
        work = titleKo,
        metaKo = metaKo,
        metaEn = metaEn,
    )
}

/** "{장르} <{제목}>, {작가}" — 빈 조각은 생략. */
private fun shareMetaLine(genre: String, title: String, author: String): String {
    val head = listOf(genre, if (title.isNotBlank()) "<$title>" else "")
        .filter { it.isNotBlank() }
        .joinToString(" ")
    return listOf(head, author).filter { it.isNotBlank() }.joinToString(", ")
}
