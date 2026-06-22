package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 공유 short URL 발급 RPC 래퍼 (041_share_links.sql 의 create_share_link).
 * referrer_id 를 실어 보내므로 친구가 이 링크로 가입하면 양쪽 +600 실타래(redeem_referral) — 친구 초대 '보내기' 측.
 */
class ShareRepository {

    private val client get() = SupabaseProvider.client

    /**
     * short_id(6자 base62) 발급. referrer/card/bg/quote 를 share_links 행으로 묶는다.
     * 실패하면 null 반환 → 호출측이 long URL 로 폴백한다.
     */
    suspend fun createShareLink(
        referrerId: Long?,
        cardId: Long?,
        bgId: String?,
        quoteB64: String?,
    ): String? = runCatching {
        client.postgrest.rpc(
            function = "create_share_link",
            parameters = buildJsonObject {
                put("p_referrer_id", referrerId)
                put("p_card_id", cardId)
                put("p_bg_id", bgId)
                put("p_quote_b64", quoteB64)
            },
        ).decodeAs<String>()
    }.getOrNull()
}
