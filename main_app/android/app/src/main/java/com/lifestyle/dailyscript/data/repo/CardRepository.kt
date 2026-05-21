package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.CardDto
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns

class CardRepository {

    private val client = SupabaseProvider.client

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
        works ( work_id, title, format, author, release_year )
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

    suspend fun fetchCardById(cardId: Long): CardDto? {
        return client.postgrest["cards"]
            .select(cardSelect) {
                filter { eq("card_id", cardId) }
                limit(1)
            }
            .decodeSingleOrNull<CardDto>()
    }
}
