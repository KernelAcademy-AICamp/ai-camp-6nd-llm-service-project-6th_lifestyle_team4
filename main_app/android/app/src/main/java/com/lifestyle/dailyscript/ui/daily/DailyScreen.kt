package com.lifestyle.dailyscript.ui.daily

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.rememberAssetBitmap
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.MetaCaps
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.formatCount
import com.lifestyle.dailyscript.ui.util.genreLabel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

@Composable
fun DailyScreen(
    userId: Long,
    onOpenNotice: () -> Unit,
    onOpenCard: (Long) -> Unit,
    onOpenLibraryWork: (Long) -> Unit,
    vm: DailyViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    val cats = remember { mutableStateListOf<CatSpawn>() }
    val scope = rememberCoroutineScope()

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Box(modifier = Modifier.height(24.dp))
            Text(
                text = dailyDateLabel(),
                style = MetaCaps,
                color = Walnut,
            )
            Box(modifier = Modifier.height(8.dp))
            Text(
                text = "디스커버리",
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 34.sp,
                    lineHeight = 41.sp,
                ),
                color = Espresso,
            )
            Box(modifier = Modifier.height(28.dp))

            state.error?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Cta,
                )
                Box(modifier = Modifier.height(12.dp))
            }

            if (state.loading && state.allCards.isEmpty()) {
                Text(
                    text = "Loading⋯",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }

            DailyNoticeRow(
                notices = state.notices,
                onClick = {
                    AppAnalytics.track("daily_notice_clicked")
                    onOpenNotice()
                },
            )
            DailyNewBooks(
                books = state.books,
                onOpenWork = { workId ->
                    AppAnalytics.track("daily_newbook_clicked", mapOf("work_id" to workId))
                    onOpenLibraryWork(workId)
                },
            )
            DailyContextual(
                cards = state.allCards,
                onOpenCard = { card ->
                    AppAnalytics.track("daily_contextual_clicked", mapOf("card_id" to card.cardId))
                    onOpenCard(card.cardId)
                },
            )
            DailyTrending(
                cards = state.allCards,
                bookmarkCounts = state.bookmarkCounts,
                onOpenCard = { card ->
                    AppAnalytics.track("daily_trending_clicked", mapOf("card_id" to card.cardId))
                    onOpenCard(card.cardId)
                },
                onOpenAll = { onOpenLibraryWork(-1L) },
            )
            DailyOzPick(
                card = state.ozPick,
                bookmarks = state.bookmarks,
                onSpawnCat = {
                    AppAnalytics.track("daily_oz_clicked", mapOf("card_id" to (state.ozPick?.cardId ?: -1L)))
                    spawnCat(cats, screenWidth, screenHeight, scope)
                },
            )
            DailyRecent(
                bookmarks = state.bookmarks,
                onOpenCard = { card ->
                    AppAnalytics.track("daily_recent_clicked", mapOf("card_id" to card.cardId))
                    onOpenCard(card.cardId)
                },
            )

            Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
        }

        cats.forEach { cat ->
            val bitmap = rememberAssetBitmap("cat/${cat.file}")
            if (bitmap != null) {
                Image(
                    bitmap = bitmap,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .offset(x = cat.x, y = cat.y)
                        .width(cat.size)
                        .graphicsLayer {
                            rotationZ = cat.rotation
                            alpha = 0.95f
                        },
                )
            }
        }
    }
}

@Composable
private fun DailyNoticeRow(notices: List<Notice>, onClick: () -> Unit) {
    val items = notices.take(3)
    if (items.isEmpty()) return
    var index by remember(items.map { it.noticeId }) { mutableStateOf(0) }
    LaunchedEffect(items.map { it.noticeId }) {
        index = 0
        while (items.size > 1) {
            delay(10_000)
            index = (index + 1) % items.size
        }
    }
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(1.dp, shape)
            .clip(shape)
            .background(Latte)
            .border(0.5.dp, Sand, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Campaign, contentDescription = null, tint = Cta, modifier = Modifier.size(18.dp))
        Box(modifier = Modifier.width(10.dp))
        Text(
            text = items[index.coerceIn(0, items.lastIndex)].title,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = Espresso,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Box(modifier = Modifier.width(8.dp))
        Text(text = "›", style = MaterialTheme.typography.titleMedium, color = Walnut)
    }
    SectionGap()
}

@Composable
private fun DailyNewBooks(books: List<DailyWork>, onOpenWork: (Long) -> Unit) {
    val main = books.firstOrNull() ?: return
    val rest = books.drop(1).take(8)
    val work = main.work
    val sampleQuote = Markdown.cleanQuote(main.cards.firstOrNull()?.quote).take(60)
    val shape = RoundedCornerShape(14.dp)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, shape)
            .clip(shape)
            .background(Espresso)
            .border(0.5.dp, Latte.copy(alpha = 0.25f), shape)
            .clickable { onOpenWork(main.workId) }
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "NEW · 새로 들어온 고전",
                style = TextStyle(fontSize = 10.sp, letterSpacing = 0.15.em, fontWeight = FontWeight.Bold),
                color = Paper,
                modifier = Modifier
                    .background(Cta, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
            Box(modifier = Modifier.height(14.dp))
            Text(
                text = work.displayTitle().ifBlank { "—" },
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                ),
                color = Paper,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(8.dp))
            Text(
                text = listOfNotNull(work.author, work.releaseYear?.toString(), genreLabel(work.format)).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = Sand,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (sampleQuote.isNotBlank()) {
                Box(modifier = Modifier.height(12.dp))
                Text(
                    text = "\"$sampleQuote${if (sampleQuote.length >= 60) "⋯" else ""}\"",
                    style = TextStyle(
                        fontFamily = EditorialSerif,
                        fontStyle = FontStyle.Italic,
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    ),
                    color = Latte,
                )
            }
        }
        DailyBookCover(work = work, width = 90.dp)
    }

    if (rest.isNotEmpty()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(top = 16.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            rest.forEach { book ->
                Column(
                    modifier = Modifier
                        .width(82.dp)
                        .clickable { onOpenWork(book.workId) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    DailyBookCover(work = book.work, width = 82.dp)
                    Box(modifier = Modifier.height(8.dp))
                    Text(
                        text = book.work.displayTitle().ifBlank { "—" },
                        style = TextStyle(fontFamily = EditorialSerif, fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
                        color = Espresso,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                    )
                    book.work.author?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.labelSmall,
                            color = Walnut,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
    SectionGap()
}

@Composable
private fun DailyContextual(cards: List<CardDto>, onOpenCard: (CardDto) -> Unit) {
    if (cards.isEmpty()) return
    var selected by remember { mutableStateOf(ContextCategories.first().id) }
    val category = ContextCategories.firstOrNull { it.id == selected } ?: ContextCategories.first()
    val picks = remember(cards, selected) { filterContextualCards(cards, category) }
    val card = picks.firstOrNull()

    Text(text = "이럴 땐, 이런 문장", style = MaterialTheme.typography.headlineMedium, color = Espresso)
    Box(modifier = Modifier.height(4.dp))
    Text(text = "지금 마음에 맞춰 한 문장을 골라드려요", style = MaterialTheme.typography.bodySmall, color = Walnut)
    Box(modifier = Modifier.height(14.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ContextCategories.forEach { c ->
            Chip(text = c.label, active = selected == c.id) { selected = c.id }
        }
    }
    Box(modifier = Modifier.height(16.dp))

    if (card == null) {
        Text(
            text = "이 분위기에 맞는 카드는 아직 준비 중이에요",
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 24.dp),
        )
    } else {
        val labels = toneLabels(card)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .dailyCard()
                .clickable { onOpenCard(card) }
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "\"${Markdown.cleanQuote(card.quote).take(120)}\"",
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 18.sp, lineHeight = 29.sp),
                color = Espresso,
                textAlign = TextAlign.Center,
            )
            Box(modifier = Modifier.height(14.dp))
            Text(
                text = listOfNotNull(card.works?.displayTitle()?.ifBlank { null }, card.works?.author?.ifBlank { null })
                    .joinToString(" · "),
                style = MetaCaps,
                color = Walnut,
                textAlign = TextAlign.Center,
            )
            ToneLabels(labels)
        }
    }
    SectionGap()
}

@Composable
private fun DailyTrending(
    cards: List<CardDto>,
    bookmarkCounts: Map<Long, Int>,
    onOpenCard: (CardDto) -> Unit,
    onOpenAll: () -> Unit,
) {
    val scored = remember(cards, bookmarkCounts) {
        cards
            .filter { it.quote.isNotBlank() }
            .map {
                val bm = bookmarkCounts[it.cardId] ?: 0
                val cm = it.commentCount ?: 0
                val vw = it.viewCount ?: 0
                TrendingCard(it, bm, cm, vw, bm * 10 + cm * 5 + vw)
            }
            .sortedByDescending { it.score }
            .take(3)
    }
    if (scored.isEmpty()) return

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = "이번 주 인기 대사", style = MaterialTheme.typography.headlineMedium, color = Espresso)
        Text(
            text = "전체 ›",
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
            modifier = Modifier.clickable(onClick = onOpenAll),
        )
    }
    Box(modifier = Modifier.height(14.dp))
    scored.forEachIndexed { i, item ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onOpenCard(item.card) }
                .border(0.5.dp, Color.Transparent)
                .padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = "${i + 1}",
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 22.sp),
                color = Espresso,
                modifier = Modifier.width(20.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "\"${Markdown.cleanQuote(item.card.quote).take(80)}\"",
                    style = TextStyle(fontFamily = EditorialSerif, fontSize = 14.sp, lineHeight = 21.sp),
                    color = Espresso,
                )
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = "북마크 ${formatCount(item.bookmarks)}   조회 ${formatCount(item.views)}   댓글 ${formatCount(item.comments)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                )
            }
        }
        Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
    }
    SectionGap()
}

@Composable
private fun DailyOzPick(
    card: CardDto?,
    bookmarks: List<BookmarkRow>,
    onSpawnCat: () -> Unit,
) {
    if (card == null) return
    val taste = remember(bookmarks) { bookmarks.mapNotNull { it.cards }.flatMap { it.keywordList() }.toSet() }
    val matchedKeyword = card.keywordList().firstOrNull { it in taste }
    val reason = if (matchedKeyword != null) {
        "'$matchedKeyword'에 자주 머무는 당신이라면, 좋아할 한 문장이에요."
    } else {
        "오즈가 오늘 골라드린 한 문장이에요."
    }
    val work = card.works
    val cat = rememberAssetBitmap("cat/cat_shelf_few.png")

    Text(text = "오즈의 오늘의 추천", style = MaterialTheme.typography.headlineMedium, color = Espresso)
    Box(modifier = Modifier.height(14.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .dailyCard()
            .clickable(onClick = onSpawnCat)
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (cat != null) {
                Image(bitmap = cat, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.width(72.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = "오즈", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = Espresso)
                Text(
                    text = listOfNotNull("당신의 취향", work?.format?.let { genreLabel(it) }, matchedKeyword).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Box(modifier = Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Latte, RoundedCornerShape(8.dp))
                .border(0.5.dp, Sand, RoundedCornerShape(8.dp))
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Text(
                text = reason,
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 13.sp, lineHeight = 21.sp),
                color = Espresso,
            )
        }
        Box(modifier = Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DailyBookCover(work = work, width = 56.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = work.displayTitle().ifBlank { "—" },
                    style = TextStyle(fontFamily = EditorialSerif, fontSize = 15.sp, fontWeight = FontWeight.Bold),
                    color = Espresso,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = listOfNotNull(work?.author, work?.releaseYear?.toString()).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = Walnut,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
    SectionGap()
}

@Composable
private fun DailyRecent(bookmarks: List<BookmarkRow>, onOpenCard: (CardDto) -> Unit) {
    val latest = remember(bookmarks) {
        bookmarks.maxByOrNull { parseEpochMillis(it.createdAt) ?: 0L }
    }
    val card = latest?.cards ?: return
    val work = card.works
    Text(
        text = "다시 만나기",
        style = TextStyle(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 20.sp),
        color = Espresso,
    )
    Box(modifier = Modifier.height(6.dp))
    Text(text = "지난주 담아둔 문장, 다시 읽어볼까요", style = MaterialTheme.typography.bodySmall, color = Walnut)
    Box(modifier = Modifier.height(14.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .dailyCard()
            .clickable { onOpenCard(card) }
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        DailyBookCover(work = work, width = 64.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "\"${Markdown.cleanQuote(card.quote)}\"",
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 14.sp, lineHeight = 22.sp),
                color = Espresso,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(8.dp))
            Text(
                text = "${work.displayTitle().ifBlank { "—" }} · ${bookmarkAge(latest.createdAt)} 북마크",
                style = MetaCaps,
                color = Walnut,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
    SectionGap()
}

@Composable
private fun DailyBookCover(work: WorkDto?, width: Dp) {
    val coverUrl = work?.coverUrl?.takeIf { it.startsWith("http") }
    var failed by remember(coverUrl) { mutableStateOf(false) }
    val shape = RoundedCornerShape(4.dp)
    if (coverUrl != null && !failed) {
        AsyncImage(
            model = coverUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            onError = { failed = true },
            modifier = Modifier
                .width(width)
                .aspectRatio(132f / 188f)
                .shadow(4.dp, shape)
                .clip(shape),
        )
    } else {
        BookCover(
            work = work,
            compact = width < 80.dp,
            modifier = Modifier
                .width(width)
                .aspectRatio(132f / 188f),
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
        Text(text = text, style = MaterialTheme.typography.labelSmall, color = if (active) Paper else Walnut)
    }
}

@Composable
private fun ToneLabels(labels: ToneLabelSet) {
    val items = listOfNotNull(
        labels.temp?.let { "온도" to it },
        labels.intensity?.let { "감도" to it },
        labels.aftertaste?.let { "여운" to it },
    )
    if (items.isEmpty()) return
    Box(modifier = Modifier.height(14.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally), modifier = Modifier.fillMaxWidth()) {
        items.forEach { (label, value) ->
            Text(
                text = "$label $value",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                color = Cta,
            )
        }
    }
}

@Composable
private fun Modifier.dailyCard(): Modifier {
    val shape = RoundedCornerShape(14.dp)
    return this
        .shadow(1.dp, shape)
        .clip(shape)
        .background(CardWarm)
        .border(0.5.dp, Latte, shape)
}

@Composable
private fun SectionGap() {
    Box(modifier = Modifier.height(36.dp))
}

private fun dailyDateLabel(): String {
    val d = LocalDate.now()
    val day = listOf("월", "화", "수", "목", "금", "토", "일")[d.dayOfWeek.value - 1]
    return "%04d · %02d · %02d · %s".format(d.year, d.monthValue, d.dayOfMonth, day)
}

private data class ContextCategory(
    val id: String,
    val label: String,
    val keywords: List<String>,
    val toneScore: (Double?, Double?) -> Int,
)

private val ContextCategories = listOf(
    ContextCategory(
        id = "comfort",
        label = "위로가 필요할 때",
        keywords = listOf("위로", "슬픔", "아픔", "눈물", "치유", "회복", "안식", "평온", "포근", "따뜻", "따스", "기댐", "감싸", "쓰다듬", "받아들", "용서", "슬퍼", "아파"),
        toneScore = { t, i -> (if (t != null && t < 0.6) 2 else if (t != null && t < 0.8) 1 else 0) + if (i != null && i < 0.7) 1 else 0 },
    ),
    ContextCategory(
        id = "flutter",
        label = "설레는 날",
        keywords = listOf("사랑", "설렘", "첫사랑", "두근", "떨림", "봄", "꽃", "만남", "청춘", "달콤", "가슴", "설레", "연인", "키스", "입맞춤", "미소", "눈빛", "입술"),
        toneScore = { t, i -> (if (t != null && t > 0.5) 2 else if (t != null && t > 0.3) 1 else 0) + if (i != null && i > 0.4) 1 else 0 },
    ),
    ContextCategory(
        id = "lonely",
        label = "먹먹한 밤",
        keywords = listOf("외로움", "그리움", "고독", "적막", "침묵", "회상", "공허", "먹먹", "쓸쓸", "낙엽", "회한", "밤하늘", "혼자", "홀로", "잊혀", "그립", "추억", "낙심", "비"),
        toneScore = { t, i -> (if (t != null && t < 0.5) 2 else 0) + if (i != null && i < 0.5) 2 else if (i != null && i < 0.7) 1 else 0 },
    ),
    ContextCategory(
        id = "resolve",
        label = "결심이 필요할 때",
        keywords = listOf("결심", "의지", "도전", "용기", "운명", "신념", "다짐", "각오", "맞서", "투지", "이겨", "포기하지", "나아", "극복", "굳건", "강인", "싸움", "꿈", "희망", "믿음"),
        toneScore = { t, i -> (if (i != null && i > 0.6) 2 else if (i != null && i > 0.4) 1 else 0) + if (t != null && t > 0.5) 1 else 0 },
    ),
)

private fun filterContextualCards(cards: List<CardDto>, category: ContextCategory): List<CardDto> =
    cards.mapNotNull { card ->
        val haystack = (
            card.keywordList().joinToString(" ") + " " +
                card.quote + " " +
                card.scriptExcerpt + " " +
                (card.significance ?: "")
            ).lowercase()
        val hits = category.keywords.count { haystack.contains(it.lowercase()) }
        if (hits == 0) null
        else card to hits * 3 + category.toneScore(normTone(card.temperature.toDouble()), normTone(card.intensity.toDouble()))
    }
        .sortedByDescending { it.second }
        .take(12)
        .map { it.first }

private data class ToneLabelSet(val temp: String?, val intensity: String?, val aftertaste: String?)

private fun toneLabels(card: CardDto): ToneLabelSet {
    val t = normTone(card.temperature.toDouble())
    val i = normTone(card.intensity.toDouble())
    val temp = when {
        t == null -> null
        t < 0.2 -> "차가움"
        t < 0.4 -> "차분함"
        t < 0.6 -> "미지근"
        t < 0.8 -> "따스함"
        else -> "뜨거움"
    }
    val intensity = when {
        i == null -> null
        i < 0.2 -> "잔잔"
        i < 0.4 -> "조용"
        i < 0.6 -> "적당"
        i < 0.8 -> "짙음"
        else -> "강렬"
    }
    val baseLen = (card.significance?.length ?: 0).takeIf { it > 0 } ?: (card.scriptExcerpt.length / 8)
    val aftertaste = when {
        baseLen <= 0 -> null
        baseLen < 40 -> "짧음"
        baseLen < 80 -> "담백"
        baseLen < 140 -> "보통"
        baseLen < 220 -> "깊음"
        else -> "길음"
    }
    return ToneLabelSet(temp, intensity, aftertaste)
}

private fun normTone(n: Double): Double? {
    if (!n.isFinite()) return null
    return when {
        n > 10.0 -> (n / 100.0).coerceIn(0.0, 1.0)
        n > 1.0 -> (n / 10.0).coerceIn(0.0, 1.0)
        else -> n.coerceIn(0.0, 1.0)
    }
}

private data class TrendingCard(
    val card: CardDto,
    val bookmarks: Int,
    val comments: Int,
    val views: Int,
    val score: Int,
)

private data class CatSpawn(
    val id: Long,
    val file: String,
    val size: Dp,
    val x: Dp,
    val y: Dp,
    val rotation: Float,
)

private val RandomCatFiles = listOf(
    "cat_confused.png",
    "cat_empty.png",
    "cat_idle.png",
    "cat_shelf_few.png",
    "cat_shelf_many.png",
    "cat_struck.png",
)

private fun spawnCat(
    cats: MutableList<CatSpawn>,
    maxWidth: Dp,
    maxHeight: Dp,
    scope: kotlinx.coroutines.CoroutineScope,
) {
    val size = (60 + Random.nextInt(51)).dp
    val xMax = (maxWidth - size - 24.dp).coerceAtLeast(0.dp)
    val yMax = (maxHeight * 0.70f - size).coerceAtLeast(90.dp)
    val cat = CatSpawn(
        id = System.nanoTime(),
        file = RandomCatFiles.random(),
        size = size,
        x = 12.dp + (xMax.value * Random.nextFloat()).dp,
        y = 70.dp + ((yMax - 70.dp).coerceAtLeast(0.dp).value * Random.nextFloat()).dp,
        rotation = Random.nextInt(-15, 16).toFloat(),
    )
    cats.add(cat)
    scope.launch {
        delay(10_000)
        cats.removeAll { it.id == cat.id }
    }
}

private fun bookmarkAge(iso: String): String {
    val millis = parseEpochMillis(iso) ?: return "언젠가"
    val days = ((System.currentTimeMillis() - millis).coerceAtLeast(0L)) / (24L * 60L * 60L * 1000L)
    return when (days) {
        0L -> "오늘"
        1L -> "어제"
        else -> "${days}일 전"
    }
}

private fun parseEpochMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    runCatching { return OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(iso).toEpochMilli() }
    runCatching { return LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC).toEpochMilli() }
    return null
}
