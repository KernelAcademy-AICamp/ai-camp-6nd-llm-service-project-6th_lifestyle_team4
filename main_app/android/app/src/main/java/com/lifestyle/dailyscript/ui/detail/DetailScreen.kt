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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.DetailTopBar
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.LangSegmented
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.ScreenplayMono
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown
import com.lifestyle.dailyscript.ui.util.MarkdownBoldTransformation
import com.lifestyle.dailyscript.ui.util.ScriptFormat
import com.lifestyle.dailyscript.ui.util.descriptionFor
import com.lifestyle.dailyscript.ui.util.displayAuthor
import com.lifestyle.dailyscript.ui.util.significanceFor
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DetailScreen(
    cardId: Long,
    userId: Long,
    isAnonymous: Boolean,
    myNickname: String,
    onBack: () -> Unit,
) {
    val vm: DetailViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(cardId, userId) { vm.load(cardId, userId) }
    LaunchedEffect(state.card?.cardId) {
        state.card?.let { AppAnalytics.trackCard("script_opened", it) }
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
    var hlComposeText by remember(cardId) { mutableStateOf<String?>(null) }
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

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
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
                    label = if (state.bookmarked)
                        stringResource(R.string.collected_artifact)
                    else
                        stringResource(R.string.collect_artifact),
                    onClick = { vm.toggleBookmark(userId) },
                    variant = SharpButtonVariant.Outline,
                    enabled = !state.bookmarkActionInFlight,
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
                    modifier = Modifier.fillMaxWidth(),
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
                    commentsError = state.commentsError,
                    onSubmit = { vm.submitComment(userId, myNickname, it) },
                    onToggleLike = { vm.toggleLike(userId, it) },
                    onDelete = { vm.deleteComment(userId, it) },
                    onStartReply = { vm.setReplyTarget(it) },
                    onCancelReply = { vm.setReplyTarget(null) },
                )

                Box(modifier = Modifier.height(24.dp))
            }
        }
      }

      // Floating highlight action — appears when script text is selected (PWA #hl-add-btn).
      if (scriptSelected.isNotEmpty()) {
          HlFloatingButton(
              modifier = Modifier
                  .align(Alignment.BottomEnd)
                  .padding(end = 18.dp, bottom = 24.dp)
                  .coachAnchor(coach, "detail_hl_button"),
              onClick = {
                  if (isAnonymous) {
                      android.widget.Toast.makeText(
                          context,
                          "로그인 후 하이라이트를 저장할 수 있어요.",
                          android.widget.Toast.LENGTH_SHORT,
                      ).show()
                  } else {
                      hlComposeText = scriptSelected
                  }
              },
          )
      }
      hlComposeText?.let { text ->
          HighlightComposeDialog(
              selectedText = text,
              onDismiss = { hlComposeText = null },
              onSave = { note ->
                  vm.saveHighlight(userId, myNickname, text, note)
                  hlComposeText = null
                  scriptTfv = scriptTfv.copy(selection = TextRange(scriptTfv.selection.end))
              },
          )
      }
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

/** Bold any line that exactly matches a character name (mirrors the PWA's boldSpeakerLines). */
private fun boldSpeakerLines(text: String, characterNames: List<String>): AnnotatedString {
    if (characterNames.isEmpty()) return AnnotatedString(text)
    val nameSet = characterNames.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    if (nameSet.isEmpty()) return AnnotatedString(text)
    return buildAnnotatedString {
        val lines = text.split("\n")
        lines.forEachIndexed { index, line ->
            val trimmed = line.trim()
            val namePart = trimmed.substringBefore("(").trim()
            // A speaker name only appears at a block start (first line, or after a blank line).
            val isBlockStart = index == 0 || lines[index - 1].trim().isEmpty()
            val isSpeaker = isBlockStart && trimmed.isNotEmpty() && (trimmed in nameSet || namePart in nameSet)
            if (isSpeaker) {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(line) }
            } else {
                append(line)
            }
            if (index < lines.lastIndex) append("\n")
        }
    }
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
            ),
            visualTransformation = transformation,
            cursorBrush = SolidColor(Cta),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Coral pill that floats at the screen's bottom-right (mirrors the PWA #hl-add-btn). */
@Composable
private fun HlFloatingButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(999.dp)
    Row(
        modifier = modifier
            .shadow(8.dp, shape)
            .background(Cta, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "하이라이트 추가",
            color = Color.White,
            style = MaterialTheme.typography.labelLarge.copy(
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.08.em,
            ),
        )
    }
}

private class SpeakerBoldTransformation(private val names: List<String>) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText =
        TransformedText(boldSpeakerLines(text.text, names), OffsetMapping.Identity)
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

@Composable
private fun HighlightComposeDialog(
    selectedText: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = { onSave(note) }) { Text("저장", color = Cta) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        title = { Text("하이라이트 저장", color = Espresso) },
        text = {
            Column {
                Text(
                    text = "“$selectedText”",
                    style = MaterialTheme.typography.titleMedium.copy(fontFamily = EditorialSerif),
                    color = Espresso,
                )
                Box(modifier = Modifier.height(12.dp))
                EditorialField(
                    value = note,
                    onValueChange = { note = it },
                    placeholder = "메모 (선택)",
                    minHeight = 64.dp,
                    maxLength = 500,
                )
            }
        },
        containerColor = Paper,
    )
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
