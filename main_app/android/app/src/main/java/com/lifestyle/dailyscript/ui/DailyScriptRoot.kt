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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.FeedPost
import com.lifestyle.dailyscript.data.model.Highlight
import com.lifestyle.dailyscript.data.repo.UserSession
import com.lifestyle.dailyscript.ui.archive.ArchiveScreen
import com.lifestyle.dailyscript.ui.components.BottomNavBar
import com.lifestyle.dailyscript.ui.components.HomeTopBar
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SettingsTopBar
import com.lifestyle.dailyscript.ui.daily.DailyScreen
import com.lifestyle.dailyscript.ui.detail.DetailScreen
import com.lifestyle.dailyscript.ui.feed.FeedPostDetailSheet
import com.lifestyle.dailyscript.ui.feed.FeedScreen
import com.lifestyle.dailyscript.ui.feed.HighlightDetailSheet
import com.lifestyle.dailyscript.ui.feedback.FeedbackScreen
import com.lifestyle.dailyscript.ui.notif.NotifSheet
import com.lifestyle.dailyscript.ui.notif.NotifViewModel
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
import com.lifestyle.dailyscript.ui.yarn.YarnViewModel
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Walnut
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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
    val idCheck by sessionVm.idCheck.collectAsState()
    val showProfilePrompt by sessionVm.profilePromptVisible.collectAsState()

    val noticeVm: NoticeViewModel = viewModel()
    val noticeBadge by noticeVm.unread.collectAsState()

    // 알림(확성기) VM — 상단바 배지 + 알림 시트(댓글/대댓글). 액티비티 스코프(루트 호이스팅).
    val notifVm: NotifViewModel = viewModel()
    val notifUnread by notifVm.unread.collectAsState()
    val notifItems by notifVm.items.collectAsState()
    val notifLoading by notifVm.loading.collectAsState()
    var notifSheetOpen by remember { mutableStateOf(false) }
    // 실타래 설명 팝업 — 상단바 실타래 칩 탭 시. (충전 페이지 폐지 후 칩의 유일한 동작)
    var yarnInfoOpen by remember { mutableStateOf(false) }
    var notifDetailPost by remember { mutableStateOf<FeedPost?>(null) }
    var notifDetailHighlight by remember { mutableStateOf<Highlight?>(null) }
    val rootScope = rememberCoroutineScope()
    // 미읽음 배지 폴링 — 포그라운드(STARTED)에서만 60초마다 + 복귀 즉시 1회. (PWA setInterval 60s + visibilitychange)
    //   repeatOnLifecycle 이 백그라운드에선 루프를 멈추고, 포그라운드 복귀 때 재시작하며 즉시 갱신한다. 게스트는 0.
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(session.userId, session.isAnonymous) {
        if (session.isAnonymous) {
            notifVm.refreshUnread(session.userId, true)
            return@LaunchedEffect
        }
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) {
                notifVm.refreshUnread(session.userId, false)
                delay(60_000)
            }
        }
    }

    // 홈 카드 VM — 하단 '홈' 탭 재탭 시 새로고침을 위해 루트에서 호이스팅(액티비티 스코프).
    val homeVm: HomeViewModel = viewModel()

    // 실타래 잔액 — 상단바 칩과 DETAIL 게이트가 공유하는 단일 소스. VM 은 액티비티
    // 스코프라 세션이 바뀌면(로그인/로그아웃/탈퇴) 서버 잔액으로 다시 시드한다.
    val yarnVm: YarnViewModel = viewModel()
    val yarnAvailable by yarnVm.available.collectAsState()
    val purchasedShareThemes by yarnVm.purchasedThemes.collectAsState()
    val shareBackgrounds by yarnVm.shareBackgrounds.collectAsState()
    val attendanceHistory by yarnVm.attendanceHistory.collectAsState()
    LaunchedEffect(session.userId, session.yarnBalance) {
        yarnVm.setPurchased(session.yarnBalance)
    }
    LaunchedEffect(session.userId) {
        yarnVm.loadPurchasedThemes()
        yarnVm.loadShareBackgrounds()
    }

    // OZ Pick "취향 알려주기" CTA → 선호도 온보딩 강제 재노출 (이미 완료한 사용자도 다시 설정 가능).
    var forcePrefOverlay by remember { mutableStateOf(false) }

    // 출석체크 — 00시 기준 그날 첫 진입이면 1회 보상 애니(+100) → 다이얼로그.
    var attendanceVisible by remember { mutableStateOf(false) }
    var attendanceRewarded by remember { mutableStateOf(false) }
    // 출석 보상 애니메이션 상태 — 버스트→실타래 칩으로 이동→칩 bounce→잔액 카운트업.
    var rewardAnimAmount by remember { mutableStateOf<Int?>(null) }  // >0 이면 애니 재생 중
    var rewardAnimStart by remember { mutableStateOf(0) }
    var rewardAnimFinal by remember { mutableStateOf(0) }
    var yarnChipCenter by remember { mutableStateOf(Offset.Zero) }   // 칩 중심 window px (버스트 목표)
    var chipDisplayOverride by remember { mutableStateOf<Int?>(null) } // 카운트업 동안 칩 표시값 덮어쓰기
    var chipBounceKey by remember { mutableStateOf(0) }               // ++ 하면 칩 실타래 이미지 bounce
    var bottomBarTopPx by remember { mutableStateOf(0f) }             // 하단 바 카드 top(window px) — 상세 '본문 끝 통과' 보상 판정
    LaunchedEffect(session.userId, session.isAnonymous) {
        if (session.isAnonymous) return@LaunchedEffect
        val today = java.time.LocalDate.now().toString()
        if (AppPreferences.attendanceLastShown() == today) return@LaunchedEffect
        AppPreferences.markAttendanceShown(today)
        val start = yarnVm.available.value
        attendanceRewarded = yarnVm.rewardAttendance()
        yarnVm.loadAttendanceHistory()       // 서버 출석 기록(오늘 포함) → 달력 렌더용
        val finalBal = yarnVm.available.value
        if (attendanceRewarded && finalBal > start) {
            chipDisplayOverride = start          // 카운트업 전까지 칩을 시작값에 고정
            rewardAnimStart = start
            rewardAnimFinal = finalBal
            rewardAnimAmount = finalBal - start  // 애니 재생 트리거 (끝나면 달력 표시)
        } else {
            attendanceVisible = true             // 보상 없으면 달력만
        }
    }
    if (attendanceVisible) {
        com.lifestyle.dailyscript.ui.yarn.AttendanceDialog(
            rewardedToday = attendanceRewarded,
            history = attendanceHistory,
            onDismiss = { attendanceVisible = false },
        )
    }
    rewardAnimAmount?.takeIf { it > 0 }?.let { amt ->
        com.lifestyle.dailyscript.ui.yarn.YarnRewardAnimation(
            amount = amt,
            startBalance = rewardAnimStart,
            finalBalance = rewardAnimFinal,
            chipCenter = { yarnChipCenter },
            onCountTo = { chipDisplayOverride = it },
            onBounce = { chipBounceKey++ },
            onFinished = {
                chipDisplayOverride = null
                rewardAnimAmount = null
                attendanceVisible = true
            },
        )
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
    val fullScreenRoutes = setOf(Routes.NOTICE, Routes.FEEDBACK, Routes.MY_COMMENTS, Routes.MY_FEED, Routes.BOOKMARKS, Routes.TERMS, Routes.PRIVACY)
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
                Routes.DAILY, Routes.HOME, Routes.ARCHIVE, Routes.FEED -> HomeTopBar(
                    yarn = chipDisplayOverride ?: yarnAvailable,
                    onYarnClick = {
                        AppAnalytics.track("yarn_info_open")
                        yarnInfoOpen = true
                    },
                    yarnBounceKey = chipBounceKey,
                    onYarnChipPositioned = { yarnChipCenter = it },
                    notifUnread = notifUnread,
                    onNotifClick = {
                        notifVm.open(session.userId, session.isAnonymous)
                        notifSheetOpen = true
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
                        isAnonymous = session.isAnonymous,
                        nickname = session.nickname,
                        loginId = session.loginId,
                        onOpenNotice = { navController.navigate(Routes.NOTICE) { launchSingleTop = true } },
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                        // OZ Pick CTA — 게스트/무선호 사용자가 선호도 온보딩을 다시 열도록.
                        onRequestPreferences = { forcePrefOverlay = true },
                    )
                }
                composable(Routes.HOME) {
                    HomeScreen(
                        userId = session.userId,
                        vm = homeVm,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                        yarnBalance = yarnAvailable,
                        purchasedThemeIds = purchasedShareThemes,
                        remoteBackgrounds = shareBackgrounds,
                        onBuyTheme = { bg -> yarnVm.buyShareTheme(bg.id, bg.price) },
                    )
                }
                composable(Routes.ARCHIVE) {
                    LibraryScreen(
                        userId = session.userId,
                        onOpenCard = { cardId -> navController.navigate(Routes.detail(cardId)) },
                        onOpenBookmarks = { navController.navigate(Routes.BOOKMARKS) },
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
                        onOpenBookmarks = { navController.navigate(Routes.BOOKMARKS) },
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
                    NoticeScreen(vm = noticeVm, onBack = { navController.popBackStack() })
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(
                        session = session,
                        authMessage = authMessage,
                        authInProgress = authInProgress,
                        idCheck = idCheck,
                        onSignIn = { id, pw, signUp, gender, age -> sessionVm.signIn(id, pw, signUp, gender, age) },
                        onCheckId = sessionVm::checkIdAvailability,
                        onResetIdCheck = sessionVm::resetIdCheck,
                        onSocialSignIn = { provider -> sessionVm.signInWithProvider(provider, activity) },
                        onSignOut = sessionVm::signOutAndReauth,
                        onDeleteAccount = sessionVm::deleteAccountAndReauth,
                        onUpdateProfile = sessionVm::updateProfile,
                        onSavePreferences = { g, t, a -> sessionVm.savePreferences(g, t, a, skipped = false) },
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
                        yarnBalance = yarnAvailable,
                        purchasedThemeIds = purchasedShareThemes,
                        remoteBackgrounds = shareBackgrounds,
                        onBuyTheme = { bg -> yarnVm.buyShareTheme(bg.id, bg.price) },
                        // 본문을 스크롤로 끝까지 읽으면 첫 열람 보상(+300) 지급 — 지급량 반환(보상 애니 트리거).
                        // 게스트(익명)는 출석 보상과 동일하게 제외 (PWA: !state.userId 시 보상 없음).
                        // dedup 은 user-scope — session.userId 로 분리(재가입 시 재보상, PWA d2c2c0a).
                        onContentRead = { if (session.isAnonymous) 0 else yarnVm.rewardFirstView(session.userId, cardId) },
                        // 본문 끝(에디션 표기)이 떠 있는 하단 탭 카드 top 을 통과하는 순간 보상 판정.
                        bottomBarTopPx = bottomBarTopPx,
                        onBack = { navController.popBackStack() },
                        // 첫 공유 안내 모달의 '앱 사용법 둘러보기' — 코치 투어 시작(홈으로 이동 후, 설정의 onOpenGuide 와 동일).
                        onLaunchTour = {
                            AppAnalytics.track("onboarding_requested")
                            coach.requestStart()
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.DAILY) { inclusive = false }
                                launchSingleTop = true
                            }
                        },
                        onGoFeed = {
                            navController.navigate(Routes.FEED) { launchSingleTop = true }
                        },
                        onOpenFeedback = {
                            AppAnalytics.track("nav", mapOf("from" to Routes.DETAIL, "to" to Routes.FEEDBACK))
                            navController.navigate(Routes.FEEDBACK) { launchSingleTop = true }
                        },
                    )
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
                    selectBottomTab(navController, currentRoute, route) {
                        // 이미 홈일 때 홈 탭을 다시 누르면 새로고침 — 제거된 새로고침 버튼을 대체.
                        homeVm.refresh(session.userId, session.isAnonymous)
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter),
                onBarTopPositioned = { bottomBarTopPx = it },
            )
        }

        // 알림(확성기) 시트 — 헤더 버튼 클릭 시. 항목 탭 → 해당 피드 글/하이라이트 상세 시트로 이동.
        if (notifSheetOpen) {
            NotifSheet(
                items = notifItems,
                loading = notifLoading,
                loginRequired = session.isAnonymous,
                onDismiss = { notifSheetOpen = false },
                onOpen = { n ->
                    // 시트를 먼저 닫고(탭 즉시 반응) 비동기로 대상 조회 → 성공 시 상세, 실패(삭제 등)면 토스트. (PWA closeNotifModal→fetch→'이동 실패')
                    notifSheetOpen = false
                    rootScope.launch {
                        when (n.kind) {
                            "post_comment", "comment_reply" -> {
                                val post = n.targetPostId?.let { notifVm.resolvePost(it) }
                                if (post != null) notifDetailPost = post
                                else Toast.makeText(context, "이동 실패", Toast.LENGTH_SHORT).show()
                            }
                            "highlight_comment", "highlight_comment_reply" -> {
                                val hl = n.targetHighlightId?.let { notifVm.resolveHighlight(it) }
                                if (hl != null) notifDetailHighlight = hl
                                else Toast.makeText(context, "이동 실패", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                },
            )
        }

        // 실타래 설명 팝업 — 상단바 칩 탭 시.
        if (yarnInfoOpen) {
            com.lifestyle.dailyscript.ui.yarn.YarnInfoDialog(onDismiss = { yarnInfoOpen = false })
        }

        notifDetailPost?.let { post ->
            FeedPostDetailSheet(
                post = post,
                userId = session.userId,
                isAnonymous = session.isAnonymous,
                myNickname = session.nickname,
                onDismiss = { notifDetailPost = null },
                onOpenCard = { cardId ->
                    notifDetailPost = null
                    navController.navigate(Routes.detail(cardId))
                },
            )
        }
        notifDetailHighlight?.let { hl ->
            HighlightDetailSheet(
                highlight = hl,
                userId = session.userId,
                isAnonymous = session.isAnonymous,
                myNickname = session.nickname,
                onDismiss = { notifDetailHighlight = null },
                onOpenCard = { cardId ->
                    notifDetailHighlight = null
                    navController.navigate(Routes.detail(cardId))
                },
            )
        }

        CoachTourOverlay(coach)
        // 선호도(장르·주제) 온보딩 — 첫 접속/미선택 사용자에게 앱 진입 즉시 1회, 시작 탭(NOTICE)보다
        // 먼저 전 화면 위에 띄운다 (스플래시가 걷히면 바로 보임). 코치 투어는 prefSelected 후
        // 홈 첫 진입 때 시작 (PWA 순서: 선호도 → 투어). 덕분에 홈 첫 카드부터 선호가 반영된다.
        // initial=null(DataStore 방출 전)엔 띄우지 않아 완료 사용자에게 깜빡임이 없다.
        val prefSelected by AppPreferences.prefSelected.collectAsState(initial = null)
        if (prefSelected == false || forcePrefOverlay) {
            PreferenceOverlay(onFinish = { r ->
                sessionVm.savePreferences(r.genres, r.themes, r.any, r.skipped)
                forcePrefOverlay = false
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

/**
 * 하단 탭 전환. 상세 등 '탭이 아닌' 임시 화면이 탭 위에 쌓인 상태에서 하단 탭을 누르면, 표준 패턴의
 * popUpTo(start){saveState}가 그 임시 화면까지 떠나는 탭의 상태로 함께 저장하고 restoreState 가 즉시
 * 되살려 다시 그 화면으로 튕긴다(투데이=HOME 처럼 시작목적지가 아닌 탭에서 항상 재현). 그래서 표준
 * 전환 전에 위에 쌓인 비-탭 임시 화면들을 (저장 없이) 먼저 pop 해 떨궈낸다 → saveState 는 탭만 깨끗하게
 * 저장한다. 같은 탭을 다시 누르면(시작=HOME) [onReselect] 로 새로고침.
 *
 * 표준 하단탭 패턴 — 시작 목적지까지 popUpTo(saveState) + restoreState 로 떠나는 탭의 NavBackStackEntry
 * (=ViewModel)를 보존해 재진입 시 데이터를 다시 불러오지 않는다(각 VM 의 loaded 가드와 맞물림).
 */
private fun selectBottomTab(
    navController: NavHostController,
    currentRoute: String?,
    route: String,
    onReselect: () -> Unit,
) {
    while (
        navController.currentDestination?.route !in Routes.bottomTabs &&
        navController.previousBackStackEntry != null
    ) {
        if (!navController.popBackStack()) break
    }
    // pop 직후 실제 목적지(currentRoute Compose 상태는 이 프레임엔 아직 갱신 전일 수 있음).
    val liveRoute = navController.currentDestination?.route
    if (liveRoute != route) {
        AppAnalytics.track("nav", mapOf("from" to currentRoute, "to" to route))
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    } else if (route == Routes.HOME) {
        onReselect()
    }
}
