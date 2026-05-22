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
    @State private var selectedTab: Tab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { HomeView(selectedTab: $selectedTab) }
                .tag(Tab.home)
            NavigationStack { ArchiveView() }
                .tag(Tab.archive)
            NavigationStack { MyPageView() }
                .tag(Tab.settings)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            EditorialTabBar(selection: $selectedTab)
        }
    }
}

#Preview {
    RootView()
}
