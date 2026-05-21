package com.lifestyle.dailyscript.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.DetailTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.theme.BorderSubtle
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.OnSurfaceVariant
import com.lifestyle.dailyscript.ui.theme.ScreenplayMono
import com.lifestyle.dailyscript.ui.theme.SignatureOrange

@Composable
fun DetailScreen(
    cardId: Long,
    userId: Long,
    onBack: () -> Unit,
) {
    val vm: DetailViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(cardId, userId) { vm.load(cardId, userId) }

    Column(modifier = Modifier.fillMaxSize()) {
        DetailTopBar(
            title = state.card?.works?.title.orEmpty(),
            bookmarked = state.bookmarked,
            onBack = onBack,
            onToggleBookmark = { vm.toggleBookmark(userId) },
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val card = state.card
            if (state.loading && card == null) {
                Text(text = stringResource(R.string.loading), color = OnSurfaceVariant)
            } else if (card == null) {
                Text(
                    text = state.error ?: "Card not found.",
                    color = SignatureOrange,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                MetadataChipsRow(card)
                Box(modifier = Modifier.height(32.dp))

                if (!card.excerptDescription.isNullOrBlank()) {
                    Text(
                        text = card.excerptDescription,
                        style = MaterialTheme.typography.bodyLarge,
                        color = OnSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Box(modifier = Modifier.height(24.dp))
                }

                Text(
                    text = card.scriptExcerpt,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = ScreenplayMono,
                        letterSpacing = 0.02.em,
                    ),
                    color = InkBlack,
                )

                if (shouldShowSignificance(card)) {
                    Box(modifier = Modifier.height(32.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(BorderSubtle),
                    )
                    Box(modifier = Modifier.height(24.dp))
                    Text(
                        text = stringResource(R.string.significance_label).uppercase(),
                        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                        color = OnSurfaceVariant,
                    )
                    Box(modifier = Modifier.height(12.dp))
                    Text(
                        text = card.significance.orEmpty(),
                        style = MaterialTheme.typography.bodyLarge,
                        color = InkBlack,
                    )
                }

                Box(modifier = Modifier.height(48.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(BorderSubtle),
                )
                Box(modifier = Modifier.height(32.dp))

                SharpButton(
                    label = if (state.bookmarked)
                        stringResource(R.string.collected_artifact)
                    else
                        stringResource(R.string.collect_artifact),
                    onClick = { vm.toggleBookmark(userId) },
                    variant = SharpButtonVariant.Outline,
                )

                Box(modifier = Modifier.height(16.dp))
                Text(
                    text = "${stringResource(R.string.edition_note)} #${"%04d".format(card.cardId)}",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.1.em),
                    color = OnSurfaceVariant,
                )
                Box(modifier = Modifier.height(24.dp))
            }
        }
    }
}

private val SignificanceFormats = setOf("opera", "play")

private fun shouldShowSignificance(card: CardDto): Boolean {
    val format = card.works?.format?.trim()?.lowercase().orEmpty()
    return !card.significance.isNullOrBlank() && format in SignificanceFormats
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
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
                color = OnSurfaceVariant,
            )
        }
    }
}
