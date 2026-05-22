import SwiftUI

struct Chip: View {
    let text: String
    var filled: Bool = false

    var body: some View {
        Text(text.uppercased())
            .font(.custom("Pretendard-Medium", size: 11))
            .tracking(11 * 0.2)
            .foregroundStyle(filled ? Color.paper : .walnut)
            .frame(minWidth: 44, minHeight: 22)
            .padding(.horizontal, 10)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(filled ? Color.espresso : Color.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(filled ? Color.espresso : Color.latte, lineWidth: 1)
            )
    }
}

#Preview {
    HStack(spacing: 8) {
        Chip(text: "movie", filled: true)
        Chip(text: "first love", filled: false)
    }
    .padding()
    .background(Color.paper)
}
