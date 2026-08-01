import SwiftUI

/// DAILY tab — the discovery screen (PWA bottom-nav "DAILY"). Ports Android
/// `ui/daily/DailyScreen.kt`: notice carousel, New Books, Contextual (mood
/// chips), Trending, and Oz Pick. Read-only over the existing card set — reuses
/// `fetchCards(limit:500)` + `fetchBookmarkCounts`, no new fetches, no analytics.
/// Korean labels verbatim.
struct DailyView: View {
    @Binding var selectedTab: Tab
    /// 새 책 펼침 모달에서 카드 상세로 push 하기 위한 스택 경로(RootView 소유 dailyPath).
    @Binding var path: NavigationPath
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @EnvironmentObject private var network: NetworkMonitor
    @Environment(\.requestLogin) private var requestLogin   // 로그인 유도 → 루트 인증 모달 직접 호출
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var heroNS

    @State private var allCards: [Card] = []
    @State private var trendingCounts: [Int: Int] = [:]
    @State private var ozCard: Card?
    @State private var hasLoaded = false
    @State private var fetchFailed = false
    /// 새 책 룰렛에서 탭한 작품 — OpenedBookView(책 펼침) 오버레이로 표시.
    @State private var openedWork: DiscoveryWork?

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
            if fetchFailed {
                FetchErrorBanner { Task { await load(force: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // PWA(web_pwa) view-daily 미러: 상단 날짜·"디스커버리" 제목 제거.
                    // 공지 바(DailyNoticeCarousel) 제거 — 날짜는 새 책 카드 안으로 이동(DailyNewBooksSection).
                    Spacer().frame(height: 16)

                    if !allCards.isEmpty {
                        // PWA view-daily 순서: 새 책 → Oz 픽 → 트렌딩.
                        // (Contextual 「이럴 땐, 이런 문장」 섹션은 PWA 에서 제거됨 → iOS 도 제거.)
                        DailyNewBooksSection(cards: allCards) { openedWork = $0 }
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
                        Spacer().frame(height: 36)
                        DailyTrendingSection(cards: allCards, bookmarkCounts: trendingCounts)
                    } else if !fetchFailed {
                        QuietLoadingLabel()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 80)
                    }
                    // 104 = 필 블록 보상 — safeAreaInset 은 TabView 페이지에 전파되지 않아
                    // 40 이면 스크롤 끝이 글래스 필 뒤에 멈춘다(기기 QA, Feed 와 동일 값).
                    Spacer().frame(height: 104)
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
            CardDetailView(card: $0) { requestLogin() }   // 댓글 게이트 → 인증 모달 직접 호출
                .cardHeroDestination($0.cardId, in: heroNS, enabled: !reduceMotion)
        }
        // 새 책 펼침 — Library/Archive 와 동일한 OpenedBookView 모달. 그 작품의 카드를
        // 보여주고, 카드 탭 시 상세로 push(Android OpenedLibraryBook 패리티).
        .overlay {
            if let work = openedWork {
                OpenedBookView(
                    work: shelfWork(work),
                    volumeNo: (buildNewBooks(allCards).firstIndex { $0.id == work.id } ?? 0) + 1,
                    onOpen: { card in
                        openedWork = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { path.append(card) }
                    },
                    onClose: { openedWork = nil }
                )
            }
        }
        .task { await load() }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        // 신원 초기화 — 이전 사용자의 오즈 추천을 즉시 버리고 다시 계산한다. 신호가 '정리 후'에
        // 오므로 recomputeOz 는 이미 비워진 취향·오즈 캐시를 읽어 게스트 기준으로 뽑는다(P1).
        .onChange(of: prefs.identityResetToken) { _, _ in
            ozCard = nil
            recomputeOz()
        }
        // 연결 회복 → 실패로 멈춘 화면의 자기 복구(HomeView 와 동일 패턴 — #200 후속).
        // FEED 는 탭 진입마다 reload 라 자연 회복되지만, 이 화면은 hasLoaded 래치가 있어
        // 신호 없이는 '불러오기 실패' 배너에 영원히 멈춘다. 실패 상태일 때만.
        .onChange(of: network.reconnectToken) { _, _ in
            guard fetchFailed else { return }
            Task { await load(force: true) }
        }
        // Bookmarks load separately, so recompute the (taste-matched) Oz pick once
        // they arrive — chooseOzPick re-promotes a cached non-personalized pick.
        .onChange(of: bookmarks.bookmarks.map(\.cardId)) { _, _ in
            guard !allCards.isEmpty else { return }
            recomputeOz()
        }
        // 취향 **값**이 바뀌면 오즈 픽을 다시 고른다 — 프로필 편집에서 장르/주제를 바꾸고
        // 돌아왔을 때 라벨만 갱신되고 카드는 그대로였던 문제(외부 QA D-17). `prefSelected`
        // 는 편집 시 true→true 라 onChange 가 울리지 않아 신호가 될 수 없다.
        .onChange(of: prefs.prefsRevision) { _, _ in
            guard !allCards.isEmpty else { return }
            ozCard = nil          // 이전 픽을 먼저 버려 새 취향의 결과만 남게 한다
            recomputeOz()
        }
        // 온보딩 진입/이탈(게스트 CTA → 취향 설정)은 값이 아니라 '설정 완료' 여부라 별도 신호로
        // 남긴다. 값까지 바뀐 경우 위 리비전과 둘 다 울리지만 재계산은 메모리 연산이라 무해하다.
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
                allCards = try await CardCache.shared.cards()   // 세션 공유(무료 티어 부하↓)
            }
            fetchFailed = false
            trendingCounts = (try? await Supa.shared.fetchBookmarkCounts(cardIds: allCards.map(\.cardId))) ?? [:]
            recomputeOz()
            hasLoaded = true
        } catch {
            fetchFailed = true
        }
    }

    /// DiscoveryWork → ShelfWork (OpenedBookView 입력). LibraryCatalogModel.groupBooks
    /// 의 필드 매핑과 동일 — 부제 있으면 title=부제, 아니면 작품명.
    private func shelfWork(_ dw: DiscoveryWork) -> ShelfWork {
        let series = dw.work.title
        let subtitle = dw.work.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasSub = (subtitle?.isEmpty == false)
        return ShelfWork(
            id: dw.id,
            series: series,
            subtitle: hasSub ? subtitle : nil,
            title: hasSub ? subtitle! : series,
            format: dw.work.format,
            author: dw.work.author,
            releaseYear: dw.work.releaseYear,
            work: dw.work,
            rows: dw.cards.map { ShelfRow(card: $0, createdDate: nil) }
        )
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
