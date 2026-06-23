package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.ShareBackgroundDto
import com.lifestyle.dailyscript.ui.share.ShareBackground
import com.lifestyle.dailyscript.ui.share.toShareBackground
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 공유 short URL 발급 RPC 래퍼 (041_share_links.sql 의 create_share_link) +
 * 공유 카드지(premium/royal) 목록 조회 (042_share_backgrounds).
 * referrer_id 를 실어 보내므로 친구가 이 링크로 가입하면 양쪽 +600 실타래(redeem_referral) — 친구 초대 '보내기' 측.
 */
class ShareRepository {

    private val client get() = SupabaseProvider.client

    /**
     * 활성 premium/royal 카드지 목록 (sort_order 오름차순). RLS 가 비활성 행을 가린다.
     * 실패(네트워크/디코드)하면 빈 리스트 — 호출측은 무료 8종만으로 동작한다.
     */
    suspend fun listBackgrounds(): List<ShareBackground> = runCatching {
        client.postgrest["share_backgrounds"]
            .select(Columns.raw("slug,name,tier,price,image_url,ink,work_title,sort_order")) {
                filter { eq("is_active", true) }
                order("sort_order", Order.ASCENDING)
            }
            .decodeList<ShareBackgroundDto>()
            .map { it.toShareBackground() }
    }.getOrDefault(emptyList())

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
