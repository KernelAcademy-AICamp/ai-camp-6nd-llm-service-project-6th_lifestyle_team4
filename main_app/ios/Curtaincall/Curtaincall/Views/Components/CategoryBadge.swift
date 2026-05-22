import SwiftUI

struct CategoryBadge: View {
    let code: String

    var body: some View {
        Text(code)
            .font(.uiSans(11, weight: .medium))
            .tracking(0.2)
            .foregroundStyle(.paper)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.black.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

#Preview {
    HStack(spacing: 8) {
        CategoryBadge(code: "C")
        CategoryBadge(code: "B")
        CategoryBadge(code: "K")
        CategoryBadge(code: "L")
    }
    .padding()
    .background(Color.sand)
}
