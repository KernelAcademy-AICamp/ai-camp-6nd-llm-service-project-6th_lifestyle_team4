package com.lifestyle.dailyscript.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.ui.util.GENRE_ORDER
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** One book in the library = one work, gathering all of its cards (명대사). */
data class LibraryBook(
    val workId: Long,
    val work: WorkDto,
    val cards: List<CardDto>,
)

data class LibraryState(
    val loading: Boolean = true,
    val books: List<LibraryBook> = emptyList(),
    val error: String? = null,
)

/**
 * Whole-catalog browser: pulls the shared card page (with nested works) and folds it
 * into the unique works we have, so the library tab can show every book by genre.
 */
class LibraryViewModel : ViewModel() {
    private val cardRepo = CardRepository()
    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { cardRepo.fetchAllCards() }
                .onSuccess { cards -> _state.value = LibraryState(loading = false, books = buildBooks(cards)) }
                .onFailure { e -> _state.value = LibraryState(loading = false, error = e.message ?: "불러오기 실패") }
        }
    }

    /** Group cards by work → one book per work, ordered by genre then title for a tidy "All" view. */
    private fun buildBooks(cards: List<CardDto>): List<LibraryBook> =
        cards
            .filter { it.works != null }
            .groupBy { it.works!!.workId }
            .map { (workId, group) ->
                LibraryBook(workId = workId, work = group.first().works!!, cards = group)
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
