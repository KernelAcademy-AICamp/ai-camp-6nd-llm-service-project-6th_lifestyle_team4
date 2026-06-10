package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.CardIdRow
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.data.model.CommentInsert
import com.lifestyle.dailyscript.data.model.CommentLikeRow
import com.lifestyle.dailyscript.data.model.MyComment
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class CommentRepository {

    private val client get() = SupabaseProvider.client

    private val commentSelect = Columns.raw(
        "comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at"
    )

    private val myCommentSelect = Columns.raw(
        "comment_id, card_id, parent_comment_id, body, created_at, " +
            "cards ( card_id, work_id, quote, script_excerpt, keywords, temperature, intensity, " +
            "works ( work_id, title, subtitle, format, author, release_year ) )"
    )

    /** A user's own comments, newest first (for the "내 댓글" screen). */
    suspend fun loadByUser(userId: Long): List<MyComment> =
        client.postgrest["card_comments"]
            .select(myCommentSelect) {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList()

    suspend fun loadComments(cardId: Long): List<Comment> =
        client.postgrest["card_comments"]
            .select(commentSelect) {
                filter { eq("card_id", cardId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

    /**
     * 카드별 댓글 수(답글 포함) — card_comments 의 card_id 만 전량 읽어 직접 집계.
     * denormalized cards.comment_count 컬럼 대신 실제 행을 세어 정확도 우선(PWA loadCommentCounts 동일).
     */
    suspend fun allCommentCounts(): Map<Long, Int> =
        client.postgrest["card_comments"]
            .select(Columns.raw("card_id")) { limit(20000) }
            .decodeList<CardIdRow>()
            .groupingBy { it.cardId }
            .eachCount()

    /** Returns the comment_id → set of user_ids who liked it. */
    suspend fun loadLikes(commentIds: List<Long>): Map<Long, Set<Long>> {
        if (commentIds.isEmpty()) return emptyMap()
        val rows = client.postgrest["comment_likes"]
            .select(Columns.raw("comment_id, user_id")) {
                filter { isIn("comment_id", commentIds) }
            }
            .decodeList<CommentLikeRow>()
        return rows.groupBy({ it.commentId }, { it.userId })
            .mapValues { (_, ids) -> ids.toSet() }
    }

    suspend fun addComment(
        cardId: Long,
        userId: Long,
        body: String,
        authorNickname: String?,
        parentCommentId: Long?,
    ): Comment =
        client.postgrest["card_comments"]
            .insert(
                CommentInsert(
                    cardId = cardId,
                    userId = userId,
                    parentCommentId = parentCommentId,
                    authorNickname = authorNickname,
                    body = body,
                )
            ) { select(commentSelect) }
            .decodeSingle()

    suspend fun deleteComment(commentId: Long, userId: Long) {
        client.postgrest["card_comments"].delete {
            filter {
                eq("comment_id", commentId)
                eq("user_id", userId)
            }
        }
    }

    /** Edit a user's own comment body (for the "내 댓글" inline editor). */
    suspend fun updateComment(commentId: Long, userId: Long, body: String) {
        client.postgrest["card_comments"].update({ set("body", body) }) {
            filter {
                eq("comment_id", commentId)
                eq("user_id", userId)
            }
        }
    }

    /** @param liked target state. true → insert a like, false → remove it. */
    suspend fun setLike(commentId: Long, userId: Long, liked: Boolean) {
        if (liked) {
            client.postgrest["comment_likes"].insert(CommentLikeRow(commentId, userId))
        } else {
            client.postgrest["comment_likes"].delete {
                filter {
                    eq("comment_id", commentId)
                    eq("user_id", userId)
                }
            }
        }
    }
}
