package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.model.FeedCommentInsert
import com.lifestyle.dailyscript.data.model.FeedCommentLikeRow
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.FeedPostInsert
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.model.HighlightComment
import com.lifestyle.dailyscript.data.model.HighlightCommentInsert
import com.lifestyle.dailyscript.data.model.HighlightInsert
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class FeedRepository {

    private val client get() = SupabaseProvider.client

    // Nested card columns required to decode CardDto (keywords/temperature/intensity are non-optional).
    private val nestedCard =
        "cards ( card_id, work_id, quote, script_excerpt, keywords, temperature, intensity, " +
            "works ( work_id, title, subtitle, format, author, release_year, cover_url ) )"

    private val postSelect =
        Columns.raw("post_id, card_id, user_id, author_nickname, body, created_at, $nestedCard")
    private val highlightSelect =
        Columns.raw("highlight_id, card_id, user_id, author_nickname, selected_text, user_note, created_at, $nestedCard")
    private val feedCommentSelect =
        Columns.raw("comment_id, post_id, user_id, parent_comment_id, author_nickname, body, created_at")
    private val highlightCommentSelect =
        Columns.raw("comment_id, highlight_id, user_id, parent_comment_id, author_nickname, body, created_at")

    suspend fun loadPosts(): List<FeedPost> =
        client.postgrest["feed_posts"]
            .select(postSelect) {
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()

    suspend fun loadHighlights(): List<Highlight> =
        client.postgrest["card_highlights"]
            .select(highlightSelect) {
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()

    suspend fun loadMyPosts(userId: Long): List<FeedPost> =
        client.postgrest["feed_posts"]
            .select(postSelect) {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList()

    suspend fun loadMyHighlights(userId: Long): List<Highlight> =
        client.postgrest["card_highlights"]
            .select(highlightSelect) {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList()

    suspend fun deletePost(postId: Long, userId: Long) {
        client.postgrest["feed_posts"].delete {
            filter { eq("post_id", postId); eq("user_id", userId) }
        }
    }

    /** Edit a user's own one-liner body (for the "내 피드 · ONE LINERS" inline editor). */
    suspend fun updatePost(postId: Long, userId: Long, body: String) {
        client.postgrest["feed_posts"].update({ set("body", body) }) {
            filter { eq("post_id", postId); eq("user_id", userId) }
        }
    }

    suspend fun deleteHighlight(highlightId: Long, userId: Long) {
        client.postgrest["card_highlights"].delete {
            filter { eq("highlight_id", highlightId); eq("user_id", userId) }
        }
    }

    suspend fun addPost(cardId: Long, userId: Long, body: String, authorNickname: String?) {
        client.postgrest["feed_posts"].insert(
            FeedPostInsert(cardId = cardId, userId = userId, authorNickname = authorNickname, body = body)
        )
    }

    suspend fun addHighlight(
        cardId: Long,
        userId: Long,
        selectedText: String,
        note: String?,
        authorNickname: String?,
    ) {
        client.postgrest["card_highlights"].insert(
            HighlightInsert(
                cardId = cardId,
                userId = userId,
                authorNickname = authorNickname,
                selectedText = selectedText,
                userNote = note?.takeIf { it.isNotBlank() },
            )
        )
    }

    // ---- feed_post_comments — 피드 글 상세의 댓글 (대댓글 parent_comment_id + 하트) ----

    suspend fun loadComments(postId: Long): List<FeedComment> =
        client.postgrest["feed_post_comments"]
            .select(feedCommentSelect) {
                filter { eq("post_id", postId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

    suspend fun addComment(
        postId: Long,
        userId: Long,
        body: String,
        authorNickname: String?,
        parentCommentId: Long?,
    ): FeedComment =
        client.postgrest["feed_post_comments"]
            .insert(
                FeedCommentInsert(
                    postId = postId,
                    userId = userId,
                    parentCommentId = parentCommentId,
                    authorNickname = authorNickname,
                    body = body,
                )
            ) { select(feedCommentSelect) }
            .decodeSingle()

    suspend fun deleteComment(commentId: Long, userId: Long) {
        client.postgrest["feed_post_comments"].delete {
            filter {
                eq("comment_id", commentId)
                eq("user_id", userId)
            }
        }
    }

    /** feed_post_comment_likes: comment_id → 좋아요 누른 user_id 집합. */
    suspend fun loadCommentLikes(commentIds: List<Long>): Map<Long, Set<Long>> =
        loadLikes("feed_post_comment_likes", commentIds)

    /** @param liked target state. true → insert a like, false → remove it. */
    suspend fun setCommentLike(commentId: Long, userId: Long, liked: Boolean) =
        setLike("feed_post_comment_likes", commentId, userId, liked)

    // ---- card_highlight_comments — 하이라이트 카드 상세의 댓글 (feed_post_comments 미러) ----

    suspend fun loadHighlightComments(highlightId: Long): List<HighlightComment> =
        client.postgrest["card_highlight_comments"]
            .select(highlightCommentSelect) {
                filter { eq("highlight_id", highlightId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

    suspend fun addHighlightComment(
        highlightId: Long,
        userId: Long,
        body: String,
        authorNickname: String?,
        parentCommentId: Long?,
    ): HighlightComment =
        client.postgrest["card_highlight_comments"]
            .insert(
                HighlightCommentInsert(
                    highlightId = highlightId,
                    userId = userId,
                    parentCommentId = parentCommentId,
                    authorNickname = authorNickname,
                    body = body,
                )
            ) { select(highlightCommentSelect) }
            .decodeSingle()

    suspend fun deleteHighlightComment(commentId: Long, userId: Long) {
        client.postgrest["card_highlight_comments"].delete {
            filter {
                eq("comment_id", commentId)
                eq("user_id", userId)
            }
        }
    }

    /** card_highlight_comment_likes: comment_id → 좋아요 누른 user_id 집합. */
    suspend fun loadHighlightCommentLikes(commentIds: List<Long>): Map<Long, Set<Long>> =
        loadLikes("card_highlight_comment_likes", commentIds)

    suspend fun setHighlightCommentLike(commentId: Long, userId: Long, liked: Boolean) =
        setLike("card_highlight_comment_likes", commentId, userId, liked)

    // ---- 좋아요 공용 헬퍼 (두 like 테이블의 컬럼이 comment_id/user_id로 동일) ----

    private suspend fun loadLikes(table: String, commentIds: List<Long>): Map<Long, Set<Long>> {
        if (commentIds.isEmpty()) return emptyMap()
        val rows = client.postgrest[table]
            .select(Columns.raw("comment_id, user_id")) {
                filter { isIn("comment_id", commentIds) }
            }
            .decodeList<FeedCommentLikeRow>()
        return rows.groupBy({ it.commentId }, { it.userId }).mapValues { (_, ids) -> ids.toSet() }
    }

    private suspend fun setLike(table: String, commentId: Long, userId: Long, liked: Boolean) {
        if (liked) {
            // 이미 좋아요한 행에 다시 insert 하면 복합 PK 충돌이 난다. 충돌은 '이미 목표 상태'
            // 이므로 흡수하고, 그 외 실패만 전파해 호출측이 롤백하게 한다 (BookmarkRepository.toggle 패턴).
            val result = runCatching {
                client.postgrest[table].insert(FeedCommentLikeRow(commentId, userId))
            }
            if (result.isFailure && !likeExists(table, commentId, userId)) {
                throw result.exceptionOrNull() ?: IllegalStateException("Like insert failed.")
            }
        } else {
            client.postgrest[table].delete {
                filter {
                    eq("comment_id", commentId)
                    eq("user_id", userId)
                }
            }
        }
    }

    private suspend fun likeExists(table: String, commentId: Long, userId: Long): Boolean =
        client.postgrest[table]
            .select(Columns.raw("comment_id, user_id")) {
                filter {
                    eq("comment_id", commentId)
                    eq("user_id", userId)
                }
                limit(1)
            }
            .decodeSingleOrNull<FeedCommentLikeRow>() != null
}
