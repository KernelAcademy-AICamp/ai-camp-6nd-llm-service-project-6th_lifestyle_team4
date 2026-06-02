package com.lifestyle.dailyscript.ui.archive

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.MetaCaps
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.GENRE_ORDER
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.genreLabel
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.delay

// --- British-bookstore bookshelf palette (local, decorative) ---
private val Gilt = Color(0xFFC9A24B)        // antique gold — rules, marker
private val GiltBright = Color(0xFFE6CC82)  // brighter gilt — titles

private val Leathers = listOf(
    Color(0xFF5A2A24), // oxblood
    Color(0xFF2F3A30), // forest green
    Color(0xFF293541), // navy
    Color(0xFF6A4A30), // tan / cognac
    Color(0xFF40303B), // plum
    Color(0xFF3A463F), // sage slate
)

private val WoodLip = Color(0xFF9C7A4E)     // lit front edge of the shelf
private val WoodFace = Color(0xFF6E5031)
private val WoodShadow = Color(0xFF33220F)

private val ShelfSidePadding = 20.dp

// The book cover swings open with a slight overshoot — matches the PWA's
// cubic-bezier(0.34, 1.2, 0.64, 1) on the .book transform.
private val BookCoverEasing = CubicBezierEasing(0.34f, 1.2f, 0.64f, 1f)

/** Gilt bookmark glyph stamped at the head of each spine (mirrors the PWA spine-count icon path). */
private val BookmarkGilt: ImageVector =
    ImageVector.Builder(
        name = "spine_bookmark",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.White)) {
            moveTo(6f, 2f)
            lineTo(18f, 2f)
            lineTo(18f, 21f)
            lineTo(12f, 17f)
            lineTo(6f, 21f)
            close()
        }
    }.build()

/** Spine title font size by title length — the PWA's fontSize ramp (m-app.js buildGenreShelf). */
private fun spineFontSize(titleLen: Int): Int =
    if (titleLen <= 5) 16 else if (titleLen <= 8) 14 else if (titleLen <= 12) 12 else 11

/** One book on the shelf = one work, gathering all of its bookmarked cards. */
private data class ShelfBook(
    val workId: Long,
    val title: String,
    val series: String,
    val subtitle: String?,
    val author: String?,
    val format: String?,
    val year: Int?,
    val cards: List<CardDto>,
    val bookmarkedAt: Map<Long, String>,
    val width: Dp,
    val height: Dp,
    val leather: Color,
)

private data class GenreSection(
    val genre: String,
    val label: String,
    val count: Int,
    val books: List<ShelfBook>,
)

/** Wooden-frame colors per genre (mirrors the PWA .bookshelf.g-* CSS vars). */
private data class BookshelfColors(val frame: Long, val frameLight: Long, val back: Long)

private val BOOKSHELF_COLORS = mapOf(
    "movie" to BookshelfColors(0xFF4A2A18, 0xFF6E4A2E, 0xFF2E1D10),
    "drama" to BookshelfColors(0xFF6B4A2A, 0xFF947040, 0xFF3F2A14),
    "musical" to BookshelfColors(0xFF5A2818, 0xFF7E3A28, 0xFF321008),
    "opera" to BookshelfColors(0xFF26180E, 0xFF3F2A1A, 0xFF140A05),
    "play" to BookshelfColors(0xFF3F2818, 0xFF5C3A24, 0xFF241408),
    "novel" to BookshelfColors(0xFF4A4036, 0xFF6B5E50, 0xFF2C2620),
    "poem" to BookshelfColors(0xFF27393B, 0xFF3E585A, 0xFF142021),
    "essay" to BookshelfColors(0xFF3A4030, 0xFF58604A, 0xFF20241A),
)

private fun frameColorsFor(genre: String): BookshelfColors =
    BOOKSHELF_COLORS[genre] ?: BOOKSHELF_COLORS.getValue("movie")

@Composable
fun ArchiveScreen(
    userId: Long,
    onOpenCard: (Long) -> Unit,
) {
    val vm: ArchiveViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

    var search by remember { mutableStateOf("") }
    var genre by remember { mutableStateOf<String?>(null) } // null = 전체

    LaunchedEffect(search) {
        val q = search.trim()
        if (q.isNotBlank()) {
            delay(600)
            if (search.trim() == q) {
                AppAnalytics.track("archive_searched", mapOf("query" to q))
            }
        }
    }

    val allBooks = remember(state.bookmarks) { buildBooks(state.bookmarks) }
    val filtered = allBooks.filter { b ->
        val fmt = b.format?.lowercase() ?: ""
        val genreOk = when (genre) {
            null -> true
            "other" -> fmt !in GENRE_ORDER
            else -> fmt == genre
        }
        val q = search.trim()
        val searchOk = q.isBlank() ||
            b.title.contains(q, ignoreCase = true) ||
            (b.subtitle?.contains(q, ignoreCase = true) == true)
        genreOk && searchOk
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        // --- Header (bookstore sign) ---
        Box(modifier = Modifier.height(28.dp))
        Text(
            text = stringResource(R.string.archive_title),
            style = MaterialTheme.typography.displayMedium,
            color = Espresso,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        if (state.bookmarks.isNotEmpty()) {
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.archive_volume_count, allBooks.size) +
                    "  ·  " + stringResource(R.string.archive_card_count, state.bookmarks.size),
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

        if (allBooks.isNotEmpty()) {
            GenreChips(
                allBooks = allBooks,
                selected = genre,
                onSelect = {
                    genre = it
                    AppAnalytics.track("archive_genre_filtered", mapOf("genre" to (it ?: "all")))
                },
            )
            Box(modifier = Modifier.height(10.dp))
            ArchiveSearchField(
                value = search,
                onChange = { search = it },
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Box(modifier = Modifier.height(4.dp))
        }

        when {
            state.loading && state.bookmarks.isEmpty() -> {
                Text(
                    text = stringResource(R.string.loading),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                )
            }
            state.bookmarks.isEmpty() -> EmptyShelf()
            else -> Bookcase(
                books = filtered,
                onOpenCard = onOpenCard,
            )
        }
    }
}

@Composable
private fun GenreChips(
    allBooks: List<ShelfBook>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    val counts = allBooks.groupingBy { it.format?.lowercase() ?: "other" }.eachCount()
    val present = GENRE_ORDER.filter { counts.containsKey(it) }
    val otherCount = counts.filterKeys { it !in GENRE_ORDER }.values.sum()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chip(text = "All · ${allBooks.size}", active = selected == null) { onSelect(null) }
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

@Composable
private fun Bookcase(
    books: List<ShelfBook>,
    onOpenCard: (Long) -> Unit,
) {
    var openWorkId by remember { mutableStateOf<Long?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        if (books.isEmpty()) {
            Text(
                text = "검색 결과가 없습니다.",
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
            )
        } else {
            val sections = remember(books) { groupByGenre(books) }
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = ShelfSidePadding),
            ) {
                sections.forEach { section ->
                    item(key = "hdr-${section.genre}") {
                        GenreHeader(label = section.label, count = section.count)
                    }
                    item(key = "shelf-${section.genre}") {
                        GenreBookshelf(
                            colors = frameColorsFor(section.genre),
                            books = section.books,
                            onOpen = {
                                openWorkId = it
                                AppAnalytics.track("archive_book_opened", mapOf("work_id" to it))
                            },
                        )
                    }
                }
                item { Box(modifier = Modifier.height(56.dp)) }
            }
        }

        // --- Opened book: a popup whose cover swings open ---
        val opened = books.firstOrNull { it.workId == openWorkId }
        if (opened != null) {
            val volumeNo = books.indexOfFirst { it.workId == opened.workId } + 1
            OpenedBook(
                book = opened,
                volumeNo = volumeNo,
                onOpenCard = onOpenCard,
                onClose = { openWorkId = null },
            )
        }
    }
}

@Composable
private fun GenreHeader(label: String, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 24.dp, start = 4.dp, end = 4.dp, bottom = 10.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.headlineSmall, color = Espresso)
        Text(
            text = "$count ${if (count == 1) "BOOK" else "BOOKS"}",
            style = MetaCaps,
            color = Walnut,
        )
    }
}

/** A genre's books in a single horizontally-scrolling wooden bookcase frame (mirrors .bookshelf). */
@Composable
private fun GenreBookshelf(colors: BookshelfColors, books: List<ShelfBook>, onOpen: (Long) -> Unit) {
    val frame = Color(colors.frame)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(frame),
    ) {
        // Raised top wood band.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .background(Brush.verticalGradient(0f to Color(colors.frameLight), 1f to frame)),
        )
        // Dark interior with the single scroll row of spines; side frames via horizontal padding.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp)
                .background(Brush.verticalGradient(0f to Color(colors.back), 1f to Color(0xFF1B0E06))),
        ) {
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .heightIn(min = 212.dp)
                    .padding(horizontal = 6.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                books.forEach { book -> BookSpine(book = book, onOpen = { onOpen(book.workId) }) }
            }
        }
        // Shelf board (bottom frame).
        Box(modifier = Modifier.fillMaxWidth().height(16.dp).background(frame))
    }
}

/** Search input with a leading magnifier (mirrors .archive-search). */
@Composable
private fun ArchiveSearchField(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
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

// --- Work grouping mirrored from the PWA (group by series + subtitle + author, NOT
// work_id) so cards from duplicate work rows of the same title merge into one book. ---

private val TITLE_DISPLAY_ALIASES = mapOf(
    "titanic" to "타이타닉",
    "아저씨" to "아저씨",
)

/** Normalize a raw title via the alias map (mirrors the PWA displayTitle). */
private fun normalizeTitle(raw: String?): String {
    val t = (raw ?: "").trim()
    if (t.isEmpty()) return t
    val lc = t.lowercase()
    TITLE_DISPLAY_ALIASES[lc]?.let { return it }
    val stripped = lc.filter { it.isLetterOrDigit() }
    if (stripped.isNotEmpty()) TITLE_DISPLAY_ALIASES[stripped]?.let { return it }
    return t
}

private class SeriesPattern(val name: String, val detect: Regex, val authorDetect: Regex?, val strip: List<Regex>)

private val SERIES_PATTERNS = listOf(
    SeriesPattern(
        name = "셜록홈즈",
        detect = Regex("(?:셜록|홈즈|sherlock|holmes)", RegexOption.IGNORE_CASE),
        authorDetect = Regex("(?:코난\\s*도일|conan\\s*doyle|아서\\s*코난|arthur\\s*conan)", RegexOption.IGNORE_CASE),
        strip = listOf(
            Regex("셜록\\s*홈즈", RegexOption.IGNORE_CASE), Regex("sherlock\\s*holmes", RegexOption.IGNORE_CASE),
            Regex("셜록"), Regex("홈즈"), Regex("sherlock", RegexOption.IGNORE_CASE), Regex("holmes", RegexOption.IGNORE_CASE),
        ),
    ),
)

private val SERIES_TRIM = Regex("^[\\s\\-:·,—–의와과]+|[\\s\\-:·,—–의와과]+$")
private val MULTI_SPACE = Regex("\\s+")

/** Split a title/author into series + subtitle (mirrors the PWA extractSeries). */
private fun extractSeries(title: String, author: String): Pair<String, String> {
    val t = title.trim()
    val a = author.trim()
    if (t.isEmpty() && a.isEmpty()) return "" to ""
    for (sp in SERIES_PATTERNS) {
        val titleMatch = sp.detect.containsMatchIn(t)
        val authorMatch = sp.authorDetect?.let { a.isNotEmpty() && it.containsMatchIn(a) } ?: false
        if (titleMatch || authorMatch) {
            var subtitle = t
            if (titleMatch) for (re in sp.strip) subtitle = re.replace(subtitle, "")
            subtitle = MULTI_SPACE.replace(SERIES_TRIM.replace(subtitle, ""), " ").trim()
            return sp.name to subtitle
        }
    }
    return t to ""
}

/** (series, subtitle) honoring DB subtitle first (mirrors the PWA resolveSeriesSubtitle). */
private fun resolveSeriesSubtitle(title: String?, subtitle: String?, author: String?): Pair<String, String> {
    val dbSubtitle = subtitle?.trim().orEmpty()
    if (dbSubtitle.isNotEmpty()) return normalizeTitle(title) to dbSubtitle
    return extractSeries(normalizeTitle(title), author ?: "")
}

/** Grouping key — series__subtitle__author, lowercased (mirrors the PWA workGroupKey). */
private fun workGroupKey(title: String?, subtitle: String?, author: String?): String {
    val (series, sub) = resolveSeriesSubtitle(title, subtitle, author)
    val a = (author ?: "").lowercase().trim()
    return "${series.lowercase()}__${sub.lowercase()}__$a"
}

/** Group bookmarked cards into books by series/subtitle/author (matches the PWA shelf). */
private fun buildBooks(bookmarks: List<BookmarkRow>): List<ShelfBook> {
    val rows = bookmarks.filter { it.cards != null }
    return rows
        .groupBy { row -> row.cards!!.works.let { workGroupKey(it?.title, it?.subtitle, it?.author) } }
        .entries
        .mapIndexed { index, (_, group) ->
            val cardList = group.map { it.cards!! }
            val work = cardList.first().works
            val (series, subtitle) = resolveSeriesSubtitle(work?.title, work?.subtitle, work?.author)
            val displayName = subtitle.ifBlank { series }.ifBlank { cardList.first().quote }
            // Spine sizing mirrors the PWA: width grows with the gathered-card count, and
            // height fits the full vertical title so no characters are clipped.
            val titleLen = displayName.length
            val perChar = spineFontSize(titleLen) + 4
            val width = (44 + minOf(20, cardList.size * 3)).dp
            val height = maxOf(200, 110 + titleLen * perChar).dp
            ShelfBook(
                workId = work?.workId ?: cardList.first().workId,
                title = displayName,
                series = series,
                subtitle = subtitle.ifBlank { null },
                author = work?.author,
                format = work?.format,
                year = work?.releaseYear,
                cards = cardList,
                bookmarkedAt = group.associate { it.cards!!.cardId to it.createdAt },
                width = width,
                height = height,
                leather = Leathers[index % Leathers.size],
            )
        }
}

/** Order books into GENRE_ORDER sections (then 기타). Each genre is one scrollable shelf. */
private fun groupByGenre(books: List<ShelfBook>): List<GenreSection> {
    val sections = mutableListOf<GenreSection>()
    for (g in GENRE_ORDER) {
        val items = books.filter { (it.format?.lowercase() ?: "") == g }
        if (items.isNotEmpty()) sections.add(GenreSection(g, genreLabel(g), items.size, items))
    }
    val others = books.filter { (it.format?.lowercase() ?: "") !in GENRE_ORDER }
    if (others.isNotEmpty()) sections.add(GenreSection("other", "기타", others.size, others))
    return sections
}

/** A single work rendered as an upright, gilt-tooled leather spine. */
@Composable
private fun BookSpine(
    book: ShelfBook,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp)
    val leather = book.leather

    Box(
        modifier = Modifier
            .width(book.width)
            .height(book.height)
            .clip(shape)
            .background(
                // Cylindrical sheen: lit down the centre, darker at both edges.
                Brush.horizontalGradient(
                    0f to lerp(leather, Color.Black, 0.32f),
                    0.5f to lerp(leather, Color.White, 0.10f),
                    1f to lerp(leather, Color.Black, 0.36f),
                ),
            )
            .clickable(onClick = onOpen),
    ) {
        // Two gilt bands near the head and foot of the spine (mirrors .spine::before/::after).
        GiltBands(modifier = Modifier.align(Alignment.TopCenter).padding(top = 10.dp))
        GiltBands(modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp))

        val fs = spineFontSize(book.title.length)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 3.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Head: gilt bookmark glyph + gathered-card count.
            Icon(
                imageVector = BookmarkGilt,
                contentDescription = null,
                tint = GiltBright,
                modifier = Modifier.size(9.dp),
            )
            Box(modifier = Modifier.height(3.dp))
            Text(
                text = book.cards.size.toString(),
                fontFamily = EditorialSerif,
                fontSize = 11.sp,
                lineHeight = 11.sp,
                color = GiltBright,
            )

            // Middle: the title set vertically — each glyph upright, reading top→bottom
            // (mirrors writing-mode: vertical-rl; text-orientation: mixed). Split on spaces
            // so a word break is a small gap rather than a full blank line.
            Column(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val spineTitleStyle = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = fs.sp,
                    lineHeight = (fs + 4).sp,
                    color = GiltBright,
                    textAlign = TextAlign.Center,
                    // Tight block so the only gap between words is the spacer below.
                    platformStyle = PlatformTextStyle(includeFontPadding = false),
                    lineHeightStyle = LineHeightStyle(
                        alignment = LineHeightStyle.Alignment.Center,
                        trim = LineHeightStyle.Trim.Both,
                    ),
                )
                book.title.split(' ').filter { it.isNotBlank() }.forEachIndexed { i, word ->
                    if (i > 0) Box(modifier = Modifier.height((fs * 0.45f).dp))
                    Text(text = word.toCharArray().joinToString("\n"), style = spineTitleStyle)
                }
            }

            // Foot: small gilt genre label.
            Text(
                text = genreLabel(book.format).uppercase(),
                fontFamily = EditorialSerif,
                fontWeight = FontWeight.Bold,
                fontSize = 8.sp,
                lineHeight = 9.sp,
                letterSpacing = 1.2.sp,
                color = Gilt,
            )
        }
    }
}

/**
 * The opened book — a centered popup whose cover swings open from its left spine
 * (rotateY −100°→0° + scale 0.6→1, with a slight overshoot), over a fading backdrop.
 * Mirrors the PWA .book-modal / .book transition and layout.
 */
@Composable
private fun OpenedBook(
    book: ShelfBook,
    volumeNo: Int,
    onOpenCard: (Long) -> Unit,
    onClose: () -> Unit,
) {
    // progress 0→1 drives the open; on dismiss `visible` flips false and the real
    // onClose is deferred until the close animation finishes (cover swings shut).
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
                        drawRect(book.leather, Offset.Zero, Size(8.dp.toPx(), size.height))
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
                    BookHeader(book = book, volumeNo = volumeNo, onClose = dismiss)
                    Box(modifier = Modifier.height(20.dp))
                    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Sand))
                    Box(modifier = Modifier.height(12.dp))
                    book.cards.forEach { card ->
                        BookQuoteItem(
                            card = card,
                            bookmarkedAt = formatBookmarkDate(book.bookmarkedAt[card.cardId]),
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
private fun BookHeader(book: ShelfBook, volumeNo: Int, onClose: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val vol = "%02d".format(volumeNo)
            val eyebrow = if (!book.subtitle.isNullOrBlank())
                "${book.series} · VOLUME #$vol" else "Collected · Volume #$vol"
            Text(
                text = eyebrow.uppercase(),
                style = TextStyle(fontSize = 10.sp, letterSpacing = 0.3.em, color = Walnut),
            )
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = book.title,
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 26.sp, lineHeight = 34.sp),
                color = Espresso,
            )
            val meta = listOfNotNull(
                genreLabel(book.format),
                book.author?.ifBlank { null },
                book.year?.toString(),
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
        // Close (X) — 32dp box with a hairline walnut border, mirroring .book-close.
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

/** One gathered card in the opened book (mirrors .book-quote-item: serial, date, quote, meta). */
@Composable
private fun BookQuoteItem(
    card: CardDto,
    bookmarkedAt: String,
    onOpen: () -> Unit,
) {
    // Theme tokens are @Composable getters — read here, then use inside drawBehind.
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
            if (bookmarkedAt.isNotBlank()) {
                Text(
                    text = bookmarkedAt,
                    style = TextStyle(
                        fontSize = 10.sp,
                        letterSpacing = 0.18.em,
                        color = Sand,
                        fontWeight = FontWeight.Medium,
                    ),
                    modifier = Modifier.padding(end = 56.dp),
                )
                Box(modifier = Modifier.height(14.dp))
            }
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
        // Card serial (일련번호) — the card_id with no leading zeros (like the feed picker).
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

/** "M. d  오전/오후 h:mm" in local time — mirrors the PWA formatBookmarkDate. */
private fun formatBookmarkDate(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val instant = runCatching { OffsetDateTime.parse(iso).toInstant() }
        .recoverCatching { Instant.parse(iso) }
        .recoverCatching { LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC) }
        .getOrNull() ?: return ""
    val dt = instant.atZone(ZoneId.systemDefault())
    var h = dt.hour
    val ampm = if (h < 12) "오전" else "오후"
    h %= 12
    if (h == 0) h = 12
    val min = "%02d".format(dt.minute)
    return "${dt.monthValue}. ${dt.dayOfMonth}  $ampm $h:$min"
}

/** Double gilt line evoking the raised bands tooled across an antique spine. */
@Composable
private fun GiltBands(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Gilt.copy(alpha = 0.85f)),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Gilt.copy(alpha = 0.5f)),
        )
    }
}

/** A wooden shelf board the books rest on, with a lit front edge. */
@Composable
private fun ShelfBoard() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(16.dp)
            .background(
                Brush.verticalGradient(
                    0f to WoodLip,
                    0.12f to WoodFace,
                    1f to WoodShadow,
                ),
            ),
    )
}

@Composable
private fun EmptyShelf() {
    Column {
        Text(
            text = stringResource(R.string.empty_bookmarks),
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
        )
        ShelfBoard()
    }
}
