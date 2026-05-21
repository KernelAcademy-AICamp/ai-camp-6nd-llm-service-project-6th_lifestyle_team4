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
            val cardIsBookmarked = card?.cardId?.let { id ->
                runCatching { bookmarkRepo.isBookmarked(userId, id) }.getOrDefault(false)
            } ?: false
            _state.value = HomeState(
                loading = false,
                todayCard = card,
                todayBookmarked = cardIsBookmarked,
                bookmarks = bookmarksResult.getOrDefault(emptyList()),
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarksResult.exceptionOrNull()?.message,
                ).joinToString(" • ").ifBlank { null },
            )
        }
    }

    fun toggleTodayBookmark(userId: Long) {
        val card = _state.value.todayCard ?: return
        viewModelScope.launch {
            runCatching { bookmarkRepo.toggle(userId, card.cardId) }
                .onSuccess { now ->
                    val refreshed = runCatching { bookmarkRepo.list(userId) }.getOrDefault(_state.value.bookmarks)
                    _state.value = _state.value.copy(todayBookmarked = now, bookmarks = refreshed)
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
)
