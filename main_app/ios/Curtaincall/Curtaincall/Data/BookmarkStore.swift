import Foundation
import Combine

/// Shared bookmark state so Home / Archive / Detail stay in sync.
@MainActor
final class BookmarkStore: ObservableObject {

    @Published var bookmarks: [BookmarkRow] = []
    @Published var bookmarkedIds: Set<Int> = []
    @Published var actionInFlight = false

    /// **신원 세대 토큰.** 네트워크를 기다리는 사이에 계정이 바뀌면(로그아웃·탈퇴) 뒤늦게 도착한
    /// 이전 계정의 응답이 방금 비운 상태를 되살리는 문제가 있었다 — 호출 **순서**를 고쳐도
    /// (`finishIdentityChange`) 이미 떠난 요청은 막지 못한다. 모든 쓰기 진입점에서 값을 올리고,
    /// `await` 뒤에 토큰이 그대로인지 확인해 낡은 응답은 통째로 버린다.
    private var identityGeneration = 0

    var bookmarkCards: [Card] { bookmarks.compactMap { $0.card } }

    /// 지금 시작하는 요청의 세대 번호. 진행 중이던 이전 요청들은 이 시점에 모두 무효가 된다.
    private func beginGeneration() -> Int {
        identityGeneration &+= 1
        return identityGeneration
    }

    func load(userId: Int?) async {
        // ⚠️ 세대 증가는 nil(=비우기) 분기보다 **먼저** 와야 한다. 로그아웃 경로는 이 nil 호출로
        // 상태를 비우는데, 여기서 세대를 올려야 이전 계정의 in-flight 응답이 무효화된다.
        let generation = beginGeneration()
        guard let userId else {
            bookmarks = []
            bookmarkedIds = []
            return
        }
        do {
            let rows = try await Supa.shared.listBookmarks(userId: userId)
            guard generation == identityGeneration else { return }   // 그사이 신원이 바뀜 → 폐기
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
        let generation = beginGeneration()
        let wasBookmarked = bookmarkedIds.contains(cardId)
        if wasBookmarked { bookmarkedIds.remove(cardId) } else { bookmarkedIds.insert(cardId) }
        do {
            let now = try await Supa.shared.toggleBookmark(userId: userId, cardId: cardId)
            // 낙관적 반영/재조회 모두 세대 확인 뒤에만. load() 만 막으면 바로 아래 insert 가
            // 게스트 상태에 이전 계정의 카드 1건을 되살린다.
            if generation == identityGeneration {
                if now { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
                await load(userId: userId)
            }
        } catch {
            // 롤백도 마찬가지 — 신원이 바뀐 뒤라면 되돌릴 대상 자체가 남의 상태다.
            if generation == identityGeneration {
                if wasBookmarked { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
            }
        }
        actionInFlight = false
    }
}
