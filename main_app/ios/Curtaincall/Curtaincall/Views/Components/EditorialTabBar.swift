import SwiftUI

struct EditorialTabBar: View {
    @Binding var selection: Tab
    /// Unread-notice dot on the MY tab (Notice is no longer its own tab).
    var noticeUnread: Bool = false
    /// Called when an already-selected tab is tapped again (e.g. to pop its
    /// navigation stack back to root).
    var onReselect: ((Tab) -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            HStack(spacing: 0) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    Button {
                        if selection == tab { onReselect?(tab) } else { selection = tab }
                    } label: {
                        tabItem(tab: tab, active: tab == selection)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(height: 64)
        }
        .background(Color.paper)
    }

    @ViewBuilder
    private func tabItem(tab: Tab, active: Bool) -> some View {
        if tab.isCenter {
            centerItem(tab: tab, active: active)
        } else {
            standardItem(tab: tab, active: active)
        }
    }

    private func standardItem(tab: Tab, active: Bool) -> some View {
        let tint: Color = active ? .espresso : .walnut
        return VStack(spacing: 4) {
            Image(systemName: tab.iconName)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(tint)
                .overlay(alignment: .topTrailing) {
                    if tab == .settings && noticeUnread {
                        Circle()
                            .fill(Color.cta)
                            .frame(width: 6, height: 6)
                            .offset(x: 5, y: -2)
                    }
                }
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 10))
                .tracking(1.6)
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Circle()
                .fill(active ? Color.cta : Color.clear)
                .frame(width: 4, height: 4)
        }
    }

    /// Prominent center tab (TODAY) — a raised filled medallion. The yarn-ball
    /// graphic replaces the SF Symbol in a later PR.
    private func centerItem(tab: Tab, active: Bool) -> some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(active ? Color.espresso : Color.roast)
                    .frame(width: 44, height: 44)
                    .shadow(color: Color.black.opacity(0.18), radius: 4, x: 0, y: 2)
                Image(systemName: tab.iconName)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Color.paper)
            }
            .offset(y: -6)
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 10))
                .tracking(1.6)
                .foregroundStyle(active ? .espresso : .walnut)
                .lineLimit(1)
                .offset(y: -4)
        }
    }
}

#Preview {
    @Previewable @State var sel: Tab = .daily
    return EditorialTabBar(selection: $sel, noticeUnread: true)
}
