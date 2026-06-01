package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.card_highlights — a user-saved excerpt of a card's script. */
@Serializable
data class Highlight(
    @SerialName("highlight_id") val highlightId: Long,
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    @SerialName("selected_text") val selectedText: String,
    @SerialName("user_note") val userNote: String? = null,
    @SerialName("created_at") val createdAt: String,
    val cards: CardDto? = null,
)

@Serializable
data class HighlightInsert(
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    @SerialName("selected_text") val selectedText: String,
    @SerialName("user_note") val userNote: String? = null,
)
