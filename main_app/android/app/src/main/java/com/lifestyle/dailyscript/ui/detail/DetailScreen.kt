package com.lifestyle.dailyscript.ui.detail

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.Recommend
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.DetailTopBar
import com.lifestyle.dailyscript.ui.components.RefreshableBox
import com.lifestyle.dailyscript.ui.components.LangSegmented
import com.lifestyle.dailyscript.ui.components.BookCover
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.share.ShareBackground
import com.lifestyle.dailyscript.ui.share.ShareCardPayload
import com.lifestyle.dailyscript.ui.share.ShareCardSheet
import com.lifestyle.dailyscript.ui.share.toSharePayload
import com.lifestyle.dailyscript.ui.yarn.SpendResult
import com.lifestyle.dailyscript.ui.yarn.YarnRewardFly
import com.lifestyle.dailyscript.ui.feed.FeedComposeSheet
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.ScreenplayMono
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.MarkdownBoldTransformation
import com.lifestyle.dailyscript.ui.util.ScriptFormat
import com.lifestyle.dailyscript.ui.util.descriptionFor
import com.lifestyle.dailyscript.ui.util.displayAuthor
import com.lifestyle.dailyscript.ui.util.significanceFor
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DetailScreen(
    cardId: Long,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    yarnBalance: Int,
    purchasedThemeIds: Set<String>,
    remoteBackgrounds: List<ShareBackground> = emptyList(),
    onBuyTheme: suspend (ShareBackground) -> SpendResult,
    // 본문을 스크롤로 끝까지 읽었을 때 호출 — 첫 열람 보상(+300)을 지급하고 실제 지급량을 돌려준다(없으면 0).
    onContentRead: suspend () -> Int,
    // 떠 있는 하단 탭 카드의 top(window px) — 본문 끝이 이 선을 통과하면 '다 읽음'으로 판정. 0이면 미측정.
    bottomBarTopPx: Float = 0f,
    onBack: () -> Unit,
    onGoLibrary: () -> Unit,
    onGoFeed: () -> Unit,
    onOpenFeedback: () -> Unit,
) {
    val vm: DetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    val scrollState = rememberScrollState()
    val scrollScope = rememberCoroutineScope()

    // ── 첫 열람 보상(+300) — 본문을 스크롤로 끝까지 읽으면 1회 지급 + 화면 중앙 보상 애니. (PWA rewardYarnForFirstView)
    //   트리거: 카드 본문 끝(에디션 표기)이 떠 있는 하단 탭 카드 top 을 통과하는 순간 = 마지막 줄까지 다 읽음.
    //   폴백: 스크롤 95% 도달(바 측정 전 등). 스크롤이 없는 짧은 카드는 잠시 뒤 그대로 지급.
    val onContentReadState by rememberUpdatedState(onContentRead)
    var rewardFlyAmount by remember(cardId) { mutableStateOf<Int?>(null) }
    var rewardFired by remember(cardId) { mutableStateOf(false) }
    // 본문 끝 앵커(에디션 표기) top(window px) — 모든 포맷에서 렌더되며 댓글 바로 위에 위치. 의의 블록(opera/play 한정)에 묶지 않는다.
    var contentEndTopPx by remember(cardId) { mutableStateOf<Float?>(null) }
    val readComplete by remember(cardId) {
        derivedStateOf {
            val max = scrollState.maxValue
            if (max <= 0) return@derivedStateOf false
            val ratioPassed = scrollState.value.toFloat() / max >= 0.95f
            // 본문 끝 top 이 하단 탭 카드 top 보다 위로 올라옴 = 마지막 줄이 하단 탭을 통과.
            val endPassed = contentEndTopPx?.let { bottomBarTopPx > 0f && it <= bottomBarTopPx } ?: false
            ratioPassed || endPassed
        }
    }
    LaunchedEffect(cardId) {
        snapshotFlow { readComplete }.first { it }
        if (!rewardFired) {
            rewardFired = true
            val granted = onContentReadState()
            if (granted > 0) rewardFlyAmount = granted
        }
    }
    // 스크롤이 아예 없는 짧은 카드 — 레이아웃 안정 뒤 그대로 지급(콘텐츠를 한눈에 다 봄).
    LaunchedEffect(cardId, state.card?.cardId) {
        if (state.card == null) return@LaunchedEffect
        delay(1500)
        if (!rewardFired && scrollState.maxValue <= 0) {
            rewardFired = true
            val granted = onContentReadState()
            if (granted > 0) rewardFlyAmount = granted
        }
    }

    LaunchedEffect(cardId, userId) { vm.load(cardId, userId) }
    LaunchedEffect(state.card?.cardId) {
        state.card?.let {
            // 선호 매칭 여부 부가 — 추천 클릭률 산출용 (PWA script_opened + cardMatchProps)
            val prefs = AppPreferences.userPrefs.first()
            AppAnalytics.trackCard("script_opened", it, Recommend.matchProps(it, prefs))
        }
    }

    // Coachmark tour anchors — scroll the targeted info block into view during the 전문 steps.
    val coach = LocalCoachController.current
    val sceneReq = remember { BringIntoViewRequester() }
    val scriptReq = remember { BringIntoViewRequester() }
    val sigReq = remember { BringIntoViewRequester() }
    val tourAnchor = if (coach?.active == true && coach.current?.scr == "전문") coach.current?.anchorId else null
    LaunchedEffect(tourAnchor) {
        when (tourAnchor) {
            "detail_scene" -> runCatching { sceneReq.bringIntoView() }
            "detail_script" -> runCatching { scriptReq.bringIntoView() }
            "detail_significance" -> runCatching { sigReq.bringIntoView() }
        }
    }

    val context = LocalContext.current
    LaunchedEffect(state.highlightMessage) {
        state.highlightMessage?.let {
            android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_SHORT).show()
            vm.consumeHighlightMessage()
        }
    }

    // EN/KO toggle — ephemeral per-card UI state, resets to KO on a new card.
    var english by remember(cardId) { mutableStateOf(false) }
    val work = state.card?.works
    val hasEn = state.card?.hasEnglish() == true
    val topTitle = (if (english) work?.titleOriginal?.ifBlank { null } else null) ?: work?.title.orEmpty()
    val subtitle = (if (english) work?.subtitleOriginal?.ifBlank { null } else null) ?: work?.subtitle

    // Script selection hoisted to screen level so the highlight action can float at the
    // bottom-right of the screen (mirrors the PWA #hl-add-btn) instead of being buried
    // under a long script.
    var scriptTfv by remember(state.card?.cardId, english) {
        mutableStateOf(TextFieldValue(state.card?.let { ScriptFormat.displayScript(it, english) } ?: ""))
    }
    val scriptSel = scriptTfv.selection
    val scriptSelected = if (!scriptSel.collapsed) scriptTfv.text.substring(scriptSel.min, scriptSel.max).trim() else ""
    // NEW HIGHLIGHT 화면 — 선택 텍스트를 담고 우측에서 슬라이드 인. 공유 시트는 sharePayload 로 띄움.
    var hlScreenText by remember(cardId) { mutableStateOf<String?>(null) }
    var hlScreenVisible by remember(cardId) { mutableStateOf(false) }
    var sharePayload by remember(cardId) { mutableStateOf<ShareCardPayload?>(null) }
    var feedComposeOpen by remember(cardId) { mutableStateOf(false) }
    val selectedForTour by rememberUpdatedState(scriptSelected)
    val userIdForTour by rememberUpdatedState(userId)
    val nicknameForTour by rememberUpdatedState(myNickname)
    val isAnonymousForTour by rememberUpdatedState(isAnonymous)

    // Tour: wait for a new text-selection event after this step starts, so an old selection
    // cannot auto-skip the "select a phrase" instruction.
    LaunchedEffect(coach?.index, coach?.current?.advanceOnSelect) {
        if (coach?.active == true && coach.current?.advanceOnSelect == true) {
            snapshotFlow { scriptTfv }
                .drop(1)
                .first { value ->
                    val sel = value.selection
                    if (sel.collapsed) {
                        false
                    } else {
                        val start = sel.min.coerceIn(0, value.text.length)
                        val end = sel.max.coerceIn(0, value.text.length)
                        value.text.substring(start, end).trim().isNotEmpty()
                    }
                }
            if (coach.active && coach.current?.advanceOnSelect == true) {
                coach.next()
            }
        }
    }

    DisposableEffect(coach) {
        if (coach == null) {
            onDispose { }
        } else {
            coach.setActionHandler("saveHighlight") {
                val selected = selectedForTour.trim()
                when {
                    selected.isEmpty() -> Unit
                    isAnonymousForTour -> {
                        android.widget.Toast.makeText(
                            context,
                            "로그인해야 하이라이트를 저장할 수 있어요.",
                            android.widget.Toast.LENGTH_SHORT,
                        ).show()
                        coach.next()
                        coach.onAction?.invoke("openFeed")
                    }
                    else -> {
                        vm.saveHighlight(userIdForTour, nicknameForTour, selected, "") {
                            scriptTfv = scriptTfv.copy(selection = TextRange(scriptTfv.selection.end))
                            coach.next()
                            coach.onAction?.invoke("openFeed")
                        }
                    }
                }
            }
            onDispose { coach.setActionHandler("saveHighlight", null) }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
      Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
      ) {
        DetailTopBar(
            title = topTitle,
            subtitle = subtitle,
            bookmarked = state.bookmarked,
            bookmarkCount = state.bookmarkCount,
            bookmarkEnabled = state.card != null && !state.bookmarkActionInFlight,
            onBack = onBack,
            onToggleBookmark = { vm.toggleBookmark(userId) },
        )

        RefreshableBox(
            refreshing = state.commentsRefreshing,
            onRefresh = { vm.refreshComments() },
            modifier = Modifier.weight(1f),
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val card = state.card
            if (state.loading && card == null) {
                Text(text = stringResource(R.string.loading), color = Walnut)
            } else if (card == null) {
                Text(
                    text = state.error ?: "Card not found.",
                    color = Cta,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                MetadataChipsRow(card = card, english = english, commentCount = state.comments.size)
                Box(modifier = Modifier.height(24.dp))

                // ★ LangRow 항상 노출 — 북마크/feed 카드도 동일하게 토글 보이게.
                //   영문 원본 없으면 quoteFor/scriptFor 가 한국어로 fallback (Format.kt).
                //   PWA m-app.js 의 lib-lang-toggle "항상 노출" 패턴과 일치.
                LangRow(english = english, onToggle = { english = !english })
                Box(modifier = Modifier.height(20.dp))

                val description = card.descriptionFor(english)
                if (!description.isNullOrBlank()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .bringIntoViewRequester(sceneReq)
                            .coachAnchor(coach, "detail_scene")
                            .border(0.5.dp, Latte, RoundedCornerShape(4.dp))
                            .padding(horizontal = 18.dp, vertical = 16.dp),
                    ) {
                        Text(
                            text = "SCENE",
                            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.22.em),
                            color = Walnut,
                            modifier = Modifier.alpha(0.7f),
                        )
                        Box(modifier = Modifier.height(8.dp))
                        Text(
                            text = Markdown.prose(description),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Walnut,
                            textAlign = TextAlign.Start,
                        )
                    }
                    Box(modifier = Modifier.height(24.dp))
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .bringIntoViewRequester(scriptReq)
                        .coachAnchor(coach, "detail_script"),
                ) {
                    ScriptBody(
                        card = card,
                        value = scriptTfv,
                        onValueChange = { scriptTfv = it },
                    )
                }

                val significance = card.significanceFor(english)
                if (shouldShowSignificance(card) && !significance.isNullOrBlank()) {
                    Box(modifier = Modifier.height(32.dp))
                    Hairline()
                    Box(modifier = Modifier.height(24.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .bringIntoViewRequester(sigReq)
                            .coachAnchor(coach, "detail_significance"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = stringResource(R.string.significance_label),
                            style = MaterialTheme.typography.labelSmall,
                            color = Walnut,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Box(modifier = Modifier.height(12.dp))
                        Text(
                            text = Markdown.prose(significance),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Espresso,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                Box(modifier = Modifier.height(48.dp))
                Hairline()
                Box(modifier = Modifier.height(32.dp))

                SharpButton(
                    label = stringResource(R.string.detail_post_one_liner),
                    onClick = {
                        // 북마크 보장 — toggle 은 in-flight 자체 가드(fire-and-forget).
                        if (!state.bookmarked) vm.toggleBookmark(userId)
                        if (isAnonymous) {
                            android.widget.Toast.makeText(
                                context,
                                "로그인 후 나의 감상평을 남길 수 있어요.",
                                android.widget.Toast.LENGTH_SHORT,
                            ).show()
                        } else {
                            vm.clearFeedError()
                            feedComposeOpen = true
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Box(modifier = Modifier.height(10.dp))
                SharpButton(
                    label = stringResource(R.string.detail_go_library),
                    onClick = onGoLibrary,
                    variant = SharpButtonVariant.Outline,
                    modifier = Modifier.fillMaxWidth(),
                )

                state.error?.let { error ->
                    Box(modifier = Modifier.height(12.dp))
                    Text(
                        text = error,
                        color = Cta,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                    )
                }

                Box(modifier = Modifier.height(16.dp))
                Text(
                    text = "${stringResource(R.string.edition_note)} #${"%04d".format(card.cardId)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                    // 첫 열람 보상 트리거 앵커 — 본문 끝(댓글 직전)이 화면 중앙을 통과하면 읽음 완료로 판정.
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { contentEndTopPx = it.positionInWindow().y },
                )

                // ---------- Comments ----------
                Box(modifier = Modifier.height(40.dp))
                Hairline()
                Box(modifier = Modifier.height(24.dp))
                CommentsSection(
                    comments = state.comments,
                    likes = state.likes,
                    myUserId = userId,
                    isAnonymous = isAnonymous,
                    submitting = state.commentSubmitting,
                    replyingTo = state.replyingTo,
                    editingCommentId = state.editingCommentId,
                    commentsError = state.commentsError,
                    onSubmit = { vm.submitComment(userId, myNickname, it) },
                    onToggleLike = { vm.toggleLike(userId, it) },
                    onDelete = { vm.deleteComment(userId, it) },
                    onStartReply = { vm.setReplyTarget(it) },
                    onCancelReply = { vm.setReplyTarget(null) },
                    onStartEdit = { vm.startEditComment(it) },
                    onCancelEdit = { vm.cancelEditComment() },
                    onSaveEdit = { id, body -> vm.editComment(userId, id, body) },
                )

                // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
                Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
            }
        }
        }
      }

      // 본문 선택 시 등장하는 '+' FAB (PWA #hl-add-btn) — 떠 있는 하단 바(고양이) 위로.
      if (scriptSelected.isNotEmpty()) {
          HlAddFab(
              modifier = Modifier
                  .align(Alignment.BottomEnd)
                  .padding(end = 18.dp, bottom = BottomBarContentInset + 24.dp)
                  .coachAnchor(coach, "detail_hl_button"),
              onClick = {
                  if (isAnonymous) {
                      android.widget.Toast.makeText(
                          context,
                          "로그인 후 하이라이트를 저장할 수 있어요.",
                          android.widget.Toast.LENGTH_SHORT,
                      ).show()
                  } else {
                      hlScreenText = scriptSelected
                      hlScreenVisible = true
                  }
              },
          )
      }

      // NEW HIGHLIGHT 화면 — 우측에서 슬라이드 인('한 칸 들어감'). 하단 고양이 바는 루트에서 이 위로 비친다.
      AnimatedVisibility(
          visible = hlScreenVisible,
          enter = slideInHorizontally(tween(280)) { it } + fadeIn(tween(200)),
          exit = slideOutHorizontally(tween(240)) { it } + fadeOut(tween(180)),
      ) {
          val card = state.card
          val text = hlScreenText
          if (card != null && text != null) {
              HighlightComposeScreen(
                  card = card,
                  english = english,
                  selectedText = text,
                  saving = state.highlightSaving,
                  onBack = { hlScreenVisible = false },
                  onShare = { sharePayload = card.toSharePayload(english, speaker = "", quoteOverride = text) },
                  onSave = {
                      vm.saveHighlight(userId, myNickname, text, "") {
                          scriptTfv = scriptTfv.copy(selection = TextRange(scriptTfv.selection.end))
                          hlScreenVisible = false
                          // PWA: 저장 후 피드 > 하이라이트 로 이동.
                          scrollScope.launch { AppPreferences.setFeedCategory("highlight") }
                          onGoFeed()
                      }
                  },
              )
          }
      }

      // 하이라이트 공유 시트 — 선택 텍스트를 명대사 자리에 넣어 공유.
      sharePayload?.let { p ->
          ShareCardSheet(
              payload = p,
              userId = userId,
              yarnBalance = yarnBalance,
              purchasedIds = purchasedThemeIds,
              remoteBackgrounds = remoteBackgrounds,
              onBuy = onBuyTheme,
              onDismiss = { sharePayload = null },
              onShared = {},
          )
      }
      // 오늘의 한줄 작성 시트 — 피드 탭과 같은 FeedComposeSheet, 이 카드로 고정.
      if (feedComposeOpen) {
          state.card?.let { card ->
              FeedComposeSheet(
                  card = card,
                  submitting = state.feedSubmitting,
                  error = state.feedError,
                  onDismiss = { feedComposeOpen = false },
                  onSubmit = { body ->
                      vm.submitFeedPost(userId, myNickname, body) {
                          feedComposeOpen = false
                          android.widget.Toast.makeText(
                              context,
                              "나의 감상평을 피드에 남겼어요.",
                              android.widget.Toast.LENGTH_SHORT,
                          ).show()
                          onGoFeed()
                      }
                  },
              )
          }
      }

      // 맨 위로 FAB — 스크롤 깊이 80% 이상일 때 좌하단에 노출 (PWA #detail-scroll-top-fab).
      val showScrollTop by remember {
          derivedStateOf {
              val max = scrollState.maxValue
              max > 0 && scrollState.value.toFloat() / max >= 0.8f
          }
      }
      if (showScrollTop) {
          ScrollTopFab(
              modifier = Modifier
                  .align(Alignment.BottomStart)
                  .padding(start = 16.dp, bottom = BottomBarContentInset + 24.dp),
              onClick = { scrollScope.launch { scrollState.animateScrollTo(0) } },
          )
      }

      // 피드백 넛지 — 카드 15개 열람 후 1회 (PWA feedbackNudgeModal).
      if (state.showFeedbackNudge) {
          AlertDialog(
              onDismissRequest = { vm.consumeFeedbackNudge() },
              confirmButton = {
                  TextButton(onClick = {
                      vm.consumeFeedbackNudge()
                      onOpenFeedback()
                  }) { Text("의견 남기기", color = Cta) }
              },
              dismissButton = {
                  TextButton(onClick = { vm.consumeFeedbackNudge() }) { Text("다음에", color = Walnut) }
              },
              title = { Text("앱은 어떠셨나요?", color = Espresso) },
              text = {
                  Text(
                      text = "벌써 명대사 15편을 함께 읽었어요. 잠깐 의견을 들려주시면 더 좋은 앱을 만드는 데 큰 힘이 돼요.",
                      color = Walnut,
                      style = MaterialTheme.typography.bodyMedium,
                  )
              },
              containerColor = Paper,
          )
      }

      // 첫 열람 보상 — 본문을 끝까지 읽으면 화면 중앙에 통통 튀는 +N 실타래 애니 (PWA playYarnRewardFly).
      rewardFlyAmount?.let { amt ->
          YarnRewardFly(
              amount = amt,
              modifier = Modifier.align(Alignment.Center),
              onFinished = { rewardFlyAmount = null },
          )
      }
    }
}

/** 좌하단에 떠 있는 '맨 위로' 동그란 버튼 (PWA #detail-scroll-top-fab). */
@Composable
private fun ScrollTopFab(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .size(44.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(Espresso)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "↑",
            color = Paper,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
    }
}

/** Full-width "원문(영문)으로 보기" row with the KR︱ENG segmented control (above the SCENE block). */
@Composable
private fun LangRow(english: Boolean, onToggle: () -> Unit) {
    Hairline()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = if (english) "한국어로 보기" else "원문(영문)으로 보기",
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
        )
        LangSegmented(english = english, onToggle = onToggle)
    }
    Hairline()
}

@Composable
private fun Hairline() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(Latte),
    )
}

private val SignificanceFormats = setOf("opera", "play")

private fun shouldShowSignificance(card: CardDto): Boolean {
    val format = card.works?.format?.trim()?.lowercase().orEmpty()
    return !card.significance.isNullOrBlank() && format in SignificanceFormats
}

/**
 * Script excerpt in a read-only text field — long-press selects text natively, styled like
 * the PWA's yellow 형광펜 with the native Copy/Select-all toolbar suppressed. The selection
 * is hoisted to [DetailScreen], which floats the "하이라이트 추가" action over the screen.
 * Speaker lines stay bold via a VisualTransformation.
 */
@Composable
private fun ScriptBody(
    card: CardDto,
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
) {
    val format = card.works?.format
    val names = card.works?.characterList().orEmpty()
    // ★ MarkdownBoldTransformation — **bold** 마커를 실제 굵게로 렌더 + speaker bold 같이 처리.
    // 이전엔 SpeakerBoldTransformation 만 사용해 **** 마커가 그대로 노출됐음 (관리자 페이지는 굵게 보이는데).
    val transformation = remember(names, format) {
        val speakerNames = if (ScriptFormat.usesSpeakerBold(format)) names else emptyList()
        MarkdownBoldTransformation(speakerNames)
    }
    // 본문 정렬 — 관리자 편집에서 저장된 card.textAlign 우선, 없으면 format 기본 (poem=center, else=left).
    // (migration 042 + library.js 저장부)
    val align = when (card.textAlign) {
        "center" -> TextAlign.Center
        "right"  -> TextAlign.End
        "left"   -> TextAlign.Start
        else     -> if ((format ?: "").lowercase() == "poem") TextAlign.Center else TextAlign.Start
    }
    CompositionLocalProvider(
        LocalTextSelectionColors provides HighlightSelectionColors,
        LocalTextToolbar provides NoTextToolbar,
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = ScreenplayMono,
                letterSpacing = 0.02.em,
                color = Espresso,
                textAlign = align,
            ),
            visualTransformation = transformation,
            cursorBrush = SolidColor(Cta),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** 본문 선택 시 우하단에 뜨는 동그란 '+' FAB (PWA #hl-add-btn). 탭하면 NEW HIGHLIGHT 화면 진입. */
@Composable
private fun HlAddFab(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .size(48.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(Cta)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "+",
            color = Color.White,
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.SemiBold),
        )
    }
}

// Yellow 형광펜 text selection (mirrors the PWA .hl-rect rgba(244,194,13,0.55)).
private val HighlightSelectionColors = TextSelectionColors(
    handleColor = Color(0xFFF4C20D),
    backgroundColor = Color(0x8CF4C20D),
)

// No-op toolbar → suppress Android's native "Copy / Select all" popup over the script.
private object NoTextToolbar : TextToolbar {
    override val status: TextToolbarStatus = TextToolbarStatus.Hidden
    override fun showMenu(
        rect: Rect,
        onCopyRequested: (() -> Unit)?,
        onPasteRequested: (() -> Unit)?,
        onCutRequested: (() -> Unit)?,
        onSelectAllRequested: (() -> Unit)?,
    ) { /* intentionally empty */ }
    override fun hide() { /* intentionally empty */ }
}

/**
 * NEW HIGHLIGHT 전체 화면 (PWA #hl-compose-screen 이식).
 * 상단 바: ← / NEW HIGHLIGHT / SAVE. 우상단 공유 fab. 본문: 표지+제목·작가·연도·#id + 선택문 인용박스.
 */
@Composable
private fun HighlightComposeScreen(
    card: CardDto,
    english: Boolean,
    selectedText: String,
    saving: Boolean,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit,
) {
    val work = card.works
    val title = ((if (english) work?.titleOriginal?.ifBlank { null } else null) ?: work?.title).orEmpty()
    val subtitle = (if (english) work?.subtitleOriginal?.ifBlank { null } else null) ?: work?.subtitle
    val author = (if (english) work?.authorOriginal?.ifBlank { null } else null) ?: work?.author
    val year = work?.releaseYear?.toString()

    Box(modifier = Modifier.fillMaxSize().background(Paper)) {
        Column(modifier = Modifier.fillMaxSize()) {
            // 상단 바
            Row(
                modifier = Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "뒤로",
                    tint = Espresso,
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onBack)
                        .padding(8.dp),
                )
                Text(
                    text = "NEW HIGHLIGHT",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                    color = Walnut,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = if (saving) "저장 중⋯" else "SAVE",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.18.em,
                    ),
                    color = Cta,
                    modifier = Modifier
                        .clickable(enabled = !saving, onClick = onSave)
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                )
            }
            Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BookCover(work = work, modifier = Modifier.width(120.dp).aspectRatio(132f / 188f))
                Box(modifier = Modifier.height(14.dp))
                Text(
                    text = title.ifBlank { "제목 없음" },
                    style = MaterialTheme.typography.headlineMedium,
                    color = Espresso,
                    textAlign = TextAlign.Center,
                )
                if (!subtitle.isNullOrBlank()) {
                    Box(modifier = Modifier.height(4.dp))
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Walnut, textAlign = TextAlign.Center)
                }
                val authorYear = listOfNotNull(author?.takeIf { it.isNotBlank() }, year).joinToString(" · ")
                if (authorYear.isNotBlank()) {
                    Box(modifier = Modifier.height(6.dp))
                    Text(authorYear, style = MaterialTheme.typography.labelSmall, color = Walnut)
                }
                Box(modifier = Modifier.height(4.dp))
                Text("#${"%05d".format(card.cardId)}", style = MaterialTheme.typography.labelSmall, color = Sand)
                Box(modifier = Modifier.height(24.dp))

                // 선택 본문 — card-warm 배경 + 좌측 코랄 스트라이프 + 인용부호.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                        .clip(RoundedCornerShape(2.dp))
                        .background(CardWarm)
                        .border(0.5.dp, Latte, RoundedCornerShape(2.dp)),
                ) {
                    Box(modifier = Modifier.width(3.dp).fillMaxHeight().background(Cta))
                    Text(
                        text = "“$selectedText”",
                        style = MaterialTheme.typography.bodyLarge.copy(fontFamily = EditorialSerif),
                        color = Espresso,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).padding(horizontal = 18.dp, vertical = 18.dp),
                    )
                }
                Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
            }
        }

        // 공유 fab — 우상단(SAVE 아래), 선택 텍스트를 공유 카드로.
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 72.dp, end = 14.dp)
                .shadow(4.dp, RoundedCornerShape(999.dp))
                .clip(RoundedCornerShape(999.dp))
                .background(Espresso)
                .clickable(onClick = onShare)
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.IosShare, contentDescription = null, tint = Paper, modifier = Modifier.size(14.dp))
            Box(modifier = Modifier.width(5.dp))
            Text("공유", color = Paper, style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.06.em))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MetadataChipsRow(card: CardDto, english: Boolean, commentCount: Int) {
    // Two centered lines (mirrors #detail-meta flex-direction:column):
    //   1) FORMAT · AUTHOR     2) YEAR · 👁 views · 🔖 bookmarks
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val head = listOfNotNull(
            card.works?.format?.uppercase(),
            card.works.displayAuthor(english)?.uppercase(),
        )
        if (head.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                head.forEach { value ->
                    Text(text = value, style = MaterialTheme.typography.labelSmall, color = Walnut)
                }
            }
            Box(modifier = Modifier.height(6.dp))
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val year = card.works?.releaseYear?.toString()
            if (!year.isNullOrBlank()) {
                Text(text = year, style = MaterialTheme.typography.labelSmall, color = Walnut)
                Text(text = "·", style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
            CardCounts(viewCount = card.viewCount, commentCount = commentCount)
        }
    }
}
