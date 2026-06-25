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
    let commentCount: Int?
    let shareCount: Int?
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

    // 본문(scriptExcerpt) 표시 정렬 — 관리자가 카드별로 좌/중앙/우 저장 (migration 042).
    // NULL = format 기본 (poem=center, else=left). EN 토글은 _original 우선.
    let textAlign: String?
    let textAlignOriginal: String?

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

    /// Narrower gate for the Home today-card toggle. Home only visibly swaps the
    /// quote, keywords, and work title/subtitle/format label — it never renders
    /// the script, scene description, or significance. So it checks only the
    /// originals Home can actually show, avoiding a toggle that would appear to
    /// do nothing on a row backfilled with only description/significance originals.
    /// Detail keeps the broad `hasOriginalLanguage`.
    var hasHomeOriginalLanguage: Bool {
        quoteOriginal.filledValue != nil
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
        case commentCount = "comment_count"
        case shareCount = "share_count"
        case work
        case quoteOriginal = "quote_original"
        case scriptExcerptOriginal = "script_excerpt_original"
        case excerptDescriptionOriginal = "excerpt_description_original"
        case significanceOriginal = "significance_original"
        case keywordsOriginal = "keywords_original"
        case textAlign = "text_align"
        case textAlignOriginal = "text_align_original"
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

    /// 본문 정렬 — EN 토글 시 _original 우선, 없으면 KO, 그래도 없으면 format 기본 (poem=center, else=left).
    /// Mirror of PWA m-app.js detail render `_alignSrc`.
    func displayTextAlign(original: Bool) -> String {
        let pick = original ? (textAlignOriginal ?? textAlign) : textAlign
        if let v = pick, v == "left" || v == "center" || v == "right" { return v }
        return work.format == .poem ? "center" : "left"
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
