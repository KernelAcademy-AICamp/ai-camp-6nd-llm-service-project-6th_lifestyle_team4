import SwiftUI

struct MyPageView: View {
    var body: some View {
        Text("My Page")
            .labelCaps()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.paperWhite)
    }
}

#Preview {
    MyPageView()
}
