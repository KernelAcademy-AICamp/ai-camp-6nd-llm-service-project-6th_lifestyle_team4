package com.lifestyle.dailyscript.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DetailViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()

    private val _state = MutableStateFlow(DetailState())
    val state: StateFlow<DetailState> = _state.asStateFlow()

    fun load(cardId: Long, userId: Long) {
        if (cardId <= 0L) {
            _state.value = DetailState(loading = false, error = "Invalid card id.")
            return
        }

        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardResult = runCatching { cardRepo.fetchCardById(cardId) }
            val bookmarkResult = runCatching { bookmarkRepo.isBookmarked(userId, cardId) }
            _state.value = DetailState(
                loading = false,
                card = cardResult.getOrNull(),
                bookmarked = bookmarkResult.getOrDefault(false),
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarkResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    fun toggleBookmark(userId: Long) {
        val card = _state.value.card ?: return
        if (_state.value.bookmarkActionInFlight) return
        _state.value = _state.value.copy(bookmarkActionInFlight = true, error = null)
        viewModelScope.launch {
            runCatching { bookmarkRepo.toggle(userId, card.cardId) }
                .onSuccess { now ->
                    _state.value = _state.value.copy(
                        bookmarked = now,
                        bookmarkActionInFlight = false,
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

data class DetailState(
    val loading: Boolean = true,
    val card: CardDto? = null,
    val bookmarked: Boolean = false,
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
)
