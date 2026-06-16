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
    /// 실타래 충전 잔액 (users.yarn_balance). 부트스트랩 시드용 — insert 경로엔 없어 nil.
    let yarnBalance: Int?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case nickname
        case loginId = "login_id"
        case gender
        case ageGroup = "age_group"
        case yarnBalance = "yarn_balance"
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

nonisolated struct CardBookmarkCount: Decodable, Sendable {
    let cardId: Int
    let bookmarkCount: Int

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case bookmarkCount = "bookmark_count"
    }
}

// MARK: - Notices

nonisolated struct Notice: Decodable, Identifiable, Sendable {
    let noticeId: Int
    let tag: String
    let title: String
    let body: String
    let pinned: Bool
    let createdAt: String

    var id: Int { noticeId }

    enum CodingKeys: String, CodingKey {
        case noticeId = "notice_id"
        case tag
        case title
        case body
        case pinned
        case createdAt = "created_at"
    }
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

nonisolated struct CommentUpdate: Encodable, Sendable {
    let body: String
}

/// Insert payload for a highlight comment (card_highlight_comments). Same shape
/// as CommentInsert but keyed on highlight_id. The select after insert aliases
/// highlight_id→card_id so the returned row decodes into the shared `Comment`.
nonisolated struct HighlightCommentInsert: Encodable, Sendable {
    let highlightId: Int
    let userId: Int
    let parentCommentId: Int?
    let authorNickname: String?
    let body: String

    enum CodingKeys: String, CodingKey {
        case highlightId = "highlight_id"
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

/// A signed-in member's own comment joined with its parent card, for the
/// "내 댓글" screen. Read-only projection of public.card_comments with the
/// embedded `cards(...)` → `Card` (mirrors Android `MyComment`). `body` is `var`
/// so an inline edit updates in place without a refetch.
nonisolated struct MyComment: Decodable, Identifiable, Hashable, Sendable {
    let commentId: Int
    let cardId: Int
    let parentCommentId: Int?
    var body: String
    let createdAt: String
    let card: Card?

    var id: Int { commentId }
    var createdDate: Date? { parseISODate(createdAt) }
    var isReply: Bool { parentCommentId != nil }

    enum CodingKeys: String, CodingKey {
        case commentId = "comment_id"
        case cardId = "card_id"
        case parentCommentId = "parent_comment_id"
        case body
        case createdAt = "created_at"
        case card = "cards"
    }
}

// MARK: - Feed

nonisolated struct FeedPost: Decodable, Identifiable, Sendable {
    let postId: Int
    let cardId: Int
    let userId: Int
    let authorNickname: String?
    let body: String
    let createdAt: String
    let card: Card?

    var id: Int { postId }
    var createdDate: Date? { parseISODate(createdAt) }

    enum CodingKeys: String, CodingKey {
        case postId = "post_id"
        case cardId = "card_id"
        case userId = "user_id"
        case authorNickname = "author_nickname"
        case body
        case createdAt = "created_at"
        case card = "cards"
    }
}

nonisolated struct FeedPostInsert: Encodable, Sendable {
    let cardId: Int
    let userId: Int
    let authorNickname: String?
    let body: String

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case userId = "user_id"
        case authorNickname = "author_nickname"
        case body
    }
}

nonisolated struct CardHighlight: Decodable, Identifiable, Hashable, Sendable {
    let highlightId: Int
    let cardId: Int
    let userId: Int
    let authorNickname: String?
    let selectedText: String
    let userNote: String?
    let createdAt: String
    let card: Card?

    var id: Int { highlightId }
    var createdDate: Date? { parseISODate(createdAt) }

    enum CodingKeys: String, CodingKey {
        case highlightId = "highlight_id"
        case cardId = "card_id"
        case userId = "user_id"
        case authorNickname = "author_nickname"
        case selectedText = "selected_text"
        case userNote = "user_note"
        case createdAt = "created_at"
        case card = "cards"
    }
}

nonisolated struct HighlightInsert: Encodable, Sendable {
    let cardId: Int
    let userId: Int
    let authorNickname: String?
    let selectedText: String
    let userNote: String?

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case userId = "user_id"
        case authorNickname = "author_nickname"
        case selectedText = "selected_text"
        case userNote = "user_note"
    }
}
