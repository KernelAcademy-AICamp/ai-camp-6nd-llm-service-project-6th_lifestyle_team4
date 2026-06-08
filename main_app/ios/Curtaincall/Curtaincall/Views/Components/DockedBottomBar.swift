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
    /// - when `clearTabBar` is true, lifts the bar by the app tab bar's height so
    ///   it docks flush above it (no overlap, no floating gap). Pass `false` while
    ///   the tab bar is hidden (e.g. keyboard up) so it drops into the safe area.
    ///
    /// When `isActive` is false no bar is shown and no inset is reserved.
    func dockedBottomBar<Bar: View>(
        isActive: Bool = true,
        clearTabBar: Bool = false,
        @ViewBuilder _ bar: () -> Bar
    ) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                VStack(spacing: 0) {
                    Hairline()
                    bar()
                }
                .frame(maxWidth: .infinity)
                // Pad for the tab bar, THEN paint paper — so the whole docked
                // band (bar + clearance) is opaque and nothing shows under it.
                .padding(.bottom, clearTabBar ? EditorialTabBar.barHeight : 0)
                .background(Color.paper)
                .animation(.easeInOut(duration: 0.2), value: clearTabBar)
            }
        }
    }
}
