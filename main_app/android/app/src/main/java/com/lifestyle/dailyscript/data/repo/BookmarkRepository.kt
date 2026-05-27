package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.BookmarkIdRow
import com.lifestyle.dailyscript.data.model.BookmarkInsert
import com.lifestyle.dailyscript.data.model.BookmarkRow
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class BookmarkRepository {

    private val client get() = SupabaseProvider.client

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
            works ( work_id, title, format, author, release_year, characters )
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
        return findBookmark(userId, cardId) != null
    }

    private suspend fun findBookmark(userId: Long, cardId: Long): BookmarkIdRow? {
        return client.postgrest["user_bookmarks"]
            .select(Columns.raw("bookmark_id")) {
                filter {
                    eq("user_id", userId)
                    eq("card_id", cardId)
                }
                limit(1)
            }
            .decodeSingleOrNull<BookmarkIdRow>()
    }

    /** Returns the new bookmarked state. */
    suspend fun toggle(userId: Long, cardId: Long): Boolean = toggleMutex.withLock {
        val existing = findBookmark(userId, cardId)

        if (existing != null) {
            val deleteResult = runCatching {
                client.postgrest["user_bookmarks"].delete {
                    filter {
                        eq("user_id", userId)
                        eq("card_id", cardId)
                    }
                }
            }
            if (deleteResult.isFailure && findBookmark(userId, cardId) != null) {
                throw deleteResult.exceptionOrNull() ?: IllegalStateException("Bookmark delete failed.")
            }
            false
        } else {
            val insertResult = runCatching {
                client.postgrest["user_bookmarks"].insert(
                    BookmarkInsert(userId = userId, cardId = cardId)
                )
            }
            if (insertResult.isFailure) {
                if (findBookmark(userId, cardId) != null) {
                    true
                } else {
                    throw insertResult.exceptionOrNull() ?: IllegalStateException("Bookmark insert failed.")
                }
            } else {
                true
            }
        }
    }

    private companion object {
        val toggleMutex = Mutex()
    }
}
