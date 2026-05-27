import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    @State private var cards: [Card] = []
    @State private var hasLoaded = false
    @State private var isLoading = false
    @State private var fetchFailed = false

    private var todayCard: Card? { cards.first }
    private var archive: [Card] { Array(cards.dropFirst().prefix(5)) }

    var body: some View {
        VStack(spacing: 0) {
            homeTopBar
            Hairline()
            if fetchFailed {
                FetchErrorBanner { Task { await reload() } }
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
                        Button { Task { await reload() } } label: {
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
                        NavigationLink(value: card) {
                            TodayCardView(card: card, isLoading: isLoading)
                        }
                        .buttonStyle(.plain)
                    } else if isLoading {
                        TodayCardView(card: nil, isLoading: true)
                    }
                    // On fetch failure with no cached card, render nothing —
                    // the banner above carries the message.

                    Spacer().frame(height: 56)
                    Hairline()

                    HStack(alignment: .bottom) {
                        Text("지난 기록")
                            .font(.headlineSerif(22))
                            .foregroundStyle(.espresso)
                        Spacer()
                        Text("VIEW ARCHIVE")
                            .labelCaps()
                            .padding(.bottom, 4)
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 12)

                    if !archive.isEmpty {
                        ForEach(Array(archive.enumerated()), id: \.element.id) { idx, card in
                            NavigationLink(value: card) {
                                ArchiveRow(card: card, daysAgo: idx + 1)
                            }
                            .buttonStyle(.plain)
                        }
                    } else if !fetchFailed {
                        Text("아직 북마크한 카드가 없습니다.")
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
        await reload()
        hasLoaded = true
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            cards = try await SupabaseClient.shared.fetchCards()
            fetchFailed = false
        } catch {
            fetchFailed = true
        }
    }
}

private struct TodayCardView: View {
    let card: Card?
    let isLoading: Bool
    @State private var bookmarked = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center) {
                    HStack(spacing: 8) {
                        if let format = card?.work.format.rawValue, !format.isEmpty {
                            Chip(text: format, filled: true)
                        }
                        if let kw = card?.keywords.first {
                            Chip(text: kw, filled: false)
                        }
                    }
                    Spacer()
                    Image(systemName: bookmarked ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 22, weight: .regular))
                        .foregroundStyle(bookmarked ? Color.cta : .walnut)
                        .onTapGesture { bookmarked.toggle() }
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
        .background(
            RoundedRectangle(cornerRadius: 8).fill(Color.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5)
        )
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return NavigationStack {
        HomeView(selectedTab: $sel)
    }
}
