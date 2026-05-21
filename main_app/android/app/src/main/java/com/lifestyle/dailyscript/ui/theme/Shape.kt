package com.lifestyle.dailyscript.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// Sharp & Architectural — 0px corners across the board.
private val Sharp = RoundedCornerShape(0.dp)

val EditorialShapes: Shapes = Shapes(
    extraSmall = Sharp,
    small = Sharp,
    medium = Sharp,
    large = Sharp,
    extraLarge = Sharp,
)
