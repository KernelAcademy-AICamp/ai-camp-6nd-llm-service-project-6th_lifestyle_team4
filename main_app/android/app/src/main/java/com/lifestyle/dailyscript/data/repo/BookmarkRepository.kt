package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.BookmarkIdRow
import com.lifestyle.dailyscript.data.model.BookmarkInsert
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardBookmarkCount
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
            created_at,
            keywords,
            temperature,
            intensity,
            view_count,
            comment_count,
            quote_original,
            script_excerpt_original,
            excerpt_description_original,
            significance_original,
            keywords_original,
            works ( work_id, title, subtitle, format, author, release_year, intro, cover_url, characters, title_original, subtitle_original, author_original )
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

    /**
     * card_id → how many users bookmarked it (from the card_bookmark_counts view).
     * Mirrors the PWA's loadBookmarkCounts (m-app.js:917). Returns an empty map on failure.
     */
    suspend fun counts(cardIds: List<Long>): Map<Long, Int> {
        if (cardIds.isEmpty()) return emptyMap()
        val rows = client.postgrest["card_bookmark_counts"]
            .select(Columns.raw("card_id, bookmark_count")) {
                filter { isIn("card_id", cardIds) }
            }
            .decodeList<CardBookmarkCount>()
        return rows.associate { it.cardId to it.bookmarkCount }
    }

    /**
     * 뷰 전체 (card_id → bookmark_count) — 점수 추천의 인기도 항에 사용.
     * PWA loadBookmarkCounts 와 동일하게 전량 로드 (카드 수백 장 규모).
     */
    suspend fun allCounts(): Map<Long, Int> =
        client.postgrest["card_bookmark_counts"]
            .select(Columns.raw("card_id, bookmark_count")) { limit(2000) }
            .decodeList<CardBookmarkCount>()
            .associate { it.cardId to it.bookmarkCount }

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
