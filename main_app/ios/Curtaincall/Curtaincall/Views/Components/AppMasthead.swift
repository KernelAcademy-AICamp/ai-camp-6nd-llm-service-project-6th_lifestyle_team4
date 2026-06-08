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
    /// When provided, shows the trailing "MY PAGE" link that jumps to the My
    /// tab. Omit it on the My tab itself.
    var onMyPage: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                BrandWordmark()
                Spacer()
                if let onMyPage {
                    Button(action: onMyPage) {
                        Text("MY PAGE")
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
    }
}
