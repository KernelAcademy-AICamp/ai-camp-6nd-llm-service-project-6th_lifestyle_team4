package com.lifestyle.dailyscript.ui.ozhouse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.model.MyComment
import com.lifestyle.dailyscript.data.repo.BookmarkRepository
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.data.repo.FeedRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * OZ's house 데이터 — 벽 소품(달력·책장·액자)이 보여주는 실데이터.
 * 출석은 로컬(AppPreferences), 나머지는 기존 my탭 레포 그대로 재사용.
 */
data class OzHouseState(
    val loading: Boolean = true,
    val attendance: Set<String> = emptySet(),   // yyyy-MM-dd
    val attendCount: Int = 0,                    // 이번 달 출석 일수
    val attendStreak: Int = 0,                   // 오늘 기준 연속 출석
    val bookmarks: List<BookmarkRow> = emptyList(),
    val comments: List<MyComment> = emptyList(), // 내 댓글
    val posts: List<FeedPost> = emptyList(),     // 내 한줄 (feed_posts)
    val highlights: List<Highlight> = emptyList(),
    val error: String? = null,
)

class OzHouseViewModel : ViewModel() {
    private val bookmarkRepo = BookmarkRepository()
    private val commentRepo = CommentRepository()
    private val feedRepo = FeedRepository()

    private val _state = MutableStateFlow(OzHouseState())
    val state: StateFlow<OzHouseState> = _state.asStateFlow()

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val attendance = runCatching { AppPreferences.attendanceHistory() }.getOrDefault(emptySet())
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
            val comments = runCatching { commentRepo.loadByUser(userId) }
            val posts = runCatching { feedRepo.loadMyPosts(userId) }
            val highlights = runCatching { feedRepo.loadMyHighlights(userId) }
            val stats = attendanceStats(attendance)
            _state.value = OzHouseState(
                loading = false,
                attendance = attendance,
                attendCount = stats.first,
                attendStreak = stats.second,
                bookmarks = bookmarks.getOrDefault(emptyList()),
                comments = comments.getOrDefault(emptyList()),
                posts = posts.getOrDefault(emptyList()),
                highlights = highlights.getOrDefault(emptyList()),
                error = listOfNotNull(
                    bookmarks.exceptionOrNull()?.message,
                    comments.exceptionOrNull()?.message,
                    posts.exceptionOrNull()?.message,
                    highlights.exceptionOrNull()?.message,
                ).joinToString(" / ").ifBlank { null },
            )
        }
    }

    /** 이번 달 출석 일수 + 오늘부터 거슬러 올라간 연속 출석 일수. */
    private fun attendanceStats(history: Set<String>): Pair<Int, Int> {
        val today = LocalDate.now()
        val prefix = "%04d-%02d".format(today.year, today.monthValue)
        val count = history.count { it.startsWith(prefix) }
        var streak = 0
        var day = today
        while (history.contains(day.toString())) {
            streak++
            day = day.minusDays(1)
        }
        return count to streak
    }
}
