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

    @State private var selectedTab: Tab = .home
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()
    @State private var feedPath = NavigationPath()
    @State private var showArchivePrompt = false

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
    }

    private var tabs: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $homePath) {
                HomeView(selectedTab: $selectedTab)
            }
            .tag(Tab.home)
            NavigationStack(path: $archivePath) {
                ArchiveView(selectedTab: $selectedTab)
            }
            .tag(Tab.archive)
            NavigationStack(path: $feedPath) {
                FeedView(selectedTab: $selectedTab)
            }
            .tag(Tab.feed)
            NavigationStack { NoticeView() }
                .tag(Tab.notice)
            NavigationStack { MyPageView(selectedTab: $selectedTab) }
                .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            EditorialTabBar(selection: $selectedTab)
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
