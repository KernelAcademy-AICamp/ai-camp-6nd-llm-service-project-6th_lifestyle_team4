package com.lifestyle.dailyscript.ui.daily

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.data.repo.NoticeRepository
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
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
            val ozPick = chooseOzPick(cards, bookmarks.mapNotNull { it.cards })

            _state.value = DailyState(
                loading = false,
                loaded = true,
                allCards = cards,
                books = buildWorks(cards),
                bookmarks = bookmarks,
                notices = noticesResult.getOrDefault(emptyList()),
                bookmarkCounts = countsResult.getOrDefault(emptyMap()),
                commentCounts = commentCountsResult.getOrDefault(emptyMap()),
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

    private suspend fun chooseOzPick(cards: List<CardDto>, bookmarkCards: List<CardDto>): CardDto? {
        if (cards.isEmpty()) return null
        val today = LocalDate.now().toString()
        val cached = runCatching { AppPreferences.ozDailyCardId(today) }.getOrNull()
        cached?.let { id -> cards.firstOrNull { it.cardId == id } }?.let { return it }

        val taste = bookmarkCards.flatMap { it.keywordList() }.toSet()
        val matched = if (taste.isEmpty()) emptyList()
            else cards.filter { card -> card.keywordList().any { it in taste } }
        val pick = (matched.ifEmpty { cards }).random(Random.Default)
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

    private fun parseEpochMillis(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        runCatching { return OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
        runCatching { return Instant.parse(iso).toEpochMilli() }
        runCatching { return LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC).toEpochMilli() }
        return null
    }
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
