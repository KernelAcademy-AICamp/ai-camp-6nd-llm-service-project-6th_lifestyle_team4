package com.lifestyle.dailyscript.ui.feed

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSans
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.formatBookmarkDate

/**
 * 피드 글("오늘의 한줄") 상세 — 밑에서 올라오는 바텀시트.
 * 명대사 인용 + "명대사 읽어보기"(카드 상세로 이동) + 작성자 본문 + 댓글.
 * post 객체는 피드 목록에서 그대로 전달받고(재로드 X), 댓글만 ViewModel로 로드한다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedPostDetailSheet(
    post: FeedPost,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onDismiss: () -> Unit,
    onOpenCard: (Long) -> Unit,
) {
    val vm: FeedPostDetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(post.postId) { vm.load(post.postId) }

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
                    QuoteCard(card = post.cards, onOpenCard = { onOpenCard(post.cardId) })

                    Box(modifier = Modifier.height(20.dp))
                    AuthorRow(nickname = post.authorNickname, createdAt = post.createdAt)

                    Box(modifier = Modifier.height(16.dp))
                    Text(
                        text = post.body,
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontFamily = EditorialSerif,
                            lineHeight = 28.sp,
                        ),
                        color = Espresso,
                    )

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
                items(state.comments, key = { "c-${it.commentId}" }) { c ->
                    CommentRow(
                        comment = c,
                        isMine = c.userId == userId,
                        onDelete = { vm.deleteComment(userId, c.commentId) },
                    )
                }
            }

            item(key = "tail") { Box(modifier = Modifier.height(40.dp)) }
        }
    }
}

/** Sheet header — "DAILY SCRIPT" label + close(X). */
@Composable
private fun HeaderRow(onClose: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "DAILY SCRIPT",
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
            color = Walnut,
        )
        Icon(
            imageVector = Icons.Filled.Close,
            contentDescription = "닫기",
            tint = Espresso,
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable(onClick = onClose)
                .padding(7.dp),
        )
    }
}

/** 명대사 카드 — 인용 + 출처 + "명대사 읽어보기" 버튼(카드 상세로 이동). */
@Composable
private fun QuoteCard(card: CardDto?, onOpenCard: () -> Unit) {
    val w = card?.works
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
        Text(
            text = Markdown.quote(card?.quote),
            style = MaterialTheme.typography.headlineMedium.copy(fontFamily = EditorialSerif),
            color = Espresso,
            textAlign = TextAlign.Center,
        )
        if (source.isNotBlank()) {
            Box(modifier = Modifier.height(16.dp))
            Text(
                text = "— $source",
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.1.em),
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

/** 작성자 줄 — 아바타 + 닉네임 + 작성일. (♡ 좋아요는 없음) */
@Composable
private fun AuthorRow(nickname: String?, createdAt: String) {
    val nick = nickname?.ifBlank { null } ?: "익명"
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.size(44.dp).clip(CircleShape).background(Latte),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Edit,
                contentDescription = null,
                tint = Walnut,
                modifier = Modifier.size(22.dp),
            )
        }
        Box(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = nick,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontFamily = EditorialSans,
                    fontWeight = FontWeight.Normal,
                ),
                color = Espresso,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(2.dp))
            Text(
                text = formatBookmarkDate(createdAt),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontFamily = EditorialSans,
                    fontWeight = FontWeight.Normal,
                ),
                color = Roast,
            )
        }
    }
}

/** 댓글 입력 — CommentsSection.CommentComposer 의 IME bring-into-view 패턴 미러(답글 없음). */
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun CommentComposer(submitting: Boolean, onSubmit: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val bringReq = remember { BringIntoViewRequester() }
    val imeBottom = WindowInsets.ime.getBottom(LocalDensity.current)
    LaunchedEffect(focused, text, imeBottom) {
        if (focused && imeBottom > 0) runCatching { bringReq.bringIntoView() }
    }
    val shape = RoundedCornerShape(8.dp)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        BasicTextField(
            value = text,
            onValueChange = { if (it.length <= 500) text = it },
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = Espresso),
            cursorBrush = SolidColor(Cta),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                if (text.isEmpty()) {
                    Text(
                        text = "이 글에 대한 생각을 남겨주세요…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Walnut,
                    )
                }
                inner()
            },
        )
    }

    Box(modifier = Modifier.height(8.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .bringIntoViewRequester(bringReq),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "${text.length} / 500",
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
        )
        SharpButton(
            label = if (submitting) "⋯" else "등록",
            onClick = {
                if (!submitting && text.isNotBlank()) {
                    onSubmit(text)
                    text = ""
                }
            },
            enabled = !submitting && text.isNotBlank(),
        )
    }
}

/** 평면 댓글 행 — 닉네임 + 상대시간 + 본문 + (본인 글이면) DELETE. 좋아요·답글 없음. */
@Composable
private fun CommentRow(comment: FeedComment, isMine: Boolean, onDelete: () -> Unit) {
    val shape = RoundedCornerShape(6.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp)
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = comment.authorNickname ?: "익명",
                style = MaterialTheme.typography.titleMedium,
                color = Espresso,
            )
            Text(
                text = relativeTime(comment.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
        Box(modifier = Modifier.height(6.dp))
        Text(
            text = comment.body,
            style = MaterialTheme.typography.bodyMedium,
            color = Espresso,
        )
        if (isMine) {
            Box(modifier = Modifier.height(8.dp))
            Text(
                text = "DELETE",
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                modifier = Modifier
                    .align(Alignment.End)
                    .clickable(onClick = onDelete),
            )
        }
    }
}
