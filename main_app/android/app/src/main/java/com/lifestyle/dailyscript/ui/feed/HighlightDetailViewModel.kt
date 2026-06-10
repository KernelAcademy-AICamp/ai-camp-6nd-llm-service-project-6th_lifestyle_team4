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
        if (body.isEmpty() || highlightId <= 0L) return
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching {
                feedRepo.addHighlightComment(highlightId, userId, body, nickname.ifBlank { null })
            }.onSuccess { added ->
                val exists = _state.value.comments.any { it.commentId == added.commentId }
                AppAnalytics.track(
                    "highlight_comment_submitted",
                    mapOf("highlight_id" to highlightId, "comment_id" to added.commentId),
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
            runCatching { feedRepo.deleteHighlightComment(commentId, userId) }
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

data class HighlightDetailState(
    val loading: Boolean = true,
    val comments: List<HighlightComment> = emptyList(),
    val submitting: Boolean = false,
    val error: String? = null,
)
