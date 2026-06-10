package com.lifestyle.dailyscript.ui.yarn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.repo.YarnRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * 실타래 잔액 + 차감을 한곳에서 관리한다. 상단바 칩과 [YarnGate] 가 같은
 * [available] StateFlow 를 구독하므로 차감 즉시 양쪽이 갱신된다.
 *
 * - 무료 5개/일: 로컬(AppPreferences) 카운터. 매일 리셋.
 * - 충전(구매) 잔액: 서버(users.yarn_balance). [YarnRepository] RPC 로 차감.
 * - 차감 우선순위: 무료분 먼저 → 그다음 충전 잔액.
 * - 카드당 1회(unlock): 한 번 연 카드는 무료 재열람.
 *
 * 세션이 바뀌면(로그인/로그아웃/탈퇴) 호스트가 [setPurchased]/[refreshDaily] 로
 * 다시 시드한다 — VM 은 액티비티 스코프라 살아남기 때문.
 */
class YarnViewModel : ViewModel() {

    private val repo = YarnRepository()

    private val purchased = MutableStateFlow(0)
    private val dailyUsed = MutableStateFlow(0)

    /** 오늘 쓸 수 있는 총 실타래 = (무료 잔여) + (충전 잔액). */
    val available: StateFlow<Int> =
        combine(purchased, dailyUsed) { p, used ->
            (AppPreferences.DAILY_YARN_GRANT - used).coerceAtLeast(0) + p
        }.stateIn(viewModelScope, SharingStarted.Eagerly, AppPreferences.DAILY_YARN_GRANT)

    /** 충전(구매) 잔액만 — 충전 페이지의 "보유 실타래" 등에서 쓸 수 있음. */
    val purchasedBalance: StateFlow<Int> = purchased.asStateFlow()

    init { refreshDaily() }

    private fun today() = LocalDate.now().toString()

    /** 로컬 일일 사용량을 다시 읽어 [available] 에 반영(앱 복귀·날짜 변경 대비). */
    fun refreshDaily() = viewModelScope.launch {
        dailyUsed.value = AppPreferences.yarnUsedToday(today())
    }

    /** 세션의 서버 잔액으로 시드(재bootstrap 동기화). */
    fun setPurchased(balance: Int) { purchased.value = balance }

    suspend fun isUnlocked(cardId: Long): Boolean = AppPreferences.isUnlocked(cardId)

    /**
     * 카드 열람 차감. 이미 unlock 이면 무료. 아니면 무료분 우선 → 충전 잔액 순으로
     * 1개 차감하고 unlock 으로 기록한다.
     */
    suspend fun spend(cardId: Long): YarnResult {
        if (AppPreferences.isUnlocked(cardId)) return YarnResult.AlreadyUnlocked

        val remainingDaily =
            (AppPreferences.DAILY_YARN_GRANT - AppPreferences.yarnUsedToday(today())).coerceAtLeast(0)
        if (remainingDaily > 0) {
            dailyUsed.value = AppPreferences.bumpYarnDaily(today())
            AppPreferences.markUnlocked(cardId)
            return YarnResult.ChargedDaily
        }

        val newBalance = runCatching { repo.consumeYarn() }.getOrElse { return YarnResult.Error }
        if (newBalance < 0) return YarnResult.Insufficient
        purchased.value = newBalance
        AppPreferences.markUnlocked(cardId)
        return YarnResult.ChargedPurchased
    }

    /** 충전 — 결제 없이 즉시 서버 잔액에 n개 추가. 성공 시 true(잔액 갱신), 실패 시 false. */
    suspend fun addYarn(n: Int): Boolean {
        val newBalance = runCatching { repo.grantYarn(n) }.getOrNull() ?: return false
        purchased.value = newBalance
        return true
    }

    /** QA/데모용 — fire-and-forget 충전. */
    fun grant(n: Int) = viewModelScope.launch { addYarn(n) }
}

sealed interface YarnResult {
    /** 이미 연 카드 — 무료 재열람. */
    data object AlreadyUnlocked : YarnResult
    data object ChargedDaily : YarnResult
    data object ChargedPurchased : YarnResult
    /** 잔액 0 — 열람 차단, 충전 유도. */
    data object Insufficient : YarnResult
    /** RPC/네트워크 실패. */
    data object Error : YarnResult
}
