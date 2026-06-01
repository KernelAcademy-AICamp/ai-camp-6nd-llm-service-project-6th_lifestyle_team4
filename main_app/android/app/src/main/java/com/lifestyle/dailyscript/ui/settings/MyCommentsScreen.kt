package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
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
import com.lifestyle.dailyscript.data.model.MyComment
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MyCommentsViewModel : ViewModel() {
    private val repo = CommentRepository()
    private val _state = MutableStateFlow(MyCommentsState())
    val state: StateFlow<MyCommentsState> = _state.asStateFlow()

    fun load(userId: Long) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = runCatching { repo.loadByUser(userId) }
            _state.value = MyCommentsState(
                loading = false,
                comments = result.getOrDefault(emptyList()),
                error = result.exceptionOrNull()?.message,
            )
        }
    }

    fun delete(userId: Long, commentId: Long) {
        viewModelScope.launch {
            runCatching { repo.deleteComment(commentId, userId) }
                .onSuccess {
                    _state.value = _state.value.copy(comments = _state.value.comments.filterNot { it.commentId == commentId })
                }
                .onFailure { _state.value = _state.value.copy(error = "삭제 실패: ${it.message ?: ""}") }
        }
    }
}

data class MyCommentsState(
    val loading: Boolean = true,
    val comments: List<MyComment> = emptyList(),
    val error: String? = null,
)

@Composable
fun MyCommentsScreen(userId: Long, onBack: () -> Unit, onOpenCard: (Long) -> Unit) {
    val vm: MyCommentsViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        ActivityTopBar(title = "내 댓글", onBack = onBack)
        when {
            state.loading && state.comments.isEmpty() -> ActivityNote("불러오는 중⋯")
            state.error != null && state.comments.isEmpty() -> ActivityNote(state.error!!, error = true)
            state.comments.isEmpty() -> ActivityNote("아직 남긴 댓글이 없어요.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.comments, key = { it.commentId }) { c ->
                    MyCommentRow(
                        comment = c,
                        onOpen = { onOpenCard(c.cardId) },
                        onDelete = { vm.delete(userId, c.commentId) },
                    )
                }
                item { Box(modifier = Modifier.height(40.dp)) }
            }
        }
    }
}

@Composable
private fun MyCommentRow(comment: MyComment, onOpen: () -> Unit, onDelete: () -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    val w = comment.cards?.works
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
            Text(text = relativeTime(comment.createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        }
        Box(modifier = Modifier.height(8.dp))
        Text(text = comment.body, style = MaterialTheme.typography.bodyMedium, color = Espresso)
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = "삭제",
            style = MaterialTheme.typography.labelSmall,
            color = Cta,
            modifier = Modifier
                .clickable(onClick = onDelete)
                .padding(vertical = 2.dp),
        )
    }
}

@Composable
internal fun ActivityTopBar(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = "Back",
            tint = Espresso,
            modifier = Modifier.size(40.dp).clickable(onClick = onBack).padding(8.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = Espresso,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
}

@Composable
internal fun ActivityNote(text: String, error: Boolean = false) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = if (error) Cta else Walnut,
            modifier = Modifier.padding(24.dp),
        )
    }
}
