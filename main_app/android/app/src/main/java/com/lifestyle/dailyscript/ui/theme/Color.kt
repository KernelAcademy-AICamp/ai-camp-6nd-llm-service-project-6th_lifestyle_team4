package com.lifestyle.dailyscript.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

// LongBlack palette — theme-aware tokens.
//
// These resolve from LocalAppColors so the same call site (e.g. `background(Paper)`,
// `color = Espresso`) renders correctly in both light and dark themes.
// They MUST be read inside a composition (every usage already is).

val Paper: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.paper

val Espresso: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.espresso

val Walnut: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.walnut

val Latte: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.latte

val Sand: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.sand

val Cta: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.cta

val Roast: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.roast

val Highlight: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.highlight

val CardWarm: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.cardWarm

val FeedCard: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.feedCard

val NewbookCard: Color
    @Composable @ReadOnlyComposable get() = LocalAppColors.current.newbookCard
