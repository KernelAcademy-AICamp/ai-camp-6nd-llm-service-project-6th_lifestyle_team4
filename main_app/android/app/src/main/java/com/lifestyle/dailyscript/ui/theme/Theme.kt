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

private val EditorialLightColors = lightColorScheme(
    primary = InkBlack,
    onPrimary = PaperWhite,
    primaryContainer = InkBlack,
    onPrimaryContainer = PaperWhite,
    secondary = SignatureOrange,
    onSecondary = PaperWhite,
    tertiary = InkBlack,
    onTertiary = PaperWhite,
    background = PaperWhite,
    onBackground = InkBlack,
    surface = PaperWhite,
    onSurface = InkBlack,
    surfaceVariant = SurfaceMuted,
    onSurfaceVariant = OnSurfaceVariant,
    outline = BorderSubtle,
    outlineVariant = OutlineVariant,
)

@Composable
fun DailyScriptTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    // Light-only for MVP — designs are paper-white based.
    val colorScheme = EditorialLightColors

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
