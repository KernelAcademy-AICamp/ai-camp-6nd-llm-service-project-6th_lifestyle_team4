package com.lifestyle.dailyscript.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
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

    // 활성 세션 식별 — VM이 액티비티 스코프라 로그아웃/로그인 도중 떠 있던 load()가
    // 늦게 끝나며 다른 사용자의 데이터로 state를 덮어쓰는 레이스를 막는다.
    private var activeUserId: Long? = null

    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    /** Initial load / screen entry — restore the last-shown card (PWA renderHome). */
    fun load(userId: Long) {
        activeUserId = userId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardsResult = runCatching { cardRepo.fetchAllCards() }
            val bookmarksResult = runCatching { bookmarkRepo.list(userId) }
            if (activeUserId != userId) return@launch // 더 최신 세션의 load가 시작됨 — 이 결과는 폐기
            allCards = cardsResult.getOrDefault(emptyList())
            bookmarkCards = bookmarksResult.getOrNull()?.mapNotNull { it.cards } ?: emptyList()

            val tasteEnabled = AppPreferences.tasteEnabled.first()
            val recentIds = AppPreferences.recentlyShown.first()
            // Show the card the user was last looking at; a brand-new user (no queue)
            // gets a random pick, which we then remember as the last-shown.
            var today = Recommend.restoreLastShown(allCards, recentIds, bookmarkCards)
            if (today == null) {
                today = Recommend.pickRandom(allCards, tasteEnabled, bookmarkCards, recentIds)
                if (today != null) AppPreferences.rememberShown(today.cardId)
            }
            val recent = buildRecent(AppPreferences.recentlyShown.first())

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
        if (_state.value.loading) return // 진행 중이면 무시 — 연타로 중복 새로고침/카운트 차감 방지
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
            if (pick != null) {
                AppPreferences.rememberShown(pick.cardId)
                AppAnalytics.trackCard(
                    "today_refreshed",
                    pick,
                    mapOf("is_anonymous" to isAnonymous),
                )
            }
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
                    AppAnalytics.trackCard(
                        if (now) "bookmark_added" else "bookmark_removed",
                        card,
                        mapOf("source" to "home_today"),
                    )
                    val delta = if (now) 1 else -1
                    val newCount = ((_state.value.bookmarkCounts[card.cardId] ?: 0) + delta).coerceAtLeast(0)
                    _state.value = _state.value.copy(
                        todayBookmarked = now,
                        bookmarkCounts = _state.value.bookmarkCounts + (card.cardId to newCount),
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

    /**
     * 오늘 카드 열람 즉시 홈의 조회수를 +1 선반영 — 상세 진입/복귀 시 숫자 깜빡임 없이 매끄럽게.
     * 실제 DB 증가는 상세의 incrementView 가 처리하고, 복귀 시 load() 재조회가 최종값으로 맞춘다.
     */
    fun markTodayViewed() {
        val card = _state.value.todayCard ?: return
        _state.value = _state.value.copy(
            todayCard = card.copy(viewCount = (card.viewCount ?: 0) + 1),
        )
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
