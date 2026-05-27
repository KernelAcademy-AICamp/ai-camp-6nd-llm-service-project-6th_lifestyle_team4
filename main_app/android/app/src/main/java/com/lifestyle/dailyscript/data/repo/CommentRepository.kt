package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.data.model.CommentInsert
import com.lifestyle.dailyscript.data.model.CommentLikeRow
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class CommentRepository {

    private val client get() = SupabaseProvider.client

    private val commentSelect = Columns.raw(
        "comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at"
    )

    suspend fun loadComments(cardId: Long): List<Comment> =
        client.postgrest["card_comments"]
            .select(commentSelect) {
                filter { eq("card_id", cardId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

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
