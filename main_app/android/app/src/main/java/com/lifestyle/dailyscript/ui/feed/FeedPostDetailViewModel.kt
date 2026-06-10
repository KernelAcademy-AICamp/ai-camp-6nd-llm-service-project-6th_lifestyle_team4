package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.repo.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Comments for a single feed post detail sheet (post 객체는 UI가 직접 들고 있고, 댓글만 로드). */
class FeedPostDetailViewModel : ViewModel() {

    private val feedRepo = FeedRepository()

    private val _state = MutableStateFlow(FeedPostDetailState())
    val state: StateFlow<FeedPostDetailState> = _state.asStateFlow()

    private var postId: Long = -1L

    fun load(postId: Long) {
        if (postId <= 0L) return
        this.postId = postId
        // 새 글로 열릴 때 이전 글 댓글이 잠깐 보이지 않도록 초기화.
        _state.value = FeedPostDetailState(loading = true)
        viewModelScope.launch {
            val comments = runCatching { feedRepo.loadComments(postId) }.getOrDefault(emptyList())
            val likes = runCatching {
                feedRepo.loadCommentLikes(comments.map { it.commentId })
            }.getOrDefault(emptyMap())
            _state.value = _state.value.copy(
                loading = false,
                comments = comments,
                likes = likes,
            )
        }
    }

    fun submitComment(userId: Long, nickname: String, rawBody: String) {
        if (_state.value.submitting) return
        val body = rawBody.trim()
        if (body.isEmpty() || postId <= 0L) return
        val parentId = _state.value.replyingTo?.commentId
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching {
                feedRepo.addComment(postId, userId, body, nickname.ifBlank { null }, parentId)
            }.onSuccess { added ->
                val exists = _state.value.comments.any { it.commentId == added.commentId }
                AppAnalytics.track(
                    "feed_comment_submitted",
                    mapOf("post_id" to postId, "comment_id" to added.commentId, "is_reply" to (parentId != null)),
                )
                _state.value = _state.value.copy(
                    comments = if (exists) _state.value.comments else _state.value.comments + added,
                    submitting = false,
                    replyingTo = null,
                )
            }.onFailure { error ->
                _state.value = _state.value.copy(
                    submitting = false,
                    error = "댓글 작성 실패: ${error.message ?: ""}",
                )
            }
        }
    }

    fun deleteComment(userId: Long, commentId: Long) {
        viewModelScope.launch {
            runCatching { feedRepo.deleteComment(commentId, userId) }
                .onSuccess {
                    _state.value = _state.value.copy(
                        comments = _state.value.comments.filterNot { it.commentId == commentId },
                        replyingTo = _state.value.replyingTo?.takeIf { it.commentId != commentId },
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(error = "삭제 실패: ${error.message ?: ""}")
                }
        }
    }

    fun toggleLike(userId: Long, commentId: Long) {
        if (userId <= 0L) return
        val current = _state.value.likes[commentId] ?: emptySet()
        val liked = userId in current
        val next = if (liked) current - userId else current + userId
        _state.value = _state.value.copy(likes = _state.value.likes + (commentId to next))
        viewModelScope.launch {
            runCatching { feedRepo.setCommentLike(commentId, userId, !liked) }
                .onFailure {
                    _state.value = _state.value.copy(likes = _state.value.likes + (commentId to current))
                }
        }
    }

    fun startReply(comment: FeedComment) {
        _state.value = _state.value.copy(replyingTo = comment)
    }

    fun cancelReply() {
        _state.value = _state.value.copy(replyingTo = null)
    }
}

data class FeedPostDetailState(
    val loading: Boolean = true,
    val comments: List<FeedComment> = emptyList(),
    val likes: Map<Long, Set<Long>> = emptyMap(),
    val replyingTo: FeedComment? = null,
    val submitting: Boolean = false,
    val error: String? = null,
)
