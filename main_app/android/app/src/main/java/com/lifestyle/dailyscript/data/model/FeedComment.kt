package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 피드 글/하이라이트 댓글의 공통 모양 — 같은 댓글 UI(대댓글 트리 + 하트)가
 * FeedComment / HighlightComment 어느 쪽이든 동일하게 렌더할 수 있게 한다.
 * parentCommentId == null → top-level 댓글.
 */
interface FeedCommentLike {
    val commentId: Long
    val userId: Long
    val parentCommentId: Long?
    val authorNickname: String?
    val body: String
    val createdAt: String
}

/** A row from public.feed_post_comments — a comment on a feed post ("오늘의 한줄"). */
@Serializable
data class FeedComment(
    @SerialName("comment_id") override val commentId: Long,
    @SerialName("post_id") val postId: Long,
    @SerialName("user_id") override val userId: Long,
    @SerialName("parent_comment_id") override val parentCommentId: Long? = null,
    @SerialName("author_nickname") override val authorNickname: String? = null,
    override val body: String,
    @SerialName("created_at") override val createdAt: String,
) : FeedCommentLike

@Serializable
data class FeedCommentInsert(
    @SerialName("post_id") val postId: Long,
    @SerialName("user_id") val userId: Long,
    @SerialName("parent_comment_id") val parentCommentId: Long? = null,
    @SerialName("author_nickname") val authorNickname: String? = null,
    val body: String,
)

/**
 * A row from public.feed_post_comment_likes / public.card_highlight_comment_likes
 * (composite PK comment_id + user_id). 두 테이블의 컬럼이 동일해 공용으로 쓴다.
 */
@Serializable
data class FeedCommentLikeRow(
    @SerialName("comment_id") val commentId: Long,
    @SerialName("user_id") val userId: Long,
)
