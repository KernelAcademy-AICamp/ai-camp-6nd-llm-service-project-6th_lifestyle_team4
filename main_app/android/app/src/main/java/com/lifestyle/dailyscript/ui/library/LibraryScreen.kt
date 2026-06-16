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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBackIos
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SwapVert
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
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
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
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
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel
import kotlinx.coroutines.delay

// The cover swings open with a slight overshoot — matches the archive/PWA .book transition.
private val BookCoverEasing = CubicBezierEasing(0.34f, 1.2f, 0.64f, 1f)

// 한 페이지에 4열 × 3줄 = 12권 (무한스크롤 대신 페이지 단위).
private const val LibraryPageSize = 12

/**
 * Library catalog: every work we have, shown four-per-row as the same leather "book shape"
 * used by the feed highlight ([BookCover]). Filter by genre with chips, search by title, and
 * tap a cover to swing the book open and read its gathered 명대사 — tapping one opens the card.
 */
@Composable
fun LibraryScreen(
    userId: Long,
    onOpenCard: (Long) -> Unit,
    initialOpenWorkId: Long? = null,
) {
    val vm: LibraryViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

    var search by remember { mutableStateOf("") }
    var genre by remember { mutableStateOf<String?>(null) } // null = 전체
    var sort by remember { mutableStateOf(LibrarySort.ALPHA) } // 기본 = 가나다순
    var openWorkId by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(initialOpenWorkId, state.books) {
        val workId = initialOpenWorkId ?: return@LaunchedEffect
        // 딥링크 work_id 가 병합된 책의 비대표 id 일 수 있으니 workIds 집합으로 찾아 대표 id 로 연다.
        state.books.firstOrNull { workId in it.workIds }?.let { openWorkId = it.workId }
    }

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
    val filtered = remember(books, genre, search, sort) {
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
        }.sortedWith(librarySortComparator(sort))
    }

    // 페이지네이션 — 필터/검색이 바뀌면(=filtered 재계산) 1페이지로 리셋.
    var page by remember(filtered) { mutableStateOf(0) }
    val pageCount = (filtered.size + LibraryPageSize - 1) / LibraryPageSize
    val pageBooks = remember(filtered, page) {
        filtered.drop(page * LibraryPageSize).take(LibraryPageSize)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Paper)
                // 떠 있는 하단 바(페이지 바·그리드 마지막 줄)가 가리지 않도록 카드 높이만큼 아래 여백.
                // 배경(Paper)은 패딩 앞이라 카드 뒤까지 꽉 차 본문이 카드 아래로 이어져 보인다.
                .padding(bottom = BottomBarContentInset),
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
                // 작품/명대사 카운트 줄 — 오른쪽 끝에 정렬 토글(가나다순 ⇄ 최신등록순)을 같은 라인에 둔다.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.library_work_count, books.size) +
                            "  ·  " + stringResource(R.string.archive_card_count, cardCount),
                        style = MetaCaps,
                        color = Walnut,
                        modifier = Modifier.weight(1f),
                    )
                    SortToggle(
                        selected = sort,
                        onToggle = {
                            val next = if (sort == LibrarySort.ALPHA) LibrarySort.LATEST else LibrarySort.ALPHA
                            sort = next
                            AppAnalytics.track("library_sorted", mapOf("sort" to next.name.lowercase()))
                        },
                    )
                }
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
                else -> {
                    BookGrid(
                        books = pageBooks,
                        onOpen = { openWorkId = it },
                        modifier = Modifier.weight(1f),
                    )
                    if (pageCount > 1) {
                        PageBar(
                            page = page,
                            pageCount = pageCount,
                            onSelect = {
                                page = it
                                AppAnalytics.track("library_page_changed", mapOf("page" to it + 1))
                            },
                        )
                    }
                }
            }
        }

        // --- Opened book: a popup whose cover swings open to show the gathered quotes ---
        val opened = books.firstOrNull { it.workId == openWorkId }
        if (opened != null) {
            OpenedLibraryBook(
                book = opened,
                bookmarkedCardIds = state.bookmarkedCardIds,
                onOpenCard = onOpenCard,
                onClose = { openWorkId = null },
            )
        }
    }
}

@Composable
private fun BookGrid(books: List<LibraryBook>, onOpen: (Long) -> Unit, modifier: Modifier = Modifier) {
    if (books.isEmpty()) {
        Text(
            text = "검색 결과가 없습니다.",
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            modifier = modifier.padding(horizontal = 20.dp, vertical = 24.dp),
        )
        return
    }
    // 화면이 낮아 3줄이 다 안 보일 때만 페이지 안에서 스크롤 — 페이지가 바뀌면 맨 위로.
    val gridState = rememberLazyGridState()
    LaunchedEffect(books) { gridState.scrollToItem(0) }
    LazyVerticalGrid(
        columns = GridCells.Fixed(4),
        state = gridState,
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 16.dp),
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
                BookTitle(text = book.work.displayTitle().ifBlank { "—" })
            }
        }
    }
}

// 표지 아래 제목 — 한 줄에 맞는 가장 큰 크기로 자동 축소(11→8sp), 자간 0 으로 가로 폭 확보.
// 8sp 로도 한 줄에 안 들어가는 아주 긴 제목만 2줄 말줄임으로 떨어진다.
private val BookTitleSizes = listOf(11.sp, 10.sp, 9.sp, 8.sp)

@Composable
private fun BookTitle(text: String) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val base = MaterialTheme.typography.labelSmall.copy(
        color = Walnut,
        letterSpacing = 0.sp,
        textAlign = TextAlign.Center,
    )
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val widthPx = with(density) { maxWidth.roundToPx() }
        val fitted = BookTitleSizes.firstOrNull { size ->
            !measurer.measure(
                text = text,
                style = base.copy(fontSize = size),
                constraints = Constraints(maxWidth = widthPx),
                maxLines = 1,
                softWrap = false,
            ).didOverflowWidth
        }
        Text(
            text = text,
            style = base.copy(fontSize = fitted ?: BookTitleSizes.last()),
            maxLines = if (fitted != null) 1 else 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** 페이지 이동 바 — ◀ 1 2 3 ▶. 페이지가 많으면 현재 페이지 주변 5개만 보여준다. */
@Composable
private fun PageBar(page: Int, pageCount: Int, onSelect: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            // 떠 있는 하단 바와 붙어 터치가 불편하지 않도록 위로 띄움(아래 여백 ↑).
            .padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 40.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PageArrow(forward = false, enabled = page > 0) { onSelect(page - 1) }
        pageWindow(page, pageCount).forEach { p ->
            Chip(text = "${p + 1}", active = p == page) { if (p != page) onSelect(p) }
        }
        PageArrow(forward = true, enabled = page < pageCount - 1) { onSelect(page + 1) }
    }
}

/** 페이지 번호 노출 범위 — 최대 [max]개, 현재 페이지를 가운데 두고 양 끝에서 클램프. */
private fun pageWindow(page: Int, pageCount: Int, max: Int = 5): IntRange {
    if (pageCount <= max) return 0 until pageCount
    val start = (page - max / 2).coerceIn(0, pageCount - max)
    return start until start + max
}

@Composable
private fun PageArrow(forward: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (forward) Icons.AutoMirrored.Outlined.ArrowForwardIos
            else Icons.AutoMirrored.Outlined.ArrowBackIos,
            contentDescription = if (forward) "다음 페이지" else "이전 페이지",
            tint = if (enabled) Espresso else Latte,
            modifier = Modifier.size(14.dp),
        )
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

/**
 * 정렬 토글 — 현재 정렬(가나다순/최신등록순) 라벨을 보여주고 탭하면 다른 쪽으로 전환.
 * 카운트 줄 오른쪽 끝에 들어가는 작은 알약 모양(장르 칩과 같은 테두리·톤).
 */
@Composable
private fun SortToggle(selected: LibrarySort, onToggle: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Row(
        modifier = Modifier
            .background(Paper, shape)
            .border(1.dp, Latte, shape)
            .clickable(onClick = onToggle)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.SwapVert,
            contentDescription = "정렬 전환",
            tint = Walnut,
            modifier = Modifier.size(13.dp),
        )
        Box(modifier = Modifier.width(4.dp))
        Text(
            text = selected.label,
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
            maxLines = 1,
        )
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
internal fun OpenedLibraryBook(
    book: LibraryBook,
    bookmarkedCardIds: Set<Long>,
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
                    book.cards.forEachIndexed { index, card ->
                        LibraryQuoteItem(
                            card = card,
                            serial = index + 1,
                            bookmarked = card.cardId in bookmarkedCardIds,
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
private fun LibraryQuoteItem(card: CardDto, serial: Int, bookmarked: Boolean, onOpen: () -> Unit) {
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
            // 우측 상단 북마크 뱃지/#순번과 겹치지 않게 우측 여백 확보 (PWA padding-right 36px).
            modifier = Modifier.padding(start = 18.dp, top = 18.dp, end = 36.dp, bottom = 16.dp),
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
        // 북마크한 카드는 우측 상단에 채워진 bookmark 뱃지로 구별 (PWA db0d5ff).
        if (bookmarked) {
            Icon(
                imageVector = Icons.Outlined.Bookmark,
                contentDescription = "북마크함",
                tint = Cta,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 8.dp, end = 10.dp)
                    .size(16.dp),
            )
        }
        // Card serial (일련번호) — 책 안에서의 0패딩 순번(#01, #02…). 북마크 뱃지 아래로 내림.
        Text(
            text = "#%02d".format(serial),
            style = TextStyle(
                fontSize = 9.sp,
                letterSpacing = 0.25.em,
                color = Sand,
                fontWeight = FontWeight.Bold,
            ),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = if (bookmarked) 32.dp else 10.dp, end = 12.dp),
        )
    }
}
