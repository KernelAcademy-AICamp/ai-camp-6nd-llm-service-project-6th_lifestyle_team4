package com.lifestyle.dailyscript.ui.notice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.data.repo.NoticeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Notices list + unread badge. Hoisted to the activity scope in DailyScriptRoot so
 * the bottom-nav badge and the Notice screen share one instance.
 */
class NoticeViewModel : ViewModel() {

    private val repo = NoticeRepository()

    private val _state = MutableStateFlow(NoticeState())
    val state: StateFlow<NoticeState> = _state.asStateFlow()

    /** Count of notices newer than the last one the user opened. */
    val unread: StateFlow<Int> =
        combine(_state, AppPreferences.noticeLastSeenId) { st, lastSeen ->
            st.notices.count { it.noticeId > lastSeen }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = runCatching { repo.list() }
            _state.value = NoticeState(
                loading = false,
                notices = result.getOrDefault(emptyList()),
                error = result.exceptionOrNull()?.message,
            )
        }
    }

    /** 당겨서 새로고침 — 목록은 유지하며 인디케이터만 표시하고 다시 불러온다. */
    fun refresh() {
        if (_state.value.refreshing) return
        _state.value = _state.value.copy(refreshing = true, error = null)
        viewModelScope.launch {
            val result = runCatching { repo.list() }
            _state.value = _state.value.copy(
                refreshing = false,
                notices = result.getOrDefault(_state.value.notices),
                error = result.exceptionOrNull()?.message,
            )
        }
    }

    /** Called when the Notice screen is opened — clears the unread badge. */
    fun markAllSeen() {
        val maxId = _state.value.notices.maxOfOrNull { it.noticeId } ?: return
        viewModelScope.launch { AppPreferences.setNoticeLastSeen(maxId) }
    }
}

data class NoticeState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val notices: List<Notice> = emptyList(),
    val error: String? = null,
)
