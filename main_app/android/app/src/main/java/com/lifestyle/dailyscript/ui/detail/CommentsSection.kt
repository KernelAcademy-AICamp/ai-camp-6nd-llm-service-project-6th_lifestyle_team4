package com.lifestyle.dailyscript.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.data.model.Comment
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.max

@Composable
fun CommentsSection(
    comments: List<Comment>,
    likes: Map<Long, Set<Long>>,
    myUserId: Long,
    isAnonymous: Boolean,
    submitting: Boolean,
    replyingTo: Comment?,
    commentsError: String?,
    onSubmit: (String) -> Unit,
    onToggleLike: (Long) -> Unit,
    onDelete: (Long) -> Unit,
    onStartReply: (Comment) -> Unit,
    onCancelReply: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "READER NOTES",
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
            color = Walnut,
        )
        Box(modifier = Modifier.height(16.dp))

        if (isAnonymous) {
            Text(
                text = "로그인 후 댓글과 하트를 남길 수 있어요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            )
        } else {
            CommentComposer(
                submitting = submitting,
                replyingTo = replyingTo,
                onSubmit = onSubmit,
                onCancelReply = onCancelReply,
            )
        }

        commentsError?.let {
            Box(modifier = Modifier.height(8.dp))
            Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
        }

        Box(modifier = Modifier.height(20.dp))

        if (comments.isEmpty()) {
            Text(
                text = "아직 댓글이 없어요. 첫 감상을 남겨보세요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            )
        } else {
            groupComments(comments).forEach { (top, replies) ->
                CommentRow(
                    comment = top,
                    isReply = false,
                    likeUsers = likes[top.commentId] ?: emptySet(),
                    myUserId = myUserId,
                    isAnonymous = isAnonymous,
                    onToggleLike = onToggleLike,
                    onDelete = onDelete,
                    onReply = onStartReply,
                )
                replies.forEach { reply ->
                    CommentRow(
                        comment = reply,
                        isReply = true,
                        likeUsers = likes[reply.commentId] ?: emptySet(),
                        myUserId = myUserId,
                        isAnonymous = isAnonymous,
                        onToggleLike = onToggleLike,
                        onDelete = onDelete,
                        onReply = onStartReply,
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentComposer(
    submitting: Boolean,
    replyingTo: Comment?,
    onSubmit: (String) -> Unit,
    onCancelReply: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
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
                .heightIn(min = 48.dp),
            decorationBox = { inner ->
                if (text.isEmpty()) {
                    Text(
                        text = if (replyingTo != null) "답글을 남기세요…" else "이 명대사에 대한 생각을 남겨보세요…",
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
        modifier = Modifier.fillMaxWidth(),
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

@Composable
private fun CommentRow(
    comment: Comment,
    isReply: Boolean,
    likeUsers: Set<Long>,
    myUserId: Long,
    isAnonymous: Boolean,
    onToggleLike: (Long) -> Unit,
    onDelete: (Long) -> Unit,
    onReply: (Comment) -> Unit,
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
 * Build top-level → replies (1 level deep). A reply-of-a-reply is normalized
 * under its root top-level comment (matches the PWA flattening).
 */
private fun groupComments(list: List<Comment>): List<Pair<Comment, List<Comment>>> {
    if (list.isEmpty()) return emptyList()
    val byId = list.associateBy { it.commentId }
    fun rootOf(c: Comment): Long {
        val parentId = c.parentCommentId ?: return c.commentId
        val parent = byId[parentId]
        return parent?.parentCommentId ?: parentId
    }
    val repliesByRoot = list.filter { it.parentCommentId != null }.groupBy { rootOf(it) }
    return list.filter { it.parentCommentId == null }
        .map { top -> top to (repliesByRoot[top.commentId] ?: emptyList()) }
}

/** "방금 / N분 전 / N시간 전 / N일 전 / yyyy.MM.dd" — mirrors the PWA. */
internal fun relativeTime(iso: String): String {
    val millis = parseEpochMillis(iso) ?: return ""
    val diff = max(0L, System.currentTimeMillis() - millis)
    val min = diff / 60_000
    if (min < 1) return "방금"
    if (min < 60) return "${min}분 전"
    val hr = min / 60
    if (hr < 24) return "${hr}시간 전"
    val day = hr / 24
    if (day < 7) return "${day}일 전"
    val odt = OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneId.systemDefault())
    return "%04d.%02d.%02d".format(odt.year, odt.monthValue, odt.dayOfMonth)
}

private fun parseEpochMillis(iso: String): Long? {
    runCatching { return OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(iso).toEpochMilli() }
    runCatching {
        return LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC).toEpochMilli()
    }
    return null
}
