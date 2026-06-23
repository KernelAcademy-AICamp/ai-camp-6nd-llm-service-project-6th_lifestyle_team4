import SwiftUI

/// 상단바 실타래 잔액 칩 — Android `YarnChip` / PWA yarn chip 미러.
/// 작은 라운드 알약(sand 35%), 실타래 아이콘 + 잔액. v1 은 잔액 표시 전용(비활성) —
/// 충전(구매) 진입점을 막아 App Store 2.1/3.1.1 을 피한다(적립 전용).
struct YarnChip: View {
    let balance: Int
    /// nil 이면 비활성(잔액 표시 전용) — v1 은 충전(구매) 진입을 막으려 액션 없이 쓴다.
    var action: (() -> Void)? = nil

    private var chip: some View {
        HStack(spacing: 5) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 15, height: 15)
                .clipShape(Circle())
            Text("\(balance)")
                .font(.custom("Pretendard-Medium", size: 12))
                .foregroundStyle(.espresso)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.sand.opacity(0.35)))
    }

    var body: some View {
        if let action {
            Button(action: action) { chip }
                .buttonStyle(.plain)
                .accessibilityLabel("실타래 \(balance)개, 충전하기")
        } else {
            chip.accessibilityLabel("실타래 \(balance)개")
        }
    }
}
