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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.DetailTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.ScreenplayMono
import com.lifestyle.dailyscript.ui.theme.Walnut

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        DetailTopBar(
            title = state.card?.works?.title.orEmpty(),
            bookmarked = state.bookmarked,
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
                MetadataChipsRow(card)
                Box(modifier = Modifier.height(28.dp))

                if (!card.excerptDescription.isNullOrBlank()) {
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
                            text = card.excerptDescription,
                            style = MaterialTheme.typography.bodyLarge,
                            color = Walnut,
                            textAlign = TextAlign.Start,
                        )
                    }
                    Box(modifier = Modifier.height(24.dp))
                }

                Text(
                    text = boldSpeakerLines(card.scriptExcerpt, card.works?.characterList().orEmpty()),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = ScreenplayMono,
                        letterSpacing = 0.02.em,
                    ),
                    color = Espresso,
                )

                if (shouldShowSignificance(card)) {
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
                        text = card.significance.orEmpty(),
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

@Composable
private fun MetadataChipsRow(card: CardDto) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val items = listOfNotNull(
            card.works?.format?.uppercase(),
            card.works?.author?.uppercase(),
            card.works?.releaseYear?.toString(),
        )
        items.forEach { value ->
            Text(
                text = value,
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
    }
}
