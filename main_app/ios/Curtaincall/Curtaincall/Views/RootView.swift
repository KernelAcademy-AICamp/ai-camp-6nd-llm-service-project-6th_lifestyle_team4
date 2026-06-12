import SwiftUI

enum Tab: Hashable, CaseIterable {
    case home, archive, feed, notice, settings

    var title: String {
        switch self {
        case .home: return "Home"
        case .archive: return "Library"
        case .feed: return "Feed"
        case .notice: return "Notice"
        case .settings: return "My"
        }
    }

    var iconName: String {
        switch self {
        case .home: return "house"
        case .archive: return "books.vertical"
        case .feed: return "rectangle.stack"
        case .notice: return "megaphone"
        case .settings: return "person.crop.circle"
        }
    }
}

struct RootView: View {
    @Binding var pendingCardId: Int?
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var selectedTab: Tab = .home
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()
    @State private var feedPath = NavigationPath()
    @State private var showArchivePrompt = false
    @State private var composerActive = false
    @State private var feedReselect = 0

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
        }
        .onChange(of: selectedTab) { _, newValue in
            if newValue == .archive && session.isAnonymous {
                selectedTab = .home
                showArchivePrompt = true
            }
        }
        .task {
            if let id = pendingCardId { await resolveAndPush(id: id) }
        }
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
            NavigationStack(path: $homePath) {
                HomeView(selectedTab: $selectedTab)
            }
            .tag(Tab.home)
            NavigationStack(path: $archivePath) {
                ArchiveView(selectedTab: $selectedTab, path: $archivePath)
            }
            .tag(Tab.archive)
            NavigationStack(path: $feedPath) {
                FeedView(selectedTab: $selectedTab, reselect: feedReselect)
            }
            .tag(Tab.feed)
            NavigationStack { NoticeView(selectedTab: $selectedTab) }
                .tag(Tab.notice)
            NavigationStack { MyPageView(selectedTab: $selectedTab) }
                .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        // Hide the tab bar while the comment composer is focused (keyboard up),
        // so the input can pin directly above the keyboard; restore on blur.
        .onPreferenceChange(ComposerFocusedPreferenceKey.self) { active in
            withAnimation(.easeInOut(duration: 0.2)) { composerActive = active }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !composerActive {
                EditorialTabBar(selection: $selectedTab, onReselect: popToRoot)
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

    /// Re-tapping the active tab pops that tab's navigation stack back to root.
    private func popToRoot(_ tab: Tab) {
        switch tab {
        case .home: homePath = NavigationPath()
        case .archive: archivePath = NavigationPath()
        case .feed:
            feedPath = NavigationPath()
            feedReselect += 1  // scroll Feed to top + refresh
        case .notice, .settings: break
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
