package com.lifestyle.dailyscript.ui.notif

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.data.model.AppNotification
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

/** kind → 알림 문구 (PWA notifRowHtml verb 맵). */
private fun notifVerb(kind: String): String = when (kind) {
    "post_comment" -> "내 감상평에 댓글을 남겼어요"
    "comment_reply" -> "내 댓글에 답글을 남겼어요"
    "highlight_comment" -> "내 하이라이트에 댓글을 남겼어요"
    "highlight_comment_reply" -> "내 하이라이트 댓글에 답글을 남겼어요"
    else -> "댓글을 남겼어요"
}

/**
 * 헤더 확성기 → 알림 목록 시트 (PWA notif-modal 미러). 항목 탭 시 [onOpen] 으로 해당
 * 피드 글/하이라이트 상세를 연다. 시트를 연 시점에 호출부가 전부 읽음 처리한다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotifSheet(
    items: List<AppNotification>,
    loading: Boolean,
    loginRequired: Boolean,
    onDismiss: () -> Unit,
    onOpen: (AppNotification) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text("알림", style = MaterialTheme.typography.headlineMedium, color = Espresso)
            Box(modifier = Modifier.height(12.dp))
            when {
                loginRequired -> CenteredNote("로그인 후 사용할 수 있어요.")
                loading && items.isEmpty() -> CenteredNote("불러오는 중⋯")
                items.isEmpty() -> CenteredNote("아직 알림이 없어요.")
                else -> LazyColumn(modifier = Modifier.heightIn(max = 480.dp)) {
                    items(items, key = { it.notificationId }) { n ->
                        NotifRow(n) { onOpen(n) }
                        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
                    }
                }
            }
        }
    }
}

@Composable
private fun NotifRow(n: AppNotification, onClick: () -> Unit) {
    val actor = n.actorNickname?.ifBlank { null } ?: "익명"
    val line = buildAnnotatedString {
        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Espresso)) { append(actor) }
        append(" 님이 ${notifVerb(n.kind)}")
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            // 미읽음은 옅은 코랄 배경(PWA rgba(216,90,48,.06)).
            .background(if (n.isRead) Paper else Cta.copy(alpha = 0.06f))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 14.dp),
    ) {
        Text(text = line, style = MaterialTheme.typography.bodyMedium, color = Walnut)
        n.bodyPreview?.ifBlank { null }?.let {
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
                maxLines = 2,
            )
        }
        Box(modifier = Modifier.height(6.dp))
        Text(
            text = relativeTime(n.createdAt),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.04.em),
            color = Walnut,
        )
    }
}

@Composable
private fun CenteredNote(text: String) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = Walnut)
    }
}
