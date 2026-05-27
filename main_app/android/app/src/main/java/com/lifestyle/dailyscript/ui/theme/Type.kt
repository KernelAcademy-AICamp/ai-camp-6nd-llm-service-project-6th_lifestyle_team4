package com.lifestyle.dailyscript.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.R

// LongBlack typography
//
//  Korean headlines/quotes → 명조체 (NanumMyeongjo, res/font에 번들)
//  Body / UI / labels       → 시스템 sans (Pretendard 번들 시 교체 가능)
//  Screenplay (Detail body) → 시스템 monospace
//
// Weight policy: never go above 500. 위젯/iOS와 동일한 폰트 사용.
val EditorialSerif: FontFamily = FontFamily(Font(R.font.nanum_myeongjo))
val EditorialSans:  FontFamily = FontFamily.Default
val ScreenplayMono: FontFamily = FontFamily.Monospace

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
