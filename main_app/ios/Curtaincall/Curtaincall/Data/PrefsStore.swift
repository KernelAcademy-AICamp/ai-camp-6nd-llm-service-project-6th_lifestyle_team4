import Foundation

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
    }

    @Published var pushEnabled: Bool { didSet { d.set(pushEnabled, forKey: Key.push) } }
    @Published var tasteEnabled: Bool { didSet { d.set(tasteEnabled, forKey: Key.taste) } }
    @Published var darkTheme: Bool { didSet { d.set(darkTheme, forKey: Key.dark) } }

    init() {
        pushEnabled = d.object(forKey: Key.push) as? Bool ?? true
        tasteEnabled = d.bool(forKey: Key.taste)
        darkTheme = d.bool(forKey: Key.dark)
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
