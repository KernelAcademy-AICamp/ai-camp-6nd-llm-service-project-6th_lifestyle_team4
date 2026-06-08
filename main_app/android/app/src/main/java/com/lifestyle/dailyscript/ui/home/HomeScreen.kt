package com.lifestyle.dailyscript.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.ChipTag
import com.lifestyle.dailyscript.ui.components.LangSegmented
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import kotlinx.coroutines.launch
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.ScriptFormat
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.formatCount
import com.lifestyle.dailyscript.ui.util.genreChipColor
import com.lifestyle.dailyscript.ui.util.genreLabel
import com.lifestyle.dailyscript.ui.util.keywordsFor
import com.lifestyle.dailyscript.ui.util.quoteFor
import com.lifestyle.dailyscript.ui.util.scriptFor
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun HomeScreen(
    userId: Long,
    isAnonymous: Boolean,
    onOpenCard: (Long) -> Unit,
) {
    val vm: HomeViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

    // First-run onboarding → the interactive spotlight tour (rendered in DailyScriptRoot).
    val coach = LocalCoachController.current
    val guideSeen by AppPreferences.guideSeen.collectAsState(initial = true)
    val scope = rememberCoroutineScope()
    // Keep the tour's target card in sync so "전문 읽으러 가기" opens today's detail.
    LaunchedEffect(state.todayCard?.cardId) { coach?.tourCardId = state.todayCard?.cardId }
    LaunchedEffect(guideSeen, state.loading, state.todayCard) {
        if (!guideSeen && !state.loading && state.todayCard != null && coach != null && !coach.active) {
            coach.start()
            scope.launch { AppPreferences.setGuideSeen() }
        }
    }

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
        Text(
            text = todayString().uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(modifier = Modifier.height(10.dp))
        Box(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = todayTitleAnnotated(),
                style = MaterialTheme.typography.displayMedium.copy(fontSize = 28.sp, lineHeight = 38.sp),
                color = Espresso,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().align(Alignment.Center),
            )
            RefreshButton(
                enabled = !state.loading,
                onClick = { vm.refresh(userId, isAnonymous) },
                modifier = Modifier.align(Alignment.CenterEnd).coachAnchor(coach, "home_refresh"),
            )
        }
        Box(modifier = Modifier.height(20.dp))

        TodayCard(
            card = state.todayCard,
            bookmarked = state.todayBookmarked,
            bookmarkActionInFlight = state.bookmarkActionInFlight,
            loading = state.loading,
            bookmarkCount = state.todayCard?.let { state.bookmarkCounts[it.cardId] } ?: 0,
            commentCount = state.todayCard?.commentCount ?: 0,
            onBookmarkToggle = { vm.toggleTodayBookmark(userId) },
            onOpen = {
                state.todayCard?.let {
                    vm.markTodayViewed()
                    onOpenCard(it.cardId)
                }
            },
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
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TodayCard(
    card: CardDto?,
    bookmarked: Boolean,
    bookmarkActionInFlight: Boolean,
    loading: Boolean,
    bookmarkCount: Int,
    commentCount: Int,
    onBookmarkToggle: () -> Unit,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    val coach = LocalCoachController.current
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
                if (!format.isNullOrBlank()) {
                    ChipTag(text = format, filled = true, fillColor = genreChipColor(format)?.let { Color(it) })
                }
                if (card != null) {
                    CardCounts(viewCount = card.viewCount, commentCount = commentCount)
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (card?.hasEnglish() == true) {
                    LangSegmented(english = english, onToggle = { english = !english })
                }
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .coachAnchor(coach, "today_bookmark")
                        .clickable(
                            enabled = card != null && !bookmarkActionInFlight,
                            onClick = onBookmarkToggle,
                        ),
                ) {
                    Icon(
                        imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                        contentDescription = stringResource(R.string.bookmark),
                        tint = if (bookmarked) Cta else Walnut,
                        modifier = Modifier.size(20.dp),
                    )
                    if (card != null) {
                        Text(
                            text = formatCount(bookmarkCount),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                platformStyle = PlatformTextStyle(includeFontPadding = false),
                            ),
                            color = Walnut,
                        )
                    }
                }
            }
        }
        Box(modifier = Modifier.height(28.dp))
        // Speaker (bold) above the quote, when extractable — mirrors the PWA.
        // 산문(novel/essay/prose) 은 화자 개념이 없어 추출 skip — 지문/묘사가 화자로
        // 오인되어 굵게 표시되는 버그(예: "끔찍한 흉터로 일그러진 창백한 얼굴") 방지.
        // EN 모드: 영문 script 직접 추출 → 실패 시 한글 quote 의 블록 인덱스로 영문 같은
        // 인덱스 라벨 매칭 (cross-lang). 한글 라벨은 내부 가드로 영문 모드에 노출 차단.
        val speaker = card?.let {
            if (ScriptFormat.isProse(it.works?.format)) return@let ""
            val characters = it.works?.characterList().orEmpty()
            if (english) {
                ScriptFormat.extractSpeakerEn(
                    scriptEn = it.scriptFor(true),
                    scriptKo = it.scriptFor(false),
                    characters = characters,
                    quoteEn = it.quoteFor(true),
                    quoteKo = it.quoteFor(false),
                )
            } else {
                ScriptFormat.extractSpeaker(it.scriptFor(false), characters, it.quoteFor(false))
            }
        }.orEmpty()
        if (speaker.isNotBlank()) {
            Text(
                text = speaker,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    letterSpacing = 0.02.em,
                ),
                color = Espresso,
            )
            Box(modifier = Modifier.height(12.dp))
        }
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
        if (card != null) {
            // Card serial (일련번호) — card_id with no leading zeros, under the work meta.
            Box(modifier = Modifier.height(if (workMeta.isNullOrBlank()) 18.dp else 6.dp))
            Text(
                text = "#${card.cardId}",
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
        Box(modifier = Modifier.height(24.dp))
        SectionDivider()
        Box(modifier = Modifier.height(12.dp))
        // 키워드 칩 — 가로 영역 초과 시 자동 줄바꿈 (영문 긴 키워드가 한 글자씩 깨지던 버그 수정)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            card?.keywordsFor(english)?.forEach { kw ->
                Text(
                    text = "#$kw",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    maxLines = 1,
                )
            }
        }
        Box(modifier = Modifier.height(20.dp))
        SharpButton(
            label = stringResource(R.string.read_full_script),
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth().coachAnchor(coach, "today_read"),
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

/** "오늘의 명대사" with "의" at 0.7em (mirrors the PWA home title). */
private fun todayTitleAnnotated(): AnnotatedString = buildAnnotatedString {
    append("오늘")
    withStyle(SpanStyle(fontSize = 20.sp, letterSpacing = (-0.02).em)) { append("의") }
    append(" 명대사")
}

/** Circular, raised "다른 명대사" refresh button (mirrors the PWA .home-random-btn). */
@Composable
private fun RefreshButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(36.dp)
            .shadow(2.dp, CircleShape)
            .background(CardWarm, CircleShape)
            .border(0.5.dp, Color(0x0F000000), CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Refresh,
            contentDescription = "다른 명대사 보기",
            tint = Walnut,
            modifier = Modifier.size(18.dp),
        )
    }
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
