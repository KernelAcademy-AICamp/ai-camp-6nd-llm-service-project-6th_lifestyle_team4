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
    @State private var selectedTab: Tab = .home
    @State private var homePath = NavigationPath()
    @State private var archivePath = NavigationPath()

    var body: some View {
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
        .task {
            if let id = pendingCardId {
                await resolveAndPush(id: id)
            }
        }
        .onChange(of: pendingCardId) { _, newValue in
            if let id = newValue {
                Task { await resolveAndPush(id: id) }
            }
        }
    }

    /// Looks up the card by id and pushes it onto the Home stack.
    /// Silent on errors/missing card — widget tap should never crash the app.
    private func resolveAndPush(id: Int) async {
        defer { pendingCardId = nil }
        do {
            let cards = try await SupabaseClient.shared.fetchCards()
            guard let card = cards.first(where: { $0.cardId == id }) else { return }
            selectedTab = .home
            homePath.append(card)
        } catch {
            // graceful fallback: stay where we are
        }
    }
}

#Preview {
    @Previewable @State var pending: Int? = nil
    RootView(pendingCardId: $pending)
}
