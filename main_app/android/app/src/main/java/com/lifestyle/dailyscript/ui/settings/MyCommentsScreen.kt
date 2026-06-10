package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.MyComment
import com.lifestyle.dailyscript.data.repo.CommentRepository
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.formatBookmarkDate
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

    fun edit(userId: Long, commentId: Long, body: String) {
        viewModelScope.launch {
            runCatching { repo.updateComment(commentId, userId, body) }
                .onSuccess {
                    _state.value = _state.value.copy(
                        comments = _state.value.comments.map {
                            if (it.commentId == commentId) it.copy(body = body) else it
                        },
                    )
                }
                .onFailure { _state.value = _state.value.copy(error = "수정 실패: ${it.message ?: ""}") }
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

    var editingId by remember { mutableStateOf<Long?>(null) }
    var draft by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<Long?>(null) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        ActivityTopBar(title = "내 댓글", onBack = onBack)
        when {
            state.loading && state.comments.isEmpty() -> ActivityNote("불러오는 중⋯")
            state.error != null && state.comments.isEmpty() -> ActivityNote(state.error!!, error = true)
            state.comments.isEmpty() -> ActivityEmpty(
                icon = Icons.Outlined.Forum,
                title = "아직 단 댓글이 없어요",
                subtitle = "명대사에 첫 댓글을 남겨보세요.",
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 20.dp),
            ) {
                items(state.comments, key = { it.commentId }) { c ->
                    MyCommentRow(
                        comment = c,
                        isEditing = editingId == c.commentId,
                        draft = draft,
                        onDraftChange = { draft = it },
                        onStartEdit = { editingId = c.commentId; draft = c.body },
                        onCancel = { editingId = null },
                        onSave = {
                            val body = draft.trim()
                            if (body.isNotEmpty()) {
                                vm.edit(userId, c.commentId, body)
                                editingId = null
                            }
                        },
                        onDelete = { pendingDelete = c.commentId },
                        onOpen = { onOpenCard(c.cardId) },
                    )
                }
                // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
                item { Box(modifier = Modifier.height(BottomBarContentInset + 24.dp)) }
            }
        }
    }

    pendingDelete?.let { id ->
        ConfirmDeleteDialog(
            message = "이 댓글을 삭제할까요?",
            onConfirm = { vm.delete(userId, id); pendingDelete = null },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun MyCommentRow(
    comment: MyComment,
    isEditing: Boolean,
    draft: String,
    onDraftChange: (String) -> Unit,
    onStartEdit: () -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onOpen: () -> Unit,
) {
    val title = comment.cards?.works?.title?.trim().orEmpty().ifBlank { "—" }
    val kindLabel = if (comment.parentCommentId != null) "↳ 답글" else "댓글"
    val meta = listOf(formatBookmarkDate(comment.createdAt), title, kindLabel)
        .filter { it.isNotBlank() }
        .joinToString("  —  ")
        .uppercase()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (!isEditing) Modifier.clickable(onClick = onOpen) else Modifier)
            .padding(vertical = 18.dp),
    ) {
        if (meta.isNotBlank()) {
            Text(
                text = meta,
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(6.dp))
        }
        if (isEditing) {
            EditorialField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = "댓글을 입력해주세요",
                minHeight = 60.dp,
                maxLength = 500,
            )
            Box(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.End),
            ) {
                LinkButton(text = "Cancel", color = Walnut, onClick = onCancel)
                LinkButton(text = "Save", color = Cta, onClick = onSave)
            }
        } else {
            Text(text = comment.body, style = MaterialTheme.typography.bodyMedium, color = Espresso)
            Box(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.End),
            ) {
                LinkButton(text = "Edit", color = Walnut, onClick = onStartEdit)
                LinkButton(text = "Delete", color = Cta, onClick = onDelete)
            }
        }
    }
    ActivityHairline()
}

// --- Shared building blocks for the "내 활동" sub-screens (also used by MyFeedScreen). ---

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
    ActivityHairline()
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

/** Centered icon + title + subtitle empty state — mirrors the PWA's *-empty blocks. */
@Composable
internal fun ActivityEmpty(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = Sand, modifier = Modifier.size(56.dp))
            Box(modifier = Modifier.height(14.dp))
            Text(text = title, style = MaterialTheme.typography.titleLarge, color = Espresso, textAlign = TextAlign.Center)
            Box(modifier = Modifier.height(6.dp))
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = Walnut, textAlign = TextAlign.Center)
        }
    }
}

@Composable
internal fun ConfirmDeleteDialog(message: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onConfirm) { Text("삭제", color = Cta) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        text = { Text(message, color = Espresso) },
        containerColor = Paper,
    )
}

/** PWA LINK_BTN_CSS — transparent, uppercase, wide tracking. */
@Composable
internal fun LinkButton(text: String, color: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.15.em),
        color = color,
        modifier = Modifier.clickable(onClick = onClick).padding(vertical = 4.dp),
    )
}

@Composable
internal fun ActivityHairline() {
    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
}
