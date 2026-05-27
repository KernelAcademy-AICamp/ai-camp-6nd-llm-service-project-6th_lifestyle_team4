import Foundation

// MARK: - Users

nonisolated struct UserRow: Decodable, Sendable {
    let userId: Int
    let nickname: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case nickname
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
