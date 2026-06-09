package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.feed_post_comments — a comment on a feed post ("오늘의 한줄"). */
@Serializable
data class FeedComment(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("post_id") val postId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class FeedCommentInsert(
    @SerialName("post_id") val postId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)
