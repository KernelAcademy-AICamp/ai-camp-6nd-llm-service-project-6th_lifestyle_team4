package com.lifestyle.dailyscript.ui.share

import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.quoteFor

/**
 * 공유 카드 이미지에 그릴 텍스트 묶음 (PWA payloadForToday/openShareModal 의 payload).
 * 화면에 보이는 명대사·화자·작품·작가와 동일하게 채워, 생성 이미지가 카드와 일치하도록 한다.
 */
data class ShareCardPayload(
    val cardId: Long,
    val quote: String,
    val speaker: String,
    val work: String,
    val author: String,
)

/**
 * 카드 + (이미 화면에서 추출한) 화자로 공유 페이로드 생성. EN 토글을 존중해
 * 명대사/작품/작가를 영문본으로 바꾼다(영문본 없으면 한글로 폴백).
 */
fun CardDto.toSharePayload(english: Boolean, speaker: String): ShareCardPayload {
    val w = works
    val title = (if (english) w?.titleOriginal?.ifBlank { null } else null) ?: w?.title
    val author = (if (english) w?.authorOriginal?.ifBlank { null } else null) ?: w?.author
    return ShareCardPayload(
        cardId = cardId,
        quote = Markdown.cleanQuote(quoteFor(english)),
        speaker = speaker,
        work = title?.trim().orEmpty(),
        author = author?.trim().orEmpty(),
    )
}
