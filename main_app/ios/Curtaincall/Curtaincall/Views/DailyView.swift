import SwiftUI

/// DAILY tab — the discovery screen (PWA bottom-nav "DAILY"). Ports Android
/// `ui/daily/DailyScreen.kt`: notice carousel, New Books, Contextual (mood
/// chips), Trending, and Oz Pick. Read-only over the existing card set — reuses
/// `fetchCards(limit:500)` + `fetchBookmarkCounts`, no new fetches, no analytics.
/// Korean labels verbatim.
struct DailyView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var heroNS

    @State private var allCards: [Card] = []
    @State private var trendingCounts: [Int: Int] = [:]
    @State private var ozCard: Card?
    @State private var notices: [Notice] = []
    @State private var hasLoaded = false
    @State private var fetchFailed = false

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
            if fetchFailed {
                FetchErrorBanner { Task { await load(force: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Android Daily header (DailyScreen.kt:120-137): date · "디스커버리".
                    Spacer().frame(height: 24)
                    Text(Self.dailyDateLabel)
                        .labelCaps()
                    Spacer().frame(height: 8)
                    Text("디스커버리")
                        .font(.displaySerif(34))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 28)
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
                        // Oz Pick — 개인화 카드 또는 게스트(취향 미설정) CTA. 섹션이 분기.
                        Spacer().frame(height: 36)
                        DailyOzPickSection(
                            card: ozCard,
                            prefs: prefs.userPrefs,
                            isAnonymous: session.isAnonymous,
                            nickname: session.nickname,
                            loginId: session.loginId,
                            taste: taste,
                            onRequestPreferences: { prefs.prefSelected = false }
                        )
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
        // Hero morph: inject the surface namespace + per-card owner map to
        // descendant cells (the Daily sections live in DailyDiscovery). nil under
        // Reduce Motion disables it.
        .environment(\.cardHeroNamespace, reduceMotion ? nil : heroNS)
        .environment(\.cardHeroOwner, reduceMotion ? nil : heroOwner)
        .navigationDestination(for: Card.self) {
            CardDetailView(card: $0) { selectedTab = .settings }
                .cardHeroDestination($0.cardId, in: heroNS, enabled: !reduceMotion)
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
        // 취향(테마/장르)이 바뀌면(예: 게스트 CTA로 설정) Oz 픽을 다시 고른다.
        .onChange(of: prefs.prefSelected) { _, _ in
            guard !allCards.isEmpty else { return }
            recomputeOz()
        }
    }

    /// Bookmark-keyword "taste" for Oz personalization.
    private var taste: Set<String> {
        Set(bookmarks.bookmarkCards.flatMap { $0.keywords })
    }

    /// Assigns each card that appears in a *predictable* Daily section to exactly
    /// one owner, by priority (newBooks > trending > oz), so a card shown
    /// in several sections morphs from a single cell. Cards absent from the map are
    /// owned by the interactive Contextual cell (which DailyView can't predict).
    /// Mirrors the sections' own derivations (buildNewBooks / trending score) so the
    /// owner matches what each section actually renders.
    private var heroOwner: [Int: DailyHeroSection] {
        var owner: [Int: DailyHeroSection] = [:]
        for book in buildNewBooks(allCards).prefix(9) where owner[book.representativeCard.cardId] == nil {
            owner[book.representativeCard.cardId] = .newBooks
        }
        for id in trendingTopIDs() where owner[id] == nil {
            owner[id] = .trending
        }
        // Guest Oz shows the CTA (no card), so don't claim ozCard for `.oz`.
        if !ozIsGuest, let id = ozCard?.cardId, owner[id] == nil { owner[id] = .oz }
        return owner
    }

    /// True when the Oz Pick renders the guest CTA (no personalized card).
    private var ozIsGuest: Bool {
        let p = prefs.userPrefs
        let hasActive = !p.genres.isEmpty || (!p.any && !p.themes.isEmpty)
        return session.isAnonymous && !hasActive
    }

    /// Top-3 trending card ids — same equal-weight score + tiebreak as
    /// `DailyTrendingSection` (must stay in sync so hero-owner matches what renders).
    private func trendingTopIDs() -> [Int] {
        allCards
            .filter { !$0.quote.isEmpty }
            .map { (id: $0.cardId,
                    score: (trendingCounts[$0.cardId] ?? 0) + ($0.commentCount ?? 0) + ($0.viewCount ?? 0)) }
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.id > $1.id }
            .prefix(3)
            .map(\.id)
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

    /// "YYYY년 M월 D일 {요일}요일" — Android 날짜 표기(DailyScreen.kt) 형식.
    /// (DailyScreen.kt:859).
    private static var dailyDateLabel: String {
        let cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day, .weekday], from: .now)
        let days = ["일", "월", "화", "수", "목", "금", "토"]   // Calendar weekday: 1 = Sunday
        let weekday = days[((c.weekday ?? 1) - 1) % 7]
        return "\(c.year ?? 0)년 \(c.month ?? 0)월 \(c.day ?? 0)일 \(weekday)요일"
    }
}
