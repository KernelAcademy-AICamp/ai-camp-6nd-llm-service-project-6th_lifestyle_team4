import Foundation
import Combine

/// Shared bookmark state so Home / Archive / Detail stay in sync.
@MainActor
final class BookmarkStore: ObservableObject {

    @Published var bookmarks: [BookmarkRow] = []
    @Published var bookmarkedIds: Set<Int> = []
    @Published var actionInFlight = false
    /// 마지막 북마크 **쓰기 실패** 안내 문구. 낙관적 UI 를 롤백한 뒤 화면이 아무 말도 하지
    /// 않아 사용자는 '저장된 줄' 알았던 문제(외부 QA H-14) — 실패를 발행해 루트 배너가 띄운다.
    /// ⚠️ 서버/SDK 원문(error.localizedDescription)은 절대 담지 않는다(영문 시스템 메시지 노출 방지).
    @Published private(set) var lastError: String?
    /// 안내 자동 소멸 타이머 — 뷰에 타이머를 두지 않으려고 스토어가 관리한다.
    private var errorClearTask: Task<Void, Never>?

    var bookmarkCards: [Card] { bookmarks.compactMap { $0.card } }

    func load(userId: Int?) async {
        guard let userId else {
            bookmarks = []
            bookmarkedIds = []
            return
        }
        do {
            let rows = try await Supa.shared.listBookmarks(userId: userId)
            bookmarks = rows
            bookmarkedIds = Set(rows.map { $0.cardId })
        } catch {
            // keep last good state
        }
    }

    func isBookmarked(_ cardId: Int) -> Bool { bookmarkedIds.contains(cardId) }

    /// Optimistic toggle, then reconcile from the server.
    func toggle(userId: Int?, cardId: Int) async {
        guard let userId, !actionInFlight else { return }
        actionInFlight = true
        clearError()   // 이전 실패 안내가 새 시도에 남아 있지 않게
        let wasBookmarked = bookmarkedIds.contains(cardId)
        if wasBookmarked { bookmarkedIds.remove(cardId) } else { bookmarkedIds.insert(cardId) }
        do {
            let now = try await Supa.shared.toggleBookmark(userId: userId, cardId: cardId)
            if now { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
            await load(userId: userId)
        } catch {
            // 롤백은 그대로 두되(낙관적 UI 유지), 실패를 **발행**한다 — 예전엔 여기서 조용히
            // 되돌리기만 해 호출부가 실패를 알 방법이 없었다.
            if wasBookmarked { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
            flashError("북마크 저장에 실패했어요. 잠시 후 다시 시도해주세요.")
        }
        actionInFlight = false
    }

    /// 실패 안내를 띄우고 3.5초 뒤 자동으로 지운다(사용자 조작 불필요).
    private func flashError(_ message: String) {
        lastError = message
        errorClearTask?.cancel()
        errorClearTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            guard !Task.isCancelled else { return }
            self?.lastError = nil
        }
    }

    private func clearError() {
        errorClearTask?.cancel()
        errorClearTask = nil
        lastError = nil
    }
}
