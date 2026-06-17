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

/// Daily-surface sections whose card sets can overlap (all draw from `allCards`).
/// Used to dedupe hero sources so a card shown in several sections morphs from
/// exactly ONE cell — otherwise duplicate `matchedTransitionSource` ids in one
/// namespace make the zoom pick the wrong source or fail to animate.
enum DailyHeroSection: Hashable {
    case newBooks, trending, oz, recent
}

private struct CardHeroOwnerKey: EnvironmentKey {
    static let defaultValue: [Int: DailyHeroSection]? = nil
}

extension EnvironmentValues {
    /// Per-card hero-source owner for the Daily surface (cardId → the one section
    /// allowed to morph it), or nil where dedup doesn't apply (Home, Reduce Motion).
    /// Injected by DailyView. A card absent from the map is owned by the Contextual
    /// cell (the interactive section DailyView can't predict).
    var cardHeroOwner: [Int: DailyHeroSection]? {
        get { self[CardHeroOwnerKey.self] }
        set { self[CardHeroOwnerKey.self] = newValue }
    }
}

private struct CardHeroSourceModifier: ViewModifier {
    let id: Int
    let dailyOwner: DailyHeroSection?
    @Environment(\.cardHeroNamespace) private var namespace
    @Environment(\.cardHeroOwner) private var owner

    /// Whether THIS cell is the single active source for `id`. With no owner map
    /// (e.g. Home), every cell is active. With a map, a predictable section's cell
    /// is active only if it owns the card; the Contextual cell (dailyOwner == nil)
    /// owns only cards no higher-priority section claimed.
    private var isActiveSource: Bool {
        guard let owner else { return true }
        if let dailyOwner { return owner[id] == dailyOwner }
        return owner[id] == nil
    }

    func body(content: Content) -> some View {
        if isActiveSource, let namespace {
            content.matchedTransitionSource(id: id, in: namespace)
        } else {
            content
        }
    }
}

extension View {
    /// Marks a card cell as the zoom-transition source. Pass `dailyOwner` on the
    /// Daily surface so a duplicated card morphs from exactly one cell; omit it on
    /// surfaces without overlap (Home) or for Daily's Contextual cell. No-op (plain
    /// push) when the surface injected no namespace (Reduce Motion).
    func cardHeroSource(_ id: Int, dailyOwner: DailyHeroSection? = nil) -> some View {
        modifier(CardHeroSourceModifier(id: id, dailyOwner: dailyOwner))
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
