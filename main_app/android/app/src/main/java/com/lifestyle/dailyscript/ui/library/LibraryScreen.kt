package com.lifestyle.dailyscript.ui.library

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.leatherColorFor
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.MetaCaps
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.GENRE_ORDER
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.genreLabel
import kotlinx.coroutines.delay

// The cover swings open with a slight overshoot — matches the archive/PWA .book transition.
private val BookCoverEasing = CubicBezierEasing(0.34f, 1.2f, 0.64f, 1f)

/**
 * Library catalog: every work we have, shown four-per-row as the same leather "book shape"
 * used by the feed highlight ([BookCover]). Filter by genre with chips, search by title, and
 * tap a cover to swing the book open and read its gathered 명대사 — tapping one opens the card.
 */
@Composable
fun LibraryScreen(onOpenCard: (Long) -> Unit) {
    val vm: LibraryViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    var search by remember { mutableStateOf("") }
    var genre by remember { mutableStateOf<String?>(null) } // null = 전체
    var openWorkId by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(search) {
        val q = search.trim()
        if (q.isNotBlank()) {
            delay(600)
            if (search.trim() == q) {
                AppAnalytics.track("library_searched", mapOf("query" to q))
            }
        }
    }

    val books = state.books
    val filtered = remember(books, genre, search) {
        val q = search.trim()
        books.filter { b ->
            val fmt = b.work.format.lowercase()
            val genreOk = when (genre) {
                null -> true
                "other" -> fmt !in GENRE_ORDER
                else -> fmt == genre
            }
            val searchOk = q.isBlank() ||
                b.work.title.contains(q, ignoreCase = true) ||
                (b.work.subtitle?.contains(q, ignoreCase = true) == true) ||
                (b.work.author?.contains(q, ignoreCase = true) == true)
            genreOk && searchOk
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Paper),
        ) {
            // --- Header ---
            Box(modifier = Modifier.height(28.dp))
            Text(
                text = stringResource(R.string.library_title),
                style = MaterialTheme.typography.displayMedium,
                color = Espresso,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            if (books.isNotEmpty()) {
                val cardCount = remember(books) { books.sumOf { it.cards.size } }
                Box(modifier = Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.library_work_count, books.size) +
                        "  ·  " + stringResource(R.string.archive_card_count, cardCount),
                    style = MetaCaps,
                    color = Walnut,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
            }

            state.error?.let {
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = it,
                    color = Cta,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
            }

            Box(modifier = Modifier.height(12.dp))

            if (books.isNotEmpty()) {
                GenreChips(
                    books = books,
                    selected = genre,
                    onSelect = {
                        genre = it
                        AppAnalytics.track("library_genre_filtered", mapOf("genre" to (it ?: "all")))
                    },
                )
                Box(modifier = Modifier.height(10.dp))
                LibrarySearchField(
                    value = search,
                    onChange = { search = it },
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
                Box(modifier = Modifier.height(8.dp))
            }

            when {
                state.loading && books.isEmpty() -> {
                    Text(
                        text = stringResource(R.string.loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Walnut,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                    )
                }
                books.isEmpty() -> {
                    Text(
                        text = "표시할 작품이 없습니다.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Walnut,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
                    )
                }
                else -> BookGrid(books = filtered, onOpen = { openWorkId = it })
            }
        }

        // --- Opened book: a popup whose cover swings open to show the gathered quotes ---
        val opened = books.firstOrNull { it.workId == openWorkId }
        if (opened != null) {
            OpenedLibraryBook(
                book = opened,
                onOpenCard = onOpenCard,
                onClose = { openWorkId = null },
            )
        }
    }
}

@Composable
private fun BookGrid(books: List<LibraryBook>, onOpen: (Long) -> Unit) {
    if (books.isEmpty()) {
        Text(
            text = "검색 결과가 없습니다.",
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
        )
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(4),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 56.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        items(books, key = { it.workId }) { book ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BookCover(
                    work = book.work,
                    compact = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(132f / 188f)
                        .clickable {
                            AppAnalytics.track("library_book_opened", mapOf("work_id" to book.workId))
                            onOpen(book.workId)
                        },
                )
                Box(modifier = Modifier.height(6.dp))
                Text(
                    text = "명대사 ${book.cards.size}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun GenreChips(
    books: List<LibraryBook>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    val counts = books.groupingBy { it.work.format.lowercase() }.eachCount()
    val present = GENRE_ORDER.filter { counts.containsKey(it) }
    val otherCount = counts.filterKeys { it !in GENRE_ORDER }.values.sum()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chip(text = "All · ${books.size}", active = selected == null) { onSelect(null) }
        present.forEach { g ->
            Chip(text = "${genreLabel(g)} · ${counts[g]}", active = selected == g) { onSelect(g) }
        }
        if (otherCount > 0) {
            Chip(text = "기타 · $otherCount", active = selected == "other") { onSelect("other") }
        }
    }
}

@Composable
private fun Chip(text: String, active: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Box(
        modifier = Modifier
            .background(if (active) Espresso else Paper, shape)
            .border(1.dp, if (active) Espresso else Latte, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = if (active) Paper else Walnut,
            maxLines = 1,
        )
    }
}

/** Search input with a leading magnifier (mirrors the archive search). */
@Composable
private fun LibrarySearchField(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Paper)
            .border(0.5.dp, Walnut)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = Walnut, modifier = Modifier.size(18.dp))
        Box(modifier = Modifier.width(12.dp))
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = Espresso),
            cursorBrush = SolidColor(Cta),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text("작품 제목으로 검색", style = MaterialTheme.typography.bodyMedium, color = Sand)
                }
                inner()
            },
        )
    }
}

/**
 * The opened book — a centered popup whose cover swings open from its left spine
 * (rotateY −100°→0° + scale 0.6→1, with a slight overshoot), over a fading backdrop.
 * Mirrors the archive OpenedBook, simplified for the whole-catalog [LibraryBook] (no bookmark dates).
 */
@Composable
private fun OpenedLibraryBook(
    book: LibraryBook,
    onOpenCard: (Long) -> Unit,
    onClose: () -> Unit,
) {
    var visible by remember { mutableStateOf(true) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(visible) {
        progress.animateTo(
            targetValue = if (visible) 1f else 0f,
            animationSpec = tween(
                durationMillis = if (visible) 550 else 300,
                easing = if (visible) BookCoverEasing else LinearEasing,
            ),
        )
        if (!visible) onClose()
    }
    val dismiss: () -> Unit = { if (visible) visible = false }
    val leather = leatherColorFor(book.work.title)

    Dialog(
        onDismissRequest = dismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        // Drop the platform scrim — our own backdrop fades in step with the cover.
        (LocalView.current.parent as? DialogWindowProvider)?.window?.setDimAmount(0f)

        val p = progress.value
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0E0C0A).copy(alpha = 0.65f * p))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = dismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            val panelMaxHeight = maxHeight * 0.86f
            val panelWidth = if (maxWidth - 40.dp < 480.dp) maxWidth - 40.dp else 480.dp
            Box(
                modifier = Modifier
                    .width(panelWidth)
                    .heightIn(max = panelMaxHeight)
                    .graphicsLayer {
                        rotationY = -100f * (1f - p)
                        val s = 0.6f + 0.4f * p
                        scaleX = s
                        scaleY = s
                        alpha = (0.25f + 0.75f * p).coerceIn(0f, 1f)
                        transformOrigin = TransformOrigin(0f, 0.5f)
                        cameraDistance = 1500f * density
                    }
                    .background(Paper)
                    .drawBehind {
                        // Faint ruled lines down the page, then the leather spine edge.
                        val gap = 28.dp.toPx()
                        val stroke = 1.dp.toPx()
                        val rule = Color(0xFF6B5D4F).copy(alpha = 0.08f)
                        var y = gap
                        while (y < size.height) {
                            drawLine(rule, Offset(0f, y), Offset(size.width, y), stroke)
                            y += gap
                        }
                        drawRect(leather, Offset.Zero, Size(8.dp.toPx(), size.height))
                    }
                    // Swallow taps on the book so it doesn't dismiss the modal.
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(start = 40.dp, top = 36.dp, end = 28.dp, bottom = 28.dp),
                ) {
                    LibraryBookHeader(book = book, onClose = dismiss)
                    Box(modifier = Modifier.height(20.dp))
                    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Sand))
                    Box(modifier = Modifier.height(12.dp))
                    book.cards.forEach { card ->
                        LibraryQuoteItem(
                            card = card,
                            onOpen = {
                                onOpenCard(card.cardId)
                                onClose()
                            },
                        )
                        Box(modifier = Modifier.height(12.dp))
                    }
                    Box(modifier = Modifier.height(12.dp))
                    Text(
                        text = "— Daily Script · Limited Edition —",
                        style = TextStyle(fontSize = 10.sp, letterSpacing = 0.3.em, color = Sand),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

@Composable
private fun LibraryBookHeader(book: LibraryBook, onClose: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "${genreLabel(book.work.format)} · 명대사 ${book.cards.size}편".uppercase(),
                style = TextStyle(fontSize = 10.sp, letterSpacing = 0.3.em, color = Walnut),
            )
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = book.work.title,
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 26.sp, lineHeight = 34.sp),
                color = Espresso,
            )
            book.work.subtitle?.takeIf { it.isNotBlank() }?.let { sub ->
                Box(modifier = Modifier.height(4.dp))
                Text(
                    text = sub,
                    style = TextStyle(fontFamily = EditorialSerif, fontSize = 15.sp, lineHeight = 22.sp),
                    color = Walnut,
                )
            }
            val meta = listOfNotNull(
                book.work.author?.ifBlank { null },
                book.work.releaseYear?.toString(),
            ).joinToString(" · ").uppercase()
            if (meta.isNotBlank()) {
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = meta,
                    style = TextStyle(fontSize = 10.sp, letterSpacing = 0.2.em, color = Walnut),
                )
            }
        }
        Box(modifier = Modifier.width(12.dp))
        // Close (X) — 32dp box with a hairline walnut border, mirroring the archive close.
        Box(
            modifier = Modifier
                .size(32.dp)
                .border(0.5.dp, Walnut)
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Close,
                contentDescription = "닫기",
                tint = Espresso,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** One gathered card in the opened book (serial, quote, short description). */
@Composable
private fun LibraryQuoteItem(card: CardDto, onOpen: () -> Unit) {
    val accent = Sand
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardWarm)
            .border(0.5.dp, Latte)
            .drawBehind { drawRect(accent, Offset.Zero, Size(3.dp.toPx(), size.height)) }
            .clickable(onClick = onOpen),
    ) {
        Column(
            modifier = Modifier.padding(start = 18.dp, top = 18.dp, end = 16.dp, bottom = 16.dp),
        ) {
            Text(
                text = Markdown.quote(card.quote),
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontSize = 16.sp,
                    lineHeight = 30.sp,
                    color = Espresso,
                ),
            )
            val desc = Markdown.cleanQuote(card.excerptDescription)
            if (desc.isNotBlank()) {
                val meta = if (desc.length > 60) desc.take(60) + "⋯" else desc
                Box(modifier = Modifier.height(10.dp))
                Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = meta.uppercase(),
                    style = TextStyle(fontSize = 10.sp, letterSpacing = 0.2.em, color = Walnut),
                )
            }
        }
        // Card serial (일련번호) — the card_id with no leading zeros.
        Text(
            text = "#${card.cardId}",
            style = TextStyle(
                fontSize = 9.sp,
                letterSpacing = 0.25.em,
                color = Sand,
                fontWeight = FontWeight.Bold,
            ),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 10.dp, end = 12.dp),
        )
    }
}
