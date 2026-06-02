package com.lifestyle.dailyscript.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.data.repo.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
            _state.value = _state.value.copy(
                loading = false,
                card = cardResult.getOrNull(),
                bookmarked = bookmarkResult.getOrDefault(false),
                bookmarkCount = count,
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarkResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
        // Fire-and-forget view increment (mirrors PWA m-app.js:3235). Failure is non-fatal.
        viewModelScope.launch { runCatching { cardRepo.incrementView(cardId) } }
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

    fun setReplyTarget(comment: Comment?) {
        _state.value = _state.value.copy(replyingTo = comment)
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
                    _state.value = _state.value.copy(highlightSaving = false, highlightMessage = "하이라이트를 피드에 저장했어요.")
                    onSaved?.invoke()
                }
                .onFailure {
                    _state.value = _state.value.copy(highlightSaving = false, highlightMessage = "저장 실패: ${it.message ?: ""}")
                }
        }
    }

    fun consumeHighlightMessage() { _state.value = _state.value.copy(highlightMessage = null) }

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
    val commentSubmitting: Boolean = false,
    val commentsError: String? = null,
    val replyingTo: Comment? = null,
    val highlightSaving: Boolean = false,
    val highlightMessage: String? = null,
)
