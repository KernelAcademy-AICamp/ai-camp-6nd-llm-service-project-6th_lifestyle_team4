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
    var showsYarnChip = true

    @EnvironmentObject private var yarn: YarnStore
    // 트레일링 액션(북마크·공지 종)은 RootView 가 탭별로 주입한다(Android: Daily/Feed/Today/
    // Library 의 HomeTopBar 에만 표시, MY 는 별도 SettingsTopBar). 기본 false → MY 엔 안 뜸.
    @Environment(\.mastheadShowsActions) private var showsActions
    @Environment(\.mastheadNotifUnread) private var notifUnread
    @Environment(\.requestBookmarks) private var requestBookmarks
    @Environment(\.requestNotice) private var requestNotice

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                BrandWordmark()
                Spacer()
                // 실타래 잔액 칩 — 잔액 표시 전용(비활성). v1 은 충전(구매) 진입점을 막아
                // App Store 2.1/3.1.1 을 피한다(적립 전용). 탭해도 충전 화면으로 가지 않는다.
                if showsYarnChip {
                    YarnChip(balance: yarn.balance)
                }
                if showsActions {
                    // 북마크(→ 서가) 먼저, 그다음 공지 종(→ 공지, 미읽음 점). Android HomeTopBar 트레일링 미러.
                    mastheadIconButton(systemName: "bookmark", label: "북마크", action: requestBookmarks)
                    mastheadIconButton(systemName: "bell", label: notifUnread ? "공지, 새 소식 있음" : "공지", action: requestNotice)
                        .overlay(alignment: .topTrailing) {
                            if notifUnread {
                                Circle().fill(Color.cta).frame(width: 7, height: 7).offset(x: -6, y: 9)
                            }
                        }
                }
            }
            .padding(.horizontal, 20)
            .frame(height: 64)
            .background(Color.paper)
            Hairline()
        }
    }

    private func mastheadIconButton(systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(.espresso)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Masthead trailing-action environment (injected per-tab by RootView)

private struct MastheadShowsActionsKey: EnvironmentKey { static let defaultValue = false }
private struct MastheadNotifUnreadKey: EnvironmentKey { static let defaultValue = false }
private struct RequestBookmarksKey: EnvironmentKey { static let defaultValue: () -> Void = {} }
private struct RequestNoticeKey: EnvironmentKey { static let defaultValue: () -> Void = {} }

extension EnvironmentValues {
    /// True on the 4 home tabs (Daily/Feed/Today/Library) → shows bookmark + bell. MY leaves it false.
    var mastheadShowsActions: Bool {
        get { self[MastheadShowsActionsKey.self] }
        set { self[MastheadShowsActionsKey.self] = newValue }
    }
    var mastheadNotifUnread: Bool {
        get { self[MastheadNotifUnreadKey.self] }
        set { self[MastheadNotifUnreadKey.self] = newValue }
    }
    var requestBookmarks: () -> Void {
        get { self[RequestBookmarksKey.self] }
        set { self[RequestBookmarksKey.self] = newValue }
    }
    var requestNotice: () -> Void {
        get { self[RequestNoticeKey.self] }
        set { self[RequestNoticeKey.self] = newValue }
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
