package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 충전(구매) 실타래 잔액 RPC 래퍼. 잔액은 서버 users.yarn_balance 에 있고,
 * 차감/지급은 06_yarn.sql 의 SECURITY DEFINER RPC 로만 한다(원자적·RLS 무관).
 * 무료 5개/일은 클라이언트 로컬(AppPreferences)에서 별도 관리.
 */
class YarnRepository {

    private val client get() = SupabaseProvider.client

    /** 충전 잔액 1개 차감. 차감 후 잔액 반환(부족/행 없음이면 -1, 미차감). */
    suspend fun consumeYarn(): Int =
        client.postgrest.rpc("consume_yarn").decodeAs<Int>()

    /** QA 전용 — 충전 잔액 지급. 지급 후 잔액 반환. */
    suspend fun grantYarn(n: Int): Int =
        client.postgrest.rpc(
            function = "grant_yarn",
            parameters = buildJsonObject { put("p_n", n) },
        ).decodeAs<Int>()
}
