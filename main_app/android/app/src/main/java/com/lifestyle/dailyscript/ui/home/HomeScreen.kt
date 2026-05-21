package com.lifestyle.dailyscript.ui.home

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.ChipTag
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.BorderSubtle
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.OnSurfaceVariant
import com.lifestyle.dailyscript.ui.theme.OutlineVariant
import com.lifestyle.dailyscript.ui.theme.SignatureOrange
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun HomeScreen(
    userId: Long,
    onOpenCard: (Long) -> Unit,
) {
    val vm: HomeViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.refresh(userId) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
    ) {
        Box(modifier = Modifier.height(24.dp))
        Text(
            text = todayString(),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
            color = OnSurfaceVariant,
        )
        Box(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.today_script),
                style = MaterialTheme.typography.displayLarge,
                color = InkBlack,
            )
            Icon(
                imageVector = Icons.Outlined.Refresh,
                contentDescription = "Refresh",
                tint = InkBlack,
                modifier = Modifier
                    .size(40.dp)
                    .clickable(enabled = !state.loading) { vm.refresh(userId) }
                    .padding(8.dp),
            )
        }
        Box(modifier = Modifier.height(16.dp))

        TodayCard(
            card = state.todayCard,
            bookmarked = state.todayBookmarked,
            loading = state.loading,
            onBookmarkToggle = { vm.toggleTodayBookmark(userId) },
            onOpen = { state.todayCard?.let { onOpenCard(it.cardId) } },
        )

        state.error?.let {
            Box(modifier = Modifier.height(8.dp))
            Text(text = it, color = SignatureOrange, style = MaterialTheme.typography.bodySmall)
        }

        Box(modifier = Modifier.height(48.dp))
        SectionDivider()

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 32.dp, bottom = 16.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.past_records),
                style = MaterialTheme.typography.headlineMedium,
                color = InkBlack,
            )
            Text(
                text = stringResource(R.string.view_archive),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                color = OnSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }

        if (state.bookmarks.isEmpty() && !state.loading) {
            Text(
                text = stringResource(R.string.empty_bookmarks),
                style = MaterialTheme.typography.bodyMedium,
                color = OnSurfaceVariant,
                modifier = Modifier.padding(vertical = 16.dp),
            )
        } else {
            state.bookmarks.forEach { bookmark ->
                BookmarkRowItem(bookmark = bookmark, onClick = {
                    bookmark.cards?.cardId?.let(onOpenCard)
                })
            }
        }
        Box(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun TodayCard(
    card: CardDto?,
    bookmarked: Boolean,
    loading: Boolean,
    onBookmarkToggle: () -> Unit,
    onOpen: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(width = 1.dp, color = BorderSubtle)
            .background(Color.White)
            .clickable(enabled = card != null, onClick = onOpen)
            .padding(24.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val format = card?.works?.format
                if (!format.isNullOrBlank()) ChipTag(text = format, filled = true)
                card?.keywordList()?.firstOrNull()?.let { kw ->
                    ChipTag(text = kw, filled = false)
                }
            }
            Icon(
                imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = stringResource(R.string.bookmark),
                tint = if (bookmarked) SignatureOrange else OnSurfaceVariant,
                modifier = Modifier
                    .size(28.dp)
                    .clickable(enabled = card != null, onClick = onBookmarkToggle),
            )
        }
        Box(modifier = Modifier.height(32.dp))
        Text(
            text = card?.quote?.let { "“$it”" } ?: if (loading) stringResource(R.string.loading) else "—",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontFamily = EditorialSerif,
                fontStyle = FontStyle.Italic,
            ),
            color = InkBlack,
        )
        Box(modifier = Modifier.height(24.dp))
        SectionDivider()
        Box(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            card?.keywordList()?.forEach { kw ->
                Text(
                    text = "#$kw",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OnSurfaceVariant,
                )
            }
        }
        Box(modifier = Modifier.height(24.dp))
        SharpButton(
            label = stringResource(R.string.read_full_script),
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            enabled = card != null,
        )
    }
}

@Composable
private fun BookmarkRowItem(bookmark: BookmarkRow, onClick: () -> Unit) {
    val card = bookmark.cards
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = card != null, onClick = onClick)
            .padding(vertical = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val meta = listOfNotNull(
                formatBookmarkDate(bookmark.createdAt),
                card?.works?.format,
            ).joinToString("  —  ")
            if (meta.isNotBlank()) {
                Text(
                    text = meta.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
                    color = OnSurfaceVariant,
                )
                Box(modifier = Modifier.height(6.dp))
            }
            Text(
                text = card?.works?.title ?: "—",
                style = MaterialTheme.typography.titleLarge,
                color = InkBlack,
            )
            Box(modifier = Modifier.height(4.dp))
            Text(
                text = card?.quote.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = OnSurfaceVariant,
                maxLines = 1,
            )
        }
        Box(modifier = Modifier.width(12.dp))
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
            contentDescription = null,
            tint = OutlineVariant,
            modifier = Modifier.size(18.dp),
        )
    }
    SectionDivider()
}

@Composable
private fun SectionDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(BorderSubtle),
    )
}

private fun todayString(): String {
    val date = LocalDate.now()
    val fmt = DateTimeFormatter.ofPattern("yyyy년 M월 d일", Locale.KOREAN)
    return date.format(fmt)
}

private fun formatBookmarkDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching {
        // Just take the YYYY-MM-DD prefix and reformat as M.D
        val datePart = iso.substring(0, 10)
        val d = LocalDate.parse(datePart)
        "${d.monthValue}. ${d.dayOfMonth}"
    }.getOrNull()
}
