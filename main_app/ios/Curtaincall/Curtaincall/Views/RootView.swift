import SwiftUI

enum Tab: Hashable, CaseIterable {
    case home, archive, settings

    var title: String {
        switch self {
        case .home: return "Home"
        case .archive: return "Archive"
        case .settings: return "Settings"
        }
    }

    var iconName: String {
        switch self {
        case .home: return "house"
        case .archive: return "clock.arrow.circlepath"
        case .settings: return "gearshape"
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
                ArchiveView()
            }
            .tag(Tab.archive)
            NavigationStack { MyPageView() }
                .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            EditorialTabBar(selection: $selectedTab)
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
