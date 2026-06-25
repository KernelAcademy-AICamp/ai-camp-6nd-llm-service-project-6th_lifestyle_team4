package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.model.LIKE_FEED_POST
import com.lifestyle.dailyscript.data.model.LIKE_HIGHLIGHT
import com.lifestyle.dailyscript.data.model.LikeUi
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

    fun load(userId: Long, isAnonymous: Boolean) {
        if (loaded) return
        loaded = true
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val category = AppPreferences.feedCategory.first()
            val posts = runCatching { feedRepo.loadPosts() }
            val highlights = runCatching { feedRepo.loadHighlights() }
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.mapNotNull { it.cards } ?: emptyList()
            val (postLikes, highlightLikes) = loadLikes(userId, isAnonymous)
            _state.value = _state.value.copy(
                loading = false,
                category = category,
                posts = posts.getOrDefault(emptyList()),
                highlights = highlights.getOrDefault(emptyList()),
                bookmarkCards = bookmarks,
                postLikes = postLikes,
                highlightLikes = highlightLikes,
                error = listOfNotNull(
                    posts.exceptionOrNull()?.message,
                    highlights.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /** 당겨서 새로고침 — loaded 가드를 우회해 다시 불러온다(목록은 유지하며 인디케이터만 표시). */
    fun refresh(userId: Long, isAnonymous: Boolean) {
        if (_state.value.refreshing) return
        _state.value = _state.value.copy(refreshing = true, error = null)
        viewModelScope.launch {
            val posts = runCatching { feedRepo.loadPosts() }
            val highlights = runCatching { feedRepo.loadHighlights() }
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
                .getOrNull()?.mapNotNull { it.cards } ?: emptyList()
            val (postLikes, highlightLikes) = loadLikes(userId, isAnonymous)
            loaded = true
            _state.value = _state.value.copy(
                refreshing = false,
                posts = posts.getOrDefault(_state.value.posts),
                highlights = highlights.getOrDefault(_state.value.highlights),
                bookmarkCards = bookmarks,
                postLikes = postLikes,
                highlightLikes = highlightLikes,
                error = listOfNotNull(
                    posts.exceptionOrNull()?.message,
                    highlights.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /**
     * 좋아요 상태 로드 — 전체 카운트(content_like_counts 뷰) + 내 좋아요(content_likes).
     * 게스트는 내 좋아요를 건너뛴다(PWA loadContentLikes 와 동일). 실패해도 빈 맵으로 흡수해 목록 표시는 유지.
     */
    private suspend fun loadLikes(userId: Long, isAnonymous: Boolean): Pair<Map<Long, LikeUi>, Map<Long, LikeUi>> {
        val counts = runCatching { feedRepo.loadLikeCounts() }.getOrDefault(emptyList())
        val mine = if (isAnonymous) emptyList()
        else runCatching { feedRepo.loadMyLikes(userId) }.getOrDefault(emptyList())

        val myPost = mine.filter { it.targetType == LIKE_FEED_POST }.mapTo(mutableSetOf()) { it.targetId }
        val myHighlight = mine.filter { it.targetType == LIKE_HIGHLIGHT }.mapTo(mutableSetOf()) { it.targetId }
        val postCount = counts.filter { it.targetType == LIKE_FEED_POST }.associate { it.targetId to it.likeCount }
        val highlightCount = counts.filter { it.targetType == LIKE_HIGHLIGHT }.associate { it.targetId to it.likeCount }

        // 카운트가 있는 target + 내가 누른 target 의 합집합으로 맵 구성.
        val postLikes = (postCount.keys + myPost).associateWith { LikeUi(postCount[it] ?: 0, it in myPost) }
        val highlightLikes = (highlightCount.keys + myHighlight).associateWith { LikeUi(highlightCount[it] ?: 0, it in myHighlight) }
        return postLikes to highlightLikes
    }

    /**
     * 좋아요 토글 — 낙관적 업데이트 후 RPC. 성공하면 서버 반환값({liked,count})으로 확정, 실패하면 원복.
     * 게스트 가드는 UI(토스트)에서 처리하므로 여기선 항상 userId 가 유효하다고 가정.
     */
    fun toggleLike(userId: Long, targetType: String, targetId: Long) {
        val isPost = targetType == LIKE_FEED_POST
        val current = (if (isPost) _state.value.postLikes else _state.value.highlightLikes)[targetId] ?: LikeUi()
        val optimistic = LikeUi(
            count = (current.count + if (current.liked) -1 else 1).coerceAtLeast(0),
            liked = !current.liked,
        )
        putLike(isPost, targetId, optimistic)
        viewModelScope.launch {
            runCatching { feedRepo.toggleContentLike(userId, targetType, targetId) }
                .onSuccess { res -> putLike(isPost, targetId, LikeUi(res.count, res.liked)) }
                .onFailure { putLike(isPost, targetId, current) }
        }
    }

    private fun putLike(isPost: Boolean, targetId: Long, value: LikeUi) {
        _state.value =
            if (isPost) _state.value.copy(postLikes = _state.value.postLikes + (targetId to value))
            else _state.value.copy(highlightLikes = _state.value.highlightLikes + (targetId to value))
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
    // 콘텐츠 좋아요 (migration 043) — id → {count, liked}. 비어 있으면 카운트 0/미좋아요.
    val postLikes: Map<Long, LikeUi> = emptyMap(),
    val highlightLikes: Map<Long, LikeUi> = emptyMap(),
    val submitting: Boolean = false,
    val composeCard: CardDto? = null,
    val error: String? = null,
)
