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

/// 탭 본문 콘텐츠 로딩 표시 — 시스템 스피너 대신 앱의 조용한 문예 톤에 맞춘 은은한
/// '불러오는 중…' opacity 펄스. (런치/부트스트랩은 LaunchLoadingView 가 워드마크로
/// 처리하고, 이건 이미 마스트헤드가 보이는 탭 본문용 — 워드마크 중복을 피한다.)
struct QuietLoadingLabel: View {
    @State private var pulse = false

    var body: some View {
        Text("불러오는 중…")
            .font(.bodySans(14))
            .foregroundStyle(.walnut)
            .opacity(pulse ? 0.45 : 0.9)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
    }
}
