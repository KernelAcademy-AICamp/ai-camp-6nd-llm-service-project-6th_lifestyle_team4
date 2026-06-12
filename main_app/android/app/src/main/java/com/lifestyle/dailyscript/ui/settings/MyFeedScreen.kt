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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.data.repo.FeedRepository
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.formatBookmarkDate
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

    fun editPost(userId: Long, postId: Long, body: String) {
        viewModelScope.launch {
            runCatching { repo.updatePost(postId, userId, body) }
                .onSuccess {
                    _state.value = _state.value.copy(
                        posts = _state.value.posts.map { if (it.postId == postId) it.copy(body = body) else it },
                    )
                }
                .onFailure { _state.value = _state.value.copy(error = "수정 실패: ${it.message ?: ""}") }
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

private const val CAT_COMMENT = "comment"
private const val CAT_HIGHLIGHT = "highlight"

@Composable
fun MyFeedScreen(userId: Long, onBack: () -> Unit, onOpenCard: (Long) -> Unit) {
    val vm: MyFeedViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    var category by remember { mutableStateOf(CAT_COMMENT) }
    var editingId by remember { mutableStateOf<Long?>(null) }
    var draft by remember { mutableStateOf("") }
    var pendingDeletePost by remember { mutableStateOf<Long?>(null) }
    var pendingDeleteHl by remember { mutableStateOf<Long?>(null) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        ActivityTopBar(title = "내 피드", onBack = onBack)

        // Category chips — mirrors the PWA #myfeed-chips (ONE LINERS / HIGHLIGHT).
        Row(
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            MyFeedChip("ONE LINERS", category == CAT_COMMENT) { category = CAT_COMMENT; editingId = null }
            MyFeedChip("HIGHLIGHT", category == CAT_HIGHLIGHT) { category = CAT_HIGHLIGHT; editingId = null }
        }

        val empty = if (category == CAT_COMMENT) state.posts.isEmpty() else state.highlights.isEmpty()
        when {
            state.loading && empty -> ActivityNote("불러오는 중⋯")
            state.error != null && empty -> ActivityNote(state.error.orEmpty(), error = true)
            empty && category == CAT_COMMENT -> ActivityEmpty(
                icon = Icons.Outlined.EditNote,
                title = "아직 작성한 한줄이 없어요",
                subtitle = "피드의 + 로 나의 감상평을 남겨보세요.",
            )
            empty -> ActivityEmpty(
                icon = Icons.Outlined.AutoAwesome,
                title = "아직 만든 하이라이트가 없어요",
                subtitle = "본문을 길게 눌러 한 구절을 하이라이트해보세요.",
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 20.dp),
            ) {
                if (category == CAT_COMMENT) {
                    items(state.posts, key = { "p-${it.postId}" }) { p ->
                        MyFeedCommentRow(
                            post = p,
                            isEditing = editingId == p.postId,
                            draft = draft,
                            onDraftChange = { draft = it },
                            onStartEdit = { editingId = p.postId; draft = p.body },
                            onCancel = { editingId = null },
                            onSave = {
                                val body = draft.trim()
                                if (body.isNotEmpty()) { vm.editPost(userId, p.postId, body); editingId = null }
                            },
                            onDelete = { pendingDeletePost = p.postId },
                            onOpen = { p.cards?.let { onOpenCard(it.cardId) } },
                        )
                    }
                } else {
                    items(state.highlights, key = { "h-${it.highlightId}" }) { h ->
                        MyFeedHighlightRow(
                            highlight = h,
                            onDelete = { pendingDeleteHl = h.highlightId },
                            onOpen = { h.cards?.let { onOpenCard(it.cardId) } },
                        )
                    }
                }
                // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
                item { Box(modifier = Modifier.height(BottomBarContentInset + 24.dp)) }
            }
        }
    }

    pendingDeletePost?.let { id ->
        ConfirmDeleteDialog(
            message = "이 한줄을 삭제할까요?",
            onConfirm = { vm.deletePost(userId, id); pendingDeletePost = null },
            onDismiss = { pendingDeletePost = null },
        )
    }
    pendingDeleteHl?.let { id ->
        ConfirmDeleteDialog(
            message = "이 하이라이트를 삭제할까요?",
            onConfirm = { vm.deleteHighlight(userId, id); pendingDeleteHl = null },
            onDismiss = { pendingDeleteHl = null },
        )
    }
}

/** title (espresso) + subtitle (smaller, walnut) on one line — mirrors the PWA meta title. */
@Composable
private fun titleLine(w: WorkDto?): AnnotatedString {
    val subColor = Walnut // theme color must be read inside composition, not in the builder lambda
    return buildAnnotatedString {
        append(w?.title?.trim().orEmpty().ifBlank { "—" })
        val sub = w?.subtitle?.trim().orEmpty()
        if (sub.isNotEmpty()) {
            append("  ")
            withStyle(SpanStyle(color = subColor, fontSize = 13.sp)) { append(sub) }
        }
    }
}

private fun metaLine(w: WorkDto?, createdAt: String) =
    listOfNotNull(w?.format?.let { genreLabel(it) }, formatBookmarkDate(createdAt).ifBlank { null })
        .joinToString("  ·  ")
        .uppercase()

/** "ONE LINERS" row — a user's own 오늘의 한줄 (feed_posts), with inline edit. */
@Composable
private fun MyFeedCommentRow(
    post: FeedPost,
    isEditing: Boolean,
    draft: String,
    onDraftChange: (String) -> Unit,
    onStartEdit: () -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onOpen: () -> Unit,
) {
    val w = post.cards?.works
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (!isEditing) Modifier.clickable(onClick = onOpen) else Modifier)
            .padding(vertical = 16.dp),
    ) {
        Text(text = metaLine(w, post.createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        Box(modifier = Modifier.height(6.dp))
        Text(text = titleLine(w), style = MaterialTheme.typography.titleLarge, color = Espresso)
        Box(modifier = Modifier.height(8.dp))
        if (isEditing) {
            EditorialField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = "한줄을 입력해주세요",
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
            Text(text = post.body, style = MaterialTheme.typography.bodyMedium, color = Espresso)
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

/** "HIGHLIGHT" row — a user-saved excerpt (card_highlights), serif quote + serial no. */
@Composable
private fun MyFeedHighlightRow(highlight: Highlight, onDelete: () -> Unit, onOpen: () -> Unit) {
    val w = highlight.cards?.works
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(vertical = 16.dp),
    ) {
        Text(text = metaLine(w, highlight.createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        Box(modifier = Modifier.height(6.dp))
        Text(text = titleLine(w), style = MaterialTheme.typography.titleLarge, color = Espresso)
        Box(modifier = Modifier.height(8.dp))
        Text(
            text = "“${highlight.selectedText}”",
            style = TextStyle(fontFamily = EditorialSerif, fontSize = 15.sp, lineHeight = 28.sp),
            color = Espresso,
        )
        Box(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "#%05d".format(highlight.cardId),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.15.em),
                color = Sand,
            )
            LinkButton(text = "Delete", color = Cta, onClick = onDelete)
        }
    }
    ActivityHairline()
}

@Composable
private fun MyFeedChip(text: String, active: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Box(
        modifier = Modifier
            .background(if (active) Espresso else Paper, shape)
            .border(1.dp, if (active) Espresso else Latte, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = if (active) Paper else Walnut, maxLines = 1)
    }
}
