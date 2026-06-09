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
            val comments = runCatching { feedRepo.loadComments(postId) }
            _state.value = _state.value.copy(
                loading = false,
                comments = comments.getOrDefault(emptyList()),
                error = comments.exceptionOrNull()?.message,
            )
        }
    }

    fun submitComment(userId: Long, nickname: String, rawBody: String) {
        if (_state.value.submitting) return
        val body = rawBody.trim()
        if (body.isEmpty() || postId <= 0L) return
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching {
                feedRepo.addComment(postId, userId, body, nickname.ifBlank { null })
            }.onSuccess { added ->
                val exists = _state.value.comments.any { it.commentId == added.commentId }
                AppAnalytics.track(
                    "feed_comment_submitted",
                    mapOf("post_id" to postId, "comment_id" to added.commentId),
                )
                _state.value = _state.value.copy(
                    comments = if (exists) _state.value.comments else _state.value.comments + added,
                    submitting = false,
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
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(error = "삭제 실패: ${error.message ?: ""}")
                }
        }
    }
}

data class FeedPostDetailState(
    val loading: Boolean = true,
    val comments: List<FeedComment> = emptyList(),
    val submitting: Boolean = false,
    val error: String? = null,
)
