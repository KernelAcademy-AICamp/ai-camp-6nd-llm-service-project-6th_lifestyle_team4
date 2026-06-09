package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import kotlin.math.absoluteValue

// --- Leather palette for the book cover (fixed, theme-independent). Shared by the
// feed highlight card and the library grid (mirrors the PWA .hl-bookcover). ---
val BookCream = Color(0xFFFAF8F2)

private val BookLeathers = listOf(
    Color(0xFF0E0C0A), Color(0xFF5A2A24), Color(0xFF2F3A30), Color(0xFF293541),
    Color(0xFF6A4A30), Color(0xFF40303B), Color(0xFF3A463F), Color(0xFF1F2A3A),
    Color(0xFF4A2B1A), Color(0xFF3D2E22), Color(0xFF26393B), Color(0xFF2E2538),
)

/** Deterministic leather color from the title (same title → same color). */
fun leatherColorFor(title: String?): Color {
    val key = (title ?: "").ifBlank { "?" }
    return BookLeathers[key.hashCode().absoluteValue % BookLeathers.size]
}

/**
 * Solid leather book cover: left spine shadow line + inset white-line rectangle +
 * centered title/subtitle/author. Borrowed from the feed highlight card so the
 * library grid shows the same "book shape".
 *
 * Sizing comes from [modifier] — the feed passes a fixed 132×188dp, the library grid
 * passes `fillMaxWidth().aspectRatio(132f / 188f)`. [compact] shrinks the type so the
 * four-per-row grid cells stay legible.
 */
@Composable
fun BookCover(
    work: WorkDto?,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val shape = RoundedCornerShape(if (compact) 3.dp else 4.dp)
    Box(
        modifier = modifier
            .shadow(if (compact) 6.dp else 10.dp, shape)
            .clip(shape)
            .background(leatherColorFor(work?.title)),
    ) {
        // left spine shadow line
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(if (compact) 3.dp else 5.dp)
                .align(Alignment.CenterStart)
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x59000000),
                        0.5f to Color(0x1A000000),
                        1f to Color(0x59000000),
                    )
                ),
        )
        // inset white-line border rectangle
        Box(
            modifier = Modifier
                .matchParentSize()
                .padding(if (compact) 4.dp else 7.dp)
                .border(0.5.dp, Color(0x33FFFFFF), RoundedCornerShape(2.dp)),
        )
        // title / subtitle / author, centered
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    horizontal = if (compact) 7.dp else 14.dp,
                    vertical = if (compact) 9.dp else 18.dp,
                ),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = work?.title ?: "—",
                style = TextStyle(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = if (compact) 11.sp else 17.sp,
                    lineHeight = if (compact) 14.sp else 22.sp,
                ),
                color = BookCream,
                textAlign = TextAlign.Center,
                maxLines = if (compact) 3 else 4,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = work?.subtitle
            if (!sub.isNullOrBlank()) {
                Box(modifier = Modifier.height(if (compact) 5.dp else 10.dp))
                Text(
                    text = sub,
                    style = TextStyle(
                        fontFamily = EditorialSerif,
                        fontSize = if (compact) 8.sp else 12.sp,
                        lineHeight = if (compact) 11.sp else 17.sp,
                    ),
                    color = BookCream.copy(alpha = 0.90f),
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val author = work?.author
            if (!author.isNullOrBlank()) {
                Box(modifier = Modifier.height(if (compact) 6.dp else 14.dp))
                Text(
                    text = author,
                    style = TextStyle(
                        fontFamily = EditorialSerif,
                        fontSize = if (compact) 7.sp else 10.sp,
                        letterSpacing = 0.08.em,
                    ),
                    color = BookCream.copy(alpha = 0.78f),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
