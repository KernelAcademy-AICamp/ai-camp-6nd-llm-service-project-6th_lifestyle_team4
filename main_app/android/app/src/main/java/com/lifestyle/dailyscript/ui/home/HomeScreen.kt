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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.ChipTag
import com.lifestyle.dailyscript.ui.components.LangSegmented
import com.lifestyle.dailyscript.ui.components.LoginPromptDialog
import com.lifestyle.dailyscript.ui.components.RefreshableBox
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import com.lifestyle.dailyscript.ui.share.ShareBackground
import com.lifestyle.dailyscript.ui.share.ShareCardPayload
import com.lifestyle.dailyscript.ui.share.ShareCardSheet
import com.lifestyle.dailyscript.ui.share.toSharePayload
import com.lifestyle.dailyscript.ui.yarn.SpendResult
import kotlinx.coroutines.launch
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
    vm: HomeViewModel,
    onOpenCard: (Long) -> Unit,
    onRequestSignIn: () -> Unit,
    yarnBalance: Int,
    purchasedThemeIds: Set<String>,
    remoteBackgrounds: List<ShareBackground> = emptyList(),
    onBuyTheme: suspend (ShareBackground) -> SpendResult,
) {
    val state by vm.state.collectAsState()

    LaunchedEffect(userId) { vm.load(userId) }

    // First-run onboarding → the interactive spotlight tour (rendered in DailyScriptRoot).
    val coach = LocalCoachController.current
    val guideSeen by AppPreferences.guideSeen.collectAsState(initial = true)
    // 선호도 온보딩(PreferenceOverlay)이 끝난 뒤에만 투어 시작 — PWA 부팅 순서:
    // maybeShowPreferences → maybeShowGuide. null 은 DataStore 방출 전(둘 다 안 띄움).
    val prefSelected by AppPreferences.prefSelected.collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    // Keep the tour's target card in sync so "전문 읽으러 가기" opens today's detail.
    LaunchedEffect(state.todayCard?.cardId) { coach?.tourCardId = state.todayCard?.cardId }
    LaunchedEffect(guideSeen, prefSelected, state.loading, state.todayCard) {
        if (prefSelected == true && !guideSeen && !state.loading && state.todayCard != null &&
            coach != null && !coach.active
        ) {
            coach.start()
            scope.launch { AppPreferences.setGuideSeen() }
        }
    }

    // 공유 시트 — 공유 칩 탭 시 해당 카드 페이로드를 담아 연다.
    var sharePayload by remember { mutableStateOf<ShareCardPayload?>(null) }
    // 게스트가 투데이 카드에서 바로 북마크를 누르면 뜨는 로그인 유도 팝업 (카드 상세와 동일).
    var showLoginPrompt by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
      // 당겨서 새로고침 — 하단탭 '오늘' 재탭과 동일한 vm.refresh() 경로(익명 3회 한도 게이트 포함).
      RefreshableBox(
          refreshing = state.refreshing,
          onRefresh = { vm.refresh(userId, isAnonymous) },
          modifier = Modifier.fillMaxSize(),
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
        Text(
            text = todayTitleAnnotated(),
            style = MaterialTheme.typography.displayMedium.copy(fontSize = 28.sp, lineHeight = 38.sp),
            color = Espresso,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(modifier = Modifier.height(20.dp))

        TodayCard(
            card = state.todayCard,
            bookmarked = state.todayBookmarked,
            bookmarkActionInFlight = state.bookmarkActionInFlight,
            loading = state.loading,
            bookmarkCount = state.todayCard?.let { state.bookmarkCounts[it.cardId] } ?: 0,
            // 댓글 수: card_comments 집계 Map 우선(PWA 동일), 없으면 denormalized 컬럼 폴백.
            commentCount = state.todayCard?.let { state.commentCounts[it.cardId] ?: it.commentCount } ?: 0,
            shareCount = state.todayShareCount,
            // 게스트는 서버 북마크가 불가 — 에러 대신 로그인 유도 팝업 (PWA toggleBookmark isAnonymous 가드).
            onBookmarkToggle = { if (isAnonymous) showLoginPrompt = true else vm.toggleTodayBookmark(userId) },
            onShare = { sharePayload = it },
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
        // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
        Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
      }
      }

      sharePayload?.let { p ->
          ShareCardSheet(
              payload = p,
              userId = userId,
              yarnBalance = yarnBalance,
              purchasedIds = purchasedThemeIds,
              remoteBackgrounds = remoteBackgrounds,
              onBuy = onBuyTheme,
              onDismiss = { sharePayload = null },
              onShared = { vm.onCardShared(p.cardId) },
          )
      }

      // 익명 새로고침 3회 한도 — 빨간 글씨 대신 로그인 유도 팝업(iOS AccountRequiredPrompt 미러).
      if (state.refreshLimitReached) {
          RefreshLimitDialog(
              onLogin = {
                  vm.consumeRefreshLimit()
                  onRequestSignIn()
              },
              onDismiss = { vm.consumeRefreshLimit() },
          )
      }

      // 게스트가 투데이 카드에서 바로 북마크를 눌렀을 때 — 로그인 유도 팝업.
      if (showLoginPrompt) {
          LoginPromptDialog(
              onLogin = {
                  showLoginPrompt = false
                  onRequestSignIn()
              },
              onDismiss = { showLoginPrompt = false },
          )
      }
    }
}

/**
 * 익명 사용자가 오늘 새로고침 3회를 모두 쓴 뒤 뜨는 로그인 유도 팝업.
 * iOS HomeView.passAnonRefreshGate 의 AccountRequiredPrompt 카피를 그대로 옮긴다.
 */
@Composable
private fun RefreshLimitDialog(onLogin: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onLogin) { Text(stringResource(R.string.sign_in_action), color = Cta) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("닫기", color = Walnut) }
        },
        title = { Text("새로운 명대사는 3번까지", color = Espresso) },
        text = {
            Text(
                text = "오늘 명대사를 3번 받아보셨어요.\n로그인하면 무제한으로 고전 명대사를 즐길 수 있어요.",
                color = Walnut,
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        containerColor = Paper,
    )
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
    shareCount: Int,
    onBookmarkToggle: () -> Unit,
    onShare: (ShareCardPayload) -> Unit,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    val coach = LocalCoachController.current
    // EN/KO toggle is ephemeral per-card UI state — resets when the card changes.
    var english by remember(card?.cardId) { mutableStateOf(false) }

    // 화자(speaker) — quote 위에 굵게 + 공유 페이로드에 사용. 상단 공유 칩이 본문보다 먼저
    // 그려지므로 계산을 여기로 끌어올려 두 곳이 같은 값을 쓴다.
    // 산문(novel/essay/prose)은 화자 개념이 없어 skip(지문/묘사가 화자로 오인되는 버그 방지).
    // EN 모드: 영문 script 직접 추출 → 실패 시 한글 quote 의 블록 인덱스로 영문 라벨 매칭(cross-lang).
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
            // 우상단엔 언어 토글만 — 북마크·공유 칩은 작품 메타 아래(구분선 위) 우측 줄로 이동.
            if (card?.hasEnglish() == true) {
                LangSegmented(english = english, onToggle = { english = !english })
            } else {
                Box(modifier = Modifier)
            }
        }
        Box(modifier = Modifier.height(28.dp))
        // Speaker (bold) above the quote — 위에서 계산한 speaker 를 사용(상단 공유 칩과 공유).
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
        // 북마크·공유 칩 — 작품 메타 아래, 구분선 위 우측 정렬 (PWA today-card 하단 액션 줄).
        Box(modifier = Modifier.height(14.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TodayActionChip(
                icon = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = stringResource(R.string.bookmark),
                tint = if (bookmarked) Cta else Walnut,
                count = if (card != null) bookmarkCount else null,
                enabled = card != null && !bookmarkActionInFlight,
                modifier = Modifier.coachAnchor(coach, "today_bookmark"),
                onClick = onBookmarkToggle,
            )
            TodayActionChip(
                icon = Icons.Outlined.IosShare,
                contentDescription = "공유",
                tint = Walnut,
                count = if (card != null) shareCount else null,
                enabled = card != null,
                onClick = { card?.let { onShare(it.toSharePayload(english, speaker)) } },
            )
        }
        Box(modifier = Modifier.height(14.dp))
        SectionDivider()
        Box(modifier = Modifier.height(12.dp))
        // 키워드(해시태그) 줄 — 구분선 아래 전체 폭 (PWA today-keywords).
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

/** 투데이 카드 액션 칩 — 아이콘 위 + 작은 카운트 아래(세로). 북마크·공유 공용. count=null 이면 숫자 숨김. */
@Composable
private fun TodayActionChip(
    icon: ImageVector,
    contentDescription: String,
    tint: Color,
    count: Int?,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.clickable(enabled = enabled, onClick = onClick),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
        if (count != null) {
            Text(
                text = formatCount(count),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    platformStyle = PlatformTextStyle(includeFontPadding = false),
                ),
                color = Walnut,
            )
        }
    }
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
