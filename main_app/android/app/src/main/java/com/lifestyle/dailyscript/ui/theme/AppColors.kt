package com.lifestyle.dailyscript.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic palette tokens for the editorial "LongBlack" design.
 *
 * The two-tone design treats [paper] as the surface and [espresso] as the
 * ink/contrast color (text, filled buttons, chips). Dark mode inverts those two
 * so every existing usage (`background(Paper)`, `color = Espresso`, filled
 * buttons with espresso bg + paper text, …) flips correctly without per-screen
 * edits — the screen tokens are resolved via [LocalAppColors] at draw time.
 */
data class AppColors(
    val paper: Color,
    val espresso: Color,
    val walnut: Color,
    val latte: Color,
    val sand: Color,
    val cta: Color,
    val roast: Color,
    val highlight: Color,
)

val LightAppColors = AppColors(
    paper = Color(0xFFFAF8F2),     // warm cream surface
    espresso = Color(0xFF0E0C0A),  // near-black ink
    walnut = Color(0xFF6B5D4F),    // secondary text / meta
    latte = Color(0xFFE8E1D3),     // hairline / subtle panel
    sand = Color(0xFFC9B89A),      // neutral accent
    cta = Color(0xFFD85A30),       // coral CTA
    roast = Color(0xFF2C2620),     // pressed state of filled button
    highlight = Color(0xFFF4C20D), // signal (LIVE, star)
)

val DarkAppColors = AppColors(
    paper = Color(0xFF0E0C0A),     // near-black surface
    espresso = Color(0xFFFAF8F2),  // cream ink (text / filled bg)
    walnut = Color(0xFFB0A290),    // secondary text — lightened for contrast
    latte = Color(0xFF2A2620),     // hairline / subtle panel on dark
    sand = Color(0xFF7A6B57),      // neutral accent
    cta = Color(0xFFE0683E),       // coral CTA (slightly brighter on dark)
    roast = Color(0xFFE6DFD1),     // pressed state of (now light) filled button
    highlight = Color(0xFFF4C20D),
)

val LocalAppColors = staticCompositionLocalOf { LightAppColors }
