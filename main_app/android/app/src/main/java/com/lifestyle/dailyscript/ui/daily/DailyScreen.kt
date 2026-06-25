package com.lifestyle.dailyscript.ui.daily

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.Campaign
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.CardTheme
import com.lifestyle.dailyscript.data.model.BookmarkRow
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.data.model.Notice
import com.lifestyle.dailyscript.data.model.UserPrefs
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.Chip
import com.lifestyle.dailyscript.ui.components.rememberAssetBitmap
import com.lifestyle.dailyscript.ui.library.LibraryBook
import com.lifestyle.dailyscript.ui.library.OpenedLibraryBook
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSans
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.MetaCaps
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.formatCount
import com.lifestyle.dailyscript.ui.util.genreLabel
import com.lifestyle.dailyscript.ui.util.parseEpochMillis
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

@Composable
fun DailyScreen(
    userId: Long,
    isAnonymous: Boolean,
    nickname: String,
    loginId: String?,
    onOpenNotice: () -> Unit,
    onOpenCard: (Long) -> Unit,
    onRequestPreferences: () -> Unit,
    vm: DailyViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }
    // 프로필 편집에서 장르·주제를 바꾸면 OZ 픽/취향 메타를 즉시 갱신 (로드된 선호와 달라졌을 때만).
    val persistedPrefs by AppPreferences.userPrefs.collectAsState(initial = null)
    LaunchedEffect(persistedPrefs) {
        if (state.loaded && persistedPrefs != state.prefs) vm.load(userId, force = true)
    }

    // 새 책 탭 → LIBRARY 화면으로 이동하지 않고 daily 에 머문 채 책 펼침 팝업만 표시 (PWA 0ec4ed4).
    var openWorkId by remember { mutableStateOf<Long?>(null) }

    Box(
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
            Box(modifier = Modifier.height(24.dp))

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
                    openWorkId = workId
                },
            )
            // PWA 09d61cf 패리티: '이럴 땐, 이런 문장'(DailyContextual)·'다시 만나기'(DailyRecent) 숨김.
            // 순서: notice → 신작(new-books) → 당신을 위한(OzPick) → 이번 주 인기 대사(Trending).
            DailyOzPick(
                card = state.ozPick,
                bookmarks = state.bookmarks,
                prefs = state.prefs,
                isAnonymous = isAnonymous,
                nickname = nickname,
                loginId = loginId,
                onOpenCard = { card ->
                    AppAnalytics.track("daily_oz_clicked", mapOf("card_id" to card.cardId))
                    onOpenCard(card.cardId)
                },
                onRequestPreferences = {
                    AppAnalytics.track("daily_oz_pref_cta")
                    onRequestPreferences()
                },
            )
            DailyTrending(
                cards = state.allCards,
                bookmarkCounts = state.bookmarkCounts,
                commentCounts = state.commentCounts,
                onOpenCard = { card ->
                    AppAnalytics.track("daily_trending_clicked", mapOf("card_id" to card.cardId))
                    onOpenCard(card.cardId)
                },
            )

            Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
        }

        // 새 책 펼침 팝업 — daily 에 머문 채 그 작품의 모인 명대사를 LIBRARY 와 동일한 모달로 보여준다.
        val openedWork = state.books.firstOrNull { it.workId == openWorkId }
        if (openedWork != null) {
            val bookmarkedIds = remember(state.bookmarks) { state.bookmarks.map { it.cardId }.toSet() }
            OpenedLibraryBook(
                book = LibraryBook(
                    workId = openedWork.workId,
                    workIds = setOf(openedWork.workId),
                    work = openedWork.work,
                    cards = openedWork.cards,
                ),
                bookmarkedCardIds = bookmarkedIds,
                onOpenCard = { cardId ->
                    openWorkId = null
                    onOpenCard(cardId)
                },
                onClose = { openWorkId = null },
            )
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
    if (books.isEmpty()) return
    // PWA renderDailyNewBooks: pool = latest 9 works; the featured hero rotates every 10s.
    val pool = remember(books) { books.take(9) }
    var mainIdx by remember(pool) { mutableStateOf(0) }
    // 슬라이드 방향(1=다음, -1=이전) — 자동순환/스와이프/점에서 갱신해 AnimatedContent 전환에 사용.
    var direction by remember(pool) { mutableStateOf(1) }
    // 사용자가 스와이프·점을 누르면 자동순환 정지(PWA stopNewbooksRotation 과 동일).
    var paused by remember(pool) { mutableStateOf(false) }
    LaunchedEffect(pool, paused) {
        if (paused) return@LaunchedEffect
        while (pool.size > 1) {
            delay(10_000)
            direction = 1
            mainIdx = (mainIdx + 1) % pool.size
        }
    }
    val safeIdx = mainIdx.coerceIn(0, pool.lastIndex)

    // 날짜는 각 책의 등록일(newestMillis)로 DailyNewBookHero 안에서 책마다 계산한다 (카드 넘기면 날짜도 바뀜).

    // 높이 고정 + 방향성 슬라이드. 고스트(alpha 0)로 9권 중 최대 높이를 잡고,
    // 그 위에 AnimatedContent 로 현재 카드만 슬라이드 전환(PWA: 왼쪽=다음, 오른쪽=이전).
    // 검정 배경 카드(그림자·둥근모서리·검정·보더)는 이 Box 가 고정으로 그리고,
    // 그 안의 내용(텍스트·표지)만 슬라이드된다 (clip 으로 슬라이드 내용이 둥근 카드 안에 갇힘).
    val cardShape = RoundedCornerShape(14.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, cardShape)
            .clip(cardShape)
            .background(Espresso)
            .border(0.5.dp, Latte.copy(alpha = 0.25f), cardShape),
    ) {
        pool.forEach { ghost ->
            DailyNewBookHero(
                hero = ghost,
                modifier = Modifier
                    .fillMaxWidth()
                    .alpha(0f),
            )
        }
        AnimatedContent(
            targetState = safeIdx,
            modifier = Modifier.matchParentSize(),
            transitionSpec = {
                val dir = direction
                (slideInHorizontally(animationSpec = tween(420)) { w -> dir * w } + fadeIn(tween(340))) togetherWith
                    (slideOutHorizontally(animationSpec = tween(380)) { w -> -dir * w } + fadeOut(tween(300)))
            },
            label = "daily-newbook-hero",
        ) { idx ->
            val hero = pool[idx.coerceIn(0, pool.lastIndex)]
            DailyNewBookHero(
                hero = hero,
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(pool.size) {
                        if (pool.size <= 1) return@pointerInput
                        var total = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { total = 0f },
                            onHorizontalDrag = { change, amount ->
                                total += amount
                                change.consume()
                            },
                            onDragEnd = {
                                if (abs(total) >= 45.dp.toPx()) {
                                    val cur = mainIdx.coerceIn(0, pool.lastIndex)
                                    val dir = if (total < 0) 1 else -1
                                    direction = dir
                                    mainIdx = (cur + dir + pool.size) % pool.size
                                    paused = true
                                }
                            },
                        )
                    }
                    .clickable { onOpenWork(hero.workId) },
            )
        }
    }

    // 위치 표시 점 — 현재=Espresso, 나머지=Sand. 탭하면 해당 책으로 전환(자동순환 정지).
    if (pool.size > 1) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            pool.forEachIndexed { i, _ ->
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(if (i == safeIdx) Espresso else Sand)
                        .clickable {
                            if (i != safeIdx) {
                                direction = if (i > safeIdx) 1 else -1
                                paused = true
                                mainIdx = i
                            }
                        },
                )
            }
        }
    }

    // 아래 작은 표지 줄 — 큰 카드 회전과 무관하게 전체 풀을 고정 순서로 나열(재배열·현재 책 제외 안 함).
    if (pool.size > 1) {
        // 가로 스크롤 가능함을 알리는 좌/우 연한 화살표 힌트. 더 넘길 수 있는 방향에만 표시.
        val coverScroll = rememberScrollState()
        val coverHeight = 82.dp * (188f / 132f)
        val leftCaret by animateFloatAsState(
            targetValue = if (coverScroll.canScrollBackward) 0.5f else 0f,
            label = "newbook-caret-left",
        )
        val rightCaret by animateFloatAsState(
            targetValue = if (coverScroll.canScrollForward) 0.5f else 0f,
            label = "newbook-caret-right",
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 18.dp, bottom = 4.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(coverScroll),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                pool.forEach { book ->
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
                                // PWA 작은 표지 작가: 10px (제목 11px 보다 한 단계 작게).
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                color = Walnut,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
            // 좌/우 끝 화살표 — coverHeight 만큼만 차지해 표지 세로 중앙에 정렬, 더 넘길 수 있을 때만 보임.
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .height(coverHeight)
                    .width(34.dp)
                    .alpha(leftCaret)
                    .background(Brush.horizontalGradient(listOf(Paper, Color.Transparent))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronLeft,
                    contentDescription = null,
                    tint = Espresso,
                    modifier = Modifier.size(26.dp),
                )
            }
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .height(coverHeight)
                    .width(34.dp)
                    .alpha(rightCaret)
                    .background(Brush.horizontalGradient(listOf(Color.Transparent, Paper))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronRight,
                    contentDescription = null,
                    tint = Espresso,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
    }
    SectionGap()
}

// 새 책 hero 카드의 '내용' — 날짜·NEW 뱃지·제목·저자·인용 + 표지.
// 검정 배경/둥근모서리/그림자/보더는 부모 Box 가 고정으로 그리고, 여기선 슬라이드되는 내용만 그린다.
// modifier 로 사이즈/클릭/스와이프를 외부에서 주입(고스트는 alpha 0, 보이는 카드는 클릭·드래그).
@Composable
private fun DailyNewBookHero(
    hero: DailyWork,
    modifier: Modifier = Modifier,
) {
    val work = hero.work
    val intro = work.intro?.trim().orEmpty()
    val sampleQuote = Markdown.cleanQuote(hero.cards.firstOrNull()?.quote).take(60)
    // 날짜 = 그 책의 등록일(가장 최신 카드 created_at = newestMillis). 값이 없으면(0) 오늘로 폴백.
    // 날짜=Sand 굵게, 요일=Cta. Cta 는 @Composable 게터라 remember 람다 밖에서 읽어 캡처.
    val ctaColor = Cta
    val dateLabel = remember(hero.newestMillis, ctaColor) {
        val date = if (hero.newestMillis > 0L) {
            Instant.ofEpochMilli(hero.newestMillis).atZone(ZoneId.systemDefault()).toLocalDate()
        } else {
            LocalDate.now()
        }
        val dayKo = listOf("일", "월", "화", "수", "목", "금", "토")[date.dayOfWeek.value % 7]
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                append("${date.year}년 ${date.monthValue}월 ${date.dayOfMonth}일 ")
            }
            withStyle(SpanStyle(color = ctaColor)) {
                append("${dayKo}요일")
            }
        }
    }
    // 텍스트 컬럼 간격은 PWA renderDailyNewBooks 의 마진을 그대로 옮긴 값.
    // 카드 padding 24/22 · inner gap 20 · 날짜 mb13 · NEW→제목 10 · 제목 28/lh1.25 · 제목→메타 5 · 메타→본문 15.
    Row(
        modifier = modifier
            .padding(horizontal = 22.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(20.dp),
        // PWA .daily-newbook-main-inner: align-items:center → 표지를 텍스트 기준 세로 중앙 정렬.
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = dateLabel,
                // PWA 날짜 <p> font-weight:500 (년월일 span 만 700 으로 덮어씀).
                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.04.em),
                color = Sand,
            )
            Box(modifier = Modifier.height(13.dp))
            Text(
                text = "NEW · 새로 들어온 고전",
                style = TextStyle(fontSize = 10.sp, letterSpacing = 0.15.em, fontWeight = FontWeight.Bold),
                color = Paper,
                modifier = Modifier
                    .background(Cta, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
            Box(modifier = Modifier.height(10.dp))
            Text(
                text = work.displayTitle().ifBlank { "—" },
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp,
                    lineHeight = 35.sp,
                    letterSpacing = (-0.02).em,
                ),
                color = Paper,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.height(5.dp))
            Text(
                // PWA: 작가 · 출간년도+'년' · 장르. 메타 라인 fontSize 11 / letter-spacing 0.05em / 3px 들여쓰기.
                text = listOfNotNull(work.author, work.releaseYear?.let { "${it}년" }, genreLabel(work.format))
                    .joinToString(" · "),
                style = TextStyle(fontSize = 11.sp, letterSpacing = 0.05.em),
                color = Sand,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 3.dp),
            )
            // 책 소개(intro)는 고딕체(EditorialSans)로, 없으면 명대사 폴백(serif italic + 따옴표).
            // 둘 다 14sp / line-height 1.75(≈24.5sp) / 3줄 클램프.
            if (intro.isNotBlank()) {
                Box(modifier = Modifier.height(15.dp))
                Text(
                    text = intro,
                    style = TextStyle(
                        fontFamily = EditorialSans,
                        fontSize = 14.sp,
                        lineHeight = 24.5.sp,
                    ),
                    color = Latte,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            } else if (sampleQuote.isNotBlank()) {
                Box(modifier = Modifier.height(15.dp))
                Text(
                    text = "\"$sampleQuote${if (sampleQuote.length >= 60) "⋯" else ""}\"",
                    style = TextStyle(
                        fontFamily = EditorialSerif,
                        fontStyle = FontStyle.Italic,
                        fontSize = 14.sp,
                        lineHeight = 24.5.sp,
                    ),
                    color = Latte,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        DailyBookCover(work = work, width = 82.dp)
    }
}

@Composable
private fun DailyContextual(cards: List<CardDto>, onOpenCard: (CardDto) -> Unit) {
    if (cards.isEmpty()) return
    // PWA renderDailyContextual: 카드가 1장 이상 매칭되는 카테고리만 후보로(빈 칩 방지).
    val allCats = remember(cards) { ContextCategories.filter { filterContextualCards(cards, it).isNotEmpty() } }
    if (allCats.isEmpty()) return
    // PWA _dailySeed(): 로컬 자정 epoch ms / 86,400,000 (자정마다 +1). 칩 시작점·카드 오프셋에 사용.
    val seed = remember {
        LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() / 86_400_000L
    }
    // 하루 3개씩만 노출 — 일별 시드로 시작점을 돌려 매일 다른 조합. (후보 3개 이하면 전부.)
    val dailyCats = remember(allCats, seed) {
        val count = 3
        if (allCats.size <= count) allCats
        else {
            val start = (seed % allCats.size).toInt()
            List(count) { k -> allCats[(start + k) % allCats.size] }
        }
    }
    var selected by remember(dailyCats) { mutableStateOf(dailyCats.first().id) }
    val category = dailyCats.firstOrNull { it.id == selected } ?: dailyCats.first()
    val picks = remember(cards, category) { filterContextualCards(cards, category) }
    // 일별 시드를 오프셋으로 더해 매일 다른 카드가 첫 화면에 오도록.
    val card = if (picks.isEmpty()) null else picks[(seed % picks.size).toInt()]

    Text(text = "이럴 땐, 이런 문장", style = MaterialTheme.typography.headlineMedium, color = Espresso)
    Box(modifier = Modifier.height(4.dp))
    Text(text = "끌리는 주제를 골라, 새로운 문장을 만나보세요.", style = MaterialTheme.typography.bodySmall, color = Walnut)
    Box(modifier = Modifier.height(12.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        dailyCats.forEach { c ->
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
        val keywords = card.keywordList().map { it.trim() }.filter { it.isNotEmpty() }.take(3)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .dailyCard()
                .clickable { onOpenCard(card) }
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "\"${card.quote.take(120)}\"",
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 18.sp, lineHeight = 29.sp),
                color = Espresso,
                textAlign = TextAlign.Center,
            )
            Box(modifier = Modifier.height(14.dp))
            Text(
                text = listOfNotNull(card.works?.title?.ifBlank { null }, card.works?.author?.ifBlank { null })
                    .joinToString(" · "),
                style = MetaCaps,
                color = Walnut,
                textAlign = TextAlign.Center,
            )
            // PWA: 온도/감도/여운 대신 카드 키워드 칩(#키워드, 최대 3개)을 보여준다.
            if (keywords.isNotEmpty()) {
                Box(modifier = Modifier.height(16.dp))
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                ) {
                    keywords.forEach { kw ->
                        Text(
                            text = "#$kw",
                            style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
                            color = Cta,
                            modifier = Modifier
                                .background(Latte, CircleShape)
                                .padding(horizontal = 11.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
    SectionGap()
}

@Composable
private fun DailyTrending(
    cards: List<CardDto>,
    bookmarkCounts: Map<Long, Int>,
    commentCounts: Map<Long, Int>,
    onOpenCard: (CardDto) -> Unit,
) {
    val scored = remember(cards, bookmarkCounts, commentCounts) {
        cards
            .filter { it.quote.isNotBlank() }
            .map {
                val bm = bookmarkCounts[it.cardId] ?: 0
                // 댓글 수는 card_comments 집계 Map 우선(PWA 동일), 없으면 denormalized 컬럼 폴백.
                val cm = commentCounts[it.cardId] ?: it.commentCount ?: 0
                val vw = it.viewCount ?: 0
                // PWA renderDailyTrending: score = bookmark + comment + view (equal weight).
                TrendingCard(it, bm, cm, vw, bm + cm + vw)
            }
            .sortedByDescending { it.score }
            .take(3)
    }
    if (scored.isEmpty()) return

    Text(text = "이번 주 인기 대사", style = MaterialTheme.typography.headlineMedium, color = Espresso)
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
    prefs: UserPrefs?,
    isAnonymous: Boolean,
    nickname: String,
    loginId: String?,
    onOpenCard: (CardDto) -> Unit,
    onRequestPreferences: () -> Unit,
) {
    // 익명 + 활성 선호 없음 → 카드 대신 개인화 유도 CTA (PWA renderDailyOzPick 게스트 분기).
    if (isAnonymous && prefs?.hasActive() != true) {
        DailyOzPickCta(nickname = nickname, onRequestPreferences = onRequestPreferences)
        return
    }
    if (card == null) return
    val taste = remember(bookmarks) { bookmarks.mapNotNull { it.cards }.flatMap { it.keywordList() }.toSet() }
    // 추천 한마디 — 고른 주제 > 행동 취향 > 일반 순 (PWA themeHit > tasteHit > 기본).
    val themeHit = if (prefs != null && !prefs.any && prefs.themes.isNotEmpty()) {
        CardTheme.cardThemeSet(card.keywordList()).firstOrNull { it in prefs.themes }
    } else {
        null
    }
    val tasteHit = card.keywordList().firstOrNull { it in taste }
    val work = card.works
    val cat = rememberAssetBitmap("cat/cat_computer.png")
    // 선호 메타 — 고른 장르/주제(없으면 상관없음). PWA genreText/themeText.
    val genreText = (prefs?.genres ?: emptyList()).joinToString(", ") { genreLabel(it) }.ifBlank { "상관없음" }
    val themeText = if (prefs?.any == true) "상관없음"
        else (prefs?.themes ?: emptyList()).joinToString(", ").ifBlank { "상관없음" }
    // Cta/Espresso 는 @Composable 게터라 AnnotatedString 빌더 밖(컴포지션)에서 읽어 캡처.
    val ctaColor = Cta
    val espressoColor = Espresso
    // PWA reasonHtml — 매칭 키워드만 굵게.
    val reason = buildAnnotatedString {
        when {
            themeHit != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("'$themeHit'") }
                append(" 이야기를 좋아한다면, 이 작품이 잘 맞을 거예요.")
            }
            tasteHit != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("'$tasteHit'") }
                append("에 자주 머무는 당신이라면, 좋아할 한 문장이에요.")
            }
            else -> append("오즈가 오늘 골라드린 한 문장이에요.")
        }
    }
    // PWA 카드 헤더 메타 — 닉네임(>아이디>당신) 굵게 + '님', 장르/주제 라벨 코랄. 한 블록.
    val userName = nickname.ifBlank { loginId.orEmpty() }
    val metaText = buildAnnotatedString {
        if (userName.isNotBlank()) {
            withStyle(SpanStyle(fontSize = 15.sp, color = espressoColor, fontWeight = FontWeight.Bold)) { append(userName) }
            append(" 님")
        } else {
            withStyle(SpanStyle(fontSize = 15.sp, color = espressoColor, fontWeight = FontWeight.Bold)) { append("당신") }
        }
        append("\n")
        withStyle(SpanStyle(color = ctaColor, fontWeight = FontWeight.Bold)) { append("장르") }
        append(" : $genreText\n")
        withStyle(SpanStyle(color = ctaColor, fontWeight = FontWeight.Bold)) { append("주제") }
        append(" : $themeText")
    }

    DailyOzPickHeading()
    Box(modifier = Modifier.height(4.dp))
    Text(text = "오즈가 당신의 취향을 살펴 골랐어요.", style = MaterialTheme.typography.bodySmall, color = Walnut)
    Box(modifier = Modifier.height(12.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .dailyCard()
            .clickable { onOpenCard(card) }
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            if (cat != null) {
                Image(bitmap = cat, contentDescription = "오즈", contentScale = ContentScale.Fit, modifier = Modifier.width(140.dp))
            }
            Text(
                text = metaText,
                style = TextStyle(fontSize = 11.sp, lineHeight = 21.sp),
                color = Walnut,
                modifier = Modifier.weight(1f),
            )
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
                    text = work?.title?.takeIf { it.isNotBlank() } ?: "—",
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

/** "당신을 위한 Daily Script." — PWA renderDailyOzPick 섹션 헤더(끝 점은 코랄). */
@Composable
private fun DailyOzPickHeading() {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(
            text = "당신을 위한 ",
            style = MaterialTheme.typography.titleMedium.copy(fontFamily = EditorialSerif, fontSize = 17.sp),
            color = Espresso,
        )
        Text(
            text = "Daily Script",
            style = MaterialTheme.typography.headlineMedium.copy(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 24.sp),
            color = Espresso,
        )
        Text(
            text = ".",
            style = MaterialTheme.typography.headlineMedium.copy(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 24.sp),
            color = Cta,
        )
    }
}

/** 게스트/무선호 사용자에게 취향 설정을 유도하는 OZ Pick CTA (PWA renderDailyOzPick guest 카드). */
@Composable
private fun DailyOzPickCta(nickname: String, onRequestPreferences: () -> Unit) {
    val cat = rememberAssetBitmap("cat/cat_computer.png")
    DailyOzPickHeading()
    Box(modifier = Modifier.height(8.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .dailyCard()
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            if (cat != null) {
                Image(bitmap = cat, contentDescription = "오즈", contentScale = ContentScale.Fit, modifier = Modifier.width(140.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = nickname.ifBlank { "게스트" },
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                    color = Espresso,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Box(modifier = Modifier.height(6.dp))
                Text(
                    text = "아직 당신의 취향을 몰라요",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
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
                text = "좋아하는 장르와 주제만 알려주시면, 오즈가 매일 딱 맞는 한 문장을 골라드려요.",
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 13.sp, lineHeight = 21.sp),
                color = Espresso,
            )
        }
        Box(modifier = Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Cta)
                .clickable(onClick = onRequestPreferences)
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "취향 알려주기",
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                color = Paper,
            )
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
    Text(text = "담아둔 문장, 다시 읽어볼까요?", style = MaterialTheme.typography.bodySmall, color = Walnut)
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

private data class ContextCategory(
    val id: String,
    val label: String,
    val keywords: List<String>,
)

// PWA CONTEXT_CATEGORIES (renderDailyContextual): 14 moods, matched purely on a card's
// structured keywords (LLM 3 tags) — quote/script/significance·tone are NOT used for matching.
// 하루 3개씩 일별 시드로 회전 노출(아래 DailyContextual).
private val ContextCategories = listOf(
    ContextCategory(
        id = "comfort",
        label = "위로가 필요할 때",
        keywords = listOf("위로", "슬픔", "아픔", "상처", "눈물", "치유", "회복", "안식", "위안", "평온", "평화", "포근", "온기", "따뜻", "따스", "용서", "연민", "공감", "고통"),
    ),
    ContextCategory(
        id = "lonely",
        label = "먹먹한 밤",
        keywords = listOf("외로움", "그리움", "고독", "적막", "침묵", "회상", "공허", "먹먹", "쓸쓸", "회한", "이별", "상실", "그늘", "밤", "혼자", "홀로", "추억", "미련", "허무"),
    ),
    ContextCategory(
        id = "resolve",
        label = "결심이 필요할 때",
        keywords = listOf("결심", "의지", "도전", "용기", "운명", "신념", "다짐", "각오", "투지", "극복", "강인", "싸움", "꿈", "희망", "믿음", "열정", "성장", "자유", "선택", "시작", "변화", "두려움"),
    ),
    ContextCategory(
        id = "love",
        label = "사랑에 빠졌을 때",
        keywords = listOf("사랑", "연애", "연정", "애정", "설렘", "첫사랑", "열정", "마음", "동경", "끌림", "입맞춤", "고백", "연인", "애틋", "정열", "구애", "연모"),
    ),
    ContextCategory(
        id = "ambition",
        label = "야망이 끓을 때",
        keywords = listOf("야망", "야심", "권력", "욕망", "성공", "지배", "정복", "명예", "출세", "패권", "군림", "권세", "왕좌", "승리", "쟁취", "도약"),
    ),
    ContextCategory(
        id = "anger",
        label = "분노가 차오를 때",
        keywords = listOf("분노", "복수", "증오", "격분", "원한", "적개심", "울분", "노여움", "응징", "저항", "반항", "항거", "울화", "독기", "앙심"),
    ),
    ContextCategory(
        id = "mortal",
        label = "삶과 죽음을 생각할 때",
        keywords = listOf("죽음", "삶", "생명", "인생", "운명", "허무", "종말", "소멸", "영원", "유한", "무상", "존재", "필멸", "생사", "덧없음", "세월"),
    ),
    ContextCategory(
        id = "desire",
        label = "유혹에 흔들릴 때",
        keywords = listOf("유혹", "욕망", "쾌락", "본능", "충동", "호색", "관능", "탐닉", "중독", "갈망", "끌림", "타락", "방종", "쾌감"),
    ),
    ContextCategory(
        id = "faith",
        label = "믿음이 흔들릴 때",
        keywords = listOf("믿음", "신앙", "양심", "기도", "위선", "죄", "구원", "회개", "영혼", "도덕", "종교", "참회", "심판", "용서"),
    ),
    ContextCategory(
        id = "freedom",
        label = "자유를 꿈꿀 때",
        keywords = listOf("자유", "해방", "독립", "탈출", "속박", "억압", "굴레", "저항", "권리", "평등", "존엄", "굴종", "해탈", "구속"),
    ),
    ContextCategory(
        id = "vocation",
        label = "일과 소명",
        keywords = listOf("글쓰기", "직업", "강박", "소명", "창작", "예술", "노동", "일", "천직", "몰두", "장인", "재능", "직분", "소임"),
    ),
    ContextCategory(
        id = "greed",
        label = "욕심과 소유",
        keywords = listOf("소유", "집착", "욕심", "탐욕", "재물", "돈", "물질", "인색", "미련", "소유욕", "재산", "부", "이익", "가난"),
    ),
    ContextCategory(
        id = "society",
        label = "시대와 민중",
        keywords = listOf("민중", "복종", "회복력", "사회", "계급", "권위", "부조리", "시대", "군중", "혁명", "신분", "억압", "체제", "저항"),
    ),
    ContextCategory(
        id = "growth",
        label = "깨달음과 성장",
        keywords = listOf("질문", "인내", "성장", "깨달음", "배움", "지혜", "통찰", "성찰", "각성", "자각", "성숙", "깨우침", "수양", "경험"),
    ),
)

// PWA _kwMatch: equality, or a ≥2-char substring match in either direction.
private fun kwMatch(catKw: String, cardKw: String): Boolean {
    if (catKw.isEmpty() || cardKw.isEmpty()) return false
    if (catKw == cardKw) return true
    if (catKw.length >= 2 && cardKw.contains(catKw)) return true
    if (cardKw.length >= 2 && catKw.contains(cardKw)) return true
    return false
}

private fun filterContextualCards(cards: List<CardDto>, category: ContextCategory): List<CardDto> =
    cards.mapNotNull { card ->
        val kws = card.keywordList().map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        if (kws.isEmpty()) return@mapNotNull null
        val hits = category.keywords.count { ck ->
            val c = ck.lowercase()
            kws.any { kwMatch(c, it) }
        }
        if (hits == 0) null else card to hits
    }
        .sortedWith(compareByDescending<Pair<CardDto, Int>> { it.second }.thenByDescending { it.first.viewCount ?: 0 })
        .take(12)
        .map { it.first }

private data class TrendingCard(
    val card: CardDto,
    val bookmarks: Int,
    val comments: Int,
    val views: Int,
    val score: Int,
)

private fun bookmarkAge(iso: String): String {
    val millis = parseEpochMillis(iso) ?: return "언젠가"
    val days = ((System.currentTimeMillis() - millis).coerceAtLeast(0L)) / (24L * 60L * 60L * 1000L)
    return when (days) {
        0L -> "오늘"
        1L -> "어제"
        else -> "${days}일 전"
    }
}
