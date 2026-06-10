package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.card_highlight_comments — a comment on a feed highlight. */
@Serializable
data class HighlightComment(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("highlight_id") val highlightId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class HighlightCommentInsert(
    @SerialName("highlight_id") val highlightId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)
