package com.lifestyle.dailyscript.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * LIBRARY bottom-nav icon — four book spines of varying heights on a shelf baseline.
 * Mirrors the PWA's custom SVG (index.html `.nav-icon-library`, viewBox 24, stroke 1.6).
 * Stroke color is black; the tint from `Icon(...)` recolors it.
 */
val LibraryShelfIcon: ImageVector = ImageVector.Builder(
    name = "LibraryShelf",
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).apply {
    val stroke = SolidColor(Color.Black)
    val sw = 1.6f
    val cap = StrokeCap.Round
    val join = StrokeJoin.Round

    // spine 1 — rect(4.5, 6, 3, 13)
    path(stroke = stroke, strokeLineWidth = sw, strokeLineCap = cap, strokeLineJoin = join) {
        moveTo(4.5f, 6f); lineTo(7.5f, 6f); lineTo(7.5f, 19f); lineTo(4.5f, 19f); close()
    }
    // spine 2 — rect(8.5, 8, 3, 11)
    path(stroke = stroke, strokeLineWidth = sw, strokeLineCap = cap, strokeLineJoin = join) {
        moveTo(8.5f, 8f); lineTo(11.5f, 8f); lineTo(11.5f, 19f); lineTo(8.5f, 19f); close()
    }
    // spine 3 — rect(12.5, 4.5, 3, 14.5)
    path(stroke = stroke, strokeLineWidth = sw, strokeLineCap = cap, strokeLineJoin = join) {
        moveTo(12.5f, 4.5f); lineTo(15.5f, 4.5f); lineTo(15.5f, 19f); lineTo(12.5f, 19f); close()
    }
    // spine 4 — rect(16.5, 7, 3, 12)
    path(stroke = stroke, strokeLineWidth = sw, strokeLineCap = cap, strokeLineJoin = join) {
        moveTo(16.5f, 7f); lineTo(19.5f, 7f); lineTo(19.5f, 19f); lineTo(16.5f, 19f); close()
    }
    // shelf baseline — line(2, 20) → (22, 20)
    path(stroke = stroke, strokeLineWidth = sw, strokeLineCap = cap, strokeLineJoin = join) {
        moveTo(2f, 20f); lineTo(22f, 20f)
    }
}.build()
