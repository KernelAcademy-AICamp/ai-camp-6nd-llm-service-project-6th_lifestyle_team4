import SwiftUI

struct Chip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.uiSans(11))
            .tracking(0.2)
            .foregroundStyle(.walnut)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.latte)
    }
}

#Preview {
    HStack(spacing: 8) {
        Chip(text: "드라마")
        Chip(text: "로맨스")
        Chip(text: "비극")
    }
    .padding()
    .background(Color.paper)
}
