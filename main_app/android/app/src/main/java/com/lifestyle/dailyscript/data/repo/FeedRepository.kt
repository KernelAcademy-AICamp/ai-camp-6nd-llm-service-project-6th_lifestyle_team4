package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
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
}
