package com.lifestyle.dailyscript.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import java.time.LocalDate
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
            val recent = buildRecent(recentIds)

            _state.value = HomeState(
                loading = false,
                todayCard = today,
                todayBookmarked = today != null && bookmarkCards.any { it.cardId == today.cardId },
                recent = recent,
                bookmarkCounts = loadCounts(listOfNotNull(today) + recent),
                error = listOfNotNull(
                    cardsResult.exceptionOrNull()?.message,
                    bookmarksResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /** Bookmark counts (card_id → count) for the given cards; empty on failure. */
    private suspend fun loadCounts(cards: List<CardDto>): Map<Long, Int> {
        val ids = cards.map { it.cardId }.distinct()
        return runCatching { bookmarkRepo.counts(ids) }.getOrDefault(emptyMap())
    }

    /** Refresh — non-deterministic pick excluding recently shown. Non-members are capped at 3/day. */
    fun refresh(userId: Long, isAnonymous: Boolean) {
        if (allCards.isEmpty()) { load(userId); return }
        viewModelScope.launch {
            if (isAnonymous) {
                val today = LocalDate.now().toString()
                if (AppPreferences.refreshCountToday(today) >= FREE_REFRESH_LIMIT) {
                    _state.value = _state.value.copy(
                        error = "오늘 새로고침 ${FREE_REFRESH_LIMIT}회를 모두 썼어요. 로그인하면 무제한이에요.",
                    )
                    return@launch
                }
                AppPreferences.bumpRefreshCount(today)
            }
            _state.value = _state.value.copy(loading = true, error = null)
            val tasteEnabled = AppPreferences.tasteEnabled.first()
            val recentIds = AppPreferences.recentlyShown.first()
            val pick = Recommend.pickRandom(allCards, tasteEnabled, bookmarkCards, recentIds)
            if (pick != null) AppPreferences.rememberShown(pick.cardId)
            val newRecentIds = AppPreferences.recentlyShown.first()
            val recent = buildRecent(newRecentIds)
            _state.value = _state.value.copy(
                loading = false,
                todayCard = pick,
                todayBookmarked = pick != null && bookmarkCards.any { it.cardId == pick.cardId },
                recent = recent,
                bookmarkCounts = _state.value.bookmarkCounts + loadCounts(listOfNotNull(pick) + recent),
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

    private companion object {
        const val FREE_REFRESH_LIMIT = 3
    }
}

data class HomeState(
    val loading: Boolean = true,
    val todayCard: CardDto? = null,
    val todayBookmarked: Boolean = false,
    val recent: List<CardDto> = emptyList(),
    val bookmarkCounts: Map<Long, Int> = emptyMap(),
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
)
