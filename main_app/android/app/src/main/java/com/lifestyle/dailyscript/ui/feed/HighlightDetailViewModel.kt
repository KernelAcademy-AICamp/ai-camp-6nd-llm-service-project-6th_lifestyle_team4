package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.HighlightComment
import com.lifestyle.dailyscript.data.repo.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** 하이라이트 카드 상세 시트의 댓글 (FeedPostDetailViewModel 미러, highlight_id 기준). */
class HighlightDetailViewModel : ViewModel() {

    private val feedRepo = FeedRepository()

    private val _state = MutableStateFlow(HighlightDetailState())
    val state: StateFlow<HighlightDetailState> = _state.asStateFlow()

    private var highlightId: Long = -1L

    fun load(highlightId: Long) {
        if (highlightId <= 0L) return
        this.highlightId = highlightId
        // 새 하이라이트로 열릴 때 이전 댓글이 잠깐 보이지 않도록 초기화.
        _state.value = HighlightDetailState(loading = true)
        viewModelScope.launch {
            val comments = runCatching { feedRepo.loadHighlightComments(highlightId) }
                .getOrDefault(emptyList())
            val likes = runCatching {
                feedRepo.loadHighlightCommentLikes(comments.map { it.commentId })
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
        if (body.isEmpty() || highlightId <= 0L) return
        val parentId = _state.value.replyingTo?.commentId
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching {
                feedRepo.addHighlightComment(highlightId, userId, body, nickname.ifBlank { null }, parentId)
            }.onSuccess { added ->
                val exists = _state.value.comments.any { it.commentId == added.commentId }
                AppAnalytics.track(
                    "highlight_comment_submitted",
                    mapOf("highlight_id" to highlightId, "comment_id" to added.commentId, "is_reply" to (parentId != null)),
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
            runCatching { feedRepo.deleteHighlightComment(commentId, userId) }
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
        // 낙관적 갱신 후 서버 반영.
        val next = if (liked) current - userId else current + userId
        _state.value = _state.value.copy(likes = _state.value.likes + (commentId to next))
        viewModelScope.launch {
            runCatching { feedRepo.setHighlightCommentLike(commentId, userId, !liked) }
                .onFailure {
                    // 실패 시 롤백.
                    _state.value = _state.value.copy(likes = _state.value.likes + (commentId to current))
                }
        }
    }

    fun startReply(comment: HighlightComment) {
        _state.value = _state.value.copy(replyingTo = comment)
    }

    fun cancelReply() {
        _state.value = _state.value.copy(replyingTo = null)
    }
}

data class HighlightDetailState(
    val loading: Boolean = true,
    val comments: List<HighlightComment> = emptyList(),
    val likes: Map<Long, Set<Long>> = emptyMap(),
    val replyingTo: HighlightComment? = null,
    val submitting: Boolean = false,
    val error: String? = null,
)
