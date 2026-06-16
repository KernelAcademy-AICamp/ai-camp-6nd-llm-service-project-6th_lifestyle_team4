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
/// switching tabs never moves the wordmark. Leading brand wordmark, optional
/// trailing "MY PAGE" link, fixed 64pt bar on paper with a hairline beneath —
/// matching the Android shared `TopBar`.
struct AppMasthead: View {
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var yarn: YarnStore

    /// When provided, shows the auth-aware trailing link that jumps to the My
    /// tab: "로그인" when signed out, "MY PAGE" when signed in. Omit it on the My
    /// tab itself.
    var onMyPage: (() -> Void)? = nil

    @State private var showYarnPurchase = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                BrandWordmark()
                Spacer()
                // 실타래 잔액 칩 — 모든 탭의 상단바에 표시 (PWA/Android 미러). 탭 → 충전 화면.
                YarnChip(balance: yarn.balance) { showYarnPurchase = true }
                if let onMyPage {
                    Button(action: onMyPage) {
                        Text(session.isAnonymous ? "로그인" : "MY PAGE")
                            .labelCaps()
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .frame(height: 64)
            .background(Color.paper)
            Hairline()
        }
        .sheet(isPresented: $showYarnPurchase) { YarnPurchaseView() }
    }
}
