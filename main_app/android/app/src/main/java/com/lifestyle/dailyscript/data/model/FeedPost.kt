package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.feed_posts ("오늘의 한줄"). author_nickname is a snapshot. */
@Serializable
data class FeedPost(
    @SerialName("post_id") val postId: Long,
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
    @SerialName("created_at") val createdAt: String,
    val cards: CardDto? = null,
)

@Serializable
data class FeedPostInsert(
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)
