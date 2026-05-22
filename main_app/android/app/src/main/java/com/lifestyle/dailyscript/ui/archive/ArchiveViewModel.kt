package com.lifestyle.dailyscript.ui.archive

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ArchiveViewModel : ViewModel() {

    private val bookmarkRepo = BookmarkRepository()

    private val _state = MutableStateFlow(ArchiveState())
    val state: StateFlow<ArchiveState> = _state.asStateFlow()

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = runCatching { bookmarkRepo.list(userId) }
            _state.value = _state.value.copy(
                loading = false,
                bookmarks = result.getOrDefault(_state.value.bookmarks),
                error = result.exceptionOrNull()?.message,
            )
        }
    }

    fun removeBookmark(userId: Long, cardId: Long) {
        if (_state.value.removingCardId != null) return
        _state.value = _state.value.copy(removingCardId = cardId, error = null)
        viewModelScope.launch {
            runCatching { bookmarkRepo.toggle(userId, cardId) }
                .onSuccess {
                    val refreshed = runCatching { bookmarkRepo.list(userId) }
                    _state.value = _state.value.copy(
                        bookmarks = refreshed.getOrDefault(_state.value.bookmarks),
                        removingCardId = null,
                        error = refreshed.exceptionOrNull()?.message,
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        removingCardId = null,
                        error = error.message ?: "Bookmark update failed.",
                    )
                }
        }
    }
}

data class ArchiveState(
    val loading: Boolean = true,
    val bookmarks: List<BookmarkRow> = emptyList(),
    val error: String? = null,
    val removingCardId: Long? = null,
)
