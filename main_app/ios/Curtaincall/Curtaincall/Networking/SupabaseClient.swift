import Foundation
import Supabase

/// Thrown by `Supa.addHighlight` when the selection is blank after trimming — the
/// `card_highlights.selected_text` CHECK requires 1–2000 non-blank chars, so we
/// reject locally rather than round-tripping to a guaranteed DB failure.
enum HighlightError: Error { case emptySelectedText }

/// `check_in_attendance` RPC 반환 json (045_attendance.sql).
struct AttendanceCheckIn: Decodable {
    let rewarded: Bool
    let balance: Int
    let today: String
}

private struct AttendanceDateRow: Decodable {
    let attended_date: String
}

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
            supabaseKey: Config.supabaseAnonKey,
            // Emit the locally stored session immediately as the initial session.
            // The default (false) path runs `reportIssue()` inside
            // `emitInitialSession`, which pauses under the debugger and freezes
            // `AuthSession.bootstrap()` — deadlocking all auth. bootstrap() does a
            // `session.isExpired` check to compensate for the un-refreshed emit.
            options: SupabaseClientOptions(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
    }

    // PostgREST embedded-resource selects. Backslash-newlines keep one logical line.
    private let cardColumns = """
    card_id, work_id, quote, script_excerpt, excerpt_description, significance, \
    keywords, temperature, intensity, view_count, comment_count, share_count, \
    quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, \
    text_align, text_align_original, \
    work:works(title, subtitle, format, author, release_year, characters, cover_url, intro, \
    title_original, subtitle_original, author_original, work_genres(genres(name)))
    """

    private let bookmarkColumns = """
    bookmark_id, user_id, card_id, created_at, \
    cards(card_id, work_id, quote, script_excerpt, excerpt_description, significance, \
    keywords, temperature, intensity, view_count, comment_count, \
    quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, \
    text_align, text_align_original, \
    work:works(title, subtitle, format, author, release_year, characters, cover_url, intro, \
    title_original, subtitle_original, author_original, work_genres(genres(name))))
    """

    private let feedCardColumns = """
    cards(card_id, work_id, quote, script_excerpt, excerpt_description, significance, \
    keywords, temperature, intensity, view_count, comment_count, \
    quote_original, script_excerpt_original, excerpt_description_original, significance_original, keywords_original, \
    text_align, text_align_original, \
    work:works(title, subtitle, format, author, release_year, characters, cover_url, intro, \
    title_original, subtitle_original, author_original, work_genres(genres(name))))
    """

    private var feedPostColumns: String {
        "post_id, card_id, user_id, author_nickname, body, created_at, \(feedCardColumns)"
    }

    private var highlightColumns: String {
        "highlight_id, card_id, user_id, author_nickname, selected_text, user_note, created_at, \(feedCardColumns)"
    }

    private let commentColumns =
        "comment_id, card_id, user_id, parent_comment_id, author_nickname, body, created_at"

    // MARK: - Cards

    /// 전체 카드를 1000개씩 페이지네이션으로 끝까지 가져온다 (PWA m-app.js:1364-1377 미러).
    /// 예전 `.limit(500)` 캡 때문에 카드가 500장을 넘으면 카탈로그·작품 상세 등에서
    /// 일부 카드가 누락되던 문제 수정 — 예: 인형의 집 22장 중 4장만 노출되던 케이스.
    /// PostgREST 기본 최대 행수(1000)도 range 페이지네이션으로 우회.
    /// `limit` 파라미터는 호환을 위해 유지하지만 무시 — 항상 전체를 가져옴.
    func fetchCards(limit: Int = 500) async throws -> [Card] {
        let pageSize = 1000
        var all: [Card] = []
        var offset = 0
        while true {
            let batch: [Card] = try await client.from("cards")
                .select(cardColumns)
                .order("card_id", ascending: false)
                .range(from: offset, to: offset + pageSize - 1)
                .execute()
                .value
            all.append(contentsOf: batch)
            if batch.count < pageSize { break }
            offset += pageSize
        }
        return all
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

    func incrementCardView(cardId: Int) async throws {
        try await client.rpc("increment_card_view", params: ["p_card_id": cardId])
            .execute()
    }

    func fetchBookmarkCounts(cardIds: [Int]) async throws -> [Int: Int] {
        guard !cardIds.isEmpty else { return [:] }
        let rows: [CardBookmarkCount] = try await client.from("card_bookmark_counts")
            .select("card_id, bookmark_count")
            .in("card_id", values: cardIds)
            .execute()
            .value
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.cardId, $0.bookmarkCount) })
    }

    func fetchLatestNotice() async throws -> Notice? {
        let rows: [Notice] = try await client.from("notices")
            .select("notice_id, tag, title, body, pinned, created_at")
            .eq("published", value: true)
            .order("pinned", ascending: false)
            .order("created_at", ascending: false)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    func fetchNotices(limit: Int = 100) async throws -> [Notice] {
        try await client.from("notices")
            .select("notice_id, tag, title, body, pinned, created_at")
            .eq("published", value: true)
            .order("pinned", ascending: false)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    // MARK: - Feed

    func fetchFeedPosts(limit: Int = 50) async throws -> [FeedPost] {
        try await client.from("feed_posts")
            .select(feedPostColumns)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func fetchCardHighlights(limit: Int = 50) async throws -> [CardHighlight] {
        try await client.from("card_highlights")
            .select(highlightColumns)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    // MARK: - My Feed (내 피드) — a member's own one-liners + highlights, with
    // own-row edit/delete. All writes are `.eq(user_id)`-guarded (RLS also enforces
    // owner-only), mirroring updateComment/deleteComment.

    /// 내가 쓴 '오늘의 한줄' — feed_posts WHERE user_id = me, newest first.
    func fetchMyFeedPosts(userId: Int) async throws -> [FeedPost] {
        try await client.from("feed_posts")
            .select(feedPostColumns)
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .limit(100)
            .execute()
            .value
    }

    /// 내가 저장한 하이라이트 — card_highlights WHERE user_id = me, newest first.
    func fetchMyHighlights(userId: Int) async throws -> [CardHighlight] {
        try await client.from("card_highlights")
            .select(highlightColumns)
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .limit(100)
            .execute()
            .value
    }

    func updateFeedPost(postId: Int, userId: Int, body: String) async throws {
        try await client.from("feed_posts")
            .update(["body": body])
            .eq("post_id", value: postId)
            .eq("user_id", value: userId)
            .execute()
    }

    func deleteFeedPost(postId: Int, userId: Int) async throws {
        try await client.from("feed_posts").delete()
            .eq("post_id", value: postId)
            .eq("user_id", value: userId)
            .execute()
    }

    func deleteHighlight(highlightId: Int, userId: Int) async throws {
        try await client.from("card_highlights").delete()
            .eq("highlight_id", value: highlightId)
            .eq("user_id", value: userId)
            .execute()
    }

    func addFeedPost(cardId: Int, userId: Int, body: String, authorNickname: String?) async throws {
        try await client.from("feed_posts")
            .insert(
                FeedPostInsert(
                    cardId: cardId,
                    userId: userId,
                    authorNickname: authorNickname,
                    body: body
                )
            )
            .execute()
    }

    /// Saves a highlighted passage (drag-selected from a card's script). Mirrors
    /// Android `FeedRepository.addHighlight`; surfaces in the Feed 하이라이트 tab.
    /// RLS blocks anonymous JWTs, so callers must gate on a signed-in member.
    /// `selectedText` is trimmed to the DB's 1–2000 bound; `userNote` to ≤500.
    func addHighlight(cardId: Int, userId: Int, selectedText: String, userNote: String?, authorNickname: String?) async throws {
        let text = String(selectedText.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2000))
        // The selected_text CHECK requires 1–2000 non-blank chars; reject a
        // blank-after-trim selection locally instead of a guaranteed DB failure.
        guard !text.isEmpty else { throw HighlightError.emptySelectedText }
        let note = userNote?.trimmingCharacters(in: .whitespacesAndNewlines)
        try await client.from("card_highlights")
            .insert(
                HighlightInsert(
                    cardId: cardId,
                    userId: userId,
                    authorNickname: authorNickname,
                    selectedText: text,
                    userNote: (note?.isEmpty ?? true) ? nil : String(note!.prefix(500))
                )
            )
            .execute()
    }

    // MARK: - Users

    func findUser(anonymousId: String) async throws -> UserRow? {
        let rows: [UserRow] = try await client.from("users")
            .select("user_id, nickname, login_id, gender, age_group, yarn_balance, pref_genres, pref_themes, pref_any")
            .eq("anonymous_id", value: anonymousId)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    private struct PrefUpdate: Encodable, Sendable {
        let pref_genres: [String]
        let pref_themes: [String]
        let pref_any: Bool
        let pref_updated_at: String
    }

    /// 선호 장르·주제를 users 행에 저장(migration 033 컬럼). 기존 users self-update RLS
    /// 사용. PWA `savePreferencesToDb` 와 동일 — pref_updated_at 갱신. 회원만(익명은
    /// userId 없거나 RLS 로 무시).
    func savePreferences(userId: Int, genres: [String], themes: [String], any: Bool) async throws {
        let iso = ISO8601DateFormatter()
        try await client.from("users")
            .update(PrefUpdate(
                pref_genres: genres,
                pref_themes: themes,
                pref_any: any,
                pref_updated_at: iso.string(from: Date())
            ))
            .eq("user_id", value: userId)
            .execute()
    }

    // MARK: - Yarn (실타래) — 06_yarn.sql RPCs. Balance lives in users.yarn_balance,
    // keyed by anonymous_id = auth.uid(); the RPCs derive the target from the JWT.

    /// Atomically spend 1 yarn for a card-open. Returns the post-decrement balance,
    /// or **-1** when the balance is 0 (no charge applied). Mirrors PWA `consumeYarnRpc`.
    func consumeYarn() async throws -> Int {
        try await client.rpc("consume_yarn").execute().value
    }

    /// Grant `n` yarn (the "준비 중" purchase mock + the attendance reward).
    /// Returns the post-grant balance. Mirrors PWA `grantYarnRpc` (`p_n`).
    @discardableResult
    func grantYarn(_ n: Int) async throws -> Int {
        try await client.rpc("grant_yarn", params: ["p_n": n]).execute().value
    }

    /// 공유/다운로드 후 `cards.share_count` +1 — 새 카운트 반환. PWA `bumpShareCount`
    /// (`increment_share_count`) 미러. 익명도 허용(서버 RPC 가 SECURITY DEFINER).
    @discardableResult
    func incrementShareCount(cardId: Int) async throws -> Int {
        try await client.rpc("increment_share_count", params: ["p_card_id": cardId]).execute().value
    }

    /// First-open +1 reward with **durable server-side dedup** — `(user_id, card_id)`
    /// is UNIQUE in `yarn_card_rewards`, so a reinstall/device-reset can't re-grant
    /// (unlike a client-only guard). Returns the post-reward balance (unchanged if
    /// already rewarded). Mirrors PWA `reward_yarn_first_view` (035_yarn_card_rewards.sql).
    func rewardFirstView(userId: Int, cardId: Int) async throws -> Int {
        try await client.rpc(
            "reward_yarn_first_view",
            params: ["p_user_id": userId, "p_card_id": cardId]
        ).execute().value
    }

    // MARK: - Attendance (045_attendance.sql)

    /// 오늘(KST) 첫 출석이면 attendance 기록 + 보상(+reward) 을 서버에서 원자적으로.
    /// 반환 [AttendanceCheckIn] — rewarded=false 면 이미 오늘 출석(보상 없음). 서버가
    /// (user_id, attended_date) UNIQUE 로 dedup → 재설치/로컬삭제로도 중복 수령 불가.
    func checkInAttendance(reward: Int) async throws -> AttendanceCheckIn {
        try await client.rpc("check_in_attendance", params: ["p_reward": reward])
            .execute()
            .value
    }

    /// 출석한 날짜 목록(yyyy-MM-dd). RLS 가 본인 행만 노출. 달력 렌더용.
    func attendanceHistory() async throws -> [String] {
        let rows: [AttendanceDateRow] = try await client.from("attendance")
            .select("attended_date")
            .execute()
            .value
        return rows.map { $0.attended_date }
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
            .limit(100)
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
        // True union with dedupe, mirroring the PWA (web_pwa m-app.js:864). Relies on
        // the unique constraint user_bookmarks_user_card_unique (user_id, card_id).
        // `try` (not `try?`) so a botched merge propagates instead of vanishing.
        try await client.from("user_bookmarks")
            .upsert(rows, onConflict: "user_id,card_id", ignoreDuplicates: true)
            .execute()
        // Cleanup of the old anonymous rows runs AFTER the auth identity has switched
        // to the new user, so under the current RLS these are scoped to the NEW user
        // and effectively no-op (the users delete is additionally blocked: no DELETE
        // policy/grant). Left best-effort on purpose — the correct home for this is a
        // server-side SECURITY DEFINER function. See review notes on RLS (#3).
        _ = try? await client.from("user_bookmarks").delete().eq("user_id", value: oldUserId).execute()
        _ = try? await client.from("users").delete().eq("user_id", value: oldUserId).execute()
    }

    /// Deletes the signed-in member's account via the existing `delete_account()`
    /// Postgres RPC (SECURITY DEFINER, shared with Android). Zero args — it reads
    /// `auth.uid()` internally and raises "not authenticated" if called without a
    /// session. The caller's JWT is attached automatically by the client.
    func deleteAccount() async throws {
        try await client.rpc("delete_account").execute()
    }

    // MARK: - Moderation (UGC 신고·차단 — App Store 1.2)

    private struct ReportParams: Encodable, Sendable {
        let p_content_type: String
        let p_content_id: Int
        let p_reason: String
    }
    private struct BlockParams: Encodable, Sendable {
        let p_blocked_user_id: Int
    }

    /// 부적절한 콘텐츠 신고 — `report_content` RPC(SECURITY DEFINER). 신고자는
    /// 서버에서 `auth.uid()` 로 해석하고, 같은 콘텐츠 중복 신고는 무시된다.
    func reportContent(contentType: String, contentId: Int, reason: String) async throws {
        try await client.rpc(
            "report_content",
            params: ReportParams(p_content_type: contentType, p_content_id: contentId, p_reason: reason)
        ).execute()
    }

    /// 학대 사용자 차단 — `block_user` RPC. 이후 그 사용자의 글/댓글은 차단자에게서
    /// 가려진다(클라이언트 필터링 + 목록은 `fetchBlockedUserIds`).
    func blockUser(blockedUserId: Int) async throws {
        try await client.rpc(
            "block_user",
            params: BlockParams(p_blocked_user_id: blockedUserId)
        ).execute()
    }

    func unblockUser(blockedUserId: Int) async throws {
        try await client.rpc(
            "unblock_user",
            params: BlockParams(p_blocked_user_id: blockedUserId)
        ).execute()
    }

    /// 차단 목록 — user_blocks WHERE blocker = me (RLS: 본인 행만 SELECT). 피드/댓글
    /// 필터링에 쓴다.
    func fetchBlockedUserIds(blockerUserId: Int) async throws -> Set<Int> {
        struct Row: Decodable { let blockedUserId: Int
            enum CodingKeys: String, CodingKey { case blockedUserId = "blocked_user_id" } }
        let rows: [Row] = try await client.from("user_blocks")
            .select("blocked_user_id")
            .eq("blocker_user_id", value: blockerUserId)
            .execute()
            .value
        return Set(rows.map { $0.blockedUserId })
    }

    // MARK: - Comments + likes

    /// A signed-in member's own comments, newest first, each joined with its
    /// parent card (for the "내 댓글" screen). Read-only select on card_comments,
    /// mirroring Android `CommentRepository.loadByUser`. The embedded `cards(...)`
    /// reuses `cardColumns` so each row's parent decodes straight into `Card`,
    /// letting a tap reuse the existing CardDetail navigation. Edit/delete reuse
    /// `updateComment`/`deleteComment` (both already `.eq(user_id)`-guarded).
    func loadCommentsByUser(userId: Int) async throws -> [MyComment] {
        try await client.from("card_comments")
            .select("comment_id, card_id, parent_comment_id, body, created_at, cards(\(cardColumns))")
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .limit(100)
            .execute()
            .value
    }

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

    func updateComment(commentId: Int, userId: Int, body: String) async throws -> Comment {
        try await client.from("card_comments")
            .update(CommentUpdate(body: body))
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .select(commentColumns)
            .single()
            .execute()
            .value
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

    // MARK: - Highlight comments + likes
    //
    // Mirror the card-comment methods above onto card_highlight_comments /
    // card_highlight_comment_likes (schema 08/09). The `card_id:highlight_id`
    // alias decodes each row straight into the shared `Comment` (its `cardId`
    // then carries highlight_id — internal only, unused in the comment UI), so
    // the whole comment model + UI is reused. RLS blocks anonymous JWTs from
    // writing, matching the gate in CommentsSection/CommentComposer.

    private let highlightCommentColumns =
        "comment_id, card_id:highlight_id, user_id, parent_comment_id, author_nickname, body, created_at"
    // post_id 를 card_id 로 alias → 공유 `Comment` 모델로 디코드 (highlight 와 동일 패턴).
    private let feedPostCommentColumns =
        "comment_id, card_id:post_id, user_id, parent_comment_id, author_nickname, body, created_at"

    func loadHighlightComments(highlightId: Int) async throws -> [Comment] {
        try await client.from("card_highlight_comments")
            .select(highlightCommentColumns)
            .eq("highlight_id", value: highlightId)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    func loadHighlightCommentLikes(commentIds: [Int]) async throws -> [CommentLike] {
        guard !commentIds.isEmpty else { return [] }
        return try await client.from("card_highlight_comment_likes")
            .select("comment_id, user_id")
            .in("comment_id", values: commentIds)
            .execute()
            .value
    }

    func addHighlightComment(
        highlightId: Int,
        userId: Int,
        body: String,
        authorNickname: String?,
        parentCommentId: Int?
    ) async throws -> Comment {
        try await client.from("card_highlight_comments")
            .insert(
                HighlightCommentInsert(
                    highlightId: highlightId,
                    userId: userId,
                    parentCommentId: parentCommentId,
                    authorNickname: authorNickname,
                    body: body
                )
            )
            .select(highlightCommentColumns)
            .single()
            .execute()
            .value
    }

    func deleteHighlightComment(commentId: Int, userId: Int) async throws {
        try await client.from("card_highlight_comments").delete()
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .execute()
    }

    func updateHighlightComment(commentId: Int, userId: Int, body: String) async throws -> Comment {
        try await client.from("card_highlight_comments")
            .update(CommentUpdate(body: body))
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .select(highlightCommentColumns)
            .single()
            .execute()
            .value
    }

    func setHighlightCommentLike(commentId: Int, userId: Int, liked: Bool) async throws {
        if liked {
            try await client.from("card_highlight_comment_likes")
                .insert(CommentLike(commentId: commentId, userId: userId))
                .execute()
        } else {
            try await client.from("card_highlight_comment_likes").delete()
                .eq("comment_id", value: commentId)
                .eq("user_id", value: userId)
                .execute()
        }
    }

    // MARK: - Feed-post comments (feed_post_comments / feed_post_comment_likes)
    // highlight 댓글과 동일 구조. RLS: 읽기 공개, insert/update/delete 는 본인(auth.uid)만.

    func loadFeedPostComments(postId: Int) async throws -> [Comment] {
        try await client.from("feed_post_comments")
            .select(feedPostCommentColumns)
            .eq("post_id", value: postId)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    func loadFeedPostCommentLikes(commentIds: [Int]) async throws -> [CommentLike] {
        guard !commentIds.isEmpty else { return [] }
        return try await client.from("feed_post_comment_likes")
            .select("comment_id, user_id")
            .in("comment_id", values: commentIds)
            .execute()
            .value
    }

    func addFeedPostComment(
        postId: Int,
        userId: Int,
        body: String,
        authorNickname: String?,
        parentCommentId: Int?
    ) async throws -> Comment {
        try await client.from("feed_post_comments")
            .insert(
                FeedPostCommentInsert(
                    postId: postId,
                    userId: userId,
                    parentCommentId: parentCommentId,
                    authorNickname: authorNickname,
                    body: body
                )
            )
            .select(feedPostCommentColumns)
            .single()
            .execute()
            .value
    }

    func deleteFeedPostComment(commentId: Int, userId: Int) async throws {
        try await client.from("feed_post_comments").delete()
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .execute()
    }

    func updateFeedPostComment(commentId: Int, userId: Int, body: String) async throws -> Comment {
        try await client.from("feed_post_comments")
            .update(CommentUpdate(body: body))
            .eq("comment_id", value: commentId)
            .eq("user_id", value: userId)
            .select(feedPostCommentColumns)
            .single()
            .execute()
            .value
    }

    func setFeedPostCommentLike(commentId: Int, userId: Int, liked: Bool) async throws {
        if liked {
            try await client.from("feed_post_comment_likes")
                .insert(CommentLike(commentId: commentId, userId: userId))
                .execute()
        } else {
            try await client.from("feed_post_comment_likes").delete()
                .eq("comment_id", value: commentId)
                .eq("user_id", value: userId)
                .execute()
        }
    }
}
