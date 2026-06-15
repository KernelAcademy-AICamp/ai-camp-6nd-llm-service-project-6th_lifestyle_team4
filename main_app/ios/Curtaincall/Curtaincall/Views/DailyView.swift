import SwiftUI

/// DAILY tab — the discovery screen (PWA bottom-nav "DAILY"). Ports Android
/// `ui/daily/DailyScreen.kt`: notice carousel, New Books, Contextual (mood
/// chips), Trending, Oz Pick, and a recent-bookmark section. Read-only over the
/// existing card set — reuses `fetchCards(limit:500)` + `fetchBookmarkCounts`,
/// no new fetches, no analytics. Korean labels verbatim.
struct DailyView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var allCards: [Card] = []
    @State private var trendingCounts: [Int: Int] = [:]
    @State private var ozCard: Card?
    @State private var notices: [Notice] = []
    @State private var hasLoaded = false
    @State private var fetchFailed = false

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead(onMyPage: { selectedTab = .settings })
            if fetchFailed {
                FetchErrorBanner { Task { await load(force: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 20)
                    DailyNoticeCarousel(notices: notices)
                    if !notices.isEmpty { Spacer().frame(height: 28) }

                    if !allCards.isEmpty {
                        DailyNewBooksSection(cards: allCards)
                        Spacer().frame(height: 36)
                        DailyContextualSection(cards: allCards)
                        Spacer().frame(height: 36)
                        DailyTrendingSection(cards: allCards, bookmarkCounts: trendingCounts) {
                            selectedTab = .archive
                        }
                        if let ozCard {
                            Spacer().frame(height: 36)
                            DailyOzPickSection(card: ozCard, taste: taste)
                        }
                        if let recent = recentBookmark {
                            Spacer().frame(height: 36)
                            DailyRecentSection(card: recent.card, bookmarkedAt: recent.date)
                        }
                    } else if !fetchFailed {
                        Text("Loading⋯")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 80)
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) {
            CardDetailView(card: $0) { selectedTab = .settings }
        }
        .task { await load() }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        // Bookmarks load separately, so recompute the (taste-matched) Oz pick once
        // they arrive — chooseOzPick re-promotes a cached non-personalized pick.
        .onChange(of: bookmarks.bookmarks.map(\.cardId)) { _, _ in
            guard !allCards.isEmpty else { return }
            recomputeOz()
        }
    }

    /// Bookmark-keyword "taste" for Oz personalization.
    private var taste: Set<String> {
        Set(bookmarks.bookmarkCards.flatMap { $0.keywords })
    }

    /// Most recently bookmarked card (다시 만나기).
    private var recentBookmark: (card: Card, date: Date?)? {
        let latest = bookmarks.bookmarks
            .filter { $0.card != nil }
            .max { ($0.createdDate ?? .distantPast) < ($1.createdDate ?? .distantPast) }
        guard let latest, let card = latest.card else { return nil }
        return (card, latest.createdDate)
    }

    private func load(force: Bool = false) async {
        if hasLoaded && !force { return }
        do {
            if allCards.isEmpty {
                allCards = try await Supa.shared.fetchCards()
            }
            fetchFailed = false
            notices = (try? await Supa.shared.fetchNotices()) ?? []
            trendingCounts = (try? await Supa.shared.fetchBookmarkCounts(cardIds: allCards.map(\.cardId))) ?? [:]
            recomputeOz()
            hasLoaded = true
        } catch {
            fetchFailed = true
        }
    }

    private func recomputeOz() {
        ozCard = chooseOzPick(cards: allCards, taste: taste, prefs: prefs, today: Self.todayKey)
    }

    /// yyyy-MM-dd key for the per-day Oz cache (matches Android's LocalDate key).
    private static var todayKey: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: .now)
    }
}
