import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    @State private var cards: [Card] = []
    @State private var hasLoaded = false

    private var featured: Card { cards.first ?? .sample }
    private var archiveEntries: [Card] { Array(cards.dropFirst().prefix(5)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                introBlock
                FeaturedBlock(card: featured)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                Hairline()
                archiveHeader
                if archiveEntries.isEmpty {
                    Hairline()
                } else {
                    ForEach(Array(archiveEntries.enumerated()), id: \.element.id) { idx, card in
                        NavigationLink(value: card) {
                            ArchiveRow(card: card, daysAgo: idx + 1)
                        }
                        .buttonStyle(.plain)
                        Hairline()
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .background(Color.paperWhite)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { CardDetailView(card: $0) }
        .task { await load() }
    }

    private var topBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Daily Script")
                .font(.editorialSerif(28, weight: .regular))
                .foregroundStyle(.inkBlack)
            Spacer()
            Button { selectedTab = .settings } label: {
                Text("MY PAGE").labelCaps()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var introBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Self.formattedToday).labelCaps()
            Text("오늘의 각본")
                .font(.editorialSerif(32, weight: .semibold))
                .foregroundStyle(.inkBlack)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
    }

    private var archiveHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("지난 기록")
                .font(.editorialSerif(20, weight: .semibold))
                .foregroundStyle(.inkBlack)
            Spacer()
            Button { selectedTab = .archive } label: {
                Text("VIEW ARCHIVE").labelCaps()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
    }

    private static var formattedToday: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy년 M월 d일"
        return f.string(from: .now)
    }

    private func load() async {
        if hasLoaded { return }
        do {
            cards = try await SupabaseClient.shared.fetchCards()
            hasLoaded = true
        } catch {
            // Silent fallback — featured uses Card.sample, archive stays empty.
        }
    }
}

private struct FeaturedBlock: View {
    let card: Card
    @State private var isBookmarked = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .top) {
                if !card.work.genres.isEmpty {
                    FlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(card.work.genres, id: \.self) { Chip(text: $0) }
                    }
                }
                Spacer()
                Button { isBookmarked.toggle() } label: {
                    Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(.inkBlack)
                }
                .buttonStyle(.plain)
            }

            Text("\u{201C}\(card.quote)\u{201D}")
                .font(.editorialSerif(26, weight: .regular))
                .foregroundStyle(.inkBlack)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(4)

            if !card.keywords.isEmpty {
                FlowLayout(spacing: 8, lineSpacing: 8) {
                    ForEach(card.keywords, id: \.self) { Chip(text: $0) }
                }
            }

            NavigationLink(value: card) {
                Text("READ FULL SCRIPT").editorialButton(style: .filled)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct ArchiveRow: View {
    let card: Card
    let daysAgo: Int

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(dateText).labelCaps()
                Text(card.work.title)
                    .font(.editorialSerif(18, weight: .semibold))
                    .foregroundStyle(.inkBlack)
                if let tagline = card.excerptDescription, !tagline.isEmpty {
                    Text(tagline)
                        .font(.system(size: 13))
                        .foregroundStyle(.onSurfaceVariant)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(.onSurfaceVariant)
                .padding(.top, 4)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 20)
        .contentShape(Rectangle())
    }

    private var dateText: String {
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy.MM.dd"
        return f.string(from: date)
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return NavigationStack {
        HomeView(selectedTab: $sel)
    }
}
