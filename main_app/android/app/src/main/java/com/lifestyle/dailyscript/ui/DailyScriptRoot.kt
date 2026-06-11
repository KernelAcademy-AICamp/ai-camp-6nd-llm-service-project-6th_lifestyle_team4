package com.lifestyle.dailyscript.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.repo.UserSession
import com.lifestyle.dailyscript.ui.archive.ArchiveScreen
import com.lifestyle.dailyscript.ui.components.BottomNavBar
import com.lifestyle.dailyscript.ui.components.HomeTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SettingsTopBar
import com.lifestyle.dailyscript.ui.daily.DailyScreen
import com.lifestyle.dailyscript.ui.detail.DetailScreen
import com.lifestyle.dailyscript.ui.feed.FeedScreen
import com.lifestyle.dailyscript.ui.feedback.FeedbackScreen
import com.lifestyle.dailyscript.ui.home.HomeScreen
import com.lifestyle.dailyscript.ui.home.HomeViewModel
import com.lifestyle.dailyscript.ui.library.LibraryScreen
import com.lifestyle.dailyscript.ui.nav.Routes
import com.lifestyle.dailyscript.ui.notice.NoticeScreen
import com.lifestyle.dailyscript.ui.notice.NoticeViewModel
import com.lifestyle.dailyscript.ui.onboarding.CoachController
import com.lifestyle.dailyscript.ui.onboarding.CoachTourOverlay
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.PreferenceOverlay
import com.lifestyle.dailyscript.ui.settings.LegalScreen
import com.lifestyle.dailyscript.ui.settings.MyCommentsScreen
import com.lifestyle.dailyscript.ui.settings.MyFeedScreen
import com.lifestyle.dailyscript.ui.settings.ProfileDialog
import com.lifestyle.dailyscript.ui.settings.SettingsScreen
import com.lifestyle.dailyscript.ui.settings.privacyDoc
import com.lifestyle.dailyscript.ui.settings.termsDoc
import com.lifestyle.dailyscript.ui.yarn.YarnGate
import com.lifestyle.dailyscript.ui.yarn.YarnPurchaseScreen
import com.lifestyle.dailyscript.ui.yarn.YarnViewModel
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScaffoldWithNav(session: UserSession, sessionVm: AppSessionViewModel) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val destinationRoute = backStack?.destination?.route
    val currentRoute = when (destinationRoute) {
        Routes.ARCHIVE_WORK -> Routes.ARCHIVE
        else -> destinationRoute
    }
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    val authMessage by sessionVm.authMessage.collectAsState()
    val authInProgress by sessionVm.authInProgress.collectAsState()
    val showProfilePrompt by sessionVm.profilePromptVisible.collectAsState()

    val noticeVm: NoticeViewModel = viewModel()
    val noticeBadge by noticeVm.unread.collectAsState()

    // 홈 카드 VM — 하단 '홈' 탭 재탭 시 새로고침을 위해 루트에서 호이스팅(액티비티 스코프).
    val homeVm: HomeViewModel = viewModel()

    // 실타래 잔액 — 상단바 칩과 DETAIL 게이트가 공유하는 단일 소스. VM 은 액티비티
    // 스코프라 세션이 바뀌면(로그인/로그아웃/탈퇴) 서버 잔액으로 다시 시드한다.
    val yarnVm: YarnViewModel = viewModel()
    val yarnAvailable by yarnVm.available.collectAsState()
    LaunchedEffect(session.userId, session.yarnBalance) {
        yarnVm.setPurchased(session.yarnBalance)
        yarnVm.refreshDaily()
    }

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
                popUpTo(Routes.DAILY) { inclusive = false }
                launchSingleTop = true
            }
        }
    }

    val isDetail = destinationRoute?.startsWith("detail/") == true || destinationRoute == Routes.DETAIL
    val fullScreenRoutes = setOf(Routes.FEEDBACK, Routes.MY_COMMENTS, Routes.MY_FEED, Routes.BOOKMARKS, Routes.TERMS, Routes.PRIVACY, Routes.YARN_PURCHASE)
    val isFullScreen = isDetail || currentRoute in fullScreenRoutes
    val showTopBar = !isFullScreen
    // 하단 바는 모든 화면에서 노출 — 메인 탭·상세는 물론 마이 하위 페이지(내 댓글/내 피드/보관함/
    // 약관/개인정보/실타래 충전/의견)까지. 풀스크린 화면은 각자 자체 상단 바(뒤로가기)를 둔다.
    // 단, 키보드(IME)가 떠 있으면 숨김 — 입력 컴포저가 키보드 바로 위에 붙도록.
    val imeVisible = WindowInsets.isImeVisible
    val showBottomBar = currentRoute != null && !imeVisible

    // 뒤로가기 종료는 시작 탭(오늘)에서만 — 다른 탭/상세에선 NavController가 오늘로 되돌리거나 pop한다.
    // 오늘에서 한 번 누르면 토스트만, 2초 내 한 번 더 누르면 실제 종료(실수 종료 방지).
    var lastBackPressAt by remember { mutableStateOf(0L) }
    BackHandler(enabled = currentRoute == Routes.DAILY) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressAt < 2000L) {
            activity?.finish()
        } else {
            lastBackPressAt = now
            Toast.makeText(context, "뒤로 가기를 한 번 더 누르면 종료돼요", Toast.LENGTH_SHORT).show()
        }
    }

    CompositionLocalProvider(LocalCoachController provides coach) {
      Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().imePadding()) {
        if (showTopBar) {
            when (currentRoute) {
                Routes.DAILY, Routes.HOME, Routes.ARCHIVE, Routes.FEED, Routes.NOTICE -> HomeTopBar(
                    yarn = yarnAvailable,
                    onYarnClick = {
                        AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.YARN_PURCHASE))
                        navController.navigate(Routes.YARN_PURCHASE) { launchSingleTop = true }
                    },
                )
                Routes.SETTINGS -> SettingsTopBar(onFeedback = {
                    AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.FEEDBACK))
                    navController.navigate(Routes.FEEDBACK)
                })
                else -> Unit
            }
        }
        // 본문은 화면 전체를 채운다 — 떠 있는 하단 바가 본문 위에 overlay 되어 좌우/아래 여백까지
        // 본문이 비쳐 보인다. 각 화면이 스크롤 끝/떠있는 요소를 BottomBarContentInset 만큼 띄워
        // 카드에 가려지지 않게 처리한다.
        Box(modifier = Modifier.weight(1f)) {
            NavHost(navController = navController, startDestination = Routes.DAILY) {
                composable(Routes.DAILY) {
                    DailyScreen(
                        userId = session.userId,
                        onOpenNotice = { navController.navigate(Routes.NOTICE) { launchSingleTop = true } },
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                        onOpenLibraryWork = { workId ->
                            if (workId > 0L) {
                                navController.navigate(Routes.archiveWork(workId)) { launchSingleTop = true }
                            } else {
                                navController.navigate(Routes.ARCHIVE) { launchSingleTop = true }
                            }
                        },
                    )
                }
                composable(Routes.HOME) {
                    HomeScreen(
                        userId = session.userId,
                        vm = homeVm,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(Routes.ARCHIVE) {
                    LibraryScreen(
                        userId = session.userId,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                    )
                }
                composable(
                    route = Routes.ARCHIVE_WORK,
                    arguments = listOf(navArgument("workId") { type = NavType.LongType }),
                ) { entry ->
                    val workId = entry.arguments?.getLong("workId")?.takeIf { it > 0L }
                    LibraryScreen(
                        userId = session.userId,
                        initialOpenWorkId = workId,
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
                        yarn = yarnAvailable,
                        authMessage = authMessage,
                        authInProgress = authInProgress,
                        onSignIn = { id, pw, signUp -> sessionVm.signIn(id, pw, signUp) },
                        onSocialSignIn = { provider -> sessionVm.signInWithProvider(provider, activity) },
                        onSignOut = sessionVm::signOutAndReauth,
                        onDeleteAccount = sessionVm::deleteAccountAndReauth,
                        onUpdateProfile = sessionVm::updateProfile,
                        onOpenMyComments = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.MY_COMMENTS))
                            navController.navigate(Routes.MY_COMMENTS)
                        },
                        onOpenMyFeed = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.MY_FEED))
                            navController.navigate(Routes.MY_FEED)
                        },
                        onOpenBookmarks = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.BOOKMARKS))
                            navController.navigate(Routes.BOOKMARKS)
                        },
                        onOpenYarnPurchase = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.YARN_PURCHASE))
                            navController.navigate(Routes.YARN_PURCHASE)
                        },
                        onOpenNotice = {
                            AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to Routes.NOTICE))
                            navController.navigate(Routes.NOTICE) { launchSingleTop = true }
                        },
                        hasUnreadNotice = noticeBadge > 0,
                        onOpenGuide = {
                            AppAnalytics.track("onboarding_requested")
                            coach.requestStart()
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.DAILY) { inclusive = false }
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
                composable(Routes.BOOKMARKS) {
                    ArchiveScreen(
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
                composable(Routes.YARN_PURCHASE) {
                    YarnPurchaseScreen(
                        yarnVm = yarnVm,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = Routes.DETAIL,
                    arguments = listOf(navArgument("cardId") { type = NavType.LongType }),
                ) { entry ->
                    val cardId = entry.arguments?.getLong("cardId") ?: -1L
                    // 실타래 게이트 — 차감 승인 후에만 DetailScreen(=vm.load/incrementView) 컴포즈.
                    YarnGate(
                        cardId = cardId,
                        yarnVm = yarnVm,
                        onGoCharge = {
                            navController.popBackStack(Routes.DETAIL, inclusive = true)
                            navController.navigate(Routes.YARN_PURCHASE)
                        },
                        onCancel = { navController.popBackStack() },
                    ) {
                        DetailScreen(
                            cardId = cardId,
                            userId = session.userId,
                            isAnonymous = session.isAnonymous,
                            myNickname = session.nickname,
                            onBack = { navController.popBackStack() },
                            // 하단바 탭 전환과 같은 패턴 — 방문 순서대로 쌓아 뒤로가기가 직전 화면으로 가게 한다.
                            onGoLibrary = {
                                AppAnalytics.track("nav", mapOf("from" to Routes.DETAIL, "to" to Routes.ARCHIVE))
                                navController.navigate(Routes.ARCHIVE) { launchSingleTop = true }
                            },
                            onGoFeed = {
                                navController.navigate(Routes.FEED) { launchSingleTop = true }
                            },
                        )
                    }
                }
            }
        }
        }
        // 하단 바 — Column 형제가 아니라 inner Box 에 overlay. 본문 위에 떠 있어 고양이/홈버튼 솟음
        // 영역만큼 본문이 비는 '박스'가 생기지 않는다. (본문은 위에서 BottomBarContentInset 만큼만 패딩)
        if (showBottomBar) {
            BottomNavBar(
                currentRoute = currentRoute,
                noticeBadge = noticeBadge,
                onSelect = { route ->
                    if (currentRoute != route) {
                        AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to route))
                        // 표준 하단탭 패턴 — 시작 목적지까지 popUpTo(saveState)로 떠나는 탭의 상태를 저장하고
                        // restoreState로 되살린다. 덕분에 탭을 다시 눌러도 그 탭의 NavBackStackEntry(=ViewModel)
                        // 가 복원돼 데이터를 다시 불러오지 않는다(각 VM의 loaded 가드와 맞물림). 백스택은
                        // [시작탭, 현재탭]으로 얕게 유지 → 뒤로가기는 시작탭(오늘)으로 모였다가 앱 종료.
                        // (같은 탭 재탭은 위 currentRoute != route 가드로 중복 push 방지)
                        navController.navigate(route) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    } else if (route == Routes.HOME) {
                        // 이미 홈일 때 홈 탭을 다시 누르면 새로고침 — 제거된 새로고침 버튼을 대체.
                        homeVm.refresh(session.userId, session.isAnonymous)
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
        CoachTourOverlay(coach)
        // 선호도(장르·주제) 온보딩 — 첫 접속/미선택 사용자에게 앱 진입 즉시 1회, 시작 탭(NOTICE)보다
        // 먼저 전 화면 위에 띄운다 (스플래시가 걷히면 바로 보임). 코치 투어는 prefSelected 후
        // 홈 첫 진입 때 시작 (PWA 순서: 선호도 → 투어). 덕분에 홈 첫 카드부터 선호가 반영된다.
        // initial=null(DataStore 방출 전)엔 띄우지 않아 완료 사용자에게 깜빡임이 없다.
        val prefSelected by AppPreferences.prefSelected.collectAsState(initial = null)
        if (prefSelected == false) {
            PreferenceOverlay(onFinish = { r ->
                sessionVm.savePreferences(r.genres, r.themes, r.any, r.skipped)
            })
        }
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
