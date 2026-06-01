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

    private val PUSH = booleanPreferencesKey("push_enabled")
    private val TASTE = booleanPreferencesKey("taste_enabled")
    private val DARK = booleanPreferencesKey("dark_theme")
    private val RECENT = stringPreferencesKey("recently_shown_ids") // CSV of card ids, oldest→newest
    private val REFRESH_DATE = stringPreferencesKey("refresh_date")  // yyyy-MM-dd of last refresh
    private val REFRESH_COUNT = intPreferencesKey("refresh_count")   // refreshes used on REFRESH_DATE
    private val NOTICE_LAST_SEEN = longPreferencesKey("notice_last_seen_id") // max notice_id the user has seen
    private val FEED_CATEGORY = stringPreferencesKey("feed_category") // "today" | "highlight"
    private val GUIDE_SEEN = booleanPreferencesKey("guide_seen")     // onboarding coachmark shown once

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

    // --- Notice unread tracking ---
    val noticeLastSeenId: Flow<Long> get() = store.data.map { it[NOTICE_LAST_SEEN] ?: 0L }
    suspend fun setNoticeLastSeen(id: Long) {
        store.edit { p -> if ((p[NOTICE_LAST_SEEN] ?: 0L) < id) p[NOTICE_LAST_SEEN] = id }
    }

    // --- Feed category (오늘의 한줄 vs 하이라이트) ---
    val feedCategory: Flow<String> get() = store.data.map { it[FEED_CATEGORY] ?: "today" }
    suspend fun setFeedCategory(value: String) { store.edit { it[FEED_CATEGORY] = value } }

    // --- Onboarding coachmark (shown once) ---
    val guideSeen: Flow<Boolean> get() = store.data.map { it[GUIDE_SEEN] ?: false }
    suspend fun setGuideSeen() { store.edit { it[GUIDE_SEEN] = true } }
}
