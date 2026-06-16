package com.lifestyle.dailyscript.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 댓글 스레드(피드 글 / 하이라이트 카드) 공용 ViewModel. 로드·작성·삭제·하트 토글·답글 로직이
 * 동일하고 데이터 소스(저장소 메서드)와 분석 이벤트만 다르므로 그 부분만 서브클래스에서 주입한다.
 * [C] = 댓글 모델 타입(FeedComment / HighlightComment). 모델에 공용 인터페이스가 없어
 * comment_id 추출은 [commentIdOf] 셀렉터로 받는다.
 */
abstract class CommentThreadViewModel<C : Any> : ViewModel() {

    private val _state = MutableStateFlow(CommentThreadState<C>())
    val state: StateFlow<CommentThreadState<C>> = _state.asStateFlow()

    private var threadId: Long = -1L

    protected abstract fun commentIdOf(comment: C): Long
    protected abstract suspend fun fetchComments(threadId: Long): List<C>
    protected abstract suspend fun fetchLikes(commentIds: List<Long>): Map<Long, Set<Long>>
    protected abstract suspend fun postComment(
        threadId: Long,
        userId: Long,
        body: String,
        nickname: String?,
        parentId: Long?,
    ): C
    protected abstract suspend fun removeComment(commentId: Long, userId: Long)
    protected abstract suspend fun putLike(commentId: Long, userId: Long, liked: Boolean)
    protected abstract fun trackSubmitted(threadId: Long, commentId: Long, isReply: Boolean)

    fun load(threadId: Long) {
        if (threadId <= 0L) return
        this.threadId = threadId
        // 새 스레드로 열릴 때 이전 댓글이 잠깐 보이지 않도록 초기화.
        _state.value = CommentThreadState(loading = true)
        viewModelScope.launch {
            val comments = runCatching { fetchComments(threadId) }.getOrDefault(emptyList())
            val likes = runCatching { fetchLikes(comments.map(::commentIdOf)) }.getOrDefault(emptyMap())
            _state.value = _state.value.copy(loading = false, comments = comments, likes = likes)
        }
    }

    fun submitComment(userId: Long, nickname: String, rawBody: String) {
        if (_state.value.submitting) return
        val body = rawBody.trim()
        if (body.isEmpty() || threadId <= 0L) return
        val parentId = _state.value.replyingTo?.let(::commentIdOf)
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching { postComment(threadId, userId, body, nickname.ifBlank { null }, parentId) }
                .onSuccess { added ->
                    val exists = _state.value.comments.any { commentIdOf(it) == commentIdOf(added) }
                    trackSubmitted(threadId, commentIdOf(added), parentId != null)
                    _state.value = _state.value.copy(
                        comments = if (exists) _state.value.comments else _state.value.comments + added,
                        submitting = false,
                        replyingTo = null,
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        submitting = false,
                        error = "댓글 작성 실패: ${error.message ?: ""}",
                    )
                }
        }
    }

    fun deleteComment(userId: Long, commentId: Long) {
        viewModelScope.launch {
            runCatching { removeComment(commentId, userId) }
                .onSuccess {
                    _state.value = _state.value.copy(
                        comments = _state.value.comments.filterNot { commentIdOf(it) == commentId },
                        replyingTo = _state.value.replyingTo?.takeIf { commentIdOf(it) != commentId },
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
        // 낙관적 갱신 후 서버 반영, 실패 시 롤백.
        val next = if (liked) current - userId else current + userId
        _state.value = _state.value.copy(likes = _state.value.likes + (commentId to next))
        viewModelScope.launch {
            runCatching { putLike(commentId, userId, !liked) }
                .onFailure {
                    _state.value = _state.value.copy(likes = _state.value.likes + (commentId to current))
                }
        }
    }

    fun startReply(comment: C) {
        _state.value = _state.value.copy(replyingTo = comment)
    }

    fun cancelReply() {
        _state.value = _state.value.copy(replyingTo = null)
    }
}

data class CommentThreadState<C>(
    val loading: Boolean = true,
    val comments: List<C> = emptyList(),
    val likes: Map<Long, Set<Long>> = emptyMap(),
    val replyingTo: C? = null,
    val submitting: Boolean = false,
    val error: String? = null,
)
