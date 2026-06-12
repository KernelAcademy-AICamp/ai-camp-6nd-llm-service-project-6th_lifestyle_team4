import Foundation

/// Today's-card + recommendation logic, ported from the PWA (m-app.js).
/// Taste OFF → deterministic seed pick; taste ON → weighted by similarity to
/// the average temperature/intensity of the user's bookmarked cards.
enum Recommend {

    /// Taste-weighting only kicks in once the user has at least this many
    /// bookmarks (matches Android's MIN_BOOKMARKS_FOR_TASTE); below that the
    /// signal is too thin, so we fall back to seed/random picks.
    static let minBookmarksForTaste = 10

    struct Taste {
        let avgTemperature: Double
        let avgIntensity: Double
        let count: Int
    }

    static func todaySeed(_ date: Date = .now) -> Int {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return (c.year ?? 0) * 10000 + (c.month ?? 0) * 100 + (c.day ?? 0)
    }

    static func computeTaste(_ cards: [Card]) -> Taste? {
        guard cards.count >= minBookmarksForTaste else { return nil }
        let t = cards.map { Double($0.temperature) }.reduce(0, +) / Double(cards.count)
        let i = cards.map { Double($0.intensity) }.reduce(0, +) / Double(cards.count)
        return Taste(avgTemperature: t, avgIntensity: i, count: cards.count)
    }

    private static func distance(_ card: Card, _ taste: Taste) -> Double {
        let dt = Double(card.temperature) - taste.avgTemperature
        let di = Double(card.intensity) - taste.avgIntensity
        return (dt * dt + di * di).squareRoot()
    }

    /// Genre × theme preference multiplier (Android's gm·tm). Returns 1.0 when
    /// there are no active prefs — so taste-only behavior is unchanged. A card
    /// whose format isn't a chosen genre is ×0.15; one whose themes don't
    /// intersect the chosen themes is ×0.2 — a soft down-weight, never a hard
    /// exclude. `any`/empty themes → no theme penalty.
    private static func prefWeight(_ card: Card, _ prefs: UserPrefs?) -> Double {
        guard let prefs, prefs.hasActive else { return 1.0 }
        let gm: Double = prefs.genres.isEmpty
            ? 1.0
            : (prefs.genres.contains(card.work.format.rawValue) ? 1.0 : 0.15)
        let anyTheme = prefs.any || prefs.themes.isEmpty
        let tm: Double
        if anyTheme {
            tm = 1.0
        } else {
            let themeSet = Set(prefs.themes)
            tm = CardTheme.cardThemeSet(card.keywords).contains { themeSet.contains($0) } ? 1.0 : 0.2
        }
        return gm * tm
    }

    static func pickToday(all: [Card], tasteEnabled: Bool, bookmarkCards: [Card], prefs: UserPrefs? = nil) -> Card? {
        guard !all.isEmpty else { return nil }
        let seed = abs(todaySeed())

        // Onboarding prefs active → deterministic preference-weighted pick
        // (genre/theme bias, blended with taste when available). The day seed
        // draws the position, so the daily card stays stable per day.
        if prefs?.hasActive == true {
            let taste = tasteEnabled ? computeTaste(bookmarkCards) : nil
            let weights = all.map { card -> Double in
                let tasteTerm = taste.map { 1.0 / (1.0 + distance(card, $0)) } ?? 1.0
                return tasteTerm * prefWeight(card, prefs)
            }
            let total = weights.reduce(0, +)
            guard total > 0 else { return all[seed % all.count] }
            var r = (Double(seed % 100_000) / 100_000.0) * total
            for (idx, w) in weights.enumerated() {
                r -= w
                if r <= 0 { return all[idx] }
            }
            return all.last
        }

        if !tasteEnabled { return all[seed % all.count] }
        guard let taste = computeTaste(bookmarkCards) else { return all[seed % all.count] }

        let sorted = all.sorted { distance($0, taste) < distance($1, taste) }
        let variety = seed % 10 == 0
        let pool: [Card]
        if variety {
            pool = Array(sorted[Int(Double(sorted.count) * 0.3)...])
        } else {
            let end = max(1, Int((Double(sorted.count) * 0.3).rounded(.up)))
            pool = Array(sorted[0..<end])
        }
        return pool.isEmpty ? nil : pool[seed % pool.count]
    }

    static func pickRandom(
        all: [Card],
        tasteEnabled: Bool,
        bookmarkCards: [Card],
        recentIds: [Int],
        prefs: UserPrefs? = nil
    ) -> Card? {
        guard !all.isEmpty else { return nil }
        let exclude = Set(recentIds)
        func excludingRecent() -> [Card] {
            let pool = all.filter { !exclude.contains($0.cardId) }
            return pool.isEmpty ? all : pool
        }

        // Weighted mode kicks in for taste OR active onboarding prefs (Android's
        // `prefs.hasActive() || tasteEnabled` routing). With neither, stay uniform.
        let taste = tasteEnabled ? computeTaste(bookmarkCards) : nil
        let prefsActive = prefs?.hasActive ?? false
        guard taste != nil || prefsActive else { return excludingRecent().randomElement() }
        if Double.random(in: 0..<1) < 0.1 { return excludingRecent().randomElement() }

        let candidates = excludingRecent()
        let weights = candidates.map { card -> Double in
            let tasteTerm = taste.map { 1.0 / (1.0 + distance(card, $0)) } ?? 1.0
            return tasteTerm * prefWeight(card, prefs)
        }
        let total = weights.reduce(0, +)
        if total <= 0 { return candidates.randomElement() }
        var r = Double.random(in: 0..<total)
        for (idx, w) in weights.enumerated() {
            r -= w
            if r <= 0 { return candidates[idx] }
        }
        return candidates.last
    }
}
