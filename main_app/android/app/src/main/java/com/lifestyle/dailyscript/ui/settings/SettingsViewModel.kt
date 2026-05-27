package com.lifestyle.dailyscript.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

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

    fun loadTasteProfile(userId: Long) {
        viewModelScope.launch {
            val cards = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.mapNotNull { it.cards } ?: emptyList()
            val taste = Recommend.computeTaste(cards)
            _tasteProfile.value = if (taste == null) {
                "아직 북마크가 없어요 — 카드를 수집하면 분석이 시작됩니다."
            } else {
                "온도 %.1f · 강도 %.1f (북마크 %d개 기반)".format(
                    taste.avgTemperature, taste.avgIntensity, taste.count,
                )
            }
        }
    }
}
