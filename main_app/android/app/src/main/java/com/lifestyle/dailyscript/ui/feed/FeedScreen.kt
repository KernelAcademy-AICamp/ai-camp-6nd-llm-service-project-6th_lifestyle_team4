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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.FeedCard
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel
import kotlin.math.absoluteValue

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
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FeedChip("오늘의 한줄", state.category == FEED_TODAY) { vm.setCategory(FEED_TODAY) }
                FeedChip("하이라이트", state.category == FEED_HIGHLIGHT) { vm.setCategory(FEED_HIGHLIGHT) }
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

// --- Leather palette for feed book mockups (fixed, theme-independent — like the archive spines). ---
private val FeedGold = Color(0xFFC9A24B)
private val FeedGoldBright = Color(0xFFE6CC82)
private val BookCream = Color(0xFFFAF8F2)
private val FeedLeathers = listOf(
    Color(0xFF0E0C0A), Color(0xFF5A2A24), Color(0xFF2F3A30), Color(0xFF293541),
    Color(0xFF6A4A30), Color(0xFF40303B), Color(0xFF3A463F), Color(0xFF1F2A3A),
    Color(0xFF4A2B1A), Color(0xFF3D2E22), Color(0xFF26393B), Color(0xFF2E2538),
)

private fun leatherColorFor(title: String?): Color {
    val key = (title ?: "").ifBlank { "?" }
    return FeedLeathers[key.hashCode().absoluteValue % FeedLeathers.size]
}

@Composable
private fun FeedChip(text: String, active: Boolean, onClick: () -> Unit) {
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

/** "오늘의 한줄" — a paper note resting on a leather book strip. */
@Composable
private fun FeedPostCard(post: FeedPost, onClick: () -> Unit) {
    val w = post.cards?.works
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(FeedCard)
            .clickable(onClick = onClick)
            .padding(start = 24.dp, top = 16.dp, end = 24.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(post.authorNickname ?: "익명", style = MaterialTheme.typography.bodySmall, color = Espresso)
            Text(relativeTime(post.createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .height(0.5.dp)
                .background(Latte),
        )
        Box(modifier = Modifier.height(14.dp))
        // paper note
        Box(
            modifier = Modifier
                .fillMaxWidth(0.80f)
                .align(Alignment.CenterHorizontally)
                .background(BookCream)
                .padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 30.dp),
        ) {
            Text(
                text = post.body,
                style = MaterialTheme.typography.bodyLarge.copy(fontFamily = EditorialSerif),
                color = Color(0xFF2C2620),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        // leather book strip, pulled up to overlap the paper bottom
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .offset(y = (-20).dp)
                .background(leatherColorFor(w?.title))
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(FeedGold),
            )
            Box(modifier = Modifier.height(8.dp))
            Text(
                text = w.displayTitle().ifBlank { "—" },
                style = MaterialTheme.typography.titleMedium.copy(fontFamily = EditorialSerif),
                color = FeedGoldBright,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** "하이라이트" — a leather book cover + the saved excerpt below. */
@Composable
private fun HighlightCard(hl: Highlight, onClick: () -> Unit) {
    val w = hl.cards?.works
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(0.5.dp, Latte)
            .background(CardWarm)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(hl.authorNickname ?: "익명", style = MaterialTheme.typography.titleMedium, color = Espresso)
        val meta = listOfNotNull(
            w?.format?.let { genreLabel(it).uppercase() },
            w.displayTitle().ifBlank { null },
        ).joinToString("  ·  ")
        if (meta.isNotBlank()) {
            Box(modifier = Modifier.height(6.dp))
            Text(meta, style = MaterialTheme.typography.labelSmall, color = Walnut, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }

        Box(modifier = Modifier.height(20.dp))
        // book cover
        Column(
            modifier = Modifier
                .size(width = 132.dp, height = 188.dp)
                .background(leatherColorFor(w?.title), RoundedCornerShape(4.dp))
                .padding(horizontal = 14.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = (w?.title ?: hl.selectedText.take(20)),
                style = MaterialTheme.typography.titleLarge.copy(fontFamily = EditorialSerif),
                color = BookCream,
                textAlign = TextAlign.Center,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
            val author = w?.author
            if (!author.isNullOrBlank()) {
                Box(modifier = Modifier.height(14.dp))
                Text(
                    text = author.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = BookCream.copy(alpha = 0.78f),
                    textAlign = TextAlign.Center,
                )
            }
        }

        Box(modifier = Modifier.height(20.dp))
        Text(
            text = "“${hl.selectedText}”",
            style = MaterialTheme.typography.bodyLarge.copy(fontFamily = EditorialSerif),
            color = Espresso,
            textAlign = TextAlign.Center,
        )
        if (!hl.userNote.isNullOrBlank()) {
            Box(modifier = Modifier.height(8.dp))
            Text(hl.userNote, style = MaterialTheme.typography.bodyMedium, color = Walnut, textAlign = TextAlign.Center)
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
