package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BookmarkRow(
    @SerialName("bookmark_id") val bookmarkId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("card_id") val cardId: Long,
    @SerialName("created_at") val createdAt: String,
    val cards: CardDto? = null,
)

@Serializable
data class BookmarkInsert(
    @SerialName("user_id") val userId: Long,
    @SerialName("card_id") val cardId: Long,
)
