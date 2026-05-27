package com.lifestyle.dailyscript.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private fun lightScheme(c: AppColors): ColorScheme = lightColorScheme(
    primary = c.espresso,
    onPrimary = c.paper,
    primaryContainer = c.roast,
    onPrimaryContainer = c.paper,
    secondary = c.cta,
    onSecondary = c.paper,
    secondaryContainer = c.latte,
    onSecondaryContainer = c.espresso,
    tertiary = c.highlight,
    onTertiary = c.espresso,
    tertiaryContainer = c.latte,
    onTertiaryContainer = c.espresso,
    background = c.paper,
    onBackground = c.espresso,
    surface = c.paper,
    onSurface = c.espresso,
    surfaceVariant = c.latte,
    onSurfaceVariant = c.walnut,
    outline = c.latte,
    outlineVariant = c.sand,
    inverseSurface = c.espresso,
    inverseOnSurface = c.paper,
    inversePrimary = c.sand,
)

private fun darkScheme(c: AppColors): ColorScheme = darkColorScheme(
    primary = c.espresso,
    onPrimary = c.paper,
    primaryContainer = c.roast,
    onPrimaryContainer = c.paper,
    secondary = c.cta,
    onSecondary = c.paper,
    secondaryContainer = c.latte,
    onSecondaryContainer = c.espresso,
    tertiary = c.highlight,
    onTertiary = c.espresso,
    tertiaryContainer = c.latte,
    onTertiaryContainer = c.espresso,
    background = c.paper,
    onBackground = c.espresso,
    surface = c.paper,
    onSurface = c.espresso,
    surfaceVariant = c.latte,
    onSurfaceVariant = c.walnut,
    outline = c.latte,
    outlineVariant = c.sand,
    inverseSurface = c.espresso,
    inverseOnSurface = c.paper,
    inversePrimary = c.sand,
)

@Composable
fun DailyScriptTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val appColors = if (darkTheme) DarkAppColors else LightAppColors
    val colorScheme = if (darkTheme) darkScheme(appColors) else lightScheme(appColors)

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    CompositionLocalProvider(LocalAppColors provides appColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = EditorialTypography,
            shapes = EditorialShapes,
            content = content,
        )
    }
}
