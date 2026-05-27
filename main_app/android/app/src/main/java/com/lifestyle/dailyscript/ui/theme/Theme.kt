package com.lifestyle.dailyscript.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LongBlackLight = lightColorScheme(
    primary = Espresso,
    onPrimary = Paper,
    primaryContainer = Roast,
    onPrimaryContainer = Paper,

    secondary = Cta,           // 1차 전환 (코랄)
    onSecondary = Paper,
    secondaryContainer = Latte,
    onSecondaryContainer = Espresso,

    tertiary = Highlight,      // 시그널 (D-day, 별점, LIVE)
    onTertiary = Espresso,
    tertiaryContainer = Latte,
    onTertiaryContainer = Espresso,

    background = Paper,
    onBackground = Espresso,
    surface = Paper,
    onSurface = Espresso,

    surfaceVariant = Latte,
    onSurfaceVariant = Walnut,

    outline = Latte,
    outlineVariant = Sand,

    inverseSurface = Espresso,
    inverseOnSurface = Paper,
    inversePrimary = Sand,
)

@Composable
fun DailyScriptTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    // Light-only MVP — design system is paper-on-cream.
    val colorScheme = LongBlackLight

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = true
                isAppearanceLightNavigationBars = true
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = EditorialTypography,
        shapes = EditorialShapes,
        content = content,
    )
}
