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
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.PaperWhite
import com.lifestyle.dailyscript.ui.theme.SignatureOrange

enum class SharpButtonVariant { Solid, Outline }

@Composable
fun SharpButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: SharpButtonVariant = SharpButtonVariant.Solid,
    activeColor: Color = SignatureOrange,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val isPressed by interaction.collectIsPressedAsState()

    val baseBg = when (variant) {
        SharpButtonVariant.Solid -> InkBlack
        SharpButtonVariant.Outline -> Color.Transparent
    }
    val baseFg = when (variant) {
        SharpButtonVariant.Solid -> PaperWhite
        SharpButtonVariant.Outline -> InkBlack
    }
    val pressedBg = when (variant) {
        SharpButtonVariant.Solid -> activeColor
        SharpButtonVariant.Outline -> InkBlack
    }
    val pressedFg = PaperWhite

    val bg = if (isPressed && enabled) pressedBg else baseBg
    val fg = if (isPressed && enabled) pressedFg else baseFg
    val borderColor = if (variant == SharpButtonVariant.Outline) InkBlack else Color.Transparent

    Box(
        modifier = modifier
            .height(52.dp)
            .background(bg)
            .border(width = if (variant == SharpButtonVariant.Outline) 1.dp else 0.dp, color = borderColor)
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
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
