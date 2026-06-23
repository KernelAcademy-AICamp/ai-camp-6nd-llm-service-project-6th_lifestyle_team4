package com.lifestyle.dailyscript.ui.notif

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.model.AppNotification
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.repo.FeedRepository
import com.lifestyle.dailyscript.data.repo.NotificationRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 댓글/대댓글 알림(확성기) — 상단바 배지(미읽음 수) + 알림 시트 목록을 한곳에서 관리. (PWA notif-btn 미러)
 * 액티비티 스코프(루트에서 호이스팅)라 세션이 바뀌면 [refreshUnread] 로 다시 시드한다.
 */
class NotifViewModel : ViewModel() {

    private val repo = NotificationRepository()
    private val feedRepo = FeedRepository()

    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    private val _items = MutableStateFlow<List<AppNotification>>(emptyList())
    val items: StateFlow<List<AppNotification>> = _items.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    /** 미읽음 개수 갱신(배지) — 주기 폴링/세션 변경 시. 게스트는 0. */
    fun refreshUnread(userId: Long, isAnonymous: Boolean) {
        if (isAnonymous || userId <= 0L) {
            _unread.value = 0
            return
        }
        viewModelScope.launch {
            _unread.value = runCatching { repo.unreadCount(userId) }.getOrDefault(_unread.value)
        }
    }

    /** 시트 오픈 — 목록 로드 후 전부 읽음 처리(배지 0). 게스트는 빈 목록. */
    fun open(userId: Long, isAnonymous: Boolean) {
        if (isAnonymous || userId <= 0L) {
            _items.value = emptyList()
            return
        }
        viewModelScope.launch {
            _loading.value = true
            _items.value = runCatching { repo.list(userId) }.getOrDefault(emptyList())
            _loading.value = false
            runCatching { repo.markAllRead(userId) }
            _unread.value = 0
        }
    }

    suspend fun resolvePost(postId: Long): FeedPost? =
        runCatching { feedRepo.loadPostById(postId) }.getOrNull()

    suspend fun resolveHighlight(highlightId: Long): Highlight? =
        runCatching { feedRepo.loadHighlightById(highlightId) }.getOrNull()
}
