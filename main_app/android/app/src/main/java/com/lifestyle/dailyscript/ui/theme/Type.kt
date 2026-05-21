package com.lifestyle.dailyscript.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// Korean text + most UI: system default (Roboto + device Hangul fallback).
val EditorialSerif: FontFamily = FontFamily.Default
val EditorialSans: FontFamily = FontFamily.Default

// Screenplay body: system monospace (Droid Sans Mono on most devices).
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
    displayLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 40.sp,
        lineHeight = 48.sp,
        letterSpacing = (-0.01).em,
    ),
    headlineLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = EditorialSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,
        lineHeight = 32.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 28.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = EditorialSans,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelSmall = LabelCaps,
    labelMedium = LabelCaps.copy(fontSize = 11.sp),
)
