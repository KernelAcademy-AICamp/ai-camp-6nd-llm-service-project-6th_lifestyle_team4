package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * Editorial CTA button — 8dp corners, no shadow / no scale on press.
 *  - Solid   → espresso bg + paper text. Press → slightly darker (Roast).
 *  - Outline → 0.5dp walnut border + espresso text. Press → espresso bg.
 *
 * (The "Sharp" in the name is historical — kept for source-compat.)
 */
enum class SharpButtonVariant { Solid, Outline }

@Composable
fun SharpButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: SharpButtonVariant = SharpButtonVariant.Solid,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val isPressed by interaction.collectIsPressedAsState()
    val shape = RoundedCornerShape(8.dp)

    val baseBg: Color
    val baseFg: Color
    val pressedBg: Color
    val pressedFg: Color
    val borderColor: Color
    val borderWidth = if (variant == SharpButtonVariant.Outline) 1.dp else 0.dp

    when (variant) {
        SharpButtonVariant.Solid -> {
            baseBg = Espresso; baseFg = Paper
            pressedBg = Roast; pressedFg = Paper
            borderColor = Color.Transparent
        }
        SharpButtonVariant.Outline -> {
            baseBg = Color.Transparent; baseFg = Espresso
            pressedBg = Espresso;       pressedFg = Paper
            borderColor = Walnut
        }
    }

    val bg = if (isPressed && enabled) pressedBg else baseBg
    val fg = if (isPressed && enabled) pressedFg else baseFg

    Box(
        modifier = modifier
            .height(52.dp)
            .background(bg, shape)
            .border(width = borderWidth, color = borderColor, shape = shape)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides fg) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label.uppercase(),
                    color = fg,
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
