package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.model.FeedCommentInsert
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.FeedPostInsert
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.model.HighlightInsert
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class FeedRepository {

    private val client get() = SupabaseProvider.client

    // Nested card columns required to decode CardDto (keywords/temperature/intensity are non-optional).
    private val nestedCard =
        "cards ( card_id, work_id, quote, script_excerpt, keywords, temperature, intensity, " +
            "works ( work_id, title, subtitle, format, author, release_year ) )"

    private val postSelect =
        Columns.raw("post_id, card_id, user_id, author_nickname, body, created_at, $nestedCard")
    private val highlightSelect =
        Columns.raw("highlight_id, card_id, user_id, author_nickname, selected_text, user_note, created_at, $nestedCard")
    private val feedCommentSelect =
        Columns.raw("comment_id, post_id, user_id, author_nickname, body, created_at")

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

    // ---- feed_post_comments — 피드 글 상세의 댓글 (좋아요/답글 없는 평면 목록) ----

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
    ): FeedComment =
        client.postgrest["feed_post_comments"]
            .insert(
                FeedCommentInsert(
                    postId = postId,
                    userId = userId,
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
}
