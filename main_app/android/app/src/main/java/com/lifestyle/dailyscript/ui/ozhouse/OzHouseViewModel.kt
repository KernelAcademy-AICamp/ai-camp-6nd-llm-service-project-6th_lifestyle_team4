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
    // 꾸미기 상태 (로컬 보존)
    val nightMode: String = "auto",   // "auto" | "day" | "night"
    val theme: String = "default",
    val sofa: String = "cream",
    val rug: String = "coral",
    val tower: String = "tall",
    val catPositions: Map<Int, Pair<Float, Float>> = emptyMap(), // 포즈 index → (중심x, 중심y) 비율; 없으면 프리셋
    // 가구 드래그 위치(중심 비율; -1f=프리셋)
    val sofaX: Float = -1f, val sofaY: Float = -1f,
    val rugX: Float = -1f, val rugY: Float = -1f,
    val towerX: Float = -1f, val towerY: Float = -1f,
    val purchasedThemes: Set<String> = setOf("default"), // 구매(보유)한 테마 id
)

class OzHouseViewModel : ViewModel() {
    private val bookmarkRepo = BookmarkRepository()
    private val commentRepo = CommentRepository()
    private val feedRepo = FeedRepository()

    private val _state = MutableStateFlow(seedState())
    val state: StateFlow<OzHouseState> = _state.asStateFlow()

    /**
     * 진입 시 첫 프레임부터 저장된 꾸미기를 그리도록, 동기 캐시로 초기 상태를 미리 채운다.
     * 캐시가 없으면(콜드 스타트) 기본값으로 시작하고 [load]가 디스크에서 채운다.
     * 벽 소품 실데이터(북마크 등)는 캐시 대상이 아니므로 그대로 loading 상태로 둔다.
     */
    private fun seedState(): OzHouseState {
        val d = AppPreferences.cachedOzDecor() ?: return OzHouseState()
        return OzHouseState(
            loading = true,
            nightMode = d.night, theme = d.theme, sofa = d.sofa, rug = d.rug, tower = d.tower,
            catPositions = d.catPositions,
            sofaX = d.sofaX, sofaY = d.sofaY, rugX = d.rugX, rugY = d.rugY,
            towerX = d.towerX, towerY = d.towerY,
        )
    }

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val attendance = runCatching { AppPreferences.attendanceHistory() }.getOrDefault(emptySet())
            val bookmarks = runCatching { bookmarkRepo.list(userId) }
            val comments = runCatching { commentRepo.loadByUser(userId) }
            val posts = runCatching { feedRepo.loadMyPosts(userId) }
            val highlights = runCatching { feedRepo.loadMyHighlights(userId) }
            val decor = runCatching { AppPreferences.ozDecor() }.getOrNull()
            val purchased = runCatching { AppPreferences.ozPurchasedThemes() }.getOrDefault(setOf("default"))
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
                nightMode = decor?.night ?: "auto",
                theme = decor?.theme ?: "default",
                sofa = decor?.sofa ?: "cream",
                rug = decor?.rug ?: "coral",
                tower = decor?.tower ?: "tall",
                catPositions = decor?.catPositions ?: emptyMap(),
                sofaX = decor?.sofaX ?: -1f, sofaY = decor?.sofaY ?: -1f,
                rugX = decor?.rugX ?: -1f, rugY = decor?.rugY ?: -1f,
                towerX = decor?.towerX ?: -1f, towerY = decor?.towerY ?: -1f,
                purchasedThemes = purchased,
            )
        }
    }

    // ── 꾸미기 setters — 상태 즉시 반영 + 로컬 보존 ──
    fun setNightMode(value: String) {
        _state.value = _state.value.copy(nightMode = value)
        viewModelScope.launch { AppPreferences.setOzNight(value) }
    }

    /** 보유한 테마로 전환(미보유 비-default 테마는 무시 — 구매는 [purchaseTheme]). */
    fun setTheme(value: String) {
        if (value != "default" && value !in _state.value.purchasedThemes) return
        _state.value = _state.value.copy(theme = value)
        viewModelScope.launch { AppPreferences.setOzTheme(value) }
    }

    /**
     * 테마 구매 확정 — 구매 기록을 로컬에 남기고 즉시 적용한다.
     * 서버 실타래 차감은 호출 전에 [com.lifestyle.dailyscript.ui.yarn.YarnViewModel.spend]
     * (spend_yarn RPC) 으로 끝내고, 성공(SUCCESS)했을 때만 이 메서드를 호출한다.
     */
    fun purchaseTheme(value: String) {
        val owned = _state.value.purchasedThemes + value
        _state.value = _state.value.copy(purchasedThemes = owned, theme = value)
        viewModelScope.launch {
            AppPreferences.addOzPurchasedTheme(value)
            AppPreferences.setOzTheme(value)
        }
    }

    fun setSofa(value: String) {
        _state.value = _state.value.copy(sofa = value)
        viewModelScope.launch { AppPreferences.setOzSofa(value) }
    }

    fun setRug(value: String) {
        _state.value = _state.value.copy(rug = value)
        viewModelScope.launch { AppPreferences.setOzRug(value) }
    }

    fun setTower(value: String) {
        _state.value = _state.value.copy(tower = value)
        viewModelScope.launch { AppPreferences.setOzTower(value) }
    }

    /** 드래그 종료 시 호출 — 해당 포즈(pose) 슬롯의 위치(비율)만 갱신(다른 포즈는 유지). */
    fun setCatPos(pose: Int, x: Float, y: Float) {
        _state.value = _state.value.copy(catPositions = _state.value.catPositions + (pose to (x to y)))
        viewModelScope.launch { AppPreferences.setOzCatPos(pose, x, y) }
    }

    // ── 가구 드래그 위치 보존 (중심 비율) ──
    fun setSofaPos(x: Float, y: Float) {
        _state.value = _state.value.copy(sofaX = x, sofaY = y)
        viewModelScope.launch { AppPreferences.setOzSofaPos(x, y) }
    }

    fun setRugPos(x: Float, y: Float) {
        _state.value = _state.value.copy(rugX = x, rugY = y)
        viewModelScope.launch { AppPreferences.setOzRugPos(x, y) }
    }

    fun setTowerPos(x: Float, y: Float) {
        _state.value = _state.value.copy(towerX = x, towerY = y)
        viewModelScope.launch { AppPreferences.setOzTowerPos(x, y) }
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
