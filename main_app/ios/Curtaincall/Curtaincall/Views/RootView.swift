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

    @State private var selectedTab: Tab = .daily
    @State private var showAttendance = false
    @State private var attendanceRewarded = false
    @State private var attendanceChecked = false   // 앱 실행당 1회만 자동 체크
    @State private var dailyPath = NavigationPath()
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()
    @State private var feedPath = NavigationPath()
    @State private var showArchivePrompt = false
    @State private var composerActive = false
    @State private var feedReselect = 0
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
        // 출석체크 — 그날 첫 진입 1회 모달 + 첫 출석이면 실타래 +5. 온보딩 이후에 띄운다.
        .task { checkAttendance() }
        .onChange(of: session.ready) { _, _ in checkAttendance() }
        .onChange(of: prefs.prefSelected) { _, _ in checkAttendance() }
        .sheet(isPresented: $showAttendance) {
            AttendanceView(rewarded: attendanceRewarded)
        }
        .onChange(of: selectedTab) { _, newValue in
            if newValue == .archive && session.isAnonymous {
                selectedTab = .daily
                showArchivePrompt = true
            }
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
    }

    private var tabs: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $dailyPath) {
                DailyView(selectedTab: $selectedTab)
            }
            .tag(Tab.daily)
            NavigationStack(path: $feedPath) {
                FeedView(selectedTab: $selectedTab, reselect: feedReselect)
            }
            .tag(Tab.feed)
            NavigationStack(path: $homePath) {
                HomeView(selectedTab: $selectedTab)
            }
            .tag(Tab.home)
            NavigationStack(path: $archivePath) {
                ArchiveView(selectedTab: $selectedTab, path: $archivePath)
            }
            .tag(Tab.archive)
            NavigationStack { MyPageView(selectedTab: $selectedTab) }
                .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        // 카드 컨텍스트 메뉴(비회원 북마크 프롬프트)의 '로그인' → MY 탭으로.
        .environment(\.requestLogin) { selectedTab = .settings }
        // Hide the tab bar while the comment composer is focused (keyboard up),
        // so the input can pin directly above the keyboard; restore on blur.
        .onPreferenceChange(ComposerFocusedPreferenceKey.self) { active in
            withAnimation(.easeInOut(duration: 0.2)) { composerActive = active }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !composerActive {
                EditorialTabBar(selection: $selectedTab, noticeUnread: hasUnreadNotice, onReselect: popToRoot)
                    .transition(.move(edge: .bottom))
            }
        }
        .overlay {
            if showArchivePrompt {
                AccountRequiredPrompt(
                    title: "북마크 보관함은 회원 전용",
                    message: "보관한 명대사를 모아보려면 로그인이 필요해요."
                ) {
                    showArchivePrompt = false
                    selectedTab = .settings
                } onClose: {
                    showArchivePrompt = false
                }
            }
        }
    }

    /// 그날 첫 진입이면 출석 모달을 띄우고, 첫 출석이면 실타래 +5 지급.
    /// 세션 준비 + 온보딩 완료 후에만, 앱 실행당 1회 실행(`attendanceChecked`).
    private func checkAttendance() {
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
        case .home: homePath = NavigationPath()
        case .archive: archivePath = NavigationPath()
        case .feed:
            feedPath = NavigationPath()
            feedReselect += 1  // scroll Feed to top + refresh
        case .settings: break
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
