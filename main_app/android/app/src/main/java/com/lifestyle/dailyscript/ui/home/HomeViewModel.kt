package com.lifestyle.dailyscript.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()
    private val commentRepo = CommentRepository()

    private var allCards: List<CardDto> = emptyList()
    private var bookmarkCards: List<CardDto> = emptyList()

    // 점수 추천의 인기도 항(card_id → bookmark_count, 뷰 전체). 화면 표시용 카운트와 별개.
    private var allBookmarkCounts: Map<Long, Int> = emptyMap()

    // card_shown 중복 발화 방지 — 홈 재진입마다 load()가 다시 돌아도 같은 카드는 1회만 집계.
    private var lastTrackedShownId: Long? = null

    // 활성 세션 식별 — VM이 액티비티 스코프라 로그아웃/로그인 도중 떠 있던 load()가
    // 늦게 끝나며 다른 사용자의 데이터로 state를 덮어쓰는 레이스를 막는다.
    private var activeUserId: Long? = null

    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    /** Initial load / screen entry — restore the last-shown card (PWA renderHome). */
    fun load(userId: Long, force: Boolean = false) {
        // 세션이 바뀌면 card_shown 중복 가드를 리셋 — PWA는 로그인 시 reload로 상태가
        // 초기화되지만 액티비티 스코프 VM은 살아남으므로 직접 초기화한다.
        if (activeUserId != userId) lastTrackedShownId = null
        // 탭 재진입 시 재요청 방지 — VM이 액티비티 스코프라 살아있으므로, 같은 세션으로 이미
        // 로드됐다면 다시 불러오지 않는다(홈 재탭 새로고침은 refresh()가 따로 담당). 세션이
        // 바뀌면 activeUserId != userId 라 통과하고, 첫 로드 실패 복구는 force=true 로 강제한다.
        if (!force && activeUserId == userId && !_state.value.loading && _state.value.loaded) return
        activeUserId = userId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardsResult = runCatching { cardRepo.fetchAllCards() }
            val bookmarksResult = runCatching { bookmarkRepo.list(userId) }
            if (activeUserId != userId) return@launch // 더 최신 세션의 load가 시작됨 — 이 결과는 폐기
            allCards = cardsResult.getOrDefault(emptyList())
            bookmarkCards = bookmarksResult.getOrNull()?.mapNotNull { it.cards } ?: emptyList()

            allBookmarkCounts = runCatching { bookmarkRepo.allCounts() }.getOrDefault(emptyMap())

            val tasteEnabled = AppPreferences.tasteEnabled.first()
            val recentIds = AppPreferences.recentlyShown.first()
            val prefs = AppPreferences.userPrefs.first()
            // Show the card the user was last looking at; a brand-new user (no queue)
            // gets a fresh pick, which we then remember as the last-shown.
            var today = Recommend.restoreLastShown(allCards, recentIds, bookmarkCards)
            var source = "restore"
            if (today == null) {
                val pick = Recommend.pickCard(allCards, prefs, tasteEnabled, bookmarkCards, recentIds, allBookmarkCounts)
                today = pick?.card
                source = pick?.source ?: "random"
                if (today != null) AppPreferences.rememberShown(today.cardId)
            }
            if (today != null && lastTrackedShownId != today.cardId) {
                AppAnalytics.track(
                    "card_shown",
                    mapOf("card_id" to today.cardId, "source" to source) + Recommend.matchProps(today, prefs),
                )
                lastTrackedShownId = today.cardId
            }
            val recent = buildRecent(AppPreferences.recentlyShown.first())
            // 댓글 수는 card_comments 집계 Map(PWA 동일) — denormalized 컬럼 대신 실제 행 수.
            val commentCounts = runCatching { commentRepo.allCommentCounts() }.getOrDefault(emptyMap())

            _state.value = HomeState(
                loading = false,
                loaded = true,
                todayCard = today,
                todayBookmarked = today != null && bookmarkCards.any { it.cardId == today.cardId },
                todayShareCount = today?.shareCount ?: 0,
                recent = recent,
                bookmarkCounts = loadCounts(listOfNotNull(today) + recent),
                commentCounts = commentCounts,
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
        if (allCards.isEmpty()) { load(userId, force = true); return } // 첫 로드 실패 복구 — 가드 우회
        viewModelScope.launch {
            // load()와 동일한 세션 가드 — 로그아웃/재로그인 직후 이전 사용자의
            // allCards/bookmarkCards/allBookmarkCounts 로 새 세션을 덮어쓰지 않게.
            if (activeUserId != userId) return@launch
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
            val prefs = AppPreferences.userPrefs.first()
            val pick = Recommend.pickCard(allCards, prefs, tasteEnabled, bookmarkCards, recentIds, allBookmarkCounts)
            val card = pick?.card
            if (card != null) {
                AppPreferences.rememberShown(card.cardId)
                AppAnalytics.trackCard(
                    "today_refreshed",
                    card,
                    mapOf("is_anonymous" to isAnonymous),
                )
                AppAnalytics.track(
                    "card_shown",
                    mapOf("card_id" to card.cardId, "source" to pick.source) + Recommend.matchProps(card, prefs),
                )
                lastTrackedShownId = card.cardId
            }
            val newRecentIds = AppPreferences.recentlyShown.first()
            val recent = buildRecent(newRecentIds)
            _state.value = _state.value.copy(
                loading = false,
                todayCard = card,
                todayBookmarked = card != null && bookmarkCards.any { it.cardId == card.cardId },
                todayShareCount = card?.shareCount ?: 0,
                recent = recent,
                bookmarkCounts = _state.value.bookmarkCounts + loadCounts(listOfNotNull(card) + recent),
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
                    val prefs = AppPreferences.userPrefs.first()
                    AppAnalytics.trackCard(
                        if (now) "bookmark_added" else "bookmark_removed",
                        card,
                        mapOf("source" to "home_today") +
                            if (now) Recommend.matchProps(card, prefs) else emptyMap(),
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
     * 공유/다운로드 후 누적 공유수 +1. PWA bumpShareCount 와 동일하게 액션당 1회 호출.
     * 037 마이그레이션(increment_share_count)이 아직 안 깔렸거나 네트워크 오류여도
     * 크래시·UI 깨짐 없이 로컬값을 유지하도록 RPC 는 runCatching 으로 감싼다.
     */
    fun onCardShared(cardId: Long) {
        val card = _state.value.todayCard ?: return
        if (card.cardId != cardId) return
        // 즉시 +1 (낙관적)
        _state.value = _state.value.copy(todayShareCount = _state.value.todayShareCount + 1)
        viewModelScope.launch {
            AppAnalytics.trackCard("card_shared", card)
            runCatching { cardRepo.incrementShareCount(cardId) }
                .onSuccess { server ->
                    // 서버 권위값으로 동기화(동시 공유로 +1 이상 올랐을 수 있음)
                    if (_state.value.todayCard?.cardId == cardId) {
                        _state.value = _state.value.copy(todayShareCount = server)
                    }
                }
            // onFailure: 로컬 +1 유지
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
    val loaded: Boolean = false,
    val todayCard: CardDto? = null,
    val todayBookmarked: Boolean = false,
    // 오늘 카드 누적 공유수 — share_count 로 시드, 공유/저장 시 낙관적 +1 (onCardShared).
    val todayShareCount: Int = 0,
    val recent: List<CardDto> = emptyList(),
    val bookmarkCounts: Map<Long, Int> = emptyMap(),
    val commentCounts: Map<Long, Int> = emptyMap(),
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
)
