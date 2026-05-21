import SwiftUI

struct Chip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .regular))
            .tracking(0.3)
            .foregroundStyle(.inkBlack)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.surfaceMuted)
    }
}

#Preview {
    HStack(spacing: 8) {
        Chip(text: "드라마")
        Chip(text: "로맨스")
        Chip(text: "비극")
    }
    .padding()
}
