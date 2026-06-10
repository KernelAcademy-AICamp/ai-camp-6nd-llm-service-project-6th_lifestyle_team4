package com.lifestyle.dailyscript.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.data.model.CardDto
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.displayTitle
import com.lifestyle.dailyscript.ui.util.genreLabel

/**
 * Compose step for a one-liner on the picked card (mirrors the PWA feed-compose modal).
 * 피드 탭(FeedScreen)과 카드 상세(DetailScreen)가 공유한다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedComposeSheet(
    card: CardDto,
    submitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var body by remember(card.cardId) { mutableStateOf("") }
    val w = card.works
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .imePadding(),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = w.displayTitle().ifBlank { "—" },
                    style = MaterialTheme.typography.headlineMedium,
                    color = Espresso,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text("#${card.cardId}", style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
            val meta = listOfNotNull(
                w?.format?.let { genreLabel(it) },
                w?.author,
                w?.releaseYear?.toString(),
            ).joinToString(" · ").uppercase()
            if (meta.isNotBlank()) {
                Box(modifier = Modifier.height(6.dp))
                Text(meta, style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
            Box(modifier = Modifier.height(14.dp))
            Box(Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
            Box(modifier = Modifier.height(14.dp))
            EditorialField(
                value = body,
                onValueChange = { body = it },
                placeholder = "이 명대사에 대한 한줄을 남겨보세요…",
                minHeight = 120.dp,
                maxLength = 300,
            )
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = "${body.length}/300자",
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Box(modifier = Modifier.height(8.dp))
                Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
            }
            Box(modifier = Modifier.height(14.dp))
            SharpButton(
                label = if (submitting) "등록 중⋯" else "등록 하기",
                onClick = { if (!submitting && body.isNotBlank()) onSubmit(body) },
                enabled = !submitting && body.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
