import SwiftUI

extension View {
    /// Docks `bar` as a solid bottom bar beneath a scrollable view — the one
    /// place to put any bottom-pinned input/action bar so the behavior stays
    /// consistent and this bug class doesn't recur.
    ///
    /// Implemented as a bounded `VStack` (the scroll and the bar as siblings),
    /// NOT `safeAreaInset`: in this app's nested `TabView` → `NavigationStack`
    /// hierarchy a `.safeAreaInset(edge: .bottom)` on the ScrollView positioned
    /// the bar but did not reliably push the scroll content, so content slid
    /// under it (iOS 26.x). Bounding the scroll by layout instead means its
    /// content can never float under the bar. The bar rides above the keyboard
    /// via standard keyboard avoidance (the focused field lifts the VStack).
    ///
    /// Apply it to the **ScrollView/List**. It:
    /// - paints a `paper` background + top hairline across the full width;
    /// - when `clearTabBar` is true, keeps a moderate gap above the tab bar —
    ///   enough to avoid accidental tab-bar taps when reaching for the bar, not a
    ///   full navbar-height void. Pass `false` while the tab bar is hidden (e.g.
    ///   keyboard up) so it sits flush in the safe area.
    ///
    /// When `isActive` is false no bar is shown.
    func dockedBottomBar<Bar: View>(
        isActive: Bool = true,
        clearTabBar: Bool = false,
        @ViewBuilder _ bar: () -> Bar
    ) -> some View {
        // Spacing-scale gap between the bar and the tab bar when docked.
        let tabBarGap: CGFloat = 16
        return VStack(spacing: 0) {
            self
            if isActive {
                VStack(spacing: 0) {
                    Hairline()
                    bar()
                }
                .frame(maxWidth: .infinity)
                // Pad for the gap, THEN paint paper — the whole docked band
                // (bar + gap) is opaque, and the scroll above it is layout-bounded.
                .padding(.bottom, clearTabBar ? tabBarGap : 0)
                .background(Color.paper)
                .animation(.easeInOut(duration: 0.2), value: clearTabBar)
            }
        }
    }
}
