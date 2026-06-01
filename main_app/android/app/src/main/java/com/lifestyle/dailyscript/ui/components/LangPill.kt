package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * KO/EN language toggle pill (mirrors the PWA's detail/home toggle).
 *  - KO active → outline walnut, shows [koLabel] (tap → switch to English).
 *  - EN active → filled espresso, shows "KR" (tap → switch back to Korean).
 */
@Composable
fun LangPill(
    english: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    koLabel: String = "EN",
) {
    val shape = RoundedCornerShape(4.dp)
    val bg = if (english) Espresso else Color.Transparent
    val fg = if (english) Paper else Walnut
    Box(
        modifier = modifier
            .height(22.dp)
            .defaultMinSize(minWidth = 34.dp)
            .background(bg, shape)
            .border(1.dp, if (english) Espresso else Walnut, shape)
            .clickable(onClick = onToggle)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (english) "KR" else koLabel,
            color = fg,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}
