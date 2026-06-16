package com.lifestyle.dailyscript.ui.yarn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.repo.YarnRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * 실타래 잔액 + 보상을 한곳에서 관리. 상단바 칩이 [available] 을 구독한다.
 *
 * 사용자 명세(2026-06):
 *  - 카드 열람 게이트 제거 → spend 사용처 없음. 첫 열람 시 +1 보상([rewardFirstView]).
 *  - 매일 5개 무료분 폐지 → 잔액 = 서버 충전분(users.yarn_balance) 만.
 *  - 출석체크: 그날 첫 진입이면 +5 ([rewardAttendance]).
 */
class YarnViewModel : ViewModel() {

    private val repo = YarnRepository()

    private val purchased = MutableStateFlow(0)

    /** 사용 가능한 실타래 = 서버 충전분 전부. */
    val available: StateFlow<Int> = purchased.asStateFlow()

    /** 충전 페이지의 "보유 실타래" 와 동일(이전 호환 유지). */
    val purchasedBalance: StateFlow<Int> = purchased.asStateFlow()

    private fun today() = LocalDate.now().toString()

    /** 더 이상 일일 카운터가 없으나 호출자 호환을 위해 noop 으로 유지. */
    fun refreshDaily() {}

    /** 세션의 서버 잔액으로 시드(재bootstrap 동기화). */
    fun setPurchased(balance: Int) { purchased.value = balance }

    /** 카드 첫 열람 보상 — 카드당 1회 +1. */
    suspend fun rewardFirstView(cardId: Long) {
        if (AppPreferences.isRewarded(cardId)) return
        AppPreferences.markRewarded(cardId)
        val newBalance = runCatching { repo.grantYarn(1) }.getOrNull() ?: return
        purchased.value = newBalance
    }

    /**
     * 출석체크 — 00시 기준 그날 첫 진입이면 +5 지급 후 true.
     * 이미 지급됐거나 RPC 실패면 false.
     */
    suspend fun rewardAttendance(): Boolean {
        val today = today()
        if (AppPreferences.hasAttendanceToday(today)) return false
        AppPreferences.markAttendance(today)
        val newBalance = runCatching { repo.grantYarn(ATTENDANCE_REWARD) }.getOrNull() ?: return false
        purchased.value = newBalance
        return true
    }

    /** 충전 — 결제 없이 즉시 서버 잔액에 n개 추가. */
    suspend fun addYarn(n: Int): Boolean {
        val newBalance = runCatching { repo.grantYarn(n) }.getOrNull() ?: return false
        purchased.value = newBalance
        return true
    }

    /**
     * 구매 차감 — 서버 충전 잔액에서 amount 만큼 원자적 차감(spend_yarn RPC).
     * 성공 시 공유 잔액([available]) 갱신 후 SUCCESS, 잔액 부족이면 INSUFFICIENT, RPC 실패면 ERROR.
     */
    suspend fun spend(amount: Int): SpendResult {
        val newBalance = runCatching { repo.spendYarn(amount) }.getOrNull() ?: return SpendResult.ERROR
        if (newBalance < 0) return SpendResult.INSUFFICIENT
        purchased.value = newBalance
        return SpendResult.SUCCESS
    }

    /** QA/데모용 — fire-and-forget 충전. */
    fun grant(n: Int) = viewModelScope.launch { addYarn(n) }

    companion object { const val ATTENDANCE_REWARD = 5 }
}

sealed interface YarnResult {
    data object AlreadyUnlocked : YarnResult
    data object ChargedDaily : YarnResult
    data object ChargedPurchased : YarnResult
    data object Insufficient : YarnResult
    data object Error : YarnResult
}

/** [YarnViewModel.spend] 결과 — 구매 차감 성공/잔액부족/오류. */
enum class SpendResult { SUCCESS, INSUFFICIENT, ERROR }
