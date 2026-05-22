package com.lifestyle.dailyscript.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lifestyle.dailyscript.ui.archive.ArchiveScreen
import com.lifestyle.dailyscript.ui.components.BottomNavBar
import com.lifestyle.dailyscript.ui.components.HomeTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SettingsTopBar
import com.lifestyle.dailyscript.ui.detail.DetailScreen
import com.lifestyle.dailyscript.ui.home.HomeScreen
import com.lifestyle.dailyscript.ui.nav.Routes
import com.lifestyle.dailyscript.ui.settings.SettingsScreen
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun DailyScriptRoot() {
    val sessionVm: AppSessionViewModel = viewModel()
    val sessionState by sessionVm.state.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        when (val s = sessionState) {
            SessionState.Loading -> CenteredMessage(text = "Loading...")
            is SessionState.Error -> CenteredMessage(
                text = s.message,
                error = true,
                actionLabel = "Retry",
                onAction = sessionVm::bootstrap,
            )
            is SessionState.Ready -> ScaffoldWithNav(
                userId = s.userId,
                onSignOut = sessionVm::signOutAndReauth,
            )
        }
    }
}

@Composable
private fun ScaffoldWithNav(userId: Long, onSignOut: () -> Unit) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val isDetail = currentRoute?.startsWith("detail/") == true || currentRoute == Routes.DETAIL
    val showTopBar = !isDetail
    val showBottomBar = !isDetail && currentRoute in setOf(Routes.HOME, Routes.ARCHIVE, Routes.SETTINGS)

    Column(modifier = Modifier.fillMaxSize()) {
        if (showTopBar) {
            when (currentRoute) {
                Routes.HOME -> HomeTopBar(onMyPageClick = {
                    navController.navigate(Routes.SETTINGS) { launchSingleTop = true }
                })
                Routes.SETTINGS -> SettingsTopBar(initials = "DS")
                Routes.ARCHIVE -> SettingsTopBar(initials = "DS")
                else -> Unit
            }
        }
        Box(modifier = Modifier.weight(1f)) {
            NavHost(navController = navController, startDestination = Routes.HOME) {
                composable(Routes.HOME) {
                    HomeScreen(
                        userId = userId,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.ARCHIVE) {
                    ArchiveScreen(
                        userId = userId,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(nickname = null, onSignOut = onSignOut)
                }
                composable(
                    route = Routes.DETAIL,
                    arguments = listOf(navArgument("cardId") { type = NavType.LongType }),
                ) { entry ->
                    val cardId = entry.arguments?.getLong("cardId") ?: -1L
                    DetailScreen(
                        cardId = cardId,
                        userId = userId,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
        }
        if (showBottomBar) {
            BottomNavBar(
                currentRoute = currentRoute,
                onSelect = { route ->
                    if (currentRoute != route) {
                        navController.navigate(route) {
                            popUpTo(Routes.HOME) { inclusive = false }
                            launchSingleTop = true
                        }
                    }
                },
            )
        }
    }
}

@Composable
private fun CenteredMessage(
    text: String,
    error: Boolean = false,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = if (error) Cta else Walnut,
                textAlign = TextAlign.Center,
            )
            if (actionLabel != null && onAction != null) {
                SharpButton(
                    label = actionLabel,
                    onClick = onAction,
                    modifier = Modifier.width(180.dp),
                )
            }
        }
    }
}
