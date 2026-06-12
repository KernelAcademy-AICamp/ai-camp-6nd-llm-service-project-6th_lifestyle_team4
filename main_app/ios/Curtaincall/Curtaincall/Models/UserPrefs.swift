import Foundation

/// Onboarding preferences chosen on first launch. Mirrors Android `UserPrefs`
/// and the PWA's `ds.pref`.
///  - `genres`: works.format values ("novel","play","essay","opera","prose").
///  - `themes`: the 10 `CardTheme` category names — must match the classifier's
///    category strings exactly so a saved theme actually weights cards.
///  - `any`: "상관없음" — recommend broadly across all themes.
///
/// Stored locally (UserDefaults) for now. 이창훈 said `users.pref_*` columns are
/// planned ("DB칼럼으로 쓸겁니다") but may not be live yet, so the DB write is
/// deliberately omitted until those columns are confirmed deployed.
struct UserPrefs: Equatable, Sendable {
    var genres: [String]
    var themes: [String]
    var any: Bool

    init(genres: [String] = [], themes: [String] = [], any: Bool = false) {
        self.genres = genres
        self.themes = themes
        self.any = any
    }

    /// Whether these prefs actually narrow recommendations (Android `hasActive`).
    var hasActive: Bool { !genres.isEmpty || (!any && !themes.isEmpty) }
}
