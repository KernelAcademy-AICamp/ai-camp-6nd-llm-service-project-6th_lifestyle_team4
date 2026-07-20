import Foundation

// 파서용 포매터는 생성 비용이 크다(ISO8601DateFormatter.init ~수 ms/개). 예전엔
// parseISODate 호출마다 3개를 새로 만들어, 피드/댓글/공지 createdDate 게터가
// 대량 호출되는 탭 전환·스크롤 때 수십 ms 를 태웠다(Instruments Time Profiler:
// parseISODate 14ms + ISO8601DateFormatter.init 11ms 이 탭전환 하이치 상위 2·3위).
// → 파일 스코프 싱글턴으로 1회만 생성해 캐시. 설정 후 불변이고 date(from:) 읽기는
// Foundation 상에서 스레드-세이프라(mutate 안 함) nonisolated(unsafe) 로 공유한다.
nonisolated(unsafe) private let isoWithFraction: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
nonisolated(unsafe) private let isoPlain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()
// (unsafe 불필요 — DateFormatter 는 SDK 에서 Sendable 로 표기돼 있어 plain
//  nonisolated 로 충분. ISO8601DateFormatter 는 아니라서 위 둘만 unsafe.)
nonisolated private let isoFallback: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return f
}()

/// Parses Postgres/ISO8601 timestamps, with or without fractional seconds.
/// 포매터는 위 캐시 싱글턴을 재사용(호출당 할당 0).
nonisolated func parseISODate(_ iso: String) -> Date? {
    if let d = isoWithFraction.date(from: iso) { return d }
    if let d = isoPlain.date(from: iso) { return d }
    return isoFallback.date(from: String(iso.prefix(19)))
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
    /// 선호 장르(format 배열)·주제(한글 범주 배열)·"상관없음" 플래그 (migration 033).
    /// 컬럼이 NULL 이면 nil — "서버에 선호도 없음"을 뜻한다(로컬 온보딩 값 보존).
    let prefGenres: [String]?
    let prefThemes: [String]?
    let prefAny: Bool?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case nickname
        case loginId = "login_id"
        case gender
        case ageGroup = "age_group"
        case yarnBalance = "yarn_balance"
        case prefGenres = "pref_genres"
        case prefThemes = "pref_themes"
        case prefAny = "pref_any"
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

/// Insert payload for a feed-post comment (feed_post_comments). Same shape as
/// CommentInsert but keyed on post_id. The select after insert aliases
/// post_id→card_id so the returned row decodes into the shared `Comment`.
nonisolated struct FeedPostCommentInsert: Encodable, Sendable {
    let postId: Int
    let userId: Int
    let parentCommentId: Int?
    let authorNickname: String?
    let body: String

    enum CodingKeys: String, CodingKey {
        case postId = "post_id"
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

    /// Copy with an edited body — for optimistic in-place update after `updateFeedPost`
    /// (fields are `let`, so this rebuilds the row rather than mutating it).
    func withBody(_ newBody: String) -> FeedPost {
        FeedPost(postId: postId, cardId: cardId, userId: userId,
                 authorNickname: authorNickname, body: newBody,
                 createdAt: createdAt, card: card)
    }

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

// MARK: - Content likes (043_content_likes.sql)
// 피드 글(feed_post) / 하이라이트(highlight) 공통 좋아요 — target_type 으로 분기.

/// content_like_counts 뷰 행 — target_type 별 (target_id, like_count).
nonisolated struct ContentLikeCountRow: Decodable, Sendable {
    let targetId: Int
    let likeCount: Int

    enum CodingKeys: String, CodingKey {
        case targetId = "target_id"
        case likeCount = "like_count"
    }
}

/// content_likes 행(내 좋아요 조회용) — target_id 만 뽑는다.
nonisolated struct ContentLikeRow: Decodable, Sendable {
    let targetId: Int

    enum CodingKeys: String, CodingKey {
        case targetId = "target_id"
    }
}

/// toggle_content_like RPC 반환 — {liked, count}.
nonisolated struct ContentLikeResult: Decodable, Sendable {
    let liked: Bool
    let count: Int
}

/// toggle_content_like RPC 파라미터 — Int/String 혼합이라 dict 대신 Encodable 구조체.
nonisolated struct ContentLikeToggleParams: Encodable, Sendable {
    let userId: Int
    let targetType: String
    let targetId: Int

    enum CodingKeys: String, CodingKey {
        case userId = "p_user_id"
        case targetType = "p_target_type"
        case targetId = "p_target_id"
    }
}
