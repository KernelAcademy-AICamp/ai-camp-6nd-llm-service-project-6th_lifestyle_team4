package com.lifestyle.dailyscript.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.ui.util.GENRE_ORDER
import com.lifestyle.dailyscript.ui.util.workGroupKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** One book in the library = one work, gathering all of its cards (명대사). */
data class LibraryBook(
    val workId: Long,
    // 같은 책의 중복 work 행을 series+subtitle+author 로 묶을 때 합쳐진 모든 work_id.
    // 딥링크(archiveWork)가 비대표 work_id 를 넘겨도 이 집합으로 책을 찾는다.
    val workIds: Set<Long>,
    val work: WorkDto,
    val cards: List<CardDto>,
)

data class LibraryState(
    val loading: Boolean = true,
    val books: List<LibraryBook> = emptyList(),
    val bookmarkedCardIds: Set<Long> = emptySet(),
    val error: String? = null,
)

/**
 * Whole-catalog browser: pulls the shared card page (with nested works) and folds it
 * into the unique works we have, so the library tab can show every book by genre.
 */
class LibraryViewModel : ViewModel() {
    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()
    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    private var loaded = false

    fun load(userId: Long) {
        if (loaded) return
        loaded = true
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardsResult = runCatching { cardRepo.fetchAllCards() }
            // 펼친 책 모달에서 북마크한 카드에 뱃지를 다는 데 쓰는 내 북마크 card_id 집합.
            val bookmarkedIds = runCatching { bookmarkRepo.list(userId).map { it.cardId }.toSet() }
                .getOrDefault(emptySet())
            cardsResult
                .onSuccess { cards ->
                    _state.value = LibraryState(
                        loading = false,
                        books = buildBooks(cards),
                        bookmarkedCardIds = bookmarkedIds,
                    )
                }
                .onFailure { e -> _state.value = LibraryState(loading = false, error = e.message ?: "불러오기 실패") }
        }
    }

    /**
     * Group cards into books by series + subtitle + author (NOT work_id), mirroring the PWA
     * groupAllCardsByWork — duplicate work rows of the same title fold into one book instead of
     * showing twice. Ordered by genre then title for a tidy "All" view.
     */
    private fun buildBooks(cards: List<CardDto>): List<LibraryBook> =
        cards
            .mapNotNull { card -> card.works?.let { work -> card to work } }
            .groupBy { (_, work) -> workGroupKey(work) }
            .map { (_, group) ->
                val work = group.first().second
                LibraryBook(
                    workId = work.workId,
                    workIds = group.map { it.second.workId }.toSet(),
                    work = work,
                    cards = group.map { it.first },
                )
            }
            .sortedWith(
                compareBy(
                    { book ->
                        val i = GENRE_ORDER.indexOf(book.work.format?.lowercase())
                        if (i < 0) Int.MAX_VALUE else i
                    },
                    { it.work.title },
                ),
            )
}
