package com.lifestyle.dailyscript.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.repo.UserSession
import com.lifestyle.dailyscript.ui.archive.ArchiveScreen
import com.lifestyle.dailyscript.ui.components.BottomNavBar
import com.lifestyle.dailyscript.ui.components.HomeTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SettingsTopBar
import com.lifestyle.dailyscript.ui.detail.DetailScreen
import com.lifestyle.dailyscript.ui.feed.FeedScreen
import com.lifestyle.dailyscript.ui.feedback.FeedbackScreen
import com.lifestyle.dailyscript.ui.home.HomeScreen
import com.lifestyle.dailyscript.ui.nav.Routes
import com.lifestyle.dailyscript.ui.notice.NoticeScreen
import com.lifestyle.dailyscript.ui.notice.NoticeViewModel
import com.lifestyle.dailyscript.ui.onboarding.CoachController
import com.lifestyle.dailyscript.ui.onboarding.CoachTourOverlay
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.settings.LegalScreen
import com.lifestyle.dailyscript.ui.settings.MyCommentsScreen
import com.lifestyle.dailyscript.ui.settings.MyFeedScreen
import com.lifestyle.dailyscript.ui.settings.ProfileDialog
import com.lifestyle.dailyscript.ui.settings.SettingsScreen
import com.lifestyle.dailyscript.ui.settings.privacyDoc
import com.lifestyle.dailyscript.ui.settings.termsDoc
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Walnut

/** Credential Manager는 Activity 컨텍스트가 필요하다 — Compose의 LocalContext에서 풀어낸다. */
private fun Context.findActivity(): Activity? {
    var ctx: Context = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

@Composable
fun DailyScriptRoot() {
    val sessionVm: AppSessionViewModel = viewModel()
    val sessionState by sessionVm.state.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        when (val s = sessionState) {
            SessionState.Loading -> CenteredMessage(text = "Loading⋯")
            is SessionState.Error -> CenteredMessage(
                text = s.message,
                error = true,
                actionLabel = "Retry",
                onAction = sessionVm::bootstrap,
            )
            is SessionState.Ready -> ScaffoldWithNav(
                session = s.session,
                sessionVm = sessionVm,
            )
        }
    }
}

@Composable
private fun ScaffoldWithNav(session: UserSession, sessionVm: AppSessionViewModel) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    val authMessage by sessionVm.authMessage.collectAsState()
    val authInProgress by sessionVm.authInProgress.collectAsState()
    val showProfilePrompt by sessionVm.profilePromptVisible.collectAsState()

    val noticeVm: NoticeViewModel = viewModel()
    val noticeBadge by noticeVm.unread.collectAsState()

    // Interactive spotlight onboarding tour (앱 사용법 / 첫 실행). Starts only once HOME is shown.
    val coach = remember { CoachController() }
    LaunchedEffect(session.userId, session.isAnonymous, session.gender, session.ageGroup) {
        AppAnalytics.identify(session.userId, session.isAnonymous, session.gender, session.ageGroup)
    }
    LaunchedEffect(currentRoute) {
        val screen = when {
            currentRoute == Routes.DETAIL || currentRoute?.startsWith("detail/") == true -> "detail"
            else -> currentRoute
        }
        screen?.let(AppAnalytics::setScreen)
    }
    LaunchedEffect(session.isAnonymous) {
        coach.configure(memberActionsEnabled = !session.isAnonymous)
    }
    LaunchedEffect(currentRoute, coach.pending) {
        if (coach.pending && currentRoute == Routes.HOME) coach.start()
    }
    LaunchedEffect(navController) {
        // "전문 읽으러 가기" → 오늘 카드 상세 / "하이라이트 저장" → 피드로 이어짐.
        coach.onAction = { action ->
            when (action) {
                "openDetail" -> coach.tourCardId?.let { navController.navigate(Routes.detail(it)) }
                "openFeed" -> navController.navigate(Routes.FEED) { launchSingleTop = true }
            }
        }
        // 마침/건너뛰기 → 홈으로 복귀(상세에서 시작했다면 닫고 돌아옴).
        coach.onEnd = {
            navController.navigate(Routes.HOME) {
                popUpTo(Routes.HOME) { inclusive = false }
                launchSingleTop = true
            }
        }
    }

    val mainTabs = setOf(Routes.HOME, Routes.ARCHIVE, Routes.FEED, Routes.NOTICE, Routes.SETTINGS)
    val isDetail = currentRoute?.startsWith("detail/") == true || currentRoute == Routes.DETAIL
    val fullScreenRoutes = setOf(Routes.FEEDBACK, Routes.MY_COMMENTS, Routes.MY_FEED, Routes.TERMS, Routes.PRIVACY)
    val isFullScreen = isDetail || currentRoute in fullScreenRoutes
    val showTopBar = !isFullScreen
    val showBottomBar = !isFullScreen && currentRoute in mainTabs

    CompositionLocalProvider(LocalCoachController provides coach) {
      Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
        if (showTopBar) {
            when (currentRoute) {
                Routes.HOME, Routes.ARCHIVE, Routes.FEED, Routes.NOTICE -> HomeTopBar(onMyPageClick = {
                    AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.SETTINGS))
                    navController.navigate(Routes.SETTINGS) { launchSingleTop = true }
                })
                Routes.SETTINGS -> SettingsTopBar(onFeedback = {
                    AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.FEEDBACK))
                    navController.navigate(Routes.FEEDBACK)
                })
                else -> Unit
            }
        }
        Box(modifier = Modifier.weight(1f)) {
            NavHost(navController = navController, startDestination = Routes.HOME) {
                composable(Routes.HOME) {
                    HomeScreen(
                        userId = session.userId,
                        isAnonymous = session.isAnonymous,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.ARCHIVE) {
                    ArchiveScreen(
                        userId = session.userId,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.FEED) {
                    FeedScreen(
                        userId = session.userId,
                        isAnonymous = session.isAnonymous,
                        myNickname = session.nickname,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.NOTICE) {
                    NoticeScreen(vm = noticeVm)
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(
                        session = session,
                        authMessage = authMessage,
                        authInProgress = authInProgress,
                        onSignIn = { id, pw, signUp -> sessionVm.signIn(id, pw, signUp) },
                        onSocialSignIn = { provider -> sessionVm.signInWithProvider(provider, activity) },
                        onSignOut = sessionVm::signOutAndReauth,
                        onUpdateProfile = sessionVm::updateProfile,
                        onOpenMyComments = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.MY_COMMENTS))
                            navController.navigate(Routes.MY_COMMENTS)
                        },
                        onOpenMyFeed = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.MY_FEED))
                            navController.navigate(Routes.MY_FEED)
                        },
                        onOpenGuide = {
                            AppAnalytics.track("onboarding_requested")
                            coach.requestStart()
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.HOME) { inclusive = false }
                                launchSingleTop = true
                            }
                        },
                        onOpenTerms = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.TERMS))
                            navController.navigate(Routes.TERMS)
                        },
                        onOpenPrivacy = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.PRIVACY))
                            navController.navigate(Routes.PRIVACY)
                        },
                        onConsumeMessage = sessionVm::consumeAuthMessage,
                    )
                }
                composable(Routes.FEEDBACK) {
                    FeedbackScreen(
                        initialGender = session.gender,
                        initialAge = session.ageGroup,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(Routes.MY_COMMENTS) {
                    MyCommentsScreen(
                        userId = session.userId,
                        onBack = { navController.popBackStack() },
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.MY_FEED) {
                    MyFeedScreen(
                        userId = session.userId,
                        onBack = { navController.popBackStack() },
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.TERMS) {
                    LegalScreen(doc = termsDoc(), onBack = { navController.popBackStack() })
                }
                composable(Routes.PRIVACY) {
                    LegalScreen(doc = privacyDoc(), onBack = { navController.popBackStack() })
                }
                composable(
                    route = Routes.DETAIL,
                    arguments = listOf(navArgument("cardId") { type = NavType.LongType }),
                ) { entry ->
                    val cardId = entry.arguments?.getLong("cardId") ?: -1L
                    DetailScreen(
                        cardId = cardId,
                        userId = session.userId,
                        isAnonymous = session.isAnonymous,
                        myNickname = session.nickname,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
        }
        if (showBottomBar) {
            BottomNavBar(
                currentRoute = currentRoute,
                noticeBadge = noticeBadge,
                onSelect = { route ->
                    if (currentRoute != route) {
                        AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to route))
                        navController.navigate(route) {
                            popUpTo(Routes.HOME) { inclusive = false }
                            launchSingleTop = true
                        }
                    }
                },
            )
        }
        }
        CoachTourOverlay(coach)
        // 소셜 첫 가입 직후 1회: 성별·나이 입력 프롬프트(기존 프로필 다이얼로그 재사용, 건너뛰기 가능).
        if (showProfilePrompt) {
            ProfileDialog(
                initialNickname = session.nickname,
                initialGender = session.gender,
                initialAge = session.ageGroup,
                onDismiss = { sessionVm.consumeProfilePrompt() },
                onSave = { name, g, a ->
                    sessionVm.updateProfile(name, g, a)
                    sessionVm.consumeProfilePrompt()
                },
            )
        }
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
