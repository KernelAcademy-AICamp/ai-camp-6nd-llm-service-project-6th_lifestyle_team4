package com.lifestyle.dailyscript.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
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
}
