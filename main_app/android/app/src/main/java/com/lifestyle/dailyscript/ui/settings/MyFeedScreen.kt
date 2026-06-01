package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.repo.FeedRepository
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MyFeedViewModel : ViewModel() {
    private val repo = FeedRepository()
    private val _state = MutableStateFlow(MyFeedState())
    val state: StateFlow<MyFeedState> = _state.asStateFlow()

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val posts = runCatching { repo.loadMyPosts(userId) }
            val hls = runCatching { repo.loadMyHighlights(userId) }
            _state.value = MyFeedState(
                loading = false,
                posts = posts.getOrDefault(emptyList()),
                highlights = hls.getOrDefault(emptyList()),
                error = listOfNotNull(posts.exceptionOrNull()?.message, hls.exceptionOrNull()?.message)
                    .joinToString(" / ").ifBlank { null },
            )
        }
    }

    fun deletePost(userId: Long, postId: Long) {
        viewModelScope.launch {
            runCatching { repo.deletePost(postId, userId) }
                .onSuccess { _state.value = _state.value.copy(posts = _state.value.posts.filterNot { it.postId == postId }) }
                .onFailure { _state.value = _state.value.copy(error = "삭제 실패: ${it.message ?: ""}") }
        }
    }

    fun deleteHighlight(userId: Long, highlightId: Long) {
        viewModelScope.launch {
            runCatching { repo.deleteHighlight(highlightId, userId) }
                .onSuccess { _state.value = _state.value.copy(highlights = _state.value.highlights.filterNot { it.highlightId == highlightId }) }
                .onFailure { _state.value = _state.value.copy(error = "삭제 실패: ${it.message ?: ""}") }
        }
    }
}

data class MyFeedState(
    val loading: Boolean = true,
    val posts: List<FeedPost> = emptyList(),
    val highlights: List<Highlight> = emptyList(),
    val error: String? = null,
)

@Composable
fun MyFeedScreen(userId: Long, onBack: () -> Unit, onOpenCard: (Long) -> Unit) {
    val vm: MyFeedViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        ActivityTopBar(title = "내 피드", onBack = onBack)
        val empty = state.posts.isEmpty() && state.highlights.isEmpty()
        when {
            state.loading && empty -> ActivityNote("불러오는 중⋯")
            state.error != null && empty -> ActivityNote(state.error!!, error = true)
            empty -> ActivityNote("아직 공유한 한 줄이나 하이라이트가 없어요.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.posts.isNotEmpty()) {
                    item(key = "h-today") { SectionHeader("오늘의 한줄") }
                    items(state.posts, key = { "p-${it.postId}" }) { p ->
                        MyFeedRow(
                            card = p.cards,
                            time = relativeTime(p.createdAt),
                            body = p.body,
                            serif = false,
                            onOpen = { p.cards?.let { onOpenCard(it.cardId) } },
                            onDelete = { vm.deletePost(userId, p.postId) },
                        )
                    }
                }
                if (state.highlights.isNotEmpty()) {
                    item(key = "h-hl") { SectionHeader("하이라이트") }
                    items(state.highlights, key = { "h-${it.highlightId}" }) { h ->
                        MyFeedRow(
                            card = h.cards,
                            time = relativeTime(h.createdAt),
                            body = "“${h.selectedText}”",
                            serif = true,
                            onOpen = { h.cards?.let { onOpenCard(it.cardId) } },
                            onDelete = { vm.deleteHighlight(userId, h.highlightId) },
                        )
                    }
                }
                item { Box(modifier = Modifier.height(40.dp)) }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = Walnut,
        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
    )
}

@Composable
private fun MyFeedRow(
    card: CardDto?,
    time: String,
    body: String,
    serif: Boolean,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    val w = card?.works
    val meta = listOfNotNull(w?.format?.let { genreLabel(it) }, w.displayTitle().ifBlank { null })
        .joinToString("  ·  ").uppercase()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardWarm, shape)
            .border(0.5.dp, Latte, shape)
            .clickable(onClick = onOpen)
            .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = meta.ifBlank { "—" },
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(text = time, style = MaterialTheme.typography.labelSmall, color = Walnut)
        }
        Box(modifier = Modifier.height(8.dp))
        Text(
            text = body,
            style = if (serif) MaterialTheme.typography.bodyLarge.copy(fontFamily = EditorialSerif)
            else MaterialTheme.typography.bodyMedium,
            color = Espresso,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
        )
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = "삭제",
            style = MaterialTheme.typography.labelSmall,
            color = Cta,
            modifier = Modifier.clickable(onClick = onDelete).padding(vertical = 2.dp),
        )
    }
}
