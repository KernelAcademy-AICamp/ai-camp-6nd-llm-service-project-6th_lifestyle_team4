package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from the public.card_bookmark_counts view (card_id → how many users bookmarked it). */
@Serializable
data class CardBookmarkCount(
    @SerialName("card_id") val cardId: Long,
    @SerialName("bookmark_count") val bookmarkCount: Int,
)
