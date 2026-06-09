package com.lifestyle.dailyscript.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.detail.relativeTime
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSans
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.formatBookmarkDate
import com.lifestyle.dailyscript.ui.util.genreLabel

@Composable
fun FeedScreen(
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onOpenCard: (Long) -> Unit,
) {
    val vm: FeedViewModel = viewModel()
    val state by vm.state.collectAsState()
    val coach = LocalCoachController.current
    LaunchedEffect(userId) { vm.load(userId) }

    // Tapping a "오늘의 한줄" card pops up just the card's quote (not the full detail).
    var quotePopup by remember { mutableStateOf<CardDto?>(null) }
    // Bookmark pickers: today → compose a one-liner; highlight → open that card's detail.
    var todayPickerOpen by remember { mutableStateOf(false) }
    var hlPickerOpen by remember { mutableStateOf(false) }
    val categoryForTour by rememberUpdatedState(state.category)
    val isAnonymousForTour by rememberUpdatedState(isAnonymous)

    DisposableEffect(coach) {
        if (coach == null) {
            onDispose { }
        } else {
            coach.setActionHandler("setFeedToday") {
                vm.setCategory(FEED_TODAY)
            }
            coach.setActionHandler("openFeedComposer") {
                if (!isAnonymousForTour) {
                    if (categoryForTour == FEED_HIGHLIGHT) {
                        hlPickerOpen = true
                    } else {
                        todayPickerOpen = true
                    }
                }
            }
            onDispose {
                coach.setActionHandler("setFeedToday", null)
                coach.setActionHandler("openFeedComposer", null)
            }
        }
    }

    // One list reused for both categories — reset to the top whenever the category flips.
    val listState = rememberLazyListState()
    LaunchedEffect(state.category) { listState.scrollToItem(0) }

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
                FeedChip(
                    "오늘의 한줄",
                    state.category == FEED_TODAY,
                    modifier = Modifier.coachAnchor(coach, "feed_today_chip"),
                ) { vm.setCategory(FEED_TODAY) }
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
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (state.category == FEED_TODAY) {
                        // Type-prefixed keys so a highlight_id never collides with a post_id
                        // (a raw-id collision made the LazyColumn jump to the wrong card on tab switch).
                        items(state.posts, key = { "post-${it.postId}" }) { post ->
                            FeedPostCard(post, onClick = { post.cards?.let { quotePopup = it } })
                        }
                    } else {
                        items(state.highlights, key = { "hl-${it.highlightId}" }) { hl ->
                            HighlightCard(hl)
                        }
                    }
                    item(key = "tail-spacer") { Box(modifier = Modifier.height(72.dp)) }
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
                    .coachAnchor(coach, "feed_fab")
                    .background(Espresso, RoundedCornerShape(28.dp))
                    .clickable {
                        if (state.category == FEED_HIGHLIGHT) hlPickerOpen = true else todayPickerOpen = true
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Add, contentDescription = "작성", tint = Paper)
            }
        }
    }

    quotePopup?.let { card ->
        QuotePopup(card = card, onDismiss = { quotePopup = null })
    }

    if (todayPickerOpen) {
        BookmarkPickerSheet(
            title = "어떤 명대사에 한줄을 남길까요?",
            bookmarkCards = state.bookmarkCards,
            onDismiss = { todayPickerOpen = false },
            onPick = { card -> todayPickerOpen = false; vm.openComposeFor(card) },
        )
    }

    if (hlPickerOpen) {
        BookmarkPickerSheet(
            title = "어떤 카드에 하이라이트를 남길까요?",
            bookmarkCards = state.bookmarkCards,
            onDismiss = { hlPickerOpen = false },
            onPick = { card -> hlPickerOpen = false; onOpenCard(card.cardId) },
        )
    }

    state.composeCard?.let { card ->
        FeedComposeSheet(
            card = card,
            submitting = state.submitting,
            error = state.error,
            onDismiss = { vm.closeCompose() },
            onSubmit = { body -> vm.submitPost(userId, myNickname, card.cardId, body) },
        )
    }
}

/** Tapping a feed one-liner pops up just the card's quote (mirrors openFeedQuote). */
@Composable
private fun QuotePopup(card: CardDto, onDismiss: () -> Unit) {
    val source = listOfNotNull(card.works.displayTitle().ifBlank { null }, card.works?.author)
        .joinToString(" · ")
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss)
                .padding(32.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 420.dp)
                    .fillMaxWidth()
                    .background(Paper)
                    .border(0.5.dp, Latte)
                    .padding(horizontal = 28.dp, vertical = 34.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = Markdown.quote(card.quote),
                    style = MaterialTheme.typography.headlineMedium,
                    color = Espresso,
                    textAlign = TextAlign.Center,
                )
                if (source.isNotBlank()) {
                    Box(modifier = Modifier.height(18.dp))
                    Text(
                        text = "— $source",
                        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.1.em),
                        color = Walnut,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

/**
 * Bottom-sheet bookmark picker (mirrors the PWA feed picker). Each row shows
 * GENRE · YEAR / title / quote + a chevron. Used by both the one-liner and
 * highlight flows; the caller decides what happens on pick.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BookmarkPickerSheet(
    title: String,
    bookmarkCards: List<CardDto>,
    onDismiss: () -> Unit,
    onPick: (CardDto) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(title, style = MaterialTheme.typography.headlineMedium, color = Espresso)
            Box(modifier = Modifier.height(8.dp))
            if (bookmarkCards.isEmpty()) {
                Text(
                    text = "아직 북마크한 명대사가 없어요.\n마음에 드는 명대사를 먼저 보관해보세요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    modifier = Modifier.padding(vertical = 32.dp),
                )
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 440.dp)) {
                    items(bookmarkCards, key = { it.cardId }) { c ->
                        PickRow(c) { onPick(c) }
                        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
                    }
                }
            }
        }
    }
}

@Composable
private fun PickRow(card: CardDto, onClick: () -> Unit) {
    val w = card.works
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val meta = listOfNotNull(w?.format?.let { genreLabel(it) }, w?.releaseYear?.toString())
                .joinToString(" · ").uppercase()
            if (meta.isNotBlank()) {
                Text(meta, style = MaterialTheme.typography.labelSmall, color = Walnut)
                Box(modifier = Modifier.height(6.dp))
            }
            Text(
                text = w.displayTitle().ifBlank { "—" },
                style = MaterialTheme.typography.titleLarge,
                color = Espresso,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(4.dp))
            Text(
                text = Markdown.oneLine(card.quote),
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(modifier = Modifier.width(12.dp))
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
            contentDescription = null,
            tint = Sand,
            modifier = Modifier.size(14.dp),
        )
    }
}

/** Compose step for a one-liner on the picked card (mirrors the PWA feed-compose modal). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedComposeSheet(
    card: CardDto,
    submitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var body by remember(card.cardId) { mutableStateOf("") }
    val w = card.works
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .imePadding(),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = w.displayTitle().ifBlank { "—" },
                    style = MaterialTheme.typography.headlineMedium,
                    color = Espresso,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text("#${card.cardId}", style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
            val meta = listOfNotNull(
                w?.format?.let { genreLabel(it) },
                w?.author,
                w?.releaseYear?.toString(),
            ).joinToString(" · ").uppercase()
            if (meta.isNotBlank()) {
                Box(modifier = Modifier.height(6.dp))
                Text(meta, style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
            Box(modifier = Modifier.height(14.dp))
            Box(Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
            Box(modifier = Modifier.height(14.dp))
            EditorialField(
                value = body,
                onValueChange = { body = it },
                placeholder = "이 명대사에 대한 한줄을 남겨보세요…",
                minHeight = 120.dp,
                maxLength = 300,
            )
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = "${body.length}/300자",
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Box(modifier = Modifier.height(8.dp))
                Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
            }
            Box(modifier = Modifier.height(14.dp))
            SharpButton(
                label = if (submitting) "등록 중⋯" else "등록 하기",
                onClick = { if (!submitting && body.isNotBlank()) onSubmit(body) },
                enabled = !submitting && body.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun FeedChip(text: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Box(
        modifier = modifier
            .background(if (active) Espresso else Paper, shape)
            .border(1.dp, if (active) Espresso else Latte, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = if (active) Paper else Walnut, maxLines = 1)
    }
}

/** "오늘의 한줄" — a social review card: header → pastel quote → book line. */
@Composable
private fun FeedPostCard(post: FeedPost, onClick: () -> Unit) {
    val w = post.cards?.works
    val shape = RoundedCornerShape(16.dp)
    val nick = post.authorNickname?.ifBlank { null } ?: "익명"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, shape)
            .clip(shape)
            .background(Paper)
            .clickable(onClick = onClick),
    ) {
        // Header — avatar + nickname + "한 줄 리뷰 · time"
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
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
                    text = "한 줄 리뷰 · ${relativeTime(post.createdAt)}",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = EditorialSans,
                        fontWeight = FontWeight.Normal,
                    ),
                    color = Roast,
                )
            }
        }
        // Quote — neutral panel, centred serif
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardWarm)
                .padding(horizontal = 28.dp, vertical = 40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = post.body,
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    lineHeight = 30.sp,
                    color = Espresso,
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        // Book line — title + author
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Paper)
                .padding(horizontal = 20.dp, vertical = 16.dp),
        ) {
            Text(
                text = w.displayTitle().ifBlank { "—" },
                style = MaterialTheme.typography.titleMedium.copy(
                    fontFamily = EditorialSans,
                    fontWeight = FontWeight.Normal,
                ),
                color = Espresso,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            w?.author?.ifBlank { null }?.let {
                Box(modifier = Modifier.height(4.dp))
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = EditorialSans,
                        fontWeight = FontWeight.Normal,
                    ),
                    color = Walnut,
                )
            }
        }
    }
}

/** "하이라이트" — matches the PWA .hl-card: head(닉네임·장르·날짜) → 책표지 → 발췌 → 일련번호. */
@Composable
private fun HighlightCard(hl: Highlight) {
    val w = hl.cards?.works
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(0.5.dp, Latte)
            .background(CardWarm)
            .padding(start = 18.dp, top = 28.dp, end = 18.dp, bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // head — nickname + (genre · date·time)
        Text(
            text = hl.authorNickname ?: "익명",
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = Espresso,
        )
        val meta = listOfNotNull(
            w?.format?.let { genreLabel(it) },
            formatBookmarkDate(hl.createdAt).ifBlank { null },
        ).joinToString("  ·  ")
        if (meta.isNotBlank()) {
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = meta,
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
                color = Walnut,
            )
        }

        Box(modifier = Modifier.height(22.dp))
        HlBookCover(w)

        Box(modifier = Modifier.height(22.dp))
        HlQuote(hl.selectedText)

        Box(modifier = Modifier.height(18.dp))
        Text(
            text = "#${hl.cardId}",
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
            color = Sand,
        )
    }
}

/** Solid leather cover with an inset white-line rectangle + a left spine line (PWA .hl-bookcover). */
@Composable
private fun HlBookCover(w: com.lifestyle.dailyscript.data.model.WorkDto?) {
    BookCover(work = w, modifier = Modifier.size(width = 132.dp, height = 188.dp))
}

/** Centered excerpt with wide serif quote marks at the corners (PWA .hl-quote). */
@Composable
private fun HlQuote(text: String) {
    Box(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "“",
            style = TextStyle(fontFamily = EditorialSerif, fontSize = 22.sp),
            color = Sand,
            modifier = Modifier.align(Alignment.TopStart).offset(y = (-6).dp),
        )
        Text(
            text = text,
            style = TextStyle(fontFamily = EditorialSerif, fontSize = 15.sp, lineHeight = 28.sp),
            color = Espresso,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
        )
        Text(
            text = "”",
            style = TextStyle(fontFamily = EditorialSerif, fontSize = 22.sp),
            color = Sand,
            modifier = Modifier.align(Alignment.BottomEnd).offset(y = 12.dp),
        )
    }
}

@Composable
private fun CenteredNote(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = Walnut, modifier = Modifier.padding(24.dp))
    }
}
