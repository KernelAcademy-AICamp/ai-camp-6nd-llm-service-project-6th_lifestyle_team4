import Foundation

nonisolated struct Card: Decodable, Identifiable, Hashable, Sendable {
    let cardId: Int
    let quote: String
    let scriptExcerpt: String
    let excerptDescription: String?
    let significance: String?
    let keywords: [String]
    let temperature: Int
    let intensity: Int
    let viewCount: Int?
    let work: Work

    // Original-language source text (typically English), mirroring the PWA's
    // *_original columns. Optional so cards curated before bilingual support
    // still decode. Never shown blank — see the `display*` helpers, which fall
    // back to the Korean field when an original is missing.
    let quoteOriginal: String?
    let scriptExcerptOriginal: String?
    let excerptDescriptionOriginal: String?
    let significanceOriginal: String?
    let keywordsOriginal: [String]?

    var id: Int { cardId }

    /// True when this card carries any original-language text the KR/ENG views
    /// can surface. Covers every field Home/Detail can swap — including
    /// partially-backfilled rows that only have, say, `script_excerpt_original`
    /// — so the toggle is offered whenever it would show useful content. When
    /// false, the toggle is hidden entirely.
    var hasOriginalLanguage: Bool {
        quoteOriginal.filledValue != nil
            || scriptExcerptOriginal.filledValue != nil
            || excerptDescriptionOriginal.filledValue != nil
            || significanceOriginal.filledValue != nil
            || (keywordsOriginal?.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? false)
            || work.hasOriginalLanguage
    }

    // Explicit snake_case keys so decoding is independent of any global
    // key-decoding strategy (supabase-swift's decoder does not convert keys).
    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case quote
        case scriptExcerpt = "script_excerpt"
        case excerptDescription = "excerpt_description"
        case significance
        case keywords
        case temperature
        case intensity
        case viewCount = "view_count"
        case work
        case quoteOriginal = "quote_original"
        case scriptExcerptOriginal = "script_excerpt_original"
        case excerptDescriptionOriginal = "excerpt_description_original"
        case significanceOriginal = "significance_original"
        case keywordsOriginal = "keywords_original"
    }
}

// MARK: - Language-aware display

extension Card {
    /// When `original` is true, return the original-language value, falling back
    /// to the Korean field whenever the original is missing/blank so content is
    /// never shown empty. Matches the PWA's `useEn && X_original ? X_original : X`.
    func displayQuote(original: Bool) -> String {
        original ? (quoteOriginal.filledValue ?? quote) : quote
    }

    func displayScript(original: Bool) -> String {
        original ? (scriptExcerptOriginal.filledValue ?? scriptExcerpt) : scriptExcerpt
    }

    func displayDescription(original: Bool) -> String? {
        original ? (excerptDescriptionOriginal.filledValue ?? excerptDescription) : excerptDescription
    }

    func displaySignificance(original: Bool) -> String? {
        original ? (significanceOriginal.filledValue ?? significance) : significance
    }

    func displayKeywords(original: Bool) -> [String] {
        if original, let k = keywordsOriginal, !k.isEmpty { return k }
        return keywords
    }
}

private extension Optional where Wrapped == String {
    /// The string if it has non-whitespace content, otherwise nil — so a blank
    /// original never wins over the Korean fallback.
    var filledValue: String? {
        guard let s = self,
              !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return s
    }
}

#if DEBUG
extension Card {
    static let sample = Card(
        cardId: 1,
        quote: "나 날고 있어!",
        scriptExcerpt: "잭이 두 팔을 벌리고 로즈를 안는다. 바람이 그녀의 머리카락을 휘날린다. 그녀는 처음으로 자유롭다는 감각을 느낀다. 배는 황금빛 바다 위를 미끄러지듯 달려간다.",
        excerptDescription: "타이타닉 뱃머리에서의 상징적 장면",
        significance: nil,
        keywords: ["자유의 경험", "첫사랑", "초월성"],
        temperature: 5,
        intensity: 4,
        viewCount: 12,
        work: Work(
            title: "타이타닉",
            format: .movie,
            author: "제임스 카메론",
            releaseYear: 1997,
            titleOriginal: "Titanic",
            authorOriginal: "James Cameron"
        ),
        quoteOriginal: "I'm flying!",
        scriptExcerptOriginal: "Jack spreads his arms wide and holds Rose. The wind sweeps through her hair. For the first time she feels truly free. The ship glides across a golden sea.",
        excerptDescriptionOriginal: "The iconic scene at the bow of the Titanic",
        significanceOriginal: nil,
        keywordsOriginal: ["Freedom", "First love", "Transcendence"]
    )
}
#endif
