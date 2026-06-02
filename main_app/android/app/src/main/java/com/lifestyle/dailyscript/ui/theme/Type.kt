@file:OptIn(ExperimentalTextApi::class)

package com.lifestyle.dailyscript.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.R

// LongBlack typography — bundled to match the PWA (web_pwa) exactly:
//  Headlines/quotes (명조) → Nanum Myeongjo
//  Wordmark "Daily Script." → Bodoni Moda (웹 헤더 Bodoni 72 대응)
//  Body / UI / labels      → Noto Sans KR (variable; 400/500/700)
//  Screenplay (Detail body) → JetBrains Mono (variable; 400/500)
val EditorialSerif: FontFamily = FontFamily(Font(R.font.nanum_myeongjo))

val WordmarkSerif: FontFamily = FontFamily(Font(R.font.bodoni_moda))

val EditorialSans: FontFamily = FontFamily(
    Font(R.font.noto_sans_kr, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.noto_sans_kr, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.noto_sans_kr, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)

val ScreenplayMono: FontFamily = FontFamily(
    Font(R.font.jetbrains_mono, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.jetbrains_mono, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
)

// Reusable styles
val MetaCaps = TextStyle(
    fontFamily = EditorialSans,
    fontWeight = FontWeight.Normal,
    fontSize = 11.sp,
    lineHeight = 16.sp,
    letterSpacing = 0.2.em,
)

val QuoteSerif = TextStyle(
    fontFamily = EditorialSerif,
    fontWeight = FontWeight.Normal,
    fontStyle = FontStyle.Normal, // 한글 italic 금지
    fontSize = 22.sp,
    lineHeight = 34.sp,
)

val NumericSerif = TextStyle(
    fontFamily = EditorialSerif,
    fontWeight = FontWeight.Medium,
    fontSize = 28.sp,
    lineHeight = 28.sp,
)

val EditorialTypography: Typography = Typography(
    // Hero ("오늘의 각본") — 40px serif
    displayLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 40.sp,
        lineHeight = 52.sp,
    ),
    displayMedium = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 32.sp,
        lineHeight = 42.sp,
    ),
    // Detail work title — 24px serif
    headlineLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 24.sp,
        lineHeight = 34.sp,
    ),
    // Section header ("지난 기록") — 22px serif
    headlineMedium = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 22.sp,
        lineHeight = 31.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,
        lineHeight = 26.sp,
    ),
    // Card title / row title — 16px serif
    titleLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    // Long-form body 16/29 (≈1.8)
    bodyLarge = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 29.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 25.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 19.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.em,
    ),
    labelMedium = MetaCaps.copy(fontSize = 12.sp),
    labelSmall = MetaCaps,
)
