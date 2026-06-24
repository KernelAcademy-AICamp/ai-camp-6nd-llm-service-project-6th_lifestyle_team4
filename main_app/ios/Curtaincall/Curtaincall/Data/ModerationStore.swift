import SwiftUI
import Combine

/// UGC 신고 사유 — confirmationDialog 선택지. label 이 그대로 백엔드 reason 으로
/// 전송된다(content_reports.reason, ≤50자). App Store 1.2 신고 흐름용.
enum ReportReason: String, CaseIterable, Identifiable {
    case spam, abuse, inappropriate, other
    var id: String { rawValue }
    var label: String {
        switch self {
        case .spam:          return "스팸/홍보"
        case .abuse:         return "욕설/혐오"
        case .inappropriate: return "부적절한 내용"
        case .other:         return "기타"
        }
    }
}

/// 신고 대상 — content_reports.(content_type, content_id) 로 매핑. 콘텐츠 테이블이
/// 제각각 bigint PK(post_id/comment_id/highlight_id)를 써서, 타입+id 로 식별한다.
enum ReportTarget {
    case feedPost(Int)
    case cardComment(Int)
    case highlight(Int)
    case highlightComment(Int)
    case feedPostComment(Int)

    var contentType: String {
        switch self {
        case .feedPost:         return "feed_post"
        case .cardComment:      return "card_comment"
        case .highlight:        return "highlight"
        case .highlightComment: return "highlight_comment"
        case .feedPostComment:  return "feed_post_comment"
        }
    }

    var contentId: Int {
        switch self {
        case .feedPost(let id), .cardComment(let id), .highlight(let id),
             .highlightComment(let id), .feedPostComment(let id):
            return id
        }
    }

    /// 공유 `CommentsSection` 에서 백엔드 종류 문자열로부터 댓글 신고 대상을 만든다.
    static func comment(contentType: String, commentId: Int) -> ReportTarget {
        switch contentType {
        case "highlight_comment": return .highlightComment(commentId)
        case "feed_post_comment": return .feedPostComment(commentId)
        default:                  return .cardComment(commentId)
        }
    }
}

/// 신고/차단 상태. 차단 목록(blockedUserIds)을 들고 있어 피드/댓글이 차단 사용자
/// 콘텐츠를 가린다. 앱 전역 1개(EnvironmentObject) — RootView 가 로드/갱신한다.
@MainActor
final class ModerationStore: ObservableObject {
    @Published private(set) var blockedUserIds: Set<Int> = []

    func isBlocked(_ userId: Int) -> Bool { blockedUserIds.contains(userId) }

    /// 로그인/세션 변경 시 서버의 차단 목록을 다시 읽는다. 비로그인(userId nil)이면 비움.
    func refresh(userId: Int?) async {
        guard let userId else { blockedUserIds = []; return }
        do {
            blockedUserIds = try await Supa.shared.fetchBlockedUserIds(blockerUserId: userId)
        } catch {
            if !AppLog.isCancellation(error) { AppLog.error("blocked users fetch", error) }
        }
    }

    func report(_ target: ReportTarget, reason: ReportReason) async throws {
        try await Supa.shared.reportContent(
            contentType: target.contentType,
            contentId: target.contentId,
            reason: reason.label
        )
    }

    func block(userId: Int) async throws {
        try await Supa.shared.blockUser(blockedUserId: userId)
        blockedUserIds.insert(userId)
    }

    func unblock(userId: Int) async throws {
        try await Supa.shared.unblockUser(blockedUserId: userId)
        blockedUserIds.remove(userId)
    }
}
