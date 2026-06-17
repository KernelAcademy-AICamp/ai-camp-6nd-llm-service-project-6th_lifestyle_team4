import SwiftUI

/// Hero "zoom" morph from a card cell into CardDetail (iOS-only delight, presentation
/// only — navigation logic and the yarn gate are untouched).
///
/// Uses the native zoom navigation transition (`matchedTransitionSource` +
/// `.navigationTransition(.zoom:)`), iOS 18+. The app's min deployment target is
/// 26.2, so the API is unconditionally available — no `#available` gate is needed.
///
/// Reduce Motion: each surface injects a `nil` namespace when Reduce Motion is on, so
/// every `cardHeroSource` no-ops and the destination falls back to a plain push.
///
/// Namespace plumbing: the source lives in cells (often in child views like
/// DailyDiscovery), so it reads the surface's namespace from the environment —
/// descendants inherit it without per-cell threading. The destination is always in
/// the same view that owns the `@Namespace`, so it takes the namespace explicitly.
private struct CardHeroNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    /// The active card-surface zoom namespace, or nil to disable the morph (Reduce
    /// Motion, or surfaces that don't opt in). Injected at each surface's root.
    var cardHeroNamespace: Namespace.ID? {
        get { self[CardHeroNamespaceKey.self] }
        set { self[CardHeroNamespaceKey.self] = newValue }
    }
}

private struct CardHeroSourceModifier: ViewModifier {
    let id: Int
    @Environment(\.cardHeroNamespace) private var namespace

    func body(content: Content) -> some View {
        if let namespace {
            content.matchedTransitionSource(id: id, in: namespace)
        } else {
            content
        }
    }
}

extension View {
    /// Marks a card cell as the zoom-transition source. No-op (plain push) when the
    /// surface hasn't injected a namespace, i.e. Reduce Motion is on.
    func cardHeroSource(_ id: Int) -> some View {
        modifier(CardHeroSourceModifier(id: id))
    }

    /// Applies the zoom navigation transition to a pushed CardDetail. Pass the
    /// surface's `@Namespace` and whether the morph is enabled (`!reduceMotion`).
    /// When disabled, returns the view unchanged → standard push.
    @ViewBuilder
    func cardHeroDestination(_ id: Int, in namespace: Namespace.ID, enabled: Bool) -> some View {
        if enabled {
            navigationTransition(.zoom(sourceID: id, in: namespace))
        } else {
            self
        }
    }
}
