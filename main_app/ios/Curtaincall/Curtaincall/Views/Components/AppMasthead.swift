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

    @State private var showYarnPurchase = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                BrandWordmark()
                Spacer()
                // 실타래 잔액 칩 — 모든 탭의 상단바에 표시 (PWA/Android 미러). 탭 → 충전 화면.
                YarnChip(balance: yarn.balance) { showYarnPurchase = true }
            }
            .padding(.horizontal, 20)
            .frame(height: 64)
            .background(Color.paper)
            Hairline()
        }
        .sheet(isPresented: $showYarnPurchase) { YarnPurchaseView() }
    }
}
