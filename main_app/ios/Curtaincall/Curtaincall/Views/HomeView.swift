import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var allCards: [Card] = []
    @State private var todayCard: Card?
    @State private var recent: [Card] = []
    @State private var hasLoaded = false
    @State private var isLoading = false
    @State private var fetchFailed = false

    var body: some View {
        VStack(spacing: 0) {
            homeTopBar
            Hairline()
            if fetchFailed {
                FetchErrorBanner { Task { await reload(deterministic: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 32)
                    Text(Self.formattedToday).labelCaps()
                    Spacer().frame(height: 8)
                    HStack(alignment: .center) {
                        Text("오늘의 명대사")
                            .font(.displaySerif(32))
                            .foregroundStyle(.espresso)
                        Spacer()
                        Button { Task { await reload(deterministic: false) } } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 20, weight: .regular))
                                .foregroundStyle(.walnut)
                                .frame(width: 40, height: 40)
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoading)
                    }
                    Spacer().frame(height: 20)

                    if let card = todayCard {
                        todayCardView(card)
                    } else if isLoading {
                        TodayCardBody(card: nil, isLoading: true)
                    }

                    Spacer().frame(height: 56)
                    Hairline()

                    HStack(alignment: .bottom) {
                        Text("지난 기록")
                            .font(.headlineSerif(22))
                            .foregroundStyle(.espresso)
                        Spacer()
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 12)

                    if !recent.isEmpty {
                        ForEach(recent) { card in
                            NavigationLink(value: card) {
                                ArchiveRow(card: card, daysAgo: 1)
                            }
                            .buttonStyle(.plain)
                        }
                    } else {
                        Text("새로고침하면 이전 카드가 여기에 쌓입니다.")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .padding(.vertical, 16)
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { CardDetailView(card: $0) }
        .task { await loadOnce() }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
    }

    private func todayCardView(_ card: Card) -> some View {
        ZStack(alignment: .topTrailing) {
            NavigationLink(value: card) {
                TodayCardBody(card: card, isLoading: isLoading)
            }
            .buttonStyle(.plain)

            Button {
                Task { await bookmarks.toggle(userId: session.userId, cardId: card.cardId) }
            } label: {
                Image(systemName: bookmarks.isBookmarked(card.cardId) ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(bookmarks.isBookmarked(card.cardId) ? Color.cta : .walnut)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            .padding(.trailing, 8)
        }
    }

    private var homeTopBar: some View {
        HStack(alignment: .center) {
            HStack(spacing: 10) {
                Image(systemName: "book.closed")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                Text("Daily Script")
                    .font(.headlineSerif(22))
                    .foregroundStyle(.espresso)
            }
            Spacer()
            Button { selectedTab = .settings } label: {
                Text("MY PAGE")
                    .labelCaps()
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private static var formattedToday: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy년 M월 d일"
        return f.string(from: .now)
    }

    private func loadOnce() async {
        if hasLoaded { return }
        await reload(deterministic: true)
        hasLoaded = true
    }

    /// deterministic == true → today's seed pick (stable per day).
    /// deterministic == false → random refresh, excluding recently shown.
    private func reload(deterministic: Bool) async {
        isLoading = true
        defer { isLoading = false }
        do {
            if allCards.isEmpty {
                allCards = try await Supa.shared.fetchCards()
            }
            fetchFailed = false
            let pick: Card?
            if deterministic {
                pick = Recommend.pickToday(
                    all: allCards,
                    tasteEnabled: prefs.tasteEnabled,
                    bookmarkCards: bookmarks.bookmarkCards
                )
            } else {
                pick = Recommend.pickRandom(
                    all: allCards,
                    tasteEnabled: prefs.tasteEnabled,
                    bookmarkCards: bookmarks.bookmarkCards,
                    recentIds: prefs.recentlyShown
                )
            }
            if let pick { prefs.rememberShown(pick.cardId) }
            todayCard = pick
            recent = buildRecent()
        } catch {
            fetchFailed = true
        }
    }

    /// 지난 기록 — recently shown cards (newest first), excluding the current one.
    private func buildRecent() -> [Card] {
        let ids = Array(prefs.recentlyShown.dropLast().reversed().prefix(3))
        return ids.compactMap { id in allCards.first { $0.cardId == id } }
    }
}

private struct TodayCardBody: View {
    let card: Card?
    let isLoading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                if let format = card?.work.format.rawValue, !format.isEmpty {
                    Chip(text: format, filled: true)
                }
                if let kw = card?.keywords.first {
                    Chip(text: kw, filled: false)
                }
                Spacer()
            }
            Spacer().frame(height: 28)
            Text(card.map { "\u{201C}\($0.quote)\u{201D}" } ?? (isLoading ? "Loading…" : "—"))
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
                .bookLeading(size: 22)
            Spacer().frame(height: 24)
            Hairline()
            Spacer().frame(height: 12)
            if let keywords = card?.keywords, !keywords.isEmpty {
                HStack(spacing: 12) {
                    ForEach(keywords, id: \.self) { kw in
                        Text("#\(kw)")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                    }
                }
            }
            Spacer().frame(height: 20)
            Text("Read Full Script").editorialButton(style: .filled)
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }
}
