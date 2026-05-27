package com.lifestyle.dailyscript.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CardRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DetailViewModel : ViewModel() {

    private val cardRepo = CardRepository()
    private val bookmarkRepo = BookmarkRepository()
    private val commentRepo = CommentRepository()

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
            _state.value = _state.value.copy(
                loading = false,
                card = cardResult.getOrNull(),
                bookmarked = bookmarkResult.getOrDefault(false),
                error = listOfNotNull(
                    cardResult.exceptionOrNull()?.message,
                    bookmarkResult.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
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
                    _state.value = _state.value.copy(bookmarked = now, bookmarkActionInFlight = false)
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
    val error: String? = null,
    val bookmarkActionInFlight: Boolean = false,
    val comments: List<Comment> = emptyList(),
    val likes: Map<Long, Set<Long>> = emptyMap(),
    val commentSubmitting: Boolean = false,
    val commentsError: String? = null,
    val replyingTo: Comment? = null,
)
