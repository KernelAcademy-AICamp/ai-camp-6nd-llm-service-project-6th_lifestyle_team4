package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 충전(구매) 실타래 잔액 RPC 래퍼. 잔액은 서버 users.yarn_balance 에 있고,
 * 차감/지급은 06_yarn.sql 의 SECURITY DEFINER RPC 로만 한다(원자적·RLS 무관).
 * 출석 기록(11_attendance.sql)과 카드지 소유권(12_share_theme_unlocks.sql)도
 * 서버 권위 — 로컬(DataStore) 대신 여기서 읽고 쓴다.
 */
class YarnRepository {

    private val client get() = SupabaseProvider.client

    /** 충전 잔액 1개 차감. 차감 후 잔액 반환(부족/행 없음이면 -1, 미차감). */
    suspend fun consumeYarn(): Int =
        client.postgrest.rpc("consume_yarn").decodeAs<Int>()

    /** QA/데모용 — 충전 잔액 지급. 지급 후 잔액 반환. */
    suspend fun grantYarn(n: Int): Int =
        client.postgrest.rpc(
            function = "grant_yarn",
            parameters = buildJsonObject { put("p_n", n) },
        ).decodeAs<Int>()

    /** 구매(테마 등) — 충전 잔액에서 amount 만큼 원자적 차감. 차감 후 잔액 반환(부족/행 없음이면 -1, 미차감). */
    suspend fun spendYarn(amount: Int): Int =
        client.postgrest.rpc(
            function = "spend_yarn",
            parameters = buildJsonObject { put("p_amount", amount) },
        ).decodeAs<Int>()

    // ─────── 출석체크 (11_attendance.sql) ───────

    /**
     * 오늘(KST) 첫 출석이면 서버에 기록 + 보상([reward]) 원자적 지급.
     * 반환 [AttendanceCheckIn] — rewarded=true 면 오늘 첫 출석(보상 지급됨), false 면 이미 출석.
     * 서버가 (user_id, attended_date) UNIQUE 로 dedup → 재설치/로컬삭제로 중복 수령 불가.
     */
    suspend fun checkInAttendance(reward: Int): AttendanceCheckIn =
        client.postgrest.rpc(
            function = "check_in_attendance",
            parameters = buildJsonObject { put("p_reward", reward) },
        ).decodeAs<AttendanceCheckIn>()

    /** 출석한 날짜 목록(YYYY-MM-DD). RLS 가 본인 행만 노출. 달력 렌더용. */
    suspend fun attendanceHistory(): List<String> =
        client.postgrest["attendance"]
            .select(Columns.raw("attended_date"))
            .decodeList<AttendanceDateRow>()
            .map { it.attendedDate }

    // ─────── 공유 카드지 소유권 (12_share_theme_unlocks.sql) ───────

    /**
     * 카드지 구매 — 서버에서 실타래 [price] 차감 + 소유 등록을 원자적으로.
     * 반환 int: >=0 차감 후 잔액(이미 보유면 현재 잔액) / -2 잔액 부족 / -1·-3 오류.
     */
    suspend fun purchaseShareTheme(themeId: String, price: Int): Int =
        client.postgrest.rpc(
            function = "purchase_share_theme",
            parameters = buildJsonObject {
                put("p_theme_id", themeId)
                put("p_price", price)
            },
        ).decodeAs<Int>()

    /** 보유한 카드지 id 집합. RLS 가 본인 행만 노출. */
    suspend fun ownedShareThemes(): Set<String> =
        client.postgrest["share_theme_unlocks"]
            .select(Columns.raw("theme_id"))
            .decodeList<ThemeIdRow>()
            .map { it.themeId }
            .toSet()
}

/** check_in_attendance RPC 반환 json. */
@Serializable
data class AttendanceCheckIn(
    val rewarded: Boolean,
    val balance: Int,
    val today: String,
)

@Serializable
private data class AttendanceDateRow(
    @SerialName("attended_date") val attendedDate: String,
)

@Serializable
private data class ThemeIdRow(
    @SerialName("theme_id") val themeId: String,
)
