import SwiftUI

/// Bottom-nav tabs, in PWA order: DAILY · FEED · TODAY(center) · LIBRARY · MY.
/// Notice is no longer a tab — it's reached from the Daily notice carousel and
/// the MyPage entry. `allCases` order drives the tab-bar layout.
enum Tab: Hashable, CaseIterable {
    case daily, feed, home, archive, settings

    /// The visually prominent center tab.
    var isCenter: Bool { self == .home }

    var title: String {
        switch self {
        case .daily: return "Daily"
        case .feed: return "Feed"
        case .home: return "Today"
        case .archive: return "Library"
        case .settings: return "My"
        }
    }

    var iconName: String {
        switch self {
        case .daily: return "safari"               // explore (PWA)
        case .feed: return "rectangle.stack"
        case .home: return "quote.bubble.fill"     // fallback only; center renders the daily-script (yarn) graphic
        case .archive: return "books.vertical"
        case .settings: return "person.crop.circle"
        }
    }
}

struct RootView: View {
    @Binding var pendingCardId: Int?
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @EnvironmentObject private var yarn: YarnStore
    @EnvironmentObject private var attendance: AttendanceStore
    @EnvironmentObject private var moderation: ModerationStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var selectedTab: Tab = .daily

    // Shake-for-a-random-명대사 (iOS-only delight).
    @State private var cardPool: [Card] = []
    @State private var randomCard: Card?
    @State private var shakeHaptic = 0
    @State private var lastShakeAt: Date?
    @State private var showAttendance = false
    // 로그인 유도(requestLogin) → MY 탭 이동 대신 루트에서 인증 모달(SignInSheet)을 직접 띄운다.
    // 사용자가 '로그인'을 눌렀으니 그 자리에서 로그인 UI 를 보여준다(MY 스크롤 헌트 제거).
    @State private var showLoginModal = false
    @State private var attendanceRewarded = false
    @State private var attendanceChecked = false   // 앱 실행당 1회만 자동 체크
    @State private var dailyPath = NavigationPath()
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()
    @State private var feedPath = NavigationPath()
    @State private var settingsPath = NavigationPath()
    @State private var composerActive = false
    /// 피드에서 카드/하이라이트 상세가 열렸는지 — true 면 글쓰기 고양이를 숨긴다.
    @State private var feedDetailPresented = false
    @State private var feedReselect = 0
    /// TODAY(center) 재탭 시 1씩 증가 → HomeView 가 새 명대사 새로고침(상단 버튼과 동일).
    @State private var homeReselect = 0
    /// Bumped to re-create FeedView (resetting its private `category` @State to the
    /// default `.today`) after a Card Detail "오늘의 한줄" post routes to Feed.
    @State private var feedResetToken = 0
    /// Bumped when the RootView-owned feed write bubble is tapped → FeedView handles it.
    @State private var feedWriteTrigger = 0
    @State private var latestNoticeId: Int?

    var body: some View {
        Group {
            if session.ready {
                tabs
            } else {
                // 런치 스크린(크림 + 워드마크)에서 그대로 이어지는 로딩 뷰 — 같은 크림 배경,
                // 같은 워드마크(중앙)에 은은한 펄스 + '불러오는 중…'. 흰 화면 없이 크림 연속.
                LaunchLoadingView()
            }
        }
        // First-run preference picker, once. Shown over everything as soon as the
        // session is ready; finishing saves the picks locally (UserDefaults) and
        // flips prefSelected so it never reappears.
        .overlay {
            if session.ready && !prefs.prefSelected {
                OnboardingView { genres, themes, any in
                    withAnimation(.easeInOut(duration: 0.25)) {
                        prefs.savePrefs(genres: genres, themes: themes, any: any)
                    }
                }
                .transition(.opacity)
            }
        }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
            Task { await moderation.refresh(userId: newValue) }   // 차단 목록 재로드
            yarn.sync(serverBalance: session.yarnBalance)   // 로그인/로그아웃 시 잔액 재시드
        }
        .task { await moderation.refresh(userId: session.userId) }   // 앱 진입 시 차단 목록
        // 출석체크 — 회원의 그날 첫 진입 1회 모달 + 첫 출석이면 실타래 +100. 온보딩 이후에 띄운다.
        .task { checkAttendance() }
        .onChange(of: session.ready) { _, _ in checkAttendance() }
        .onChange(of: prefs.prefSelected) { _, _ in checkAttendance() }
        .sheet(isPresented: $showAttendance) {
            AttendanceView(rewarded: attendanceRewarded)
        }
        // 로그인/회원가입 모달 — MY 의 그 모달(#97/#99 SignInSheet)을 루트에서 재사용.
        // requestLogin 을 부르는 모든 유도(북마크 프롬프트·새로고침 제한·피드 익명)가
        // 이 한 곳을 띄운다(모달 분기 없음). 인증 성공 시 SignInSheet 가 자동으로 닫힌다.
        .sheet(isPresented: $showLoginModal) { SignInSheet() }
        .task {
            if let id = pendingCardId { await resolveAndPush(id: id) }
        }
        .task { latestNoticeId = (try? await Supa.shared.fetchLatestNotice())?.noticeId }
        .onChange(of: pendingCardId) { _, newValue in
            if let id = newValue {
                Task { await resolveAndPush(id: id) }
            }
        }
        // 소셜 첫 가입 직후 1회: 성별·나이 입력 프롬프트(기존 프로필 편집기 재사용, 건너뛰기 가능).
        .sheet(isPresented: Binding(
            get: { session.needsProfileSetup },
            set: { if !$0 { session.consumeProfileSetup() } }
        )) {
            ProfileEditor(
                initialNickname: session.nickname,
                initialGender: session.gender,
                initialAge: session.ageGroup
            ) { name, g, a in
                Task { await session.updateProfile(name, gender: g, ageGroup: a) }
                session.consumeProfileSetup()
            } onCancel: {
                session.consumeProfileSetup()
            }
        }
        // Shake → random 명대사 peek. Load a pool once; pick on shake.
        .task {
            if cardPool.isEmpty {
                cardPool = (try? await Supa.shared.fetchCards()) ?? []
            }
        }
        .onShake { handleShake() }
        .sensoryFeedback(.impact(flexibility: .soft), trigger: shakeHaptic)
        .sheet(item: $randomCard) { card in
            RandomQuotePeek(card: card) {
                openRandomFull(card)
            } onClose: {
                randomCard = nil
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
    }

    /// A shake fires only when foregrounded and NOT already in a modal/detail flow,
    /// debounced so one physical shake can't trigger twice. Then: soft haptic +
    /// present a free random-quote peek.
    private func handleShake() {
        guard scenePhase == .active, session.ready, prefs.prefSelected else { return }
        // Not in a Root-owned peek/onboarding flow (the archive prompt + onboarding
        // are .overlay-based, so they aren't UIKit modals the check below sees)…
        guard randomCard == nil, !session.needsProfileSetup else { return }
        // …no UIKit modal anywhere — including child-view sheets RootView doesn't own
        // (Feed composer/picker, My Page profile/attendance, any .alert)…
        guard !ShakeGate.isPresentingModal() else { return }
        // …and not currently reading a detail screen on the active tab.
        guard activeTabPathIsEmpty else { return }
        // Debounce: ignore repeat motion events within 1.5s of the last shake.
        let now = Date()
        if let last = lastShakeAt, now.timeIntervalSince(last) < 1.5 { return }
        lastShakeAt = now
        guard let pick = cardPool.randomElement() else { return }
        shakeHaptic += 1
        randomCard = pick
    }

    /// Whether the active tab is at its root (i.e. not in a card-detail flow).
    private var activeTabPathIsEmpty: Bool {
        switch selectedTab {
        case .daily: return dailyPath.isEmpty
        case .home: return homePath.isEmpty
        case .archive: return archivePath.isEmpty
        case .feed: return feedPath.isEmpty
        case .settings: return true
        }
    }

    /// The active tab's nav stack is at its root — drives the decorative cat,
    /// which hides whenever a detail is pushed (Card Detail, the bookshelf from
    /// Settings). Unlike `activeTabPathIsEmpty`, this honors `settingsPath`.
    private var activeStackAtRoot: Bool {
        switch selectedTab {
        case .daily: return dailyPath.isEmpty
        case .home: return homePath.isEmpty
        case .archive: return archivePath.isEmpty
        case .feed: return feedPath.isEmpty
        case .settings: return settingsPath.isEmpty
        }
    }

    /// "전문 읽기" → open the full read through the NORMAL yarn gate. Routes via the
    /// Home stack (its `navigationDestination(for: Card.self)` builds CardDetailView,
    /// whose `runOpenFlow` runs the gate) — same path as a widget deep-link, so the
    /// economy is never bypassed. Dismiss the peek first so the push isn't swallowed.
    private func openRandomFull(_ card: Card) {
        randomCard = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            selectedTab = .home
            homePath.append(card)
        }
    }

    private var tabs: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $dailyPath) {
                DailyView(selectedTab: $selectedTab, path: $dailyPath)
            }
            .tag(Tab.daily)
            NavigationStack(path: $feedPath) {
                FeedView(selectedTab: $selectedTab, reselect: feedReselect, writeTrigger: feedWriteTrigger)
                    .id(feedResetToken)   // re-create → category resets to .today
            }
            .tag(Tab.feed)
            NavigationStack(path: $homePath) {
                HomeView(selectedTab: $selectedTab, reselect: homeReselect)
            }
            .tag(Tab.home)
            NavigationStack(path: $archivePath) {
                LibraryCatalogView(selectedTab: $selectedTab, path: $archivePath)
            }
            .tag(Tab.archive)
            NavigationStack(path: $settingsPath) {
                MyPageView(selectedTab: $selectedTab, path: $settingsPath)
            }
            .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        // 로그인 유도(컨텍스트 메뉴 북마크 프롬프트·3회 새로고침 제한·피드 익명 프롬프트 등)
        // → MY 탭 이동 대신 인증 모달(SignInSheet, #97/#99)을 그 자리에서 직접 띄운다.
        .environment(\.requestLogin) { showLoginModal = true }
        // 카드 상세 '서재로 가기' → LIBRARY 탭으로 (requestLogin 패턴 동일).
        .environment(\.requestLibrary) { selectedTab = .archive }
        // 카드 상세 '오늘의 한줄' 작성 후 → FEED 탭 + '나의 감상평'(today) 카테고리로.
        // FeedView가 category를 private @State로 가지므로 id를 바꿔 재생성해 기본
        // 카테고리(.today)로 리셋한다 — 새 한줄이 '하이라이트' 등 다른 탭에 가려 안 보이는
        // 문제 방지(Android는 라우팅 전에 today 카테고리로 전환).
        .environment(\.requestFeed) {
            selectedTab = .feed
            feedPath = NavigationPath()
            feedResetToken += 1
        }
        // Hide the tab bar while the comment composer is focused (keyboard up),
        // so the input can pin directly above the keyboard; restore on blur.
        .onPreferenceChange(ComposerFocusedPreferenceKey.self) { active in
            withAnimation(.easeInOut(duration: 0.2)) { composerActive = active }
        }
        // 피드에서 카드/하이라이트 상세가 푸시되면 글쓰기 고양이를 숨긴다 (상세 위로 새지
        // 않게 + 익명 글쓰기 모달이 상세 레이어 위에 못 뜨는 문제 제거). PWA 와 동일.
        .onPreferenceChange(FeedDetailPresentedPreferenceKey.self) { presented in
            feedDetailPresented = presented
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !composerActive {
                EditorialTabBar(
                    selection: $selectedTab,
                    noticeUnread: hasUnreadNotice,
                    // 고양이는 탭 루트에만 — 카드 상세 등 푸시된 읽기 화면(스택 비어있지
                    // 않음)에선 본문 위에 얹히므로 숨긴다(Android 상세엔 고양이 없음).
                    // 피드는 글쓰기 FAB 와 z-order/탭 충돌 → 탭바 고양이 대신
                    // 아래 overlay 의 FeedWriteCat(고양이+주황 연필 FAB)이 담당한다.
                    showCat: activeStackAtRoot && selectedTab != .feed,
                    onReselect: popToRoot
                )
                .transition(.move(edge: .bottom))
                // 키보드가 올라와도 탭바·고양이는 바닥에 고정 — 키보드가 덮도록.
                // (기본 동작은 safeAreaInset 콘텐츠가 키보드 위로 떠올라 고양이가
                // 키보드 위에 앉는 버그. 본문 텍스트필드 회피는 그대로 유지된다.)
                .ignoresSafeArea(.keyboard, edges: .bottom)
            }
        }
        // 피드 글쓰기 FAB+고양이 — 탭바 '위(앞)' 레이어라 고양이가 탭바에 앉고
        // 주황 연필 버튼이 머리 위에 뜬다(PWA). 피드 루트에서만, 컴포저 활성 시 숨김.
        .overlay(alignment: .bottomTrailing) {
            if selectedTab == .feed && feedPath.isEmpty && !feedDetailPresented && !composerActive {
                FeedWriteCat { feedWriteTrigger += 1 }
                    .padding(.trailing, -4)    // LIBRARY~MY 사이로 (가로)
                    .padding(.bottom, 54)      // 책 아랫면이 탭바 윗면에 앉도록 (세로) — 조정 가능
            }
        }
    }

    /// 그날 첫 진입이면 출석 모달을 띄우고, 첫 출석이면 실타래 +100 지급.
    /// 세션 준비 + 온보딩 완료 후에만, 앱 실행당 1회 실행(`attendanceChecked`).
    private func checkAttendance() {
        // PWA: `if (state.isAnonymous || !state.userId) return` — 회원만 출석/지급.
        // (익명은 grant_yarn 이 RLS 로 실패하므로 모달·지급 자체를 건너뛴다.)
        guard !session.isAnonymous, session.userId != nil else { return }
        guard session.ready, prefs.prefSelected, !attendanceChecked else { return }
        attendanceChecked = true
        guard attendance.shouldAutoShowToday() else { return }
        attendance.markAutoShown()
        let isNew = attendance.registerToday()
        attendanceRewarded = isNew
        if isNew { Task { await yarn.grant(AttendanceStore.reward) } }
        showAttendance = true
    }

    /// Unread notice → dot on the MY tab (Notice is no longer its own tab).
    private var hasUnreadNotice: Bool {
        guard let latestNoticeId else { return false }
        return latestNoticeId > prefs.noticeLastSeenId
    }

    /// Re-tapping the active tab pops that tab's navigation stack back to root.
    private func popToRoot(_ tab: Tab) {
        switch tab {
        case .daily: dailyPath = NavigationPath()
        case .home:
            homePath = NavigationPath()
            homeReselect += 1   // 새 명대사 새로고침 (상단 새로고침 버튼과 동일 동작)
        case .archive: archivePath = NavigationPath()
        case .feed:
            feedPath = NavigationPath()
            feedReselect += 1  // scroll Feed to top + refresh
        case .settings:
            // MY 하위 페이지는 모두 값 기반(MyRoute)이라 스택을 비우면 루트로 돌아온다.
            settingsPath = NavigationPath()
        }
    }

    /// Looks up the card by id and pushes it onto the Home stack.
    /// Silent on errors/missing card — a widget tap should never crash the app.
    private func resolveAndPush(id: Int) async {
        defer { pendingCardId = nil }
        do {
            guard let card = try await Supa.shared.fetchCard(id: id) else { return }
            selectedTab = .home
            homePath.append(card)
        } catch {
            // graceful fallback: stay where we are
        }
    }
}

/// 런치 스크린(정적 크림 + 워드마크)에서 그대로 이어지는 로딩 뷰. 같은 크림 배경 +
/// 같은 워드마크 처치(NanumMyeongjo + 코랄 악센트 점, 런치 이미지와 동일 크기 40)에
/// 은은한 opacity 펄스 + '불러오는 중…'. 런치 스크린은 정적이고, 모션은 여기서만.
private struct LaunchLoadingView: View {
    @State private var pulse = false

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            // 워드마크 — AppMasthead BrandWordmark 와 동일 처치(크기만 런치에 맞춰 40).
            (Text("Daily Script ").foregroundColor(.espresso) + Text(".").foregroundColor(.cta))
                .font(.displaySerif(40))
                .tracking(0.4)
                .opacity(pulse ? 0.55 : 1)
            Text("불러오는 중…")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
                .opacity(pulse ? 0.4 : 0.85)
                .offset(y: 56)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}
