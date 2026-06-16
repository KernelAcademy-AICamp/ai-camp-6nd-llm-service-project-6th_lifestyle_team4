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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
    private val REWARDED = stringPreferencesKey("rewarded_card_ids")      // CSV of cardIds — 카드당 1회 첫 열람 +1 실타래 보상
    private val ATTENDANCE_HISTORY = stringPreferencesKey("attendance_history")   // CSV of yyyy-MM-dd
    private val ATTENDANCE_LAST_SHOWN = stringPreferencesKey("attendance_last_shown") // 오늘 모달 띄움 표시
    private val OZ_DAILY_DATE = stringPreferencesKey("oz_daily_date")     // yyyy-MM-dd for Daily Oz pick
    private val OZ_DAILY_CARD_ID = longPreferencesKey("oz_daily_card_id") // cached card_id for that date
    private val CARDS_VIEWED = intPreferencesKey("cards_viewed")          // PWA ds.cardsViewed (누적 카드 열람 수)
    private val FEEDBACK_NUDGE_SEEN = booleanPreferencesKey("feedback_nudge_seen") // PWA ds.feedbackNudgeSeen (1회 가드)
    // OZ's house 꾸미기 (PWA oz-house ds.ozhouse.*) — 로컬 보존.
    private val OZ_NIGHT = stringPreferencesKey("oz_night")   // "auto" | "day" | "night"
    private val OZ_THEME = stringPreferencesKey("oz_theme")   // 방 팔레트 id
    private val OZ_SOFA = stringPreferencesKey("oz_sofa")
    private val OZ_RUG = stringPreferencesKey("oz_rug")
    private val OZ_TOWER = stringPreferencesKey("oz_tower")
    private val OZ_CAT_POS = stringPreferencesKey("oz_cat_pos") // (구) 단일 "x,y" 비율 — 마이그레이션 읽기용
    private val OZ_CAT_POSE = intPreferencesKey("oz_cat_pose")  // (구) 단일 저장 포즈 index — 마이그레이션 읽기용
    private val OZ_CAT_POSITIONS = stringPreferencesKey("oz_cat_positions") // 포즈별 위치 "idx:x:y;idx:x:y;..."
    private val OZ_SOFA_POS = stringPreferencesKey("oz_sofa_pos")   // "x,y" 중심 비율(드래그); 없으면 프리셋
    private val OZ_RUG_POS = stringPreferencesKey("oz_rug_pos")
    private val OZ_TOWER_POS = stringPreferencesKey("oz_tower_pos")
    private val OZ_THEMES_PURCHASED = stringPreferencesKey("oz_themes_purchased") // CSV (PWA ds.ozhouse.theme.purchased)
    private val TODAY_YARN_HINTED = booleanPreferencesKey("today_yarn_hinted") // TODAY 실뭉치 힌트 1회 학습 (PWA)

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

    // --- OZ's house 꾸미기 (테마·가구·낮밤·고양이 위치) ---
    data class OzDecorPrefs(
        val night: String,
        val theme: String,
        val sofa: String,
        val rug: String,
        val tower: String,
        val catPositions: Map<Int, Pair<Float, Float>>, // 포즈 index → (중심x, 중심y) 비율; 없으면 프리셋
        val sofaX: Float,
        val sofaY: Float,
        val rugX: Float,
        val rugY: Float,
        val towerX: Float,
        val towerY: Float,
    )

    /** "x,y" → (x,y) 비율; 없으면 (-1,-1) = 프리셋 위치 사용. */
    private fun parsePos(s: String?): Pair<Float, Float> {
        val p = s?.split(",")
        return (p?.getOrNull(0)?.toFloatOrNull() ?: -1f) to (p?.getOrNull(1)?.toFloatOrNull() ?: -1f)
    }

    /** "idx:x:y;idx:x:y;..." → {idx: (x,y)}; x·y가 0~1 범위인 항목만 채택. */
    private fun parseCatPositions(s: String?): Map<Int, Pair<Float, Float>> {
        if (s.isNullOrBlank()) return emptyMap()
        return s.split(";").mapNotNull { e ->
            val f = e.split(":")
            val idx = f.getOrNull(0)?.toIntOrNull() ?: return@mapNotNull null
            val x = f.getOrNull(1)?.toFloatOrNull() ?: return@mapNotNull null
            val y = f.getOrNull(2)?.toFloatOrNull() ?: return@mapNotNull null
            if (x in 0f..1f && y in 0f..1f) idx to (x to y) else null
        }.toMap()
    }

    /** {idx: (x,y)} → "idx:x:y;idx:x:y;..." (idx 오름차순). */
    private fun encodeCatPositions(m: Map<Int, Pair<Float, Float>>): String =
        m.entries.sortedBy { it.key }.joinToString(";") { "${it.key}:${it.value.first}:${it.value.second}" }

    /**
     * 꾸미기 상태의 프로세스 전역 동기 캐시. [ozDecor] 첫 읽기와 모든 setter에서 갱신되어
     * 항상 최신값을 유지한다. OzHouseViewModel 초기 상태를 이 캐시로 시드해 진입 시 깜빡임(기본 방→저장 방)을 없앤다.
     */
    @Volatile private var decorCache: OzDecorPrefs? = null

    /** ViewModel init 등에서 동기로 읽는 캐시(없으면 null → 호출측이 기본값/비동기 로드로 폴백). */
    fun cachedOzDecor(): OzDecorPrefs? = decorCache

    private val cacheScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** 앱 시작 시 1회 호출 — 첫 오즈의 집 진입 전에 캐시를 채워 첫 진입도 깜빡임 없게 한다. */
    fun warmDecorCache() { cacheScope.launch { runCatching { ozDecor() } } }

    suspend fun ozDecor(): OzDecorPrefs {
        val p = store.data.first()
        // 포즈별 위치 — 신규 키 우선. 없으면 구 단일 키(OZ_CAT_POSE/POS)를 한 항목으로 마이그레이션.
        val catPositions = parseCatPositions(p[OZ_CAT_POSITIONS]).ifEmpty {
            val oldPose = p[OZ_CAT_POSE] ?: -1
            val (ox, oy) = parsePos(p[OZ_CAT_POS])
            if (oldPose >= 0 && ox in 0f..1f && oy in 0f..1f) mapOf(oldPose to (ox to oy)) else emptyMap()
        }
        val sofaP = parsePos(p[OZ_SOFA_POS])
        val rugP = parsePos(p[OZ_RUG_POS])
        val towerP = parsePos(p[OZ_TOWER_POS])
        return OzDecorPrefs(
            night = p[OZ_NIGHT] ?: "auto",
            theme = p[OZ_THEME] ?: "default",
            sofa = p[OZ_SOFA] ?: "cream",
            rug = p[OZ_RUG] ?: "coral",
            tower = p[OZ_TOWER] ?: "tall",
            catPositions = catPositions,
            sofaX = sofaP.first, sofaY = sofaP.second,
            rugX = rugP.first, rugY = rugP.second,
            towerX = towerP.first, towerY = towerP.second,
        ).also { decorCache = it }
    }

    // setter는 디스크 보존 + 동기 캐시(decorCache) 갱신을 함께 한다.
    // 캐시 갱신을 빠뜨리면 다음 진입 시 시드가 과거값이라 다시 깜빡이므로 모든 setter에서 반영할 것.
    suspend fun setOzNight(value: String) {
        store.edit { it[OZ_NIGHT] = value }; decorCache = decorCache?.copy(night = value)
    }
    suspend fun setOzTheme(value: String) {
        store.edit { it[OZ_THEME] = value }; decorCache = decorCache?.copy(theme = value)
    }
    suspend fun setOzSofa(value: String) {
        store.edit { it[OZ_SOFA] = value }; decorCache = decorCache?.copy(sofa = value)
    }
    suspend fun setOzRug(value: String) {
        store.edit { it[OZ_RUG] = value }; decorCache = decorCache?.copy(rug = value)
    }
    suspend fun setOzTower(value: String) {
        store.edit { it[OZ_TOWER] = value }; decorCache = decorCache?.copy(tower = value)
    }
    /** 드래그 종료 시 — 해당 포즈(pose) 슬롯의 위치(비율)만 갱신해 보존(다른 포즈 위치는 유지). */
    suspend fun setOzCatPos(pose: Int, x: Float, y: Float) {
        var next: Map<Int, Pair<Float, Float>> = emptyMap()
        store.edit { p ->
            next = parseCatPositions(p[OZ_CAT_POSITIONS]) + (pose to (x to y))
            p[OZ_CAT_POSITIONS] = encodeCatPositions(next)
        }
        decorCache = decorCache?.copy(catPositions = next)
    }

    // 가구 드래그 위치 (중심 비율). PWA layout[selector] = {left,top}.
    suspend fun setOzSofaPos(x: Float, y: Float) {
        store.edit { it[OZ_SOFA_POS] = "$x,$y" }; decorCache = decorCache?.copy(sofaX = x, sofaY = y)
    }
    suspend fun setOzRugPos(x: Float, y: Float) {
        store.edit { it[OZ_RUG_POS] = "$x,$y" }; decorCache = decorCache?.copy(rugX = x, rugY = y)
    }
    suspend fun setOzTowerPos(x: Float, y: Float) {
        store.edit { it[OZ_TOWER_POS] = "$x,$y" }; decorCache = decorCache?.copy(towerX = x, towerY = y)
    }

    // --- OZ 테마 구매 기록 (PWA THEME_PURCHASED_KEY; 'default' 는 기본 보유) ---
    suspend fun ozPurchasedThemes(): Set<String> {
        val raw = store.data.first()[OZ_THEMES_PURCHASED]
        val set = raw?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toMutableSet() ?: mutableSetOf()
        set.add("default")
        return set
    }
    suspend fun addOzPurchasedTheme(id: String) {
        store.edit { p ->
            val cur = p[OZ_THEMES_PURCHASED]?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toMutableSet()
                ?: mutableSetOf()
            cur.add(id)
            p[OZ_THEMES_PURCHASED] = cur.joinToString(",")
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
