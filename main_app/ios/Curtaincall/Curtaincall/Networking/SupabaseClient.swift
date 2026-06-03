import Foundation
import Supabase

/// Single Supabase entry point for the app, built on supabase-swift.
///
/// Replaces the previous hand-rolled URLSession client. Auth, reads and writes
/// all flow through `client`, so a signed-in user's JWT is automatically
/// attached to PostgREST requests (required for RLS-guarded writes like
/// bookmarks and comments). The widget keeps its own independent loader.
final class Supa {
    static let shared = Supa()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
    }

    // PostgREST embedded-resource selects. Backslash-newlines keep one logical line.
    private let cardColumns = """
    card_id, work_id, quote, script_excerpt, excerpt_description, significance, \
    keywords, temperature, intensity, \
    work:works(title, format, author, release_year, characters, work_genres(genres(name)))
    """

    private let bookmarkColumns = """
    bookmark_id, user_id, card_id, created_at, \
    cards(card_id, work_id, quote, script_excerpt, excerpt_description, significance, \
    keywords, temperature, intensity, \
    work:works(title, format, author, release_year, characters, work_genres(genres(name))))
    """

    private let commentColumns =
        "comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at"

    // MARK: - Cards

    func fetchCards(limit: Int = 500) async throws -> [Card] {
        try await client.from("cards")
            .select(cardColumns)
            .order("card_id", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func fetchCard(id: Int) async throws -> Card? {
        let rows: [Card] = try await client.from("cards")
            .select(cardColumns)
            .eq("card_id", value: id)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    // MARK: - Users

    func findUser(anonymousId: String) async throws -> UserRow? {
        let rows: [UserRow] = try await client.from("users")
            .select("user_id, nickname, login_id, gender, age_group")
            .eq("anonymous_id", value: anonymousId)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    func insertUser(anonymousId: String, nickname: String) async throws -> UserRow {
        try await client.from("users")
            .insert(UserInsert(anonymousId: anonymousId, nickname: nickname))
            .select("user_id, nickname")
            .single()
            .execute()
            .value
    }

    func updateNickname(userId: Int, nickname: String) async throws {
        try await client.from("users")
            .update(["nickname": nickname])
            .eq("user_id", value: userId)
            .execute()
    }

    /// 가입 직후 입력한 아이디를 users.login_id에 기록 (PWA applySignupProfile와 동일 역할).
    func applySignupProfile(userId: Int, loginId: String) async throws {
        try await client.from("users")
            .update(["login_id": loginId])
            .eq("user_id", value: userId)
            .execute()
    }

    /// 프로필 저장 — 닉네임 + 선택 성별/나이대. gender/age_group은 nil이면 컬럼을 건드리지
    /// 않는다(Android updateProfile과 동일: '선택 안 함'은 기존 값 유지). DB CHECK가 빈 문자열을 거부.
    func updateProfile(userId: Int, nickname: String, gender: String?, ageGroup: String?) async throws {
        var fields: [String: String] = ["nickname": nickname]
        if let gender { fields["gender"] = gender }
        if let ageGroup { fields["age_group"] = ageGroup }
        try await client.from("users")
            .update(fields)
            .eq("user_id", value: userId)
            .execute()
    }

    // MARK: - Bookmarks

    func listBookmarks(userId: Int) async throws -> [BookmarkRow] {
        try await client.from("user_bookmarks")
            .select(bookmarkColumns)
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    func isBookmarked(userId: Int, cardId: Int) async throws -> Bool {
        let rows: [CardIdRow] = try await client.from("user_bookmarks")
            .select("card_id")
            .eq("user_id", value: userId)
            .eq("card_id", value: cardId)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }

    /// Returns the new bookmarked state.
    func toggleBookmark(userId: Int, cardId: Int) async throws -> Bool {
        if try await isBookmarked(userId: userId, cardId: cardId) {
            try await client.from("user_bookmarks").delete()
                .eq("user_id", value: userId)
                .eq("card_id", value: cardId)
                .execute()
            return false
        } else {
            try await client.from("user_bookmarks")
                .insert(BookmarkInsert(userId: userId, cardId: cardId))
                .execute()
            return true
        }
    }

    func migrateBookmarks(oldUserId: Int, newUserId: Int) async throws {
        let old: [CardIdRow] = try await client.from("user_bookmarks")
            .select("card_id")
            .eq("user_id", value: oldUserId)
            .execute()
            .value
        guard !old.isEmpty else { return }
        let rows = old.map { BookmarkInsert(userId: newUserId, cardId: $0.cardId) }
        _ = try? await client.from("user_bookmarks").insert(rows).execute()
        _ = try? await client.from("user_bookmarks").delete().eq("user_id", value: oldUserId).execute()
        _ = try? await client.from("users").delete().eq("user_id", value: oldUserId).execute()
    }

    // MARK: - Comments + likes

    func loadComments(cardId: Int) async throws -> [Comment] {
        try await client.from("card_comments")
            .select(commentColumns)
            .eq("card_id", value: cardId)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    func loadLikes(commentIds: [Int]) async throws -> [CommentLike] {
        guard !commentIds.isEmpty else { return [] }
        return try await client.from("comment_likes")
            .select("comment_id, user_id")
            .in("comment_id", values: commentIds)
            .execute()
            .value
    }

    func addComment(
        cardId: Int,
        userId: Int,
        body: String,
        authorNickname: String?,
        parentCommentId: Int?
    ) async throws -> Comment {
        try await client.from("card_comments")
            .insert(
                CommentInsert(
                    cardId: cardId,
                    userId: userId,
                    parentCommentId: parentCommentId,
                    authorNickname: authorNickname,
                    body: body
                )
            )
            .select(commentColumns)
            .single()
            .execute()
            .value
    }

    func deleteComment(commentId: Int, userId: Int) async throws {
        try await client.from("card_comments").delete()
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .execute()
    }

    func setLike(commentId: Int, userId: Int, liked: Bool) async throws {
        if liked {
            try await client.from("comment_likes")
                .insert(CommentLike(commentId: commentId, userId: userId))
                .execute()
        } else {
            try await client.from("comment_likes").delete()
                .eq("comment_id", value: commentId)
                .eq("user_id", value: userId)
                .execute()
        }
    }
}
