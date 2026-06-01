package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A row from public.card_comments. parentCommentId == null → top-level comment. */
@Serializable
data class Comment(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("parent_comment_id") val parentCommentId: Long? = null,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class CommentInsert(
    @SerialName("card_id") val cardId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("parent_comment_id") val parentCommentId: Long? = null,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)

/** A row from public.comment_likes (composite PK comment_id + user_id). */
@Serializable
data class CommentLikeRow(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("user_id") val userId: Long,
)

/** A user's own comment joined with its card (for the "내 댓글" screen). */
@Serializable
data class MyComment(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("card_id") val cardId: Long,
    val body: String,
    @SerialName("created_at") val createdAt: String,
    val cards: CardDto? = null,
)
