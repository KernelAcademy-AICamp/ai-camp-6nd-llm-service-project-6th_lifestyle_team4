package com.lifestyle.dailyscript.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
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
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.CardCounts
import com.lifestyle.dailyscript.ui.components.DetailTopBar
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.ScreenplayMono
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.descriptionFor
import com.lifestyle.dailyscript.ui.util.displayAuthor
import com.lifestyle.dailyscript.ui.util.scriptFor
import com.lifestyle.dailyscript.ui.util.significanceFor

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        DetailTopBar(
            title = topTitle,
            bookmarked = state.bookmarked,
            bookmarkEnabled = state.card != null && !state.bookmarkActionInFlight,
            hasEnglish = hasEn,
            english = english,
            onToggleLang = { english = !english },
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
                MetadataChipsRow(card = card, english = english, bookmarkCount = state.bookmarkCount)
                if (!subtitle.isNullOrBlank()) {
                    Box(modifier = Modifier.height(10.dp))
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.titleMedium,
                        color = Walnut,
                        textAlign = TextAlign.Center,
                    )
                }
                Box(modifier = Modifier.height(28.dp))

                val description = card.descriptionFor(english)
                if (!description.isNullOrBlank()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
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
                            text = description,
                            style = MaterialTheme.typography.bodyLarge,
                            color = Walnut,
                            textAlign = TextAlign.Start,
                        )
                    }
                    Box(modifier = Modifier.height(24.dp))
                }

                ScriptBody(
                    card = card,
                    english = english,
                    isAnonymous = isAnonymous,
                    onSaveHighlight = { text, note -> vm.saveHighlight(userId, myNickname, text, note) },
                )

                val significance = card.significanceFor(english)
                if (shouldShowSignificance(card) && !significance.isNullOrBlank()) {
                    Box(modifier = Modifier.height(32.dp))
                    Hairline()
                    Box(modifier = Modifier.height(24.dp))
                    Text(
                        text = stringResource(R.string.significance_label).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = Walnut,
                    )
                    Box(modifier = Modifier.height(12.dp))
                    Text(
                        text = significance,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Espresso,
                    )
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
                )

                // ---------- Comments ----------
                Box(modifier = Modifier.height(40.dp))
                Hairline()
                Box(modifier = Modifier.height(28.dp))
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
            val isSpeaker = trimmed.isNotEmpty() && (trimmed in nameSet || namePart in nameSet)
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
 * Script excerpt rendered in a read-only text field so the user can long-press to
 * select text natively. When a non-empty selection exists, a "하이라이트 저장" action
 * appears (members only). Speaker lines stay bold via a VisualTransformation.
 */
@Composable
private fun ScriptBody(
    card: CardDto,
    english: Boolean,
    isAnonymous: Boolean,
    onSaveHighlight: (String, String) -> Unit,
) {
    val names = card.works?.characterList().orEmpty()
    var tfv by remember(card.cardId, english) { mutableStateOf(TextFieldValue(card.scriptFor(english))) }
    var composeText by remember { mutableStateOf<String?>(null) }
    val transformation = remember(names) { SpeakerBoldTransformation(names) }
    val sel = tfv.selection
    val selected = if (!sel.collapsed) tfv.text.substring(sel.min, sel.max).trim() else ""

    Column(modifier = Modifier.fillMaxWidth()) {
        BasicTextField(
            value = tfv,
            onValueChange = { tfv = it },
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
        if (selected.isNotEmpty()) {
            Box(modifier = Modifier.height(12.dp))
            if (isAnonymous) {
                Text(
                    text = "로그인 후 하이라이트를 저장할 수 있어요.",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                )
            } else {
                SharpButton(
                    label = "하이라이트 저장",
                    onClick = { composeText = selected },
                    variant = SharpButtonVariant.Outline,
                )
            }
        }
    }

    composeText?.let { text ->
        HighlightComposeDialog(
            selectedText = text,
            onDismiss = { composeText = null },
            onSave = { note ->
                onSaveHighlight(text, note)
                composeText = null
            },
        )
    }
}

private class SpeakerBoldTransformation(private val names: List<String>) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText =
        TransformedText(boldSpeakerLines(text.text, names), OffsetMapping.Identity)
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

@Composable
private fun MetadataChipsRow(card: CardDto, english: Boolean, bookmarkCount: Int) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val items = listOfNotNull(
            card.works?.format?.uppercase(),
            card.works.displayAuthor(english)?.uppercase(),
            card.works?.releaseYear?.toString(),
        )
        items.forEach { value ->
            Text(
                text = value,
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
        CardCounts(viewCount = card.viewCount, bookmarkCount = bookmarkCount)
    }
}
