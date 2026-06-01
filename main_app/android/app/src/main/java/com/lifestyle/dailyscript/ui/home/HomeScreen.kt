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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.ChipTag
import com.lifestyle.dailyscript.ui.components.LangSegmented
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.onboarding.CoachmarkOverlay
import kotlinx.coroutines.launch
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel
import com.lifestyle.dailyscript.ui.util.keywordsFor
import com.lifestyle.dailyscript.ui.util.quoteFor
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    userId: Long,
    isAnonymous: Boolean,
    onOpenCard: (Long) -> Unit,
) {
    val vm: HomeViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

    // First-run onboarding (default true → never flashes before the real value loads).
    val guideSeen by AppPreferences.guideSeen.collectAsState(initial = true)
    val scope = rememberCoroutineScope()
    var showGuide by remember { mutableStateOf(false) }
    LaunchedEffect(guideSeen, state.loading, state.todayCard) {
        if (!guideSeen && !state.loading && state.todayCard != null) showGuide = true
    }

    PullToRefreshBox(
        isRefreshing = state.loading,
        onRefresh = { vm.load(userId) },
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
      Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
      ) {
        Box(modifier = Modifier.height(32.dp))
        Text(
            text = todayString().uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
        )
        Box(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.today_script),
                style = MaterialTheme.typography.displayMedium,
                color = Espresso,
            )
            Icon(
                imageVector = Icons.Outlined.Refresh,
                contentDescription = "Refresh",
                tint = Walnut,
                modifier = Modifier
                    .size(40.dp)
                    .clickable(enabled = !state.loading) { vm.refresh(userId, isAnonymous) }
                    .padding(8.dp),
            )
        }
        Box(modifier = Modifier.height(20.dp))

        TodayCard(
            card = state.todayCard,
            bookmarked = state.todayBookmarked,
            bookmarkActionInFlight = state.bookmarkActionInFlight,
            loading = state.loading,
            bookmarkCount = state.todayCard?.let { state.bookmarkCounts[it.cardId] } ?: 0,
            onBookmarkToggle = { vm.toggleTodayBookmark(userId) },
            onOpen = { state.todayCard?.let { onOpenCard(it.cardId) } },
        )

        state.error?.let {
            Box(modifier = Modifier.height(8.dp))
            Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
        }

        Box(modifier = Modifier.height(56.dp))
        SectionDivider()

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 32.dp, bottom = 12.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.past_records),
                style = MaterialTheme.typography.headlineMedium,
                color = Espresso,
            )
            Text(
                text = stringResource(R.string.view_archive),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }

        if (state.recent.isEmpty()) {
            Text(
                text = stringResource(R.string.home_recent_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                modifier = Modifier.padding(vertical = 16.dp),
            )
        } else {
            state.recent.forEach { card ->
                RecentRowItem(card = card, onClick = { onOpenCard(card.cardId) })
            }
        }
        Box(modifier = Modifier.height(40.dp))
      }

      if (showGuide) {
          CoachmarkOverlay(onFinish = {
              showGuide = false
              scope.launch { AppPreferences.setGuideSeen() }
          })
      }
    }
}

@Composable
private fun TodayCard(
    card: CardDto?,
    bookmarked: Boolean,
    bookmarkActionInFlight: Boolean,
    loading: Boolean,
    bookmarkCount: Int,
    onBookmarkToggle: () -> Unit,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    // EN/KO toggle is ephemeral per-card UI state — resets when the card changes.
    var english by remember(card?.cardId) { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(width = 0.5.dp, color = Latte, shape = shape)
            .clickable(enabled = card != null, onClick = onOpen)
            .padding(20.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val format = card?.works?.format
                if (!format.isNullOrBlank()) ChipTag(text = genreLabel(format, english), filled = true)
                if (card != null) {
                    CardCounts(viewCount = card.viewCount, bookmarkCount = bookmarkCount)
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (card?.hasEnglish() == true) {
                    LangSegmented(english = english, onToggle = { english = !english })
                }
                Icon(
                    imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                    contentDescription = stringResource(R.string.bookmark),
                    tint = if (bookmarked) Cta else Walnut,
                    modifier = Modifier
                        .size(24.dp)
                        .clickable(
                            enabled = card != null && !bookmarkActionInFlight,
                            onClick = onBookmarkToggle,
                        ),
                )
            }
        }
        Box(modifier = Modifier.height(28.dp))
        Text(
            text = card?.let { Markdown.quote(it.quoteFor(english)) }
                ?: AnnotatedString(if (loading) stringResource(R.string.loading) else "—"),
            style = MaterialTheme.typography.headlineMedium,
            color = Espresso,
        )
        val workMeta = card?.let { workMetaLine(it, english) }
        if (!workMeta.isNullOrBlank()) {
            Box(modifier = Modifier.height(18.dp))
            Text(
                text = workMeta,
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
            )
        }
        Box(modifier = Modifier.height(24.dp))
        SectionDivider()
        Box(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            card?.keywordsFor(english)?.forEach { kw ->
                Text(
                    text = "#$kw",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                )
            }
        }
        Box(modifier = Modifier.height(20.dp))
        SharpButton(
            label = stringResource(R.string.read_full_script),
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            enabled = card != null,
        )
    }
}

@Composable
private fun RecentRowItem(card: CardDto, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val meta = card.works?.format
            if (!meta.isNullOrBlank()) {
                Text(
                    text = meta.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                )
                Box(modifier = Modifier.height(6.dp))
            }
            Text(
                text = card.works.displayTitle().ifBlank { "—" },
                style = MaterialTheme.typography.titleLarge,
                color = Espresso,
                maxLines = 1,
            )
            Box(modifier = Modifier.height(4.dp))
            Text(
                text = Markdown.oneLine(card.quote),
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                maxLines = 1,
            )
        }
        Box(modifier = Modifier.width(12.dp))
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
            contentDescription = null,
            tint = Sand,
            modifier = Modifier.size(16.dp),
        )
    }
    SectionDivider()
}

@Composable
private fun SectionDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(Latte),
    )
}

/** "— 장르 <제목> 부제" line under the quote (mirrors the PWA's todayWork, applyTodayLang). */
private fun workMetaLine(card: CardDto, english: Boolean): String? {
    val w = card.works ?: return null
    val title = (if (english) w.titleOriginal?.ifBlank { null } else null) ?: w.title
    if (title.isBlank()) return null
    val subtitle = (if (english) w.subtitleOriginal?.ifBlank { null } else null) ?: w.subtitle
    val titleBlock = if (!subtitle.isNullOrBlank()) "<$title> ${subtitle.trim()}" else "<$title>"
    val genre = genreLabel(w.format, english)
    return if (genre.isNotBlank()) "— $genre $titleBlock" else "— $titleBlock"
}

private fun todayString(): String {
    val date = LocalDate.now()
    val fmt = DateTimeFormatter.ofPattern("yyyy년 M월 d일", Locale.KOREAN)
    return date.format(fmt)
}
