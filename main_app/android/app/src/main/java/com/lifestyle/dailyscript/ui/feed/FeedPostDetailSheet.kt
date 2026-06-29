package com.lifestyle.dailyscript.ui.feed

import androidx.compose.animation.core.tween
import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.gestures.animateTo
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.model.FeedCommentLike
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
import kotlinx.coroutines.launch

/**
 * 피드 글("오늘의 한줄") 상세 — 밑에서 올라오는 바텀시트(표준 ModalBottomSheet, 0.92 고정).
 * 알림(확성기)에서 글로 바로 이동할 때 쓴다. 피드 탭에서는 [FeedPostDetailDraggableSheet] 사용.
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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Paper,
    ) {
        FeedPostDetailContent(
            post = post,
            userId = userId,
            isAnonymous = isAnonymous,
            myNickname = myNickname,
            onClose = onDismiss,
            onOpenCard = onOpenCard,
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .imePadding(),
        )
    }
}

private enum class SheetAnchor { Hidden, Rest, Full }

/**
 * 피드 탭 전용 감상평 상세 — 기본 화면 75%(Rest)만 올라오고, 상단 드래그 핸들을 잡고 위로
 * 올리면 90%(Full)까지 커진다. 아래로 내리거나 스크림/X 를 누르면 닫힌다. 표준 바텀시트의
 * 중간 멈춤이 50% 고정이라, 75%↔90% 2단 동작은 AnchoredDraggable 로 직접 구현한다.
 * 키보드/스크림/뒤로가기를 위해 포커스 가능한 Popup(메인 윈도우 인셋 상속) 안에 띄운다.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FeedPostDetailDraggableSheet(
    post: FeedPost,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onDismiss: () -> Unit,
    onOpenCard: (Long) -> Unit,
) {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val decay = rememberSplineBasedDecay<Float>()
    val dragState = remember {
        AnchoredDraggableState(
            initialValue = SheetAnchor.Hidden,
            positionalThreshold = { distance -> distance * 0.5f },
            velocityThreshold = { with(density) { 80.dp.toPx() } },
            snapAnimationSpec = tween(),
            decayAnimationSpec = decay,
        )
    }

    // 닫힘(Hidden) 위치에 안착하면 시트를 제거. 단, 한 번 열린(Rest/Full) 뒤부터만 판정한다 —
    // 시작값이 Hidden 이라 첫 방출에서 곧장 닫히는 것을 막는다.
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(dragState) {
        snapshotFlow { dragState.settledValue }.collect { v ->
            if (v != SheetAnchor.Hidden) shown = true
            else if (shown) onDismiss()
        }
    }
    val close: () -> Unit = { scope.launch { dragState.animateTo(SheetAnchor.Hidden) } }

    Popup(
        onDismissRequest = close,
        properties = PopupProperties(focusable = true, dismissOnBackPress = true),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val fullH = constraints.maxHeight.toFloat()
            // anchor 값 = 시트 top 의 y(px). Rest=25%(=75% 노출), Full=10%(=90% 노출), Hidden=화면 밖.
            val anchors = remember(fullH) {
                DraggableAnchors {
                    SheetAnchor.Full at fullH * 0.10f
                    SheetAnchor.Rest at fullH * 0.25f
                    SheetAnchor.Hidden at fullH
                }
            }
            LaunchedEffect(anchors) {
                dragState.updateAnchors(anchors)
                if (dragState.currentValue == SheetAnchor.Hidden) dragState.animateTo(SheetAnchor.Rest)
            }

            val topY = dragState.offset.let { if (it.isNaN()) fullH else it }
            val visible = (fullH - topY).coerceAtLeast(0f)

            // 스크림 — 올라온 비율만큼 짙어지고, 탭하면 닫힘(리플 없이).
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = (visible / fullH).coerceIn(0f, 1f) * 0.4f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = close,
                    ),
            )

            Surface(
                color = Paper,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(with(density) { visible.toDp() }),
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // 상단 드래그 핸들 — 여기를 잡고 위로 올리면 90%, 아래로 내리면 닫힘.
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .anchoredDraggable(dragState, Orientation.Vertical)
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(width = 32.dp, height = 4.dp)
                                .clip(CircleShape)
                                .background(Latte),
                        )
                    }
                    FeedPostDetailContent(
                        post = post,
                        userId = userId,
                        isAnonymous = isAnonymous,
                        myNickname = myNickname,
                        onClose = close,
                        onOpenCard = onOpenCard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .imePadding(),
                    )
                }
            }
        }
    }
}

/**
 * 상세 본문(명대사 인용 + "명대사 읽어보기" + 작성자 본문 + 댓글). 표준 시트와 드래그 시트가 공유.
 * post 객체는 피드 목록에서 그대로 전달받고(재로드 X), 댓글만 ViewModel로 로드한다.
 * [onClose] 는 헤더 X 버튼 동작(표준=시트 닫기, 드래그=닫힘 애니메이션).
 */
@Composable
private fun FeedPostDetailContent(
    post: FeedPost,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onClose: () -> Unit,
    onOpenCard: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: FeedPostDetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(post.postId) { vm.load(post.postId) }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        item(key = "head") {
            Column {
                HeaderRow(onClose = onClose)

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

                // 게스트는 입력창 대신 안내 문구를 댓글 목록 '아래'로 옮긴다(login-hint item).
                if (!isAnonymous) {
                    Box(modifier = Modifier.height(14.dp))
                    CommentComposer(
                        submitting = state.submitting,
                        replyingTo = state.replyingTo,
                        onSubmit = { vm.submitComment(userId, myNickname, it) },
                        onCancelReply = { vm.cancelReply() },
                    )
                    state.error?.let {
                        Box(modifier = Modifier.height(8.dp))
                        Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
                    }
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
            items(groupFeedComments(state.comments), key = { "c-${it.first.commentId}" }) { (c, isReply) ->
                FeedCommentRow(
                    comment = c,
                    isReply = isReply,
                    likeUsers = state.likes[c.commentId] ?: emptySet(),
                    myUserId = userId,
                    isAnonymous = isAnonymous,
                    onToggleLike = { vm.toggleLike(userId, it) },
                    onDelete = { vm.deleteComment(userId, it) },
                    onReply = { vm.startReply(it as FeedComment) },
                )
            }
        }

        // 댓글 목록 아래 — 게스트 안내(입력창 위에서 이리로 이동).
        if (isAnonymous) {
            item(key = "login-hint") {
                Text(
                    text = "로그인 후 댓글을 남길 수 있어요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp),
                )
            }
        }

        item(key = "tail") { Box(modifier = Modifier.height(40.dp)) }
    }
}

/** Sheet header — "DAILY SCRIPT" label + close(X). 피드 글·하이라이트 상세 공용. */
@Composable
internal fun HeaderRow(onClose: () -> Unit) {
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

/** 작성자 줄 — 아바타 + 닉네임 + 작성일. (♡ 좋아요는 없음) 피드 글·하이라이트 상세 공용. */
@Composable
internal fun AuthorRow(nickname: String?, createdAt: String) {
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

/**
 * 댓글 입력 — CommentsSection.CommentComposer 의 IME bring-into-view 패턴 미러.
 * replyingTo 가 있으면 "@닉네임 에게 답글" 헤더 + 취소를 띄우고 placeholder 도 바꾼다.
 * 피드 글·하이라이트 상세 공용.
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
internal fun CommentComposer(
    submitting: Boolean,
    replyingTo: FeedCommentLike?,
    onSubmit: (String) -> Unit,
    onCancelReply: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val bringReq = remember { BringIntoViewRequester() }
    val imeBottom = WindowInsets.ime.getBottom(LocalDensity.current)
    LaunchedEffect(focused, text, imeBottom) {
        if (focused && imeBottom > 0) runCatching { bringReq.bringIntoView() }
    }
    val shape = RoundedCornerShape(8.dp)

    if (replyingTo != null) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "↳ ${replyingTo.authorNickname ?: "익명"}에게 답글",
                style = MaterialTheme.typography.labelSmall,
                color = Cta,
            )
            Text(
                text = "취소",
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                modifier = Modifier
                    .clickable { onCancelReply() }
                    .padding(horizontal = 6.dp, vertical = 4.dp),
            )
        }
    }

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
                        text = if (replyingTo != null) "답글을 남기세요…" else "이 글에 대한 생각을 남겨주세요…",
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

/**
 * 댓글 행 — 닉네임 + 상대시간 + 본문 + 하트(좋아요 토글·카운트) + (top-level) REPLY + (본인 글) DELETE.
 * CommentsSection.CommentRow 미러. 피드 글·하이라이트 상세 공용 (FeedComment/HighlightComment 공통).
 */
@Composable
internal fun FeedCommentRow(
    comment: FeedCommentLike,
    isReply: Boolean,
    likeUsers: Set<Long>,
    myUserId: Long,
    isAnonymous: Boolean,
    onToggleLike: (Long) -> Unit,
    onDelete: (Long) -> Unit,
    onReply: (FeedCommentLike) -> Unit,
) {
    val likedByMe = myUserId in likeUsers
    val isMine = comment.userId == myUserId
    val shape = RoundedCornerShape(6.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (isReply) 24.dp else 0.dp, bottom = 10.dp)
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
                text = (if (isReply) "↳ " else "") + (comment.authorNickname ?: "익명"),
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
        Box(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (likedByMe) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = "Like",
                    tint = if (likedByMe) Cta else Walnut,
                    modifier = Modifier
                        .size(18.dp)
                        .clickable(enabled = !isAnonymous) { onToggleLike(comment.commentId) },
                )
                Text(
                    text = " ${likeUsers.size}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (likedByMe) Cta else Walnut,
                )
                if (!isReply && !isAnonymous) {
                    Text(
                        text = "REPLY",
                        style = MaterialTheme.typography.labelSmall,
                        color = Walnut,
                        modifier = Modifier
                            .padding(start = 16.dp)
                            .clickable { onReply(comment) },
                    )
                }
            }
            if (isMine) {
                Text(
                    text = "DELETE",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    modifier = Modifier.clickable { onDelete(comment.commentId) },
                )
            }
        }
    }
}

/**
 * top-level → 답글(1단 깊이) 평탄화. 답글의 답글은 루트 top-level 아래로 정규화(PWA 동일).
 * 반환: (댓글, isReply) 순서 리스트 — top 바로 뒤에 그 답글들이 온다.
 */
internal fun groupFeedComments(list: List<FeedCommentLike>): List<Pair<FeedCommentLike, Boolean>> {
    if (list.isEmpty()) return emptyList()
    val byId = list.associateBy { it.commentId }
    fun rootOf(c: FeedCommentLike): Long {
        val parentId = c.parentCommentId ?: return c.commentId
        val parent = byId[parentId]
        return parent?.parentCommentId ?: parentId
    }
    val repliesByRoot = list.filter { it.parentCommentId != null }.groupBy { rootOf(it) }
    val out = mutableListOf<Pair<FeedCommentLike, Boolean>>()
    list.filter { it.parentCommentId == null }.forEach { top ->
        out += top to false
        (repliesByRoot[top.commentId] ?: emptyList()).forEach { reply -> out += reply to true }
    }
    return out
}
