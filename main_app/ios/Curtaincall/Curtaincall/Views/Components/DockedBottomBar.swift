import SwiftUI

extension View {
    /// Docks `bar` as a solid bottom bar over a scrollable view — the one place
    /// to put any bottom-pinned input/action bar so the safe-area + keyboard +
    /// scroll-inset behavior stays consistent and this bug class doesn't recur.
    ///
    /// Apply it to the **ScrollView/List** (not an outer container) so the inset
    /// reliably reaches the scroll content. It:
    /// - paints a `paper` background + top hairline across the full width, so
    ///   scrolling content never shows through or hides behind the bar;
    /// - insets the scroll content by the bar's measured height (it's a
    ///   `safeAreaInset`), and rides above the keyboard automatically;
    /// - when `clearTabBar` is true, lifts the bar by the app tab bar's height so
    ///   it sits flush above it (no overlap, no floating gap). Pass `false` while
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
                bar()
                    .frame(maxWidth: .infinity)
                    .background(Color.paper)
                    .overlay(alignment: .top) { Hairline() }
                    .padding(.bottom, clearTabBar ? EditorialTabBar.barHeight : 0)
                    .animation(.easeInOut(duration: 0.2), value: clearTabBar)
            }
        }
    }
}
