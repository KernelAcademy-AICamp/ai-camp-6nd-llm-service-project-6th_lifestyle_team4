import SwiftUI

struct FetchErrorBanner: View {
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("데이터를 불러오지 못했습니다. 다시 시도해주세요.")
                .font(.bodySans(13))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 12)
            Button(action: onRetry) {
                Text("다시 시도")
                    .labelCaps(color: .espresso)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .overlay(
                        Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.latte)
    }
}

#Preview {
    VStack(spacing: 0) {
        FetchErrorBanner(onRetry: {})
        Spacer()
    }
    .background(Color.paper)
}
