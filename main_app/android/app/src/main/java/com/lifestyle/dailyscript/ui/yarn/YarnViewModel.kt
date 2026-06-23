package com.lifestyle.dailyscript.ui.yarn

import androidx.lifecycle.ViewModel
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.repo.ShareRepository
import com.lifestyle.dailyscript.data.repo.YarnRepository
import com.lifestyle.dailyscript.ui.share.ShareBackground
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.LocalDate

/**
 * 실타래 잔액 + 보상을 한곳에서 관리. 상단바 칩이 [available] 을 구독한다.
 *
 * 사용자 명세(2026-06):
 *  - 카드 열람 게이트 제거 → spend 사용처 없음. 첫 열람 시 +300 보상([rewardFirstView]).
 *  - 매일 5개 무료분 폐지 → 잔액 = 서버 충전분(users.yarn_balance) 만.
 *  - 출석체크: 그날 첫 진입이면 +100 ([rewardAttendance]). (PWA d10cfd3: 출석 +100 / 첫열람 +300)
 */
class YarnViewModel : ViewModel() {

    private val repo = YarnRepository()
    private val shareRepo = ShareRepository()

    private val purchased = MutableStateFlow(0)

    /** 사용 가능한 실타래 = 서버 충전분 전부. */
    val available: StateFlow<Int> = purchased.asStateFlow()

    // 구매한 공유 카드지 id 집합(기기 로컬). 공유 시트가 잠금 해제 표시에 구독.
    private val _purchasedThemes = MutableStateFlow<Set<String>>(emptySet())
    val purchasedThemes: StateFlow<Set<String>> = _purchasedThemes.asStateFlow()

    /** 앱/세션 진입 시 보유 카드지 로드. */
    suspend fun loadPurchasedThemes() { _purchasedThemes.value = AppPreferences.sharePurchasedThemes() }

    // 원격 공유 카드지(premium/royal) — share_backgrounds 테이블. 공유 시트가 무료 8종 뒤에 합쳐 쓴다.
    private val _shareBackgrounds = MutableStateFlow<List<ShareBackground>>(emptyList())
    val shareBackgrounds: StateFlow<List<ShareBackground>> = _shareBackgrounds.asStateFlow()

    /** 원격 카드지 목록 로드(공개 읽기). 실패하면 빈 리스트 유지 → 무료 8종만 노출. */
    suspend fun loadShareBackgrounds() { _shareBackgrounds.value = shareRepo.listBackgrounds() }

    /**
     * 공유 카드지 구매 — 이미 보유면 SUCCESS, 아니면 실타래 [price] 차감(서버 spend_yarn) 후 보유 기록.
     * 잔액 부족이면 INSUFFICIENT, RPC 실패면 ERROR(차감/기록 없음).
     */
    suspend fun buyShareTheme(id: String, price: Int): SpendResult {
        if (_purchasedThemes.value.contains(id)) return SpendResult.SUCCESS
        val result = spend(price)
        if (result == SpendResult.SUCCESS) {
            AppPreferences.addSharePurchasedTheme(id)
            _purchasedThemes.value = _purchasedThemes.value + id
        }
        return result
    }

    private fun today() = LocalDate.now().toString()

    /** 세션의 서버 잔액으로 시드(재bootstrap 동기화). */
    fun setPurchased(balance: Int) { purchased.value = balance }

    /**
     * 카드 첫 열람 보상 — 카드당 1회 +300. 실제 지급한 양을 돌려준다(없으면 0).
     * 호출부(상세 화면)가 반환값 > 0 일 때만 보상 애니메이션을 띄운다.
     */
    suspend fun rewardFirstView(cardId: Long): Int {
        if (AppPreferences.isRewarded(cardId)) return 0
        AppPreferences.markRewarded(cardId)
        val newBalance = runCatching { repo.grantYarn(FIRST_VIEW_REWARD) }.getOrNull() ?: return 0
        purchased.value = newBalance
        return FIRST_VIEW_REWARD
    }

    /**
     * 출석체크 — 00시 기준 그날 첫 진입이면 +100 지급 후 true.
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

    companion object {
        const val ATTENDANCE_REWARD = 100
        const val FIRST_VIEW_REWARD = 300
    }
}

/** [YarnViewModel.spend] 결과 — 구매 차감 성공/잔액부족/오류. */
enum class SpendResult { SUCCESS, INSUFFICIENT, ERROR }
