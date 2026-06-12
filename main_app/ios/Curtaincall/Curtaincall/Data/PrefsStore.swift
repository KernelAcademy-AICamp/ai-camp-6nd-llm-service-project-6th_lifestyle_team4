import Foundation
import Combine

/// User preferences mirrored from the PWA's localStorage flags.
/// Observable so toggling dark mode flips the app theme live.
@MainActor
final class PrefsStore: ObservableObject {

    private let d = UserDefaults.standard
    private enum Key {
        static let push = "ds.push"
        static let taste = "ds.taste"
        static let dark = "ds.dark"
        static let recent = "ds.recent"
        // Onboarding preferences (PWA ds.prefSelected / ds.pref.*).
        static let prefSelected = "ds.prefSelected"
        static let prefGenres = "ds.prefGenres"
        static let prefThemes = "ds.prefThemes"
        static let prefAny = "ds.prefAny"
    }

    @Published var pushEnabled: Bool { didSet { d.set(pushEnabled, forKey: Key.push) } }
    @Published var tasteEnabled: Bool { didSet { d.set(tasteEnabled, forKey: Key.taste) } }
    @Published var darkTheme: Bool { didSet { d.set(darkTheme, forKey: Key.dark) } }

    /// First-run onboarding completed (or skipped). False → show the picker once.
    /// @Published so finishing onboarding dismisses the overlay live.
    @Published var prefSelected: Bool { didSet { d.set(prefSelected, forKey: Key.prefSelected) } }

    init() {
        pushEnabled = d.object(forKey: Key.push) as? Bool ?? true
        tasteEnabled = d.bool(forKey: Key.taste)
        darkTheme = d.bool(forKey: Key.dark)
        prefSelected = d.bool(forKey: Key.prefSelected)
    }

    /// The saved onboarding picks (empty when not yet chosen).
    var userPrefs: UserPrefs {
        UserPrefs(
            genres: d.stringArray(forKey: Key.prefGenres) ?? [],
            themes: d.stringArray(forKey: Key.prefThemes) ?? [],
            any: d.bool(forKey: Key.prefAny)
        )
    }

    /// Persist the onboarding picks locally and mark onboarding done. No
    /// `users.pref_*` DB write yet — those columns aren't confirmed live (이창훈);
    /// DB sync is a follow-up once they're deployed.
    func savePrefs(genres: [String], themes: [String], any: Bool) {
        d.set(genres, forKey: Key.prefGenres)
        d.set(themes, forKey: Key.prefThemes)
        d.set(any, forKey: Key.prefAny)
        prefSelected = true
    }

    // Recently-shown queue (not @Published — used transiently by Home).
    var recentlyShown: [Int] {
        get { d.array(forKey: Key.recent) as? [Int] ?? [] }
        set { d.set(newValue, forKey: Key.recent) }
    }

    func rememberShown(_ cardId: Int) {
        var cur = recentlyShown
        cur.removeAll { $0 == cardId }   // dedupe → move to most recent
        cur.append(cardId)
        if cur.count > 10 { cur.removeFirst(cur.count - 10) }
        recentlyShown = cur
    }
}
