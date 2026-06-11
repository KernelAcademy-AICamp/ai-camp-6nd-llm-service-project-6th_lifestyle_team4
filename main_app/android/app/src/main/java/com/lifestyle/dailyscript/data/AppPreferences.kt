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
    private val REWARDED = stringPreferencesKey("rewarded_card_ids")      // CSV of cardIds — 카드당 1회 첫 열람 +1 실타래 보상
    private val ATTENDANCE_HISTORY = stringPreferencesKey("attendance_history")   // CSV of yyyy-MM-dd
    private val ATTENDANCE_LAST_SHOWN = stringPreferencesKey("attendance_last_shown") // 오늘 모달 띄움 표시
    private val OZ_DAILY_DATE = stringPreferencesKey("oz_daily_date")     // yyyy-MM-dd for Daily Oz pick
    private val OZ_DAILY_CARD_ID = longPreferencesKey("oz_daily_card_id") // cached card_id for that date

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

    // 카드 첫 열람 +1 실타래 보상 — 카드당 1회만(중복 지급 없음). PWA ds.yarnRewarded 와 동일 정책.
    suspend fun isRewarded(cardId: Long): Boolean {
        val raw = store.data.first()[REWARDED] ?: return false
        return raw.split(",").any { it.trim().toLongOrNull() == cardId }
    }

    suspend fun markRewarded(cardId: Long) {
        store.edit { p ->
            val current = (p[REWARDED] ?: "").split(",").mapNotNull { it.trim().toLongOrNull() }.toMutableSet()
            current.add(cardId)
            p[REWARDED] = current.joinToString(",")
        }
    }

    // 출석체크 — 00시 기준 그날 첫 진입 시 한 달 달력 모달 + 실타래 +5.
    suspend fun attendanceHistory(): Set<String> {
        val raw = store.data.first()[ATTENDANCE_HISTORY] ?: return emptySet()
        return raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    }
    suspend fun hasAttendanceToday(today: String): Boolean =
        attendanceHistory().contains(today)

    /** 오늘 출석 기록(이미 있으면 noop). */
    suspend fun markAttendance(today: String) {
        store.edit { p ->
            val current = (p[ATTENDANCE_HISTORY] ?: "").split(",").map { it.trim() }
                .filter { it.isNotEmpty() }.toMutableSet()
            current.add(today)
            p[ATTENDANCE_HISTORY] = current.joinToString(",")
        }
    }

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

    // --- Feed category (오늘의 한줄 vs 하이라이트) ---
    val feedCategory: Flow<String> get() = store.data.map { it[FEED_CATEGORY] ?: "today" }
    suspend fun setFeedCategory(value: String) { store.edit { it[FEED_CATEGORY] = value } }

    // --- Onboarding coachmark (shown once) ---
    val guideSeen: Flow<Boolean> get() = store.data.map { it[GUIDE_SEEN] ?: false }
    suspend fun setGuideSeen() { store.edit { it[GUIDE_SEEN] = true } }
    suspend fun resetGuideSeen() { store.edit { it[GUIDE_SEEN] = false } }

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
