package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.BookmarkInsert
import com.lifestyle.dailyscript.data.model.BookmarkRow
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class BookmarkRepository {

    private val client = SupabaseProvider.client

    private val rowSelect = Columns.raw(
        """
        bookmark_id,
        user_id,
        card_id,
        created_at,
        cards (
            card_id,
            work_id,
            quote,
            script_excerpt,
            excerpt_description,
            significance,
            keywords,
            temperature,
            intensity,
            works ( work_id, title, format, author, release_year )
        )
        """.trimIndent()
    )

    suspend fun list(userId: Long): List<BookmarkRow> =
        client.postgrest["user_bookmarks"]
            .select(rowSelect) {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList()

    suspend fun isBookmarked(userId: Long, cardId: Long): Boolean {
        val row = client.postgrest["user_bookmarks"]
            .select(Columns.raw("bookmark_id")) {
                filter {
                    eq("user_id", userId)
                    eq("card_id", cardId)
                }
                limit(1)
            }
            .decodeSingleOrNull<BookmarkRow>()
        return row != null
    }

    /** Returns the new bookmarked state. */
    suspend fun toggle(userId: Long, cardId: Long): Boolean {
        val existing = client.postgrest["user_bookmarks"]
            .select(Columns.raw("bookmark_id, user_id, card_id, created_at")) {
                filter {
                    eq("user_id", userId)
                    eq("card_id", cardId)
                }
                limit(1)
            }
            .decodeSingleOrNull<BookmarkRow>()

        return if (existing != null) {
            client.postgrest["user_bookmarks"].delete {
                filter { eq("bookmark_id", existing.bookmarkId) }
            }
            false
        } else {
            client.postgrest["user_bookmarks"].insert(
                BookmarkInsert(userId = userId, cardId = cardId)
            )
            true
        }
    }
}
