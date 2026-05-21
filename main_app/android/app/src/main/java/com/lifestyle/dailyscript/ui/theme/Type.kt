package com.lifestyle.dailyscript.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// Use the system default family so Korean glyphs render with the device's
// default Hangul font (Noto Sans CJK KR / 기기 기본 한글 폰트) — same feel as
// Claude's default UI. Latin glyphs use Roboto.
// Swap to a custom FontFamily(Font(R.font.xxx)) when you embed actual TTFs.
val EditorialSerif: FontFamily = FontFamily.Default
val EditorialSans: FontFamily = FontFamily.Default
val ScreenplayMono: FontFamily = FontFamily.Monospace

val LabelCaps = TextStyle(
    fontFamily = EditorialSans,
    fontWeight = FontWeight.Bold,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    letterSpacing = 0.12.em,
)

val QuoteSerif = TextStyle(
    fontFamily = EditorialSerif,
    fontStyle = FontStyle.Italic,
    fontWeight = FontWeight.Medium,
    fontSize = 28.sp,
    lineHeight = 40.sp,
)

val ScreenplayBody = TextStyle(
    fontFamily = ScreenplayMono,
    fontSize = 14.sp,
    lineHeight = 20.sp,
)

val EditorialTypography: Typography = Typography(
    // Hero "오늘의 각본"
    displayLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 40.sp,
        lineHeight = 48.sp,
        letterSpacing = (-0.01).em,
    ),
    // Detail screen work title
    headlineLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    // "지난 기록", section headers
    headlineMedium = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    // Bookmark item title
    titleLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    // Body long-form
    bodyLarge = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,
        lineHeight = 32.sp,
    ),
    // Default body
    bodyMedium = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 28.sp,
    ),
    // Captions / secondary
    bodySmall = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    // label-caps role
    labelSmall = LabelCaps,
    labelMedium = LabelCaps.copy(fontSize = 11.sp),
)
