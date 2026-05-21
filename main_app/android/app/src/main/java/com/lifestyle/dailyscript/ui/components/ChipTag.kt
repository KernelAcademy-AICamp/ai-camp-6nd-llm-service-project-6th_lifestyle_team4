package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.PaperWhite

@Composable
fun ChipTag(
    text: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
) {
    val bg = if (filled) InkBlack else Color.Transparent
    val fg = if (filled) PaperWhite else InkBlack
    Text(
        text = text.uppercase(),
        color = fg,
        style = MaterialTheme.typography.labelSmall,
        modifier = modifier
            .background(bg)
            .border(width = if (filled) 0.dp else 1.dp, color = InkBlack)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
