import SwiftUI

struct SectionHeader: View {
    let title: String
    var actionTitle: String? = "전체 보기"
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            if let actionTitle, let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text(actionTitle)
                            .font(.metaSans(12))
                            .foregroundStyle(.walnut)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 11, weight: .light))
                            .foregroundStyle(.walnut)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 24)
    }
}

#Preview {
    VStack(spacing: 0) {
        SectionHeader(title: "짧지만 깊은 문장의 미학", action: {})
        SectionHeader(title: "곧 공개될 각본", actionTitle: nil)
    }
    .background(Color.paper)
}
