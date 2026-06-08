import SwiftUI

extension View {
    /// Docks `bar` as a solid bottom bar over a scrollable view — the one place
    /// to put any bottom-pinned input/action bar so the safe-area + keyboard +
    /// scroll-inset behavior stays consistent and this bug class doesn't recur.
    ///
    /// Apply it to the **ScrollView/List** (not an outer container) so the inset
    /// reliably reaches the scroll content. It:
    /// - paints a `paper` background + top hairline across the full width — and
    ///   crucially the background covers the tab-bar-clearance region too, so no
    ///   scrolling content ever shows through under the bar;
    /// - insets the scroll content by the bar's measured height (it's a
    ///   `safeAreaInset`), and rides above the keyboard automatically;
    /// - when `clearTabBar` is true, keeps a moderate gap above the tab bar —
    ///   enough to avoid accidental tab-bar taps when reaching for the bar, not a
    ///   full navbar-height void. Pass `false` while the tab bar is hidden (e.g.
    ///   keyboard up) so it drops into the safe area.
    ///
    /// When `isActive` is false no bar is shown and no inset is reserved.
    func dockedBottomBar<Bar: View>(
        isActive: Bool = true,
        clearTabBar: Bool = false,
        @ViewBuilder _ bar: () -> Bar
    ) -> some View {
        // Spacing-scale gap between the bar and the tab bar when docked.
        let tabBarGap: CGFloat = 16
        return safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                VStack(spacing: 0) {
                    Hairline()
                    bar()
                }
                .frame(maxWidth: .infinity)
                // Pad for the gap, THEN paint paper — so the whole docked band
                // (bar + gap) is opaque and nothing shows through under it.
                .padding(.bottom, clearTabBar ? tabBarGap : 0)
                .background(Color.paper)
                .animation(.easeInOut(duration: 0.2), value: clearTabBar)
            }
        }
    }
}
