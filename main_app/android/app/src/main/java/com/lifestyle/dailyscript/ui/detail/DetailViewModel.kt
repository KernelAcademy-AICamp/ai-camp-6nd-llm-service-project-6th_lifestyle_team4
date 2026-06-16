package com.lifestyle.dailyscript.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.data.repo.FeedRepository
import com.lifestyle.dailyscript.ui.feed.FEED_TODAY
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class DetailViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()
    private val commentRepo = CommentRepository()
    private val feedRepo = FeedRepository()

    private var currentCardId = -1L

    private val _state = MutableStateFlow(DetailState())
    val state: StateFlow<DetailState> = _state.asStateFlow()

    fun load(cardId: Long, userId: Long) {
        if (cardId <= 0L) {
            _state.value = DetailState(loading = false, error = "Invalid card id.")
            return
        }
        currentCardId = cardId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val cardResult = runCatching { cardRepo.fetchCardById(cardId) }
            val bookmarkResult = runCatching { bookmarkRepo.isBookmarked(userId, cardId) }
            val count = runCatching { bookmarkRepo.counts(listOf(cardId))[cardId] }.getOrNull() ?: 0
            val fetched = cardResult.getOrNull()
            _state.value = _state.value.copy(
                loading = false,
                // 내 열람을 포함한 조회수를 즉시 표시 (DB 증가는 아래 incrementView 가 처리).
                card = fetched?.copy(viewCount = (fetched.viewCount ?: 0) + 1),
                bookmarked = bookmarkResult.getOrDefault(false),
                bookmarkCount = count,
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarkResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
            // 조회(증가 전 값 읽기) 후에 증가시켜 +1 이 정확히 한 번만 반영되게 한다. 실패는 비치명적.
            // (PWA m-app.js:3235 increment_card_view RPC.)
            runCatching { cardRepo.incrementView(cardId) }
            // PWA: 카드 15개 열람 후 1회 피드백 넛지 (bumpCardsViewed + feedbackNudgeSeen 가드).
            runCatching {
                val viewed = AppPreferences.bumpCardsViewed()
                if (viewed >= AppPreferences.FEEDBACK_NUDGE_THRESHOLD && !AppPreferences.feedbackNudgeSeen()) {
                    AppPreferences.markFeedbackNudgeSeen()
                    _state.value = _state.value.copy(showFeedbackNudge = true)
                }
            }
        }
        loadComments()
    }

    fun toggleBookmark(userId: Long) {
        val card = _state.value.card ?: return
        if (_state.value.bookmarkActionInFlight) return
        _state.value = _state.value.copy(bookmarkActionInFlight = true, error = null)
        viewModelScope.launch {
            runCatching { bookmarkRepo.toggle(userId, card.cardId) }
                .onSuccess { now ->
                    val delta = if (now) 1 else -1
                    val prefs = AppPreferences.userPrefs.first()
                    AppAnalytics.trackCard(
                        if (now) "bookmark_added" else "bookmark_removed",
                        card,
                        mapOf("source" to "detail") +
                            if (now) Recommend.matchProps(card, prefs) else emptyMap(),
                    )
                    _state.value = _state.value.copy(
                        bookmarked = now,
                        bookmarkCount = (_state.value.bookmarkCount + delta).coerceAtLeast(0),
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

    // ---------- Comments ----------
    fun loadComments() {
        val cardId = currentCardId
        if (cardId <= 0L) return
        viewModelScope.launch {
            val commentsResult = runCatching { commentRepo.loadComments(cardId) }
            val comments = commentsResult.getOrDefault(emptyList())
            val likes = runCatching { commentRepo.loadLikes(comments.map { it.commentId }) }
                .getOrDefault(emptyMap())
            _state.value = _state.value.copy(
                comments = comments,
                likes = likes,
                commentsError = commentsResult.exceptionOrNull()?.message,
            )
        }
    }

    /**
     * 당겨서 새로고침 — 댓글/좋아요만 다시 불러온다(PWA 의 댓글 Realtime 구독 대체).
     * 카드 본문은 다시 불러오지 않는다 — [load] 의 조회수 +1(incrementView) 재증가를 피하기 위함.
     */
    fun refreshComments() {
        val cardId = currentCardId
        if (cardId <= 0L || _state.value.commentsRefreshing) return
        _state.value = _state.value.copy(commentsRefreshing = true)
        viewModelScope.launch {
            val commentsResult = runCatching { commentRepo.loadComments(cardId) }
            val comments = commentsResult.getOrDefault(_state.value.comments)
            val likes = runCatching { commentRepo.loadLikes(comments.map { it.commentId }) }
                .getOrDefault(_state.value.likes)
            _state.value = _state.value.copy(
                comments = comments,
                likes = likes,
                commentsRefreshing = false,
                commentsError = commentsResult.exceptionOrNull()?.message,
            )
        }
    }

    fun setReplyTarget(comment: Comment?) {
        _state.value = _state.value.copy(replyingTo = comment)
    }

    fun startEditComment(commentId: Long) {
        _state.value = _state.value.copy(editingCommentId = commentId, replyingTo = null)
    }

    fun cancelEditComment() {
        _state.value = _state.value.copy(editingCommentId = null)
    }

    /** 내 댓글 본문 수정 (PWA saveEditComment — card_comments.update). 변경 없으면 그냥 닫는다. */
    fun editComment(userId: Long, commentId: Long, rawBody: String) {
        val body = rawBody.trim()
        if (body.isEmpty()) return
        val original = _state.value.comments.firstOrNull { it.commentId == commentId }
        if (original != null && original.body == body) {
            _state.value = _state.value.copy(editingCommentId = null)
            return
        }
        viewModelScope.launch {
            runCatching { commentRepo.updateComment(commentId, userId, body) }
                .onSuccess {
                    AppAnalytics.track("comment_edited", mapOf("card_id" to currentCardId, "comment_id" to commentId))
                    _state.value = _state.value.copy(
                        comments = _state.value.comments.map { if (it.commentId == commentId) it.copy(body = body) else it },
                        editingCommentId = null,
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(commentsError = "수정 실패: ${error.message ?: ""}")
                }
        }
    }

    fun submitComment(userId: Long, nickname: String, rawBody: String) {
        if (_state.value.commentSubmitting) return
        val body = rawBody.trim()
        if (body.isEmpty() || currentCardId <= 0L) return
        val parentId = _state.value.replyingTo?.commentId
        _state.value = _state.value.copy(commentSubmitting = true, commentsError = null)
        viewModelScope.launch {
            runCatching {
                commentRepo.addComment(currentCardId, userId, body, nickname.ifBlank { null }, parentId)
            }.onSuccess { added ->
                val exists = _state.value.comments.any { it.commentId == added.commentId }
                AppAnalytics.track(
                    "comment_submitted",
                    mapOf(
                        "card_id" to currentCardId,
                        "comment_id" to added.commentId,
                        "is_reply" to (parentId != null),
                    ),
                )
                _state.value = _state.value.copy(
                    comments = if (exists) _state.value.comments else _state.value.comments + added,
                    commentSubmitting = false,
                    replyingTo = null,
                )
            }.onFailure { error ->
                _state.value = _state.value.copy(
                    commentSubmitting = false,
                    commentsError = "댓글 작성 실패: ${error.message ?: ""}",
                )
            }
        }
    }

    fun toggleLike(userId: Long, commentId: Long) {
        val original = _state.value.likes[commentId] ?: emptySet()
        val wasLiked = userId in original
        val optimistic = if (wasLiked) original - userId else original + userId
        _state.value = _state.value.copy(likes = _state.value.likes + (commentId to optimistic))
        viewModelScope.launch {
            runCatching { commentRepo.setLike(commentId, userId, liked = !wasLiked) }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        likes = _state.value.likes + (commentId to original),
                        commentsError = "반응 처리 실패: ${error.message ?: ""}",
                    )
                }
        }
    }

    // ---------- Highlights ----------
    fun saveHighlight(
        userId: Long,
        nickname: String,
        selectedText: String,
        note: String,
        onSaved: (() -> Unit)? = null,
    ) {
        val cardId = currentCardId
        val text = selectedText.trim()
        if (text.isEmpty() || cardId <= 0L || _state.value.highlightSaving) return
        _state.value = _state.value.copy(highlightSaving = true, highlightMessage = null)
        viewModelScope.launch {
            runCatching { feedRepo.addHighlight(cardId, userId, text, note, nickname.ifBlank { null }) }
                .onSuccess {
                    _state.value.card?.let {
                        AppAnalytics.trackCard(
                            "highlight_saved",
                            it,
                            mapOf("has_note" to note.isNotBlank()),
                        )
                    }
                    _state.value = _state.value.copy(highlightSaving = false, highlightMessage = "하이라이트를 피드에 저장했어요.")
                    onSaved?.invoke()
                }
                .onFailure {
                    _state.value = _state.value.copy(highlightSaving = false, highlightMessage = "저장 실패: ${it.message ?: ""}")
                }
        }
    }

    fun consumeHighlightMessage() { _state.value = _state.value.copy(highlightMessage = null) }

    fun consumeFeedbackNudge() { _state.value = _state.value.copy(showFeedbackNudge = false) }

    // ---------- 오늘의 한줄 (feed post from detail) ----------
    fun clearFeedError() { _state.value = _state.value.copy(feedError = null) }

    /** 이 카드에 대한 오늘의 한줄 등록. 성공 시 [onPosted] (호출부에서 피드 탭 이동). */
    fun submitFeedPost(userId: Long, nickname: String, body: String, onPosted: () -> Unit) {
        if (_state.value.feedSubmitting) return
        val text = body.trim()
        if (text.isEmpty() || currentCardId <= 0L) return
        _state.value = _state.value.copy(feedSubmitting = true, feedError = null)
        viewModelScope.launch {
            runCatching { feedRepo.addPost(currentCardId, userId, text, nickname.ifBlank { null }) }
                .onSuccess {
                    // 피드 탭이 '오늘의 한줄' 카테고리로 열리게 — onPosted(탭 이동) 전에 기록.
                    AppPreferences.setFeedCategory(FEED_TODAY)
                    AppAnalytics.track(
                        "feed_post_submitted",
                        mapOf("card_id" to currentCardId, "source" to "detail"),
                    )
                    _state.value = _state.value.copy(feedSubmitting = false)
                    onPosted()
                }
                .onFailure {
                    _state.value = _state.value.copy(
                        feedSubmitting = false,
                        feedError = "등록 실패: ${it.message ?: ""}",
                    )
                }
        }
    }

    fun deleteComment(userId: Long, commentId: Long) {
        viewModelScope.launch {
            runCatching { commentRepo.deleteComment(commentId, userId) }
                .onSuccess {
                    _state.value = _state.value.copy(
                        comments = _state.value.comments.filterNot {
                            it.commentId == commentId || it.parentCommentId == commentId
                        },
                        replyingTo = _state.value.replyingTo?.takeIf { it.commentId != commentId },
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        commentsError = "삭제 실패: ${error.message ?: ""}",
                    )
                }
        }
    }
}

data class DetailState(
    val loading: Boolean = true,
    val card: CardDto? = null,
    val bookmarked: Boolean = false,
    val bookmarkCount: Int = 0,
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
    val comments: List<Comment> = emptyList(),
    val likes: Map<Long, Set<Long>> = emptyMap(),
    val commentsRefreshing: Boolean = false,
    val commentSubmitting: Boolean = false,
    val commentsError: String? = null,
    val replyingTo: Comment? = null,
    val editingCommentId: Long? = null,
    val showFeedbackNudge: Boolean = false,
    val highlightSaving: Boolean = false,
    val highlightMessage: String? = null,
    val feedSubmitting: Boolean = false,
    val feedError: String? = null,
)
