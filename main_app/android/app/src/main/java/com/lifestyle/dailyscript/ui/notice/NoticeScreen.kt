package com.lifestyle.dailyscript.ui.notice

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun NoticeScreen(vm: NoticeViewModel) {
    val state by vm.state.collectAsState()

    // Opening the screen marks everything seen → clears the badge.
    LaunchedEffect(state.notices.size) { vm.markAllSeen() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        Box(modifier = Modifier.height(28.dp))
        Text(
            text = "공지사항",
            style = MaterialTheme.typography.displayMedium,
            color = Espresso,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        Box(modifier = Modifier.height(16.dp))

        when {
            state.loading && state.notices.isEmpty() -> CenteredNote("불러오는 중⋯")
            state.error != null && state.notices.isEmpty() -> CenteredNote(state.error!!, error = true)
            state.notices.isEmpty() -> CenteredNote("등록된 공지가 없습니다.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.notices, key = { it.noticeId }) { notice ->
                    NoticeCard(notice)
                }
                item { Box(modifier = Modifier.height(40.dp)) }
            }
        }
    }
}

@Composable
private fun NoticeCard(notice: Notice) {
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .clickable { expanded = !expanded }
            .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TagChip(notice.tag)
                if (notice.pinned) {
                    Text(text = "📌", style = MaterialTheme.typography.labelSmall)
                }
            }
            Text(
                text = relativeTime(notice.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = notice.title,
            style = MaterialTheme.typography.titleLarge,
            color = Espresso,
        )
        Box(modifier = Modifier.height(6.dp))
        Text(
            text = notice.body,
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            maxLines = if (expanded) Int.MAX_VALUE else 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TagChip(tag: String) {
    val (label, color) = when (tag) {
        "update" -> "업데이트" to Cta
        "event" -> "이벤트" to Highlight
        else -> "공지" to Walnut
    }
    val shape = RoundedCornerShape(4.dp)
    Box(
        modifier = Modifier
            .background(color, shape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = if (tag == "event") Espresso else Color.White,
        )
    }
}

@Composable
private fun CenteredNote(text: String, error: Boolean = false) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = if (error) Cta else Walnut,
            modifier = Modifier.padding(24.dp),
        )
    }
}
