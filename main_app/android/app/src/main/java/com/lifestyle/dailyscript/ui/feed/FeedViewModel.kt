package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

const val FEED_TODAY = "today"
const val FEED_HIGHLIGHT = "highlight"

class FeedViewModel : ViewModel() {

    private val feedRepo = FeedRepository()
    private val bookmarkRepo = BookmarkRepository()

    private val _state = MutableStateFlow(FeedState())
    val state: StateFlow<FeedState> = _state.asStateFlow()

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val category = AppPreferences.feedCategory.first()
            val posts = runCatching { feedRepo.loadPosts() }
            val highlights = runCatching { feedRepo.loadHighlights() }
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.mapNotNull { it.cards } ?: emptyList()
            _state.value = _state.value.copy(
                loading = false,
                category = category,
                posts = posts.getOrDefault(emptyList()),
                highlights = highlights.getOrDefault(emptyList()),
                bookmarkCards = bookmarks,
                error = listOfNotNull(
                    posts.exceptionOrNull()?.message,
                    highlights.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    fun setCategory(cat: String) {
        _state.value = _state.value.copy(category = cat)
        viewModelScope.launch { AppPreferences.setFeedCategory(cat) }
    }

    fun openCompose() { _state.value = _state.value.copy(composeOpen = true) }
    fun closeCompose() { _state.value = _state.value.copy(composeOpen = false) }

    fun submitPost(userId: Long, nickname: String, cardId: Long, body: String) {
        if (_state.value.submitting) return
        val text = body.trim()
        if (text.isEmpty() || cardId <= 0L) return
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching { feedRepo.addPost(cardId, userId, text, nickname.ifBlank { null }) }
                .onSuccess {
                    val posts = runCatching { feedRepo.loadPosts() }.getOrDefault(_state.value.posts)
                    AppPreferences.setFeedCategory(FEED_TODAY)
                    _state.value = _state.value.copy(
                        submitting = false,
                        composeOpen = false,
                        category = FEED_TODAY,
                        posts = posts,
                    )
                }
                .onFailure {
                    _state.value = _state.value.copy(submitting = false, error = "등록 실패: ${it.message ?: ""}")
                }
        }
    }
}

data class FeedState(
    val loading: Boolean = true,
    val category: String = FEED_TODAY,
    val posts: List<FeedPost> = emptyList(),
    val highlights: List<Highlight> = emptyList(),
    val bookmarkCards: List<CardDto> = emptyList(),
    val submitting: Boolean = false,
    val composeOpen: Boolean = false,
    val error: String? = null,
)
