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
    @Environment(\.scenePhase) private var scenePhase

    @State private var selectedTab: Tab = .daily

    // Shake-for-a-random-명대사 (iOS-only delight).
    @State private var cardPool: [Card] = []
    @State private var randomCard: Card?
    @State private var shakeHaptic = 0
    @State private var lastShakeAt: Date?
    @State private var showAttendance = false
    @State private var attendanceRewarded = false
    @State private var attendanceChecked = false   // 앱 실행당 1회만 자동 체크
    @State private var dailyPath = NavigationPath()
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()
    @State private var feedPath = NavigationPath()
    @State private var settingsPath = NavigationPath()
    @State private var composerActive = false
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
                ZStack {
                    Color.paper.ignoresSafeArea()
                    Text("Loading⋯")
                        .font(.bodySans(15))
                        .foregroundStyle(.walnut)
                }
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
            yarn.sync(serverBalance: session.yarnBalance)   // 로그인/로그아웃 시 잔액 재시드
        }
        // 출석체크 — 회원의 그날 첫 진입 1회 모달 + 첫 출석이면 실타래 +100. 온보딩 이후에 띄운다.
        .task { checkAttendance() }
        .onChange(of: session.ready) { _, _ in checkAttendance() }
        .onChange(of: prefs.prefSelected) { _, _ in checkAttendance() }
        .sheet(isPresented: $showAttendance) {
            AttendanceView(rewarded: attendanceRewarded)
        }
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
                DailyView(selectedTab: $selectedTab)
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
        // 카드 컨텍스트 메뉴(비회원 북마크 프롬프트)의 '로그인' → MY 탭으로.
        .environment(\.requestLogin) { selectedTab = .settings }
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
            }
        }
        // 피드 글쓰기 FAB+고양이 — 탭바 '위(앞)' 레이어라 고양이가 탭바에 앉고
        // 주황 연필 버튼이 머리 위에 뜬다(PWA). 피드 루트에서만, 컴포저 활성 시 숨김.
        .overlay(alignment: .bottomTrailing) {
            if selectedTab == .feed && feedPath.isEmpty && !composerActive {
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
