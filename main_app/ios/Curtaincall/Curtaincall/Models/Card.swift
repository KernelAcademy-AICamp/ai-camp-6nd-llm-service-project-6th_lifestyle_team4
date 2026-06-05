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

    var id: Int { cardId }

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
        work: Work(title: "Titanic", format: .movie, author: "James Cameron", releaseYear: 1997)
    )
}
#endif
