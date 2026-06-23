import SwiftUI

/// The brand wordmark — "Daily Script ." with a Cta-colored accent period,
/// mirroring the Android `BrandWordmark`. One source of truth so every tab's
/// masthead reads identically.
struct BrandWordmark: View {
    var body: some View {
        (
            Text("Daily Script ").foregroundColor(.espresso)
            + Text(".").foregroundColor(.cta)
        )
        .font(.headlineSerif(22))
        .tracking(0.4)
    }
}

/// The single masthead used by every tab (Home/Library/Feed/Notice/My) so
/// switching tabs never moves the wordmark. Leading brand wordmark + 실타래 chip,
/// fixed 64pt bar on paper with a hairline beneath — matching the Android shared
/// `TopBar`. (No trailing MY PAGE/로그인 link — Android has none there; My Page is
/// reached via the bottom-nav MY tab.)
struct AppMasthead: View {
    @EnvironmentObject private var yarn: YarnStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                BrandWordmark()
                Spacer()
                // 실타래 잔액 칩 — 잔액 표시 전용(비활성). v1 은 충전(구매) 진입점을 막아
                // App Store 2.1/3.1.1 을 피한다(적립 전용). 탭해도 충전 화면으로 가지 않는다.
                YarnChip(balance: yarn.balance)
            }
            .padding(.horizontal, 20)
            .frame(height: 64)
            .background(Color.paper)
            Hairline()
        }
    }
}
