package com.lifestyle.dailyscript.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

// Bookmarks required before personalized recommendations kick in (mirrors the PWA's
// MIN_BOOKMARKS_FOR_TASTE). Below this we surface a progress note; at/above it we hide
// the note entirely and never expose the criteria used.
private const val MIN_BOOKMARKS_FOR_TASTE = 10

class SettingsViewModel : ViewModel() {

    private val bookmarkRepo = BookmarkRepository()

    val pushEnabled: StateFlow<Boolean> =
        AppPreferences.pushEnabled.stateIn(viewModelScope, SharingStarted.Eagerly, true)

    val tasteEnabled: StateFlow<Boolean> =
        AppPreferences.tasteEnabled.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    val darkTheme: StateFlow<Boolean> =
        AppPreferences.darkTheme.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _tasteProfile = MutableStateFlow<String?>(null)
    val tasteProfile: StateFlow<String?> = _tasteProfile.asStateFlow()

    fun setPushEnabled(value: Boolean) {
        viewModelScope.launch { AppPreferences.setPushEnabled(value) }
    }

    fun setDarkTheme(value: Boolean) {
        viewModelScope.launch { AppPreferences.setDarkTheme(value) }
    }

    fun setTasteEnabled(value: Boolean, userId: Long) {
        viewModelScope.launch {
            AppPreferences.setTasteEnabled(value)
            if (value) loadTasteProfile(userId)
        }
    }

    /**
     * Progress note for the 맞춤 추천 row — only meaningful below the bookmark threshold.
     * Mirrors the PWA's paintTasteProfile: show "N개 이상부터…(현재 x/N)" while under the
     * threshold, otherwise null (hidden) so the recommendation criteria stay private.
     */
    fun loadTasteProfile(userId: Long) {
        viewModelScope.launch {
            val count = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.count { it.cards != null } ?: 0
            _tasteProfile.value = if (count < MIN_BOOKMARKS_FOR_TASTE) {
                "북마크 ${MIN_BOOKMARKS_FOR_TASTE}개 이상부터 추천이 적용됩니다 (현재 $count/$MIN_BOOKMARKS_FOR_TASTE)"
            } else {
                null
            }
        }
    }
}
