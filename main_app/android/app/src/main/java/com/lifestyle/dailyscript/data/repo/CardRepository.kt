package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.CardDto
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class CardRepository {

    private val client get() = SupabaseProvider.client

    private val cardSelect = Columns.raw(
        """
        card_id,
        work_id,
        quote,
        script_excerpt,
        excerpt_description,
        significance,
        keywords,
        temperature,
        intensity,
        view_count,
        quote_original,
        script_excerpt_original,
        excerpt_description_original,
        significance_original,
        keywords_original,
        works ( work_id, title, subtitle, format, author, release_year, characters, title_original, subtitle_original, author_original )
        """.trimIndent()
    )

    /** MVP: pull a small page of cards and pick one at random client-side. */
    suspend fun fetchRandomCard(): CardDto? {
        val cards = client.postgrest["cards"]
            .select(cardSelect) {
                limit(100)
            }
            .decodeList<CardDto>()
        return cards.randomOrNull()
    }

    /** Pull a large page used for seed/taste-based recommendation (mirrors the PWA's 500). */
    suspend fun fetchAllCards(): List<CardDto> =
        client.postgrest["cards"]
            .select(cardSelect) {
                order("card_id", Order.DESCENDING)
                limit(500)
            }
            .decodeList()

    suspend fun fetchCardById(cardId: Long): CardDto? {
        return client.postgrest["cards"]
            .select(cardSelect) {
                filter { eq("card_id", cardId) }
                limit(1)
            }
            .decodeSingleOrNull<CardDto>()
    }

    /**
     * Fire-and-forget view increment (mirrors the PWA's increment_card_view RPC,
     * m-app.js:3235). Backend function is shared across web/native.
     */
    suspend fun incrementView(cardId: Long) {
        client.postgrest.rpc(
            function = "increment_card_view",
            parameters = buildJsonObject { put("p_card_id", cardId) },
        )
    }
}
