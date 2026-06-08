import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore

    @State private var allCards: [Card] = []
    @State private var todayCard: Card?
    @State private var todayShowOriginal = false
    @State private var recent: [Card] = []
    @State private var hasLoaded = false
    @State private var isLoading = false
    @State private var fetchFailed = false
    @State private var showAccountPrompt = false
    @State private var latestNotice: Notice?
    @State private var bookmarkCounts: [Int: Int] = [:]

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead(onMyPage: { selectedTab = .settings })
            if fetchFailed {
                FetchErrorBanner { Task { await reload(deterministic: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 32)
                    if let latestNotice {
                        NoticeBanner(notice: latestNotice) { selectedTab = .notice }
                        Spacer().frame(height: 24)
                    }
                    Text(Self.formattedToday)
                        .labelCaps()
                        .frame(maxWidth: .infinity)
                    Spacer().frame(height: 8)
                    ZStack(alignment: .trailing) {
                        Text("오늘의 명대사")
                            .font(.displaySerif(28))
                            .foregroundStyle(.espresso)
                            .frame(maxWidth: .infinity)
                        Button { Task { await reload(deterministic: false) } } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 18, weight: .regular))
                                .foregroundStyle(.walnut)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.paper))
                                .overlay(Circle().stroke(Color.latte, lineWidth: 0.5))
                                .shadow(color: Color.black.opacity(0.12), radius: 3, x: 0, y: 2)
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoading)
                    }
                    Spacer().frame(height: 20)

                    if let card = todayCard {
                        if card.hasHomeOriginalLanguage {
                            HStack {
                                Spacer()
                                LangToggle(showOriginal: $todayShowOriginal)
                            }
                            .padding(.bottom, 12)
                        }
                        todayCardView(card)
                    } else if isLoading {
                        TodayCardBody(card: nil, isLoading: true, bookmarkCount: 0, showOriginal: false)
                    }

                    Spacer().frame(height: 56)
                    Hairline()

                    HStack(alignment: .bottom) {
                        Text("지난 기록")
                            .font(.headlineSerif(22))
                            .foregroundStyle(.espresso)
                        Spacer()
                        Button { selectedTab = .archive } label: {
                            Text("VIEW LIBRARY").labelCaps()
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 12)

                    if !recent.isEmpty {
                        ForEach(recent) { card in
                            NavigationLink(value: card) {
                                ArchiveRow(card: card)
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
        .navigationDestination(for: Card.self) {
            CardDetailView(card: $0) {
                showAccountPrompt = false
                selectedTab = .settings
            }
        }
        .task { await loadOnce() }
        .task { await loadLatestNotice() }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        .overlay {
            if showAccountPrompt {
                AccountRequiredPrompt {
                    showAccountPrompt = false
                    selectedTab = .settings
                } onClose: {
                    showAccountPrompt = false
                }
            }
        }
    }

    private func todayCardView(_ card: Card) -> some View {
        ZStack(alignment: .topTrailing) {
            NavigationLink(value: card) {
                TodayCardBody(
                    card: card,
                    isLoading: isLoading,
                    bookmarkCount: bookmarkCounts[card.cardId] ?? 0,
                    showOriginal: todayShowOriginal
                )
            }
            .buttonStyle(.plain)

            Button {
                toggleBookmark(cardId: card.cardId)
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
            todayShowOriginal = false  // 새 카드는 항상 한국어부터 (PWA와 동일)
            recent = buildRecent()
            await refreshBookmarkCounts(for: [pick].compactMap { $0 } + recent)
        } catch {
            fetchFailed = true
        }
    }

    private func toggleBookmark(cardId: Int) {
        guard !session.isAnonymous else {
            showAccountPrompt = true
            return
        }
        Task {
            await bookmarks.toggle(userId: session.userId, cardId: cardId)
            await refreshBookmarkCounts(for: [todayCard].compactMap { $0 } + recent)
        }
    }

    private func refreshBookmarkCounts(for cards: [Card]) async {
        let ids = Array(Set(cards.map(\.cardId)))
        guard !ids.isEmpty else {
            bookmarkCounts = [:]
            return
        }
        do {
            bookmarkCounts = try await Supa.shared.fetchBookmarkCounts(cardIds: ids)
        } catch {
            // Keep counts cosmetic; failures should not block reading.
        }
    }

    private func loadLatestNotice() async {
        do {
            latestNotice = try await Supa.shared.fetchLatestNotice()
        } catch {
            latestNotice = nil
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
    let bookmarkCount: Int
    let showOriginal: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                if let format = card?.work.format.label(original: showOriginal), !format.isEmpty {
                    Chip(text: format, filled: true)
                }
                if let kw = card?.displayKeywords(original: showOriginal).first {
                    Chip(text: kw, filled: false)
                }
                if let card {
                    CardCountsRow(viewCount: card.viewCount ?? 0, bookmarkCount: bookmarkCount)
                        .padding(.leading, 4)
                }
                Spacer()
            }
            Spacer().frame(height: 20)
            if let speaker {
                Text(speaker)
                    .font(.bodySans(17))
                    .fontWeight(.bold)
                    .foregroundStyle(.espresso)
                Spacer().frame(height: 12)
            }
            Text(card.map { "\u{201C}\($0.displayQuote(original: showOriginal))\u{201D}" } ?? (isLoading ? "Loading…" : "—"))
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
                .bookLeading(size: 22)
            if let workLine {
                Spacer().frame(height: 20)
                Text(workLine)
                    .font(.bodySans(16))
                    .foregroundStyle(.walnut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer().frame(height: 24)
            Hairline()
            Spacer().frame(height: 12)
            if let keywords = card?.displayKeywords(original: showOriginal), !keywords.isEmpty {
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

    /// Speaker is derived from the displayed script by matching `work.characters`.
    /// In the ENG view the script is English while characters are Korean names,
    /// so no match is found and the speaker line is simply hidden (never wrong,
    /// never blank content).
    private var speaker: String? {
        guard let card else { return nil }
        let names = card.work.characters
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !names.isEmpty else { return nil }
        for line in card.displayScript(original: showOriginal).components(separatedBy: .newlines).prefix(6) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            let head = trimmed.components(separatedBy: CharacterSet(charactersIn: ":：(")).first ?? trimmed
            if names.contains(head) { return head }
        }
        return nil
    }

    private var workLine: String? {
        guard let card else { return nil }
        let displayTitle = card.work.displayTitle(original: showOriginal)
        let displaySubtitle = card.work.displaySubtitle(original: showOriginal)
        let title = displaySubtitle?.isEmpty == false
            ? "<\(displayTitle)> \(displaySubtitle!)"
            : "<\(displayTitle)>"
        let format = card.work.format.label(original: showOriginal)
        return format.isEmpty ? "— \(title)" : "— \(format) \(title)"
    }
}

private struct NoticeBanner: View {
    let notice: Notice
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(notice.tag.uppercased()).labelCaps(color: .cta)
                    Text(notice.title)
                        .font(.titleSerif(17))
                        .foregroundStyle(.espresso)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(notice.body)
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                        .lineLimit(2)
                        .bookLeading(size: 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.sand)
                    .padding(.top, 2)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PressableCardStyle())
    }
}

/// Subtle press feedback for tappable cards — a faint espresso wash on press,
/// in design tokens (matches the EditorialButton press treatment).
private struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay {
                if configuration.isPressed {
                    RoundedRectangle(cornerRadius: 8).fill(Color.espresso.opacity(0.06))
                }
            }
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
