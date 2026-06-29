package com.lifestyle.dailyscript.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.lifestyle.dailyscript.data.model.UserPrefs
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ds_prefs")

/**
 * Process-wide preference store (mirrors the PWA's localStorage flags).
 * Initialized once from [com.lifestyle.dailyscript.DailyScriptApp].
 */
object AppPreferences {

    private const val RECENT_CAP = 10

    /** 매일 부여되는 무료 실타래 수 (단일 출처). */
    const val DAILY_YARN_GRANT = 5

    /** 카드 N개 열람 후 1회 피드백 넛지 (PWA FEEDBACK_NUDGE_THRESHOLD). */
    const val FEEDBACK_NUDGE_THRESHOLD = 15

    /** unlock(카드당 1회 무료 재열람) 유효 기간 — 이후엔 다시 실타래를 차감. */
    private const val UNLOCK_WINDOW_MS = 3L * 24 * 60 * 60 * 1000 // 3일

    private val PUSH = booleanPreferencesKey("push_enabled")
    private val TASTE = booleanPreferencesKey("taste_enabled")
    private val DARK = booleanPreferencesKey("dark_theme")
    private val RECENT = stringPreferencesKey("recently_shown_ids") // CSV of card ids, oldest→newest
    private val REFRESH_DATE = stringPreferencesKey("refresh_date")  // yyyy-MM-dd of last refresh
    private val REFRESH_COUNT = intPreferencesKey("refresh_count")   // refreshes used on REFRESH_DATE
    private val NOTICE_LAST_SEEN = longPreferencesKey("notice_last_seen_id") // max notice_id the user has seen
    private val FEED_CATEGORY = stringPreferencesKey("feed_category") // "today" | "highlight"
    private val GUIDE_SEEN = booleanPreferencesKey("guide_seen")     // onboarding coachmark shown once
    private val PREF_SELECTED = booleanPreferencesKey("pref_selected") // 선호도 온보딩 완료 여부 (PWA ds.prefSelected)
    private val PREF_GENRES = stringPreferencesKey("pref_genres")      // CSV of format values (PWA ds.pref.genres)
    private val PREF_THEMES = stringPreferencesKey("pref_themes")      // CSV of 한글 주제명 (PWA ds.pref.themes)
    private val PREF_ANY = booleanPreferencesKey("pref_any")           // "상관없음" 선택 여부
    private val YARN_DAILY_DATE = stringPreferencesKey("yarn_daily_date") // yyyy-MM-dd of daily grant
    private val YARN_DAILY_USED = intPreferencesKey("yarn_daily_used")    // daily yarns spent on YARN_DAILY_DATE
    private val UNLOCKED = stringPreferencesKey("unlocked_card_ids")      // CSV of "cardId:epochMillis" (3일 무료 재열람)
    // 첫 열람 +300 보상 dedup 은 user-scope 동적 키(rewardedKey)로 분리 — 아래 isRewarded/markRewarded 참고.
    private val ATTENDANCE_LAST_SHOWN = stringPreferencesKey("attendance_last_shown") // 오늘 모달 띄움 표시
    private val OZ_DAILY_DATE = stringPreferencesKey("oz_daily_date")     // yyyy-MM-dd for Daily Oz pick
    private val OZ_DAILY_CARD_ID = longPreferencesKey("oz_daily_card_id") // cached card_id for that date
    private val CARDS_VIEWED = intPreferencesKey("cards_viewed")          // PWA ds.cardsViewed (누적 카드 열람 수)
    private val FEEDBACK_NUDGE_SEEN = booleanPreferencesKey("feedback_nudge_seen") // PWA ds.feedbackNudgeSeen (1회 가드)
    private val TODAY_YARN_HINTED = booleanPreferencesKey("today_yarn_hinted") // TODAY 실뭉치 힌트 1회 학습 (PWA)
    private val SHARE_THEMES_PURCHASED = stringPreferencesKey("share_themes_purchased") // CSV of 구매한 공유 카드지 id (기기 로컬)

    @Volatile
    private lateinit var store: DataStore<Preferences>

    fun init(context: Context) {
        if (!::store.isInitialized) store = context.applicationContext.dataStore
    }

    // --- Push notifications (local toggle only, like the PWA) ---
    val pushEnabled: Flow<Boolean> get() = store.data.map { it[PUSH] ?: true }
    suspend fun setPushEnabled(value: Boolean) { store.edit { it[PUSH] = value } }

    // --- Taste-based recommendation ---
    val tasteEnabled: Flow<Boolean> get() = store.data.map { it[TASTE] ?: false }
    suspend fun setTasteEnabled(value: Boolean) { store.edit { it[TASTE] = value } }

    // --- Dark theme ---
    val darkTheme: Flow<Boolean> get() = store.data.map { it[DARK] ?: false }
    suspend fun setDarkTheme(value: Boolean) { store.edit { it[DARK] = value } }

    // --- Recently-shown queue (for "지난 기록" + shuffle exclusion) ---
    val recentlyShown: Flow<List<Long>> get() = store.data.map { parseIds(it[RECENT]) }

    suspend fun rememberShown(cardId: Long) {
        store.edit { prefs ->
            val current = parseIds(prefs[RECENT]).toMutableList()
            current.remove(cardId)          // dedupe — move to most-recent position
            current.add(cardId)
            while (current.size > RECENT_CAP) current.removeAt(0)
            prefs[RECENT] = current.joinToString(",")
        }
    }

    private fun parseIds(raw: String?): List<Long> =
        raw?.split(",")?.mapNotNull { it.trim().toLongOrNull() } ?: emptyList()

    // --- Non-member refresh limit (mirrors the PWA's ds.refreshCount, 3/day) ---
    suspend fun refreshCountToday(today: String): Int {
        val prefs = store.data.first()
        return if (prefs[REFRESH_DATE] == today) (prefs[REFRESH_COUNT] ?: 0) else 0
    }

    /** Bump today's refresh counter (resetting on a new day). Returns the new count. */
    suspend fun bumpRefreshCount(today: String): Int {
        var result = 0
        store.edit { p ->
            val current = if (p[REFRESH_DATE] == today) (p[REFRESH_COUNT] ?: 0) else 0
            result = current + 1
            p[REFRESH_DATE] = today
            p[REFRESH_COUNT] = result
        }
        return result
    }

    // --- 실타래(yarn) 일일 무료분 + 카드 unlock (구매 잔액은 서버 users.yarn_balance) ---
    // 매일 5개 무료분을 우선 소진. 새로고침 제한(refresh_count)과 동일하게 날짜 비교로 리셋.
    suspend fun yarnUsedToday(today: String): Int {
        val prefs = store.data.first()
        return if (prefs[YARN_DAILY_DATE] == today) (prefs[YARN_DAILY_USED] ?: 0) else 0
    }

    /** 오늘 사용한 일일 실타래 +1 (새 날이면 리셋). 새 사용량 반환. */
    suspend fun bumpYarnDaily(today: String): Int {
        var result = 0
        store.edit { p ->
            val current = if (p[YARN_DAILY_DATE] == today) (p[YARN_DAILY_USED] ?: 0) else 0
            result = current + 1
            p[YARN_DAILY_DATE] = today
            p[YARN_DAILY_USED] = result
        }
        return result
    }

    // 카드당 1회 차감(unlock). 읽은 카드는 3일간 무료 재열람, 이후 다시 차감.
    suspend fun isUnlocked(cardId: Long): Boolean {
        val ts = parseUnlocks(store.data.first()[UNLOCKED])[cardId] ?: return false
        return System.currentTimeMillis() - ts < UNLOCK_WINDOW_MS
    }

    suspend fun markUnlocked(cardId: Long) {
        val now = System.currentTimeMillis()
        store.edit { p ->
            val current = parseUnlocks(p[UNLOCKED]).toMutableMap()
            current.entries.removeAll { now - it.value >= UNLOCK_WINDOW_MS } // 만료 항목 정리
            current[cardId] = now
            p[UNLOCKED] = current.entries.joinToString(",") { "${it.key}:${it.value}" }
        }
    }

    // 카드 첫 열람 +300 실타래 보상 — 카드당 1회만(중복 지급 없음). PWA ds.yarnRewarded.<userId> 와 동일 정책.
    //   ⚠️ user-scope 필수(PWA d2c2c0a) — 옛 가입 때 받은 카드를 새 가입 사용자에게 'already received'
    //   로 잘못 차단하던 문제 fix. 동적 키 "rewarded_card_ids_<userId>" 로 분리한다.
    private fun rewardedKey(userId: Long) = stringPreferencesKey("rewarded_card_ids_$userId")

    suspend fun isRewarded(userId: Long, cardId: Long): Boolean {
        val raw = store.data.first()[rewardedKey(userId)] ?: return false
        return raw.split(",").any { it.trim().toLongOrNull() == cardId }
    }

    suspend fun markRewarded(userId: Long, cardId: Long) {
        val key = rewardedKey(userId)
        store.edit { p ->
            val current = (p[key] ?: "").split(",").mapNotNull { it.trim().toLongOrNull() }.toMutableSet()
            current.add(cardId)
            p[key] = current.joinToString(",")
        }
    }

    // 첫 보상 직후 1회 공유 유도 안내 — user_id 별 1회 표시(PWA ds.firstShareGuideShown.<userId>).
    //   다른 계정 로그인/재가입 시 다시 처음부터 안내가 뜨도록 동적 키로 분리한다.
    private fun firstShareGuideKey(userId: Long) = booleanPreferencesKey("first_share_guide_shown_$userId")

    suspend fun hasShownFirstShareGuide(userId: Long): Boolean =
        store.data.first()[firstShareGuideKey(userId)] ?: false

    suspend fun markFirstShareGuideShown(userId: Long) {
        store.edit { it[firstShareGuideKey(userId)] = true }
    }

    // 외부 브라우저 OAuth(카카오) 의 익명 user_id stash — 프로세스가 브라우저 왕복 중 죽어도 복귀 후
    // 익명 북마크를 새 계정으로 옮길 수 있게 영속화한다(PWA ds.prevAnonUserId). 메모리 in-memory 필드만
    // 쓰면 프로세스 사망 시 마이그레이션이 유실된다. 0/미존재 = 없음.
    private val PENDING_MIGRATION_UID = longPreferencesKey("pending_migration_user_id")
    suspend fun pendingMigrationUserId(): Long? =
        store.data.first()[PENDING_MIGRATION_UID]?.takeIf { it > 0L }
    suspend fun setPendingMigrationUserId(userId: Long?) {
        store.edit {
            if (userId != null && userId > 0L) it[PENDING_MIGRATION_UID] = userId
            else it.remove(PENDING_MIGRATION_UID)
        }
    }
    suspend fun clearPendingMigrationUserId() { store.edit { it.remove(PENDING_MIGRATION_UID) } }

    // 출석체크 모달 1일 1회 표시 throttle (기기 로컬 UI 상태). 출석 기록·보상은 서버 권위
    // (11_attendance.sql / check_in_attendance RPC) — YarnRepository.attendanceHistory 참고.
    /** 오늘 출석체크 모달을 띄웠는지(매일 1회로 제한). */
    suspend fun attendanceLastShown(): String? = store.data.first()[ATTENDANCE_LAST_SHOWN]
    suspend fun markAttendanceShown(today: String) {
        store.edit { p -> p[ATTENDANCE_LAST_SHOWN] = today }
    }

    private fun parseUnlocks(raw: String?): Map<Long, Long> =
        raw?.split(",")?.mapNotNull { entry ->
            val parts = entry.split(":")
            val id = parts.getOrNull(0)?.trim()?.toLongOrNull()
            val ts = parts.getOrNull(1)?.trim()?.toLongOrNull()
            if (id != null && ts != null) id to ts else null
        }?.toMap() ?: emptyMap()

    // --- Notice unread tracking ---
    val noticeLastSeenId: Flow<Long> get() = store.data.map { it[NOTICE_LAST_SEEN] ?: 0L }
    suspend fun setNoticeLastSeen(id: Long) {
        store.edit { p -> if ((p[NOTICE_LAST_SEEN] ?: 0L) < id) p[NOTICE_LAST_SEEN] = id }
    }

    // --- Daily / Oz recommendation cache ---
    suspend fun ozDailyCardId(today: String): Long? {
        val prefs = store.data.first()
        return if (prefs[OZ_DAILY_DATE] == today) prefs[OZ_DAILY_CARD_ID] else null
    }

    suspend fun setOzDailyCard(today: String, cardId: Long) {
        store.edit { p ->
            p[OZ_DAILY_DATE] = today
            p[OZ_DAILY_CARD_ID] = cardId
        }
    }

    // --- 피드백 넛지 (PWA bumpCardsViewed / feedbackNudgeSeen) ---
    /** 누적 카드 열람 수 +1 (새 값 반환). */
    suspend fun bumpCardsViewed(): Int {
        var result = 0
        store.edit { p ->
            result = (p[CARDS_VIEWED] ?: 0) + 1
            p[CARDS_VIEWED] = result
        }
        return result
    }

    suspend fun feedbackNudgeSeen(): Boolean = store.data.first()[FEEDBACK_NUDGE_SEEN] ?: false
    suspend fun markFeedbackNudgeSeen() { store.edit { it[FEEDBACK_NUDGE_SEEN] = true } }

    // --- 공유 카드지(프리미엄/로얄) 구매 기록 — 실타래 차감은 서버(spend_yarn), 보유 id 는 기기 로컬 ---
    suspend fun sharePurchasedThemes(): Set<String> =
        store.data.first()[SHARE_THEMES_PURCHASED]
            ?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet()
            ?: emptySet()

    suspend fun addSharePurchasedTheme(id: String) {
        store.edit { p ->
            val cur = p[SHARE_THEMES_PURCHASED]?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
                ?.toMutableSet() ?: mutableSetOf()
            cur.add(id)
            p[SHARE_THEMES_PURCHASED] = cur.joinToString(",")
        }
    }

    // --- TODAY 실뭉치 힌트 (PWA today_yarn_hinted) ---
    val todayYarnHinted: Flow<Boolean> get() = store.data.map { it[TODAY_YARN_HINTED] ?: false }
    suspend fun setTodayYarnHinted() { store.edit { it[TODAY_YARN_HINTED] = true } }

    // --- Feed category (오늘의 한줄 vs 하이라이트) ---
    val feedCategory: Flow<String> get() = store.data.map { it[FEED_CATEGORY] ?: "today" }
    suspend fun setFeedCategory(value: String) { store.edit { it[FEED_CATEGORY] = value } }

    // --- Onboarding coachmark (shown once) ---
    val guideSeen: Flow<Boolean> get() = store.data.map { it[GUIDE_SEEN] ?: false }
    suspend fun setGuideSeen() { store.edit { it[GUIDE_SEEN] = true } }
    suspend fun resetGuideSeen() { store.edit { it[GUIDE_SEEN] = false } }

    /**
     * 회원의 첫 가입/로그인 시 온보딩(취향 설정 + 사용법 투어)을 다시 띄우기 위해 두 로컬 플래그를
     * 함께 리셋한다. 기존 신규-설치 흐름과 동일하게 PreferenceOverlay → 코치 투어가 재생된다.
     */
    suspend fun resetOnboarding() {
        store.edit {
            it[PREF_SELECTED] = false
            it[GUIDE_SEEN] = false
        }
    }

    // --- 선호도 온보딩 (PWA ds.prefSelected / ds.pref — 코치 투어 직전 1회) ---
    val prefSelected: Flow<Boolean> get() = store.data.map { it[PREF_SELECTED] ?: false }

    /** 저장된 선호도. 온보딩 미완료(미동기화)면 null — PWA getPrefs()의 null과 동일 의미. */
    val userPrefs: Flow<UserPrefs?> get() = store.data.map { p ->
        if (p[PREF_SELECTED] != true) null
        else UserPrefs(
            genres = parseCsvStrings(p[PREF_GENRES]),
            themes = parseCsvStrings(p[PREF_THEMES]),
            any = p[PREF_ANY] ?: false,
        )
    }

    /** 선호도 저장 + 완료 마킹. 온보딩 완료/건너뛰기와 DB→로컬 동기화(DB 우선)가 공용으로 쓴다. */
    suspend fun savePrefs(prefs: UserPrefs) {
        store.edit {
            it[PREF_GENRES] = prefs.genres.joinToString(",")
            it[PREF_THEMES] = prefs.themes.joinToString(",")
            it[PREF_ANY] = prefs.any
            it[PREF_SELECTED] = true
        }
    }

    private fun parseCsvStrings(raw: String?): List<String> =
        raw?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
}
