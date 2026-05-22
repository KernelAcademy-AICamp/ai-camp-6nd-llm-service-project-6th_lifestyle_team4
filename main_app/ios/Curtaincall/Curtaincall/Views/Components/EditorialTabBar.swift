import SwiftUI

struct EditorialTabBar: View {
    @Binding var selection: Tab

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            HStack(spacing: 0) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    Button {
                        selection = tab
                    } label: {
                        Text(tab.title)
                            .labelCaps(color: tab == selection ? .espresso : .walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .background(Color.paper)
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return EditorialTabBar(selection: $sel)
}
