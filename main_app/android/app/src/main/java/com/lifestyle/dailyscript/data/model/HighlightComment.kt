package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.card_highlight_comments — a comment on a feed highlight. */
@Serializable
data class HighlightComment(
    @SerialName("comment_id") override val commentId: Long,
    @SerialName("highlight_id") val highlightId: Long,
    @SerialName("user_id") override val userId: Long,
    @SerialName("parent_comment_id") override val parentCommentId: Long? = null,
    @SerialName("author_nickname") override val authorNickname: String? = null,
    override val body: String,
    @SerialName("created_at") override val createdAt: String,
) : FeedCommentLike

@Serializable
data class HighlightCommentInsert(
    @SerialName("highlight_id") val highlightId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("parent_comment_id") val parentCommentId: Long? = null,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)
