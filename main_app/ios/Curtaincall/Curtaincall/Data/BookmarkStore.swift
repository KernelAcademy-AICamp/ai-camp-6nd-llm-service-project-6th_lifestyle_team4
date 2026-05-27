import Foundation

/// Shared bookmark state so Home / Archive / Detail stay in sync.
@MainActor
final class BookmarkStore: ObservableObject {

    @Published var bookmarks: [BookmarkRow] = []
    @Published var bookmarkedIds: Set<Int> = []
    @Published var actionInFlight = false

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
        let wasBookmarked = bookmarkedIds.contains(cardId)
        if wasBookmarked { bookmarkedIds.remove(cardId) } else { bookmarkedIds.insert(cardId) }
        do {
            let now = try await Supa.shared.toggleBookmark(userId: userId, cardId: cardId)
            if now { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
            await load(userId: userId)
        } catch {
            if wasBookmarked { bookmarkedIds.insert(cardId) } else { bookmarkedIds.remove(cardId) }
        }
        actionInFlight = false
    }
}
