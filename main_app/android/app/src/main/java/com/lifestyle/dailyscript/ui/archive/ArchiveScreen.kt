package com.lifestyle.dailyscript.ui.archive

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bookmark
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.MetaCaps
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

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
private val BookGap = 6.dp

/** One book on the shelf = one work, gathering all of its bookmarked cards. */
private data class ShelfBook(
    val workId: Long,
    val title: String,
    val author: String?,
    val format: String?,
    val cards: List<CardDto>,
    val width: Dp,
    val height: Dp,
    val leather: Color,
)

@Composable
fun ArchiveScreen(
    userId: Long,
    onOpenCard: (Long) -> Unit,
) {
    val vm: ArchiveViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

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
                text = stringResource(R.string.archive_volume_count, state.bookmarks.size),
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

        Box(modifier = Modifier.height(8.dp))

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
                bookmarks = state.bookmarks,
                removingCardId = state.removingCardId,
                onOpenCard = onOpenCard,
                onRemove = { cardId -> vm.removeBookmark(userId, cardId) },
            )
        }
    }
}

@Composable
private fun Bookcase(
    bookmarks: List<BookmarkRow>,
    removingCardId: Long?,
    onOpenCard: (Long) -> Unit,
    onRemove: (Long) -> Unit,
) {
    var openWorkId by remember { mutableStateOf<Long?>(null) }
    val books = remember(bookmarks) { buildBooks(bookmarks) }

    Box(modifier = Modifier.fillMaxSize()) {
        // --- The shelves of books ---
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val available = maxWidth - ShelfSidePadding - ShelfSidePadding
            val shelves = remember(books, available) { packShelves(books, available) }

            LazyColumn(modifier = Modifier.fillMaxSize()) {
                itemsIndexed(shelves) { _, shelf ->
                    Box(modifier = Modifier.height(30.dp)) // open air of the shelf compartment
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = ShelfSidePadding),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(BookGap),
                    ) {
                        shelf.forEach { book ->
                            BookSpine(book = book, onOpen = { openWorkId = book.workId })
                        }
                    }
                    ShelfBoard()
                }
                item { Box(modifier = Modifier.height(56.dp)) }
            }
        }

        // --- Opened book: its gathered cards ---
        val opened = books.firstOrNull { it.workId == openWorkId }
        if (opened != null) {
            OpenedBook(
                book = opened,
                removingCardId = removingCardId,
                onOpenCard = onOpenCard,
                onRemove = onRemove,
                onClose = { openWorkId = null },
            )
        }
    }
}

/** Group bookmarked cards by work, newest work first, into shelf-ready books. */
private fun buildBooks(bookmarks: List<BookmarkRow>): List<ShelfBook> {
    val cards = bookmarks.mapNotNull { it.cards }
    return cards.groupBy { it.workId }.entries.mapIndexed { index, (workId, cardList) ->
        val work = cardList.first().works
        val title = work?.title ?: cardList.first().quote
        val seed = title.hashCode()
        val extra = minOf(cardList.size - 1, 5)
        val width = (46 + extra * 8 + seed.mod(2) * 4).dp
        val height = (150 + (seed / 4).mod(5) * 12).dp
        ShelfBook(
            workId = workId,
            title = title,
            author = work?.author,
            format = work?.format,
            cards = cardList,
            width = width,
            height = height,
            leather = Leathers[index % Leathers.size],
        )
    }
}

/** Greedily pack books left-to-right onto shelves that fit the available width. */
private fun packShelves(books: List<ShelfBook>, available: Dp): List<List<ShelfBook>> {
    val shelves = mutableListOf<List<ShelfBook>>()
    var current = mutableListOf<ShelfBook>()
    var used = 0.dp
    books.forEach { book ->
        val projected = if (current.isEmpty()) book.width else used + BookGap + book.width
        if (current.isNotEmpty() && projected > available) {
            shelves.add(current)
            current = mutableListOf()
            used = 0.dp
        }
        used = if (current.isEmpty()) book.width else used + BookGap + book.width
        current.add(book)
    }
    if (current.isNotEmpty()) shelves.add(current)
    return shelves
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
        GiltBands(modifier = Modifier.align(Alignment.TopCenter).padding(top = 26.dp))
        GiltBands(modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp))

        // Vertical gilt title, reading top-to-bottom.
        Text(
            text = book.title,
            modifier = Modifier
                .align(Alignment.Center)
                .width(book.height - 64.dp)
                .rotate(90f),
            fontFamily = EditorialSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.5.sp,
            color = GiltBright,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )

        if (book.cards.size > 1) {
            // Count of gathered cards, gilt-stamped near the foot of the spine.
            Text(
                text = book.cards.size.toString(),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 7.dp),
                fontFamily = EditorialSerif,
                fontSize = 11.sp,
                color = GiltBright,
            )
        }
    }
}

/** The opened book: a contents page listing every gathered card. */
@Composable
private fun OpenedBook(
    book: ShelfBook,
    removingCardId: Long?,
    onOpenCard: (Long) -> Unit,
    onRemove: (Long) -> Unit,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        Box(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clickable(onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = stringResource(R.string.back),
                    tint = Walnut,
                    modifier = Modifier.size(22.dp),
                )
            }
        }

        Box(modifier = Modifier.height(8.dp))
        Text(
            text = book.title,
            style = MaterialTheme.typography.headlineLarge,
            color = Espresso,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        val meta = listOfNotNull(
            book.author,
            book.format,
            stringResource(R.string.archive_card_count, book.cards.size),
        ).joinToString("  ·  ")
        Box(modifier = Modifier.height(4.dp))
        Text(
            text = meta.uppercase(),
            style = MetaCaps,
            color = Walnut,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        Box(modifier = Modifier.height(16.dp))

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            itemsIndexed(book.cards, key = { _, c -> c.cardId }) { index, card ->
                if (index == 0) {
                    SlipDivider()
                }
                CardSlip(
                    card = card,
                    removing = removingCardId == card.cardId,
                    onOpen = { onOpenCard(card.cardId) },
                    onRemove = { onRemove(card.cardId) },
                )
                SlipDivider()
            }
            item { Box(modifier = Modifier.height(40.dp)) }
        }
    }
}

@Composable
private fun CardSlip(
    card: CardDto,
    removing: Boolean,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "“${card.quote}”",
                style = MaterialTheme.typography.titleLarge,
                color = Espresso,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val kw = card.keywordList().firstOrNull()
            if (!kw.isNullOrBlank()) {
                Box(modifier = Modifier.height(4.dp))
                Text(text = "#$kw", style = MaterialTheme.typography.bodyMedium, color = Walnut)
            }
        }
        Box(modifier = Modifier.width(12.dp))
        Box(
            modifier = Modifier
                .size(36.dp)
                .clickable(enabled = !removing, onClick = onRemove),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Bookmark,
                contentDescription = stringResource(R.string.bookmark),
                tint = if (removing) Cta.copy(alpha = 0.4f) else Cta,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun SlipDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .height(0.5.dp)
            .background(Latte),
    )
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
