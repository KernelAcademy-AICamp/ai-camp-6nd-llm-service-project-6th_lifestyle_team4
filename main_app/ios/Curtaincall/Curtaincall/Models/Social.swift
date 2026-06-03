import Foundation

/// Parses Postgres/ISO8601 timestamps, with or without fractional seconds.
nonisolated func parseISODate(_ iso: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: iso) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    if let d = plain.date(from: iso) { return d }
    let fallback = DateFormatter()
    fallback.locale = Locale(identifier: "en_US_POSIX")
    fallback.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return fallback.date(from: String(iso.prefix(19)))
}

// MARK: - Users

nonisolated struct UserRow: Decodable, Sendable {
    let userId: Int
    let nickname: String?
    let loginId: String?
    let gender: String?
    let ageGroup: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case nickname
        case loginId = "login_id"
        case gender
        case ageGroup = "age_group"
    }
}

nonisolated struct UserInsert: Encodable, Sendable {
    let anonymousId: String
    let nickname: String?

    enum CodingKeys: String, CodingKey {
        case anonymousId = "anonymous_id"
        case nickname
    }
}

// MARK: - Bookmarks

nonisolated struct BookmarkRow: Decodable, Identifiable, Sendable {
    let bookmarkId: Int
    let cardId: Int
    let createdAt: String?
    let card: Card?

    var id: Int { bookmarkId }
    var createdDate: Date? { createdAt.flatMap(parseISODate) }

    enum CodingKeys: String, CodingKey {
        case bookmarkId = "bookmark_id"
        case cardId = "card_id"
        case createdAt = "created_at"
        case card = "cards"
    }
}

nonisolated struct BookmarkInsert: Encodable, Sendable {
    let userId: Int
    let cardId: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case cardId = "card_id"
    }
}

nonisolated struct CardIdRow: Decodable, Sendable {
    let cardId: Int
    enum CodingKeys: String, CodingKey { case cardId = "card_id" }
}

// MARK: - Comments + likes

nonisolated struct Comment: Decodable, Identifiable, Hashable, Sendable {
    let commentId: Int
    let cardId: Int
    let userId: Int
    let parentCommentId: Int?
    let authorNickname: String?
    let body: String
    let createdAt: String

    var id: Int { commentId }

    enum CodingKeys: String, CodingKey {
        case commentId = "comment_id"
        case cardId = "card_id"
        case userId = "user_id"
        case parentCommentId = "parent_comment_id"
        case authorNickname = "author_nickname"
        case body
        case createdAt = "created_at"
    }
}

nonisolated struct CommentInsert: Encodable, Sendable {
    let cardId: Int
    let userId: Int
    let parentCommentId: Int?
    let authorNickname: String?
    let body: String

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case userId = "user_id"
        case parentCommentId = "parent_comment_id"
        case authorNickname = "author_nickname"
        case body
    }
}

nonisolated struct CommentLike: Codable, Sendable {
    let commentId: Int
    let userId: Int

    enum CodingKeys: String, CodingKey {
        case commentId = "comment_id"
        case userId = "user_id"
    }
}
