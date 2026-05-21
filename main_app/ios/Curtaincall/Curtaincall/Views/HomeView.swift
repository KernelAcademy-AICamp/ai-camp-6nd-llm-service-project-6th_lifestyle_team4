import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab

    var body: some View {
        Text("Home")
            .labelCaps()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.paperWhite)
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return HomeView(selectedTab: $sel)
}
