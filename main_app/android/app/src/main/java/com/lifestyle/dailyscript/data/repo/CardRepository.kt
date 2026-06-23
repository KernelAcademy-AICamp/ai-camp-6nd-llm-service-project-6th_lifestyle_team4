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
        created_at,
        keywords,
        temperature,
        intensity,
        view_count,
        comment_count,
        share_count,
        quote_original,
        script_excerpt_original,
        excerpt_description_original,
        significance_original,
        keywords_original,
        works ( work_id, title, subtitle, format, author, release_year, intro, cover_url, characters, title_original, subtitle_original, author_original )
        """.trimIndent()
    )

    /**
     * 전체 카드를 1000개씩 페이지네이션으로 끝까지 가져온다 (PWA m-app.js:1364-1377 미러).
     * 예전 `.limit(500)` 캡 때문에 카드가 500장을 넘으면 카탈로그·작품 상세 등에서
     * 일부 카드가 누락되던 문제 수정 — 예: 인형의 집 22장 중 4장만 노출되던 케이스.
     * PostgREST 기본 최대 행수(1000)도 range 페이지네이션으로 우회.
     */
    suspend fun fetchAllCards(): List<CardDto> {
        val pageSize = 1000L
        val all = mutableListOf<CardDto>()
        var offset = 0L
        while (true) {
            val batch = client.postgrest["cards"]
                .select(cardSelect) {
                    order("card_id", Order.DESCENDING)
                    range(offset, offset + pageSize - 1)
                }
                .decodeList<CardDto>()
            all.addAll(batch)
            if (batch.size < pageSize) break
            offset += pageSize
        }
        return all
    }

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

    /**
     * 카드 공유(다운로드/SNS) 횟수 +1, 새 값 반환 (PWA bumpShareCount → increment_share_count RPC,
     * migration 037). 백엔드 함수는 web/native 공유.
     */
    suspend fun incrementShareCount(cardId: Long): Int =
        client.postgrest.rpc(
            function = "increment_share_count",
            parameters = buildJsonObject { put("p_card_id", cardId) },
        ).decodeAs<Int>()
}
