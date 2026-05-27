package com.lifestyle.dailyscript.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()

    private var allCards: List<CardDto> = emptyList()
    private var bookmarkCards: List<CardDto> = emptyList()

    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    /** Initial load — deterministic seed/taste pick for "today". */
    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardsResult = runCatching { cardRepo.fetchAllCards() }
            val bookmarksResult = runCatching { bookmarkRepo.list(userId) }
            allCards = cardsResult.getOrDefault(emptyList())
            bookmarkCards = bookmarksResult.getOrNull()?.mapNotNull { it.cards } ?: emptyList()

            val tasteEnabled = AppPreferences.tasteEnabled.first()
            val today = Recommend.pickToday(allCards, tasteEnabled, bookmarkCards)
            if (today != null) AppPreferences.rememberShown(today.cardId)
            val recentIds = AppPreferences.recentlyShown.first()

            _state.value = HomeState(
                loading = false,
                todayCard = today,
                todayBookmarked = today != null && bookmarkCards.any { it.cardId == today.cardId },
                recent = buildRecent(recentIds),
                error = listOfNotNull(
                    cardsResult.exceptionOrNull()?.message,
                    bookmarksResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /** Refresh — non-deterministic pick excluding recently shown. */
    fun refresh(userId: Long) {
        if (allCards.isEmpty()) { load(userId); return }
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val tasteEnabled = AppPreferences.tasteEnabled.first()
            val recentIds = AppPreferences.recentlyShown.first()
            val pick = Recommend.pickRandom(allCards, tasteEnabled, bookmarkCards, recentIds)
            if (pick != null) AppPreferences.rememberShown(pick.cardId)
            val newRecentIds = AppPreferences.recentlyShown.first()
            _state.value = _state.value.copy(
                loading = false,
                todayCard = pick,
                todayBookmarked = pick != null && bookmarkCards.any { it.cardId == pick.cardId },
                recent = buildRecent(newRecentIds),
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
                    val refreshed = runCatching { bookmarkRepo.list(userId) }.getOrNull()
                    if (refreshed != null) bookmarkCards = refreshed.mapNotNull { it.cards }
                    _state.value = _state.value.copy(
                        todayBookmarked = now,
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

    /** 지난 기록 — recently shown cards (newest first), excluding the current one. */
    private fun buildRecent(recentIds: List<Long>): List<CardDto> =
        recentIds.dropLast(1)        // drop the current card (always last)
            .reversed()              // newest → oldest
            .distinct()
            .take(3)
            .mapNotNull { id -> allCards.firstOrNull { it.cardId == id } }
}

data class HomeState(
    val loading: Boolean = true,
    val todayCard: CardDto? = null,
    val todayBookmarked: Boolean = false,
    val recent: List<CardDto> = emptyList(),
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
)
