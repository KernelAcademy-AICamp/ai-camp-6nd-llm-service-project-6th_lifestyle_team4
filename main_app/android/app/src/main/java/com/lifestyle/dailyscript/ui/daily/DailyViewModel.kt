package com.lifestyle.dailyscript.ui.daily

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.CardTheme
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.data.model.UserPrefs
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.data.repo.NoticeRepository
import com.lifestyle.dailyscript.ui.util.parseEpochMillis
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.random.Random

class DailyViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()
    private val noticeRepo = NoticeRepository()
    private val commentRepo = CommentRepository()

    private var activeUserId: Long? = null

    private val _state = MutableStateFlow(DailyState())
    val state: StateFlow<DailyState> = _state.asStateFlow()

    fun load(userId: Long, force: Boolean = false) {
        if (!force && activeUserId == userId && !_state.value.loading && _state.value.loaded) return
        activeUserId = userId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardsResult = runCatching { cardRepo.fetchAllCards() }
            val bookmarksResult = runCatching { bookmarkRepo.list(userId) }
            val noticesResult = runCatching { noticeRepo.list() }
            val countsResult = runCatching { bookmarkRepo.allCounts() }
            val commentCountsResult = runCatching { commentRepo.allCommentCounts() }
            if (activeUserId != userId) return@launch

            val cards = cardsResult.getOrDefault(emptyList())
            val bookmarks = bookmarksResult.getOrDefault(emptyList())
            // 온보딩 선호(장르·주제) — Daily OZ Pick 개인화에 사용 (PWA getPrefs()).
            val prefs = runCatching { AppPreferences.userPrefs.first() }.getOrNull()
            val ozPick = chooseOzPick(cards, bookmarks.mapNotNull { it.cards }, prefs)

            _state.value = DailyState(
                loading = false,
                loaded = true,
                allCards = cards,
                books = buildWorks(cards),
                bookmarks = bookmarks,
                notices = noticesResult.getOrDefault(emptyList()),
                bookmarkCounts = countsResult.getOrDefault(emptyMap()),
                commentCounts = commentCountsResult.getOrDefault(emptyMap()),
                prefs = prefs,
                ozPick = ozPick,
                error = listOfNotNull(
                    cardsResult.exceptionOrNull()?.message,
                    bookmarksResult.exceptionOrNull()?.message,
                    noticesResult.exceptionOrNull()?.message,
                    countsResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /**
     * Daily OZ Pick 선택 — PWA renderDailyOzPick 과 동일한 우선순위:
     *   1) 온보딩에서 고른 주제(있으면) — 카드 키워드를 [CardTheme] 분류기로 주제 집합 후 교집합.
     *      거기에 고른 장르까지 겹치면 우선.
     *   2) 없으면 북마크 취향(키워드) 매칭.
     *   3) 그래도 없으면 전체에서.
     * 하루 1개 캐시하되, 고른 주제·취향에 어긋나면 다시 뽑아 개인화 문구가 끊기지 않게 한다.
     */
    private suspend fun chooseOzPick(
        cards: List<CardDto>,
        bookmarkCards: List<CardDto>,
        prefs: UserPrefs?,
    ): CardDto? {
        if (cards.isEmpty()) return null
        val today = LocalDate.now().toString()
        val taste = bookmarkCards.flatMap { it.keywordList() }.toSet()
        val chosenThemes = if (prefs != null && !prefs.any) prefs.themes.toSet() else emptySet()
        val chosenGenres = prefs?.genres?.toSet() ?: emptySet()

        fun matchedTheme(card: CardDto): String? {
            if (chosenThemes.isEmpty()) return null
            return CardTheme.cardThemeSet(card.keywordList()).firstOrNull { it in chosenThemes }
        }

        val cached = runCatching { AppPreferences.ozDailyCardId(today) }.getOrNull()
            ?.let { id -> cards.firstOrNull { it.cardId == id } }
        if (cached != null) {
            val keep = if (chosenThemes.isNotEmpty()) matchedTheme(cached) != null
                else taste.isEmpty() || cached.keywordList().any { it in taste }
            if (keep) return cached
        }

        val pool = when {
            chosenThemes.isNotEmpty() -> {
                var matched = cards.filter { matchedTheme(it) != null }
                if (chosenGenres.isNotEmpty()) {
                    val both = matched.filter { it.works?.format in chosenGenres }
                    if (both.isNotEmpty()) matched = both // 주제+장르 둘 다 맞으면 우선
                }
                matched.ifEmpty { cards }
            }
            taste.isNotEmpty() -> cards.filter { card -> card.keywordList().any { it in taste } }.ifEmpty { cards }
            else -> cards
        }
        val pick = pool.random(Random.Default)
        runCatching { AppPreferences.setOzDailyCard(today, pick.cardId) }
        return pick
    }

    private fun buildWorks(cards: List<CardDto>): List<DailyWork> =
        cards
            .mapNotNull { card -> card.works?.let { work -> card to work } }
            .groupBy { (_, work) -> work.workId }
            .map { (workId, group) ->
                val cardList = group.map { it.first }
                val work = group.first().second
                DailyWork(
                    workId = workId,
                    key = workId.toString(),
                    work = work,
                    cards = cardList,
                    newestMillis = cardList.maxOfOrNull { parseEpochMillis(it.createdAt) ?: 0L } ?: 0L,
                )
            }
            .sortedByDescending { it.newestMillis }
}

data class DailyState(
    val loading: Boolean = true,
    val loaded: Boolean = false,
    val allCards: List<CardDto> = emptyList(),
    val books: List<DailyWork> = emptyList(),
    val bookmarks: List<BookmarkRow> = emptyList(),
    val notices: List<Notice> = emptyList(),
    val bookmarkCounts: Map<Long, Int> = emptyMap(),
    val commentCounts: Map<Long, Int> = emptyMap(),
    val prefs: UserPrefs? = null,
    val ozPick: CardDto? = null,
    val error: String? = null,
)

data class DailyWork(
    val workId: Long,
    val key: String,
    val work: WorkDto,
    val cards: List<CardDto>,
    val newestMillis: Long,
)
