package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.PaperWhite

@Composable
fun ChipTag(
    text: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
) {
    val bg = if (filled) InkBlack else PaperWhite
    val fg = if (filled) PaperWhite else InkBlack

    Box(
        // Same outer dimensions for both variants:
        //  - identical 1dp ink-black border (invisible on filled but takes the same space)
        //  - identical height + horizontal padding
        //  - text centered so Korean vs Latin glyph metrics don't shift the box
        modifier = modifier
            .height(24.dp)
            .defaultMinSize(minWidth = 48.dp)
            .background(bg)
            .border(width = 1.dp, color = InkBlack)
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
