package com.lifestyle.dailyscript.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()

    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    fun refresh(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardResult = runCatching { cardRepo.fetchRandomCard() }
            val bookmarksResult = runCatching { bookmarkRepo.list(userId) }
            val card = cardResult.getOrNull()
            val bookmarkStateResult = card?.cardId?.let { id ->
                runCatching { bookmarkRepo.isBookmarked(userId, id) }
            }
            _state.value = HomeState(
                loading = false,
                todayCard = card,
                todayBookmarked = bookmarkStateResult?.getOrDefault(false) ?: false,
                bookmarks = bookmarksResult.getOrDefault(emptyList()),
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarksResult.exceptionOrNull()?.message,
                    bookmarkStateResult?.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    fun toggleTodayBookmark(userId: Long) {
        val card = _state.value.todayCard ?: return
        if (_state.value.bookmarkActionInFlight) return
        _state.value = _state.value.copy(bookmarkActionInFlight = true, error = null)
        viewModelScope.launch {
            runCatching { bookmarkRepo.toggle(userId, card.cardId) }
                .onSuccess { now ->
                    val refreshedResult = runCatching { bookmarkRepo.list(userId) }
                    _state.value = _state.value.copy(
                        todayBookmarked = now,
                        bookmarks = refreshedResult.getOrDefault(_state.value.bookmarks),
                        bookmarkActionInFlight = false,
                        error = refreshedResult.exceptionOrNull()?.message,
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        bookmarkActionInFlight = false,
                        error = error.message ?: "Bookmark update failed.",
                    )
                }
        }
    }
}

data class HomeState(
    val loading: Boolean = true,
    val todayCard: CardDto? = null,
    val todayBookmarked: Boolean = false,
    val bookmarks: List<BookmarkRow> = emptyList(),
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
)
