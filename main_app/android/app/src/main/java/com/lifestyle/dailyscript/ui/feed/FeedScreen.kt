package com.lifestyle.dailyscript.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.displayTitle

@Composable
fun FeedScreen(
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onOpenCard: (Long) -> Unit,
) {
    val vm: FeedViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.height(28.dp))
            Text(
                text = "피드",
                style = MaterialTheme.typography.displayMedium,
                color = Espresso,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Box(modifier = Modifier.height(16.dp))

            // Category tabs
            Row(
                modifier = Modifier.padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                CategoryTab("오늘의 한줄", state.category == FEED_TODAY) { vm.setCategory(FEED_TODAY) }
                CategoryTab("하이라이트", state.category == FEED_HIGHLIGHT) { vm.setCategory(FEED_HIGHLIGHT) }
            }
            Box(modifier = Modifier.height(8.dp))

            val empty = if (state.category == FEED_TODAY) state.posts.isEmpty() else state.highlights.isEmpty()
            when {
                state.loading && empty -> CenteredNote("불러오는 중⋯")
                empty -> CenteredNote(
                    if (state.category == FEED_TODAY) "아직 올라온 한줄이 없어요. 첫 글을 남겨보세요."
                    else "아직 하이라이트가 없어요. 명대사 본문을 길게 눌러 저장해보세요."
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (state.category == FEED_TODAY) {
                        items(state.posts, key = { it.postId }) { post ->
                            FeedPostCard(post, onClick = { post.cards?.let { onOpenCard(it.cardId) } })
                        }
                    } else {
                        items(state.highlights, key = { it.highlightId }) { hl ->
                            HighlightCard(hl, onClick = { hl.cards?.let { onOpenCard(it.cardId) } })
                        }
                    }
                    item { Box(modifier = Modifier.height(72.dp)) }
                }
            }
        }

        // Compose FAB (members only)
        if (!isAnonymous) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(20.dp)
                    .size(56.dp)
                    .background(Cta, RoundedCornerShape(28.dp))
                    .clickable { vm.openCompose() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Add, contentDescription = "오늘의 한줄 작성", tint = Color.White)
            }
        }
    }

    if (state.composeOpen) {
        ComposeDialog(
            bookmarkCards = state.bookmarkCards,
            submitting = state.submitting,
            error = state.error,
            onDismiss = { vm.closeCompose() },
            onSubmit = { cardId, body -> vm.submitPost(userId, myNickname, cardId, body) },
        )
    }
}

@Composable
private fun CategoryTab(label: String, active: Boolean, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleLarge,
            color = if (active) Espresso else Walnut,
        )
        Box(modifier = Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .height(2.dp)
                .size(width = 28.dp, height = 2.dp)
                .background(if (active) Cta else Color.Transparent),
        )
    }
}

@Composable
private fun FeedPostCard(post: FeedPost, onClick: () -> Unit) {
    FeedCardFrame(
        nickname = post.authorNickname ?: "익명",
        time = relativeTime(post.createdAt),
        card = post.cards,
        onClick = onClick,
    ) {
        Text(text = post.body, style = MaterialTheme.typography.bodyLarge, color = Espresso)
    }
}

@Composable
private fun HighlightCard(hl: Highlight, onClick: () -> Unit) {
    FeedCardFrame(
        nickname = hl.authorNickname ?: "익명",
        time = relativeTime(hl.createdAt),
        card = hl.cards,
        onClick = onClick,
    ) {
        Text(
            text = "“${hl.selectedText}”",
            style = MaterialTheme.typography.titleLarge.copy(fontFamily = EditorialSerif),
            color = Espresso,
        )
        if (!hl.userNote.isNullOrBlank()) {
            Box(modifier = Modifier.height(8.dp))
            Text(text = hl.userNote, style = MaterialTheme.typography.bodyMedium, color = Walnut)
        }
    }
}

@Composable
private fun FeedCardFrame(
    nickname: String,
    time: String,
    card: CardDto?,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .clickable(onClick = onClick)
            .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = nickname, style = MaterialTheme.typography.titleMedium, color = Espresso)
            Text(text = time, style = MaterialTheme.typography.labelSmall, color = Walnut)
        }
        Box(modifier = Modifier.height(10.dp))
        content()
        val meta = listOfNotNull(card?.works?.format?.uppercase(), card?.works.displayTitle().ifBlank { null })
            .joinToString("  ·  ")
        if (meta.isNotBlank()) {
            Box(modifier = Modifier.height(10.dp))
            Text(text = meta, style = MaterialTheme.typography.labelSmall, color = Walnut, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ComposeDialog(
    bookmarkCards: List<CardDto>,
    submitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (cardId: Long, body: String) -> Unit,
) {
    var selected by remember { mutableStateOf(bookmarkCards.firstOrNull()) }
    var body by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = !submitting && selected != null && body.isNotBlank(),
                onClick = { selected?.let { onSubmit(it.cardId, body) } },
            ) { Text(if (submitting) "등록 중⋯" else "등록", color = Cta) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        title = { Text("오늘의 한줄", color = Espresso) },
        text = {
            Column {
                if (bookmarkCards.isEmpty()) {
                    Text(
                        text = "북마크한 카드가 없어요. 먼저 마음에 드는 명대사를 수집해보세요.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Walnut,
                    )
                } else {
                    Text("카드 선택", style = MaterialTheme.typography.labelSmall, color = Walnut)
                    Box(modifier = Modifier.height(6.dp))
                    Box {
                        val shape = RoundedCornerShape(8.dp)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Paper, shape)
                                .border(0.5.dp, Latte, shape)
                                .clickable { expanded = true }
                                .padding(14.dp),
                        ) {
                            Text(
                                text = selected?.let { "“${it.quote}”" } ?: "카드를 선택하세요",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Espresso,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            bookmarkCards.forEach { c ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            "“${c.quote}”",
                                            color = Espresso,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    onClick = { selected = c; expanded = false },
                                )
                            }
                        }
                    }
                    Box(modifier = Modifier.height(12.dp))
                    EditorialField(
                        value = body,
                        onValueChange = { body = it },
                        placeholder = "이 명대사에 대한 한줄…",
                        minHeight = 80.dp,
                        maxLength = 300,
                    )
                    Box(modifier = Modifier.height(4.dp))
                    Text("${body.length} / 300", style = MaterialTheme.typography.labelSmall, color = Walnut)
                }
                error?.let {
                    Box(modifier = Modifier.height(8.dp))
                    Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        containerColor = Paper,
    )
}

@Composable
private fun CenteredNote(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = Walnut, modifier = Modifier.padding(24.dp))
    }
}
