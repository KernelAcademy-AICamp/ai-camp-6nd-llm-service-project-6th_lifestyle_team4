import SwiftUI

struct EditorialTabBar: View {
    @Binding var selection: Tab

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            HStack(spacing: 0) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    Button { selection = tab } label: {
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
        return VStack(spacing: 4) {
            Image(systemName: tab.iconName)
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(tint)
            Text(tab.title.uppercased())
                .font(.custom("Pretendard-Medium", size: 11))
                .tracking(11 * 0.2)
                .foregroundStyle(tint)
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
