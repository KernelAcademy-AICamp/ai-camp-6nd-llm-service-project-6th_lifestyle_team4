package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.CardDto
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

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
        works ( work_id, title, format, author, release_year, characters )
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
}
