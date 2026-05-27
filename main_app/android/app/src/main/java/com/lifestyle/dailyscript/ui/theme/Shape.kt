package com.lifestyle.dailyscript.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// LongBlack mood — softer, editorial corners.
val EditorialShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),   // chips / tags
    small      = RoundedCornerShape(8.dp),   // cards / buttons
    medium     = RoundedCornerShape(8.dp),
    large      = RoundedCornerShape(12.dp),  // dark panels (Today's Note 등)
    extraLarge = RoundedCornerShape(12.dp),
)
