import SwiftUI

struct EditorialTabBar: View {
    @Binding var selection: Tab
    /// Called when an already-selected tab is tapped again (e.g. to pop its
    /// navigation stack back to root).
    var onReselect: ((Tab) -> Void)? = nil

    /// Content height of the bar (hairline + row), used by sibling bottom-pinned
    /// views (e.g. the comment composer) to clear it when it's visible.
    static let barHeight: CGFloat = 65

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

    private func tabItem(tab: Tab, active: Bool) -> some View {
        let tint: Color = active ? .espresso : .walnut
        let labelSize: CGFloat = Tab.allCases.count >= 5 ? 10 : 11
        let iconSize: CGFloat = Tab.allCases.count >= 5 ? 19 : 20
        return VStack(spacing: 4) {
            Image(systemName: tab.iconName)
                .font(.system(size: iconSize, weight: .regular))
                .foregroundStyle(tint)
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: labelSize))
                .tracking(labelSize * 0.16)
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Circle()
                .fill(active ? Color.cta : Color.clear)
                .frame(width: 4, height: 4)
        }
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return EditorialTabBar(selection: $sel)
}
