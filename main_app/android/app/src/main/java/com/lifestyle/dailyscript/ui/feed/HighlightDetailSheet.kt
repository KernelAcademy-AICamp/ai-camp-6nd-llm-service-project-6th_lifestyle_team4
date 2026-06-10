package com.lifestyle.dailyscript.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.displayTitle

/**
 * 하이라이트 상세 — 밑에서 올라오는 바텀시트(FeedPostDetailSheet 미러).
 * 책표지 + 발췌(selected_text) + "명대사 읽어보기"(카드 상세로 이동) + 작성자 메모 + 댓글.
 * highlight 객체는 피드 목록에서 그대로 전달받고(재로드 X), 댓글만 ViewModel로 로드한다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HighlightDetailSheet(
    highlight: Highlight,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onDismiss: () -> Unit,
    onOpenCard: (Long) -> Unit,
) {
    val vm: HighlightDetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(highlight.highlightId) { vm.load(highlight.highlightId) }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Paper,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .imePadding(),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
        ) {
            item(key = "head") {
                Column {
                    HeaderRow(onClose = onDismiss)

                    Box(modifier = Modifier.height(16.dp))
                    HighlightContentCard(
                        highlight = highlight,
                        onOpenCard = { onOpenCard(highlight.cardId) },
                    )

                    Box(modifier = Modifier.height(20.dp))
                    AuthorRow(nickname = highlight.authorNickname, createdAt = highlight.createdAt)

                    highlight.userNote?.takeIf { it.isNotBlank() }?.let { note ->
                        Box(modifier = Modifier.height(16.dp))
                        Text(
                            text = note,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontFamily = EditorialSerif,
                                lineHeight = 28.sp,
                            ),
                            color = Espresso,
                        )
                    }

                    Box(modifier = Modifier.height(24.dp))
                    Box(Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
                    Box(modifier = Modifier.height(20.dp))

                    Text(
                        text = "댓글 ${state.comments.size}",
                        style = MaterialTheme.typography.titleMedium,
                        color = Espresso,
                    )
                    Box(modifier = Modifier.height(14.dp))

                    if (isAnonymous) {
                        Text(
                            text = "로그인 후 댓글을 남길 수 있어요.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Walnut,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        )
                    } else {
                        CommentComposer(
                            submitting = state.submitting,
                            onSubmit = { vm.submitComment(userId, myNickname, it) },
                        )
                    }

                    state.error?.let {
                        Box(modifier = Modifier.height(8.dp))
                        Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
                    }

                    Box(modifier = Modifier.height(20.dp))
                }
            }

            if (state.comments.isEmpty()) {
                item(key = "empty") {
                    Text(
                        text = "아직 댓글이 없어요. 첫 생각을 남겨보세요.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Walnut,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    )
                }
            } else {
                items(state.comments, key = { "hc-${it.commentId}" }) { c ->
                    CommentRow(
                        authorNickname = c.authorNickname,
                        body = c.body,
                        createdAt = c.createdAt,
                        isMine = c.userId == userId,
                        onDelete = { vm.deleteComment(userId, c.commentId) },
                    )
                }
            }

            item(key = "tail") { Box(modifier = Modifier.height(40.dp)) }
        }
    }
}

/** 하이라이트 카드 — 책표지 + 발췌 + 출처 + "명대사 읽어보기" 버튼(카드 상세로 이동). */
@Composable
private fun HighlightContentCard(highlight: Highlight, onOpenCard: () -> Unit) {
    val w = highlight.cards?.works
    val source = listOfNotNull(w.displayTitle().ifBlank { null }, w?.author?.ifBlank { null })
        .joinToString(" · ")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardWarm)
            .border(0.5.dp, Latte)
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BookCover(work = w, modifier = Modifier.size(width = 120.dp, height = 170.dp))
        Box(modifier = Modifier.height(22.dp))
        Text(
            text = highlight.selectedText,
            style = MaterialTheme.typography.headlineMedium.copy(
                fontFamily = EditorialSerif,
                lineHeight = 32.sp,
            ),
            color = Espresso,
            textAlign = TextAlign.Center,
        )
        if (source.isNotBlank()) {
            Box(modifier = Modifier.height(16.dp))
            Text(
                text = "— $source",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Normal,
                ),
                color = Walnut,
                textAlign = TextAlign.Center,
            )
        }
        Box(modifier = Modifier.height(24.dp))
        SharpButton(
            label = "명대사 읽어보기",
            onClick = onOpenCard,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
