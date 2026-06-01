package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * Editorial chip / tag.
 *  - `filled = true`  → category badge (espresso bg + paper text)
 *  - `filled = false` → meta tag (paper bg + latte border + walnut text)
 */
@Composable
fun ChipTag(
    text: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
    fillColor: Color? = null,
) {
    val shape = RoundedCornerShape(4.dp)
    // A genre fill (leather tone) always pairs with fixed cream text.
    val genreCream = Color(0xFFFAF8F2)
    val bg = when {
        filled && fillColor != null -> fillColor
        filled -> Espresso
        else -> Paper
    }
    val fg = when {
        filled && fillColor != null -> genreCream
        filled -> Paper
        else -> Walnut
    }
    val borderColor = if (filled) bg else Latte

    Box(
        modifier = modifier
            .height(22.dp)
            .defaultMinSize(minWidth = 44.dp)
            .background(bg, shape)
            .border(width = 1.dp, color = borderColor, shape = shape)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text.uppercase(),
            color = fg,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}
