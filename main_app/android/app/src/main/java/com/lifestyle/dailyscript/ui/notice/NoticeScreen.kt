package com.lifestyle.dailyscript.ui.notice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown

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
            state.error != null && state.notices.isEmpty() -> CenteredNote(state.error.orEmpty(), error = true)
            state.notices.isEmpty() -> CenteredNote("등록된 공지가 없습니다.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.notices, key = { it.noticeId }) { notice ->
                    NoticeCard(notice)
                }
                // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
                item { Box(modifier = Modifier.height(BottomBarContentInset + 24.dp)) }
            }
        }
    }
}

@Composable
private fun NoticeCard(notice: Notice) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardWarm, shape)
            .border(0.5.dp, Latte, shape)
            .padding(horizontal = 18.dp, vertical = 20.dp),
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
        Box(modifier = Modifier.height(12.dp))
        Text(
            text = notice.title,
            style = MaterialTheme.typography.titleLarge,
            color = Espresso,
        )
        Box(modifier = Modifier.height(10.dp))
        NoticeBody(notice.body)
    }
}

/**
 * Renders the notice body's markdown subset (mirrors the PWA renderNoticeBodyHtml):
 *  **bold**, `## heading`, `-`/`•` bullets, blank-line paragraph gaps.
 * Image lines (`![alt](https://…)`) are skipped (no image loader bundled).
 */
@Composable
private fun NoticeBody(body: String) {
    val heading = Regex("^#{1,3}\\s+(.+)$")
    val bullet = Regex("^[-•]\\s+(.+)$")
    val image = Regex("^!\\[.*]\\(https://.*\\)$")
    Column(modifier = Modifier.fillMaxWidth()) {
        body.split("\n").forEach { rawLine ->
            val t = rawLine.trim()
            when {
                t.isEmpty() -> Box(modifier = Modifier.height(10.dp))
                image.matches(t) -> Unit // skip images
                heading.matches(t) -> {
                    val text = heading.find(t)?.groupValues?.getOrNull(1).orEmpty()
                    Box(modifier = Modifier.height(6.dp))
                    Text(
                        text = Markdown.bold(text),
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        color = Espresso,
                    )
                    Box(modifier = Modifier.height(2.dp))
                }
                bullet.matches(t) -> {
                    val text = bullet.find(t)?.groupValues?.getOrNull(1).orEmpty()
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                        Text("•  ", style = MaterialTheme.typography.bodyMedium, color = Roast)
                        Text(
                            text = Markdown.bold(text),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Roast,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                else -> Text(
                    text = Markdown.bold(t),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Roast,
                )
            }
        }
    }
}

@Composable
private fun TagChip(tag: String) {
    val shape = RoundedCornerShape(4.dp)
    val label: String
    val bg: Color
    val fg: Color
    when (tag) {
        "update" -> { label = "업데이트"; bg = Cta; fg = Color.White }
        "event" -> { label = "이벤트"; bg = Highlight; fg = Color(0xFF2C2620) }
        else -> { label = "공지"; bg = Espresso; fg = Paper }
    }
    Box(
        modifier = Modifier
            .background(bg, shape)
            .padding(horizontal = 9.dp, vertical = 3.dp),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = fg)
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
