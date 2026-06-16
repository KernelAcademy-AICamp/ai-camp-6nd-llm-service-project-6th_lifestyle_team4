package com.lifestyle.dailyscript.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.workGroupKey
import java.text.Collator
import java.util.Locale
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

/** 라이브러리 정렬 옵션 — 가나다순(기본) / 최신등록순. (장르순은 폐지) */
enum class LibrarySort(val label: String) {
    ALPHA("가나다순"),
    LATEST("최신등록순"),
}

private val koreanCollator: Collator = Collator.getInstance(Locale.KOREAN)

/** 선택된 정렬에 맞는 책 비교자 — 화면(사용자 선택)과 VM(기본 정렬)이 공용으로 쓴다. */
fun librarySortComparator(sort: LibrarySort): Comparator<LibraryBook> = when (sort) {
    // 가나다순 — 화면에 보이는 제목(displayTitle) 기준 한글 콜레이션(숫자·영문 혼합도 자연스럽게).
    LibrarySort.ALPHA ->
        Comparator { a, b -> koreanCollator.compare(a.work.displayTitle(), b.work.displayTitle()) }
    // 최신등록순 — 책의 카드 중 최대 card_id(=가장 최근 등록 카드). card_id 는 단조증가라 createdAt 보다 안전.
    LibrarySort.LATEST ->
        compareByDescending { book -> book.cards.maxOf { it.cardId } }
}

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
     * showing twice. 기본 정렬은 가나다순(화면에서 사용자가 최신등록순으로 바꿀 수 있음).
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
            .sortedWith(librarySortComparator(LibrarySort.ALPHA))
}
