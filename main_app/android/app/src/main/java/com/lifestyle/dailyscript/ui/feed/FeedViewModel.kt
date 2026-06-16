package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
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

    // 탭 재진입 시 재요청 방지 — 표준 탭 패턴으로 VM이 복원되면 첫 로드 후 다시 불러오지 않는다.
    // (글 등록은 submitPost가 loadPosts로 직접 갱신, 세션이 바뀌면 VM 자체가 새로 생성됨)
    private var loaded = false

    fun load(userId: Long) {
        if (loaded) return
        loaded = true
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

    /** 당겨서 새로고침 — loaded 가드를 우회해 다시 불러온다(목록은 유지하며 인디케이터만 표시). */
    fun refresh(userId: Long) {
        if (_state.value.refreshing) return
        _state.value = _state.value.copy(refreshing = true, error = null)
        viewModelScope.launch {
            val posts = runCatching { feedRepo.loadPosts() }
            val highlights = runCatching { feedRepo.loadHighlights() }
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.mapNotNull { it.cards } ?: emptyList()
            loaded = true
            _state.value = _state.value.copy(
                refreshing = false,
                posts = posts.getOrDefault(_state.value.posts),
                highlights = highlights.getOrDefault(_state.value.highlights),
                bookmarkCards = bookmarks,
                error = listOfNotNull(
                    posts.exceptionOrNull()?.message,
                    highlights.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    fun setCategory(cat: String) {
        if (cat != _state.value.category) {
            AppAnalytics.track("feed_category_changed", mapOf("category" to cat))
        }
        _state.value = _state.value.copy(category = cat)
        viewModelScope.launch { AppPreferences.setFeedCategory(cat) }
    }

    /** Picked a bookmarked card for a "오늘의 한줄" — opens the compose step for it. */
    fun openComposeFor(card: CardDto) { _state.value = _state.value.copy(composeCard = card, error = null) }
    fun closeCompose() { _state.value = _state.value.copy(composeCard = null) }

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
                    AppAnalytics.track(
                        "feed_post_submitted",
                        mapOf("card_id" to cardId),
                    )
                    _state.value = _state.value.copy(
                        submitting = false,
                        composeCard = null,
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
    val refreshing: Boolean = false,
    val category: String = FEED_TODAY,
    val posts: List<FeedPost> = emptyList(),
    val highlights: List<Highlight> = emptyList(),
    val bookmarkCards: List<CardDto> = emptyList(),
    val submitting: Boolean = false,
    val composeCard: CardDto? = null,
    val error: String? = null,
)
