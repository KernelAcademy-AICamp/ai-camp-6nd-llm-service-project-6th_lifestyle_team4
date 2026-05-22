import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    @State private var cards: [Card] = []
    @State private var hasLoaded = false

    private var featured: Card { cards.first ?? .sample }
    private var curated: [Card] { Array(cards.dropFirst().prefix(6)) }
    private var archiveEntries: [Card] { Array(cards.dropFirst(1 + curated.count).prefix(5)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                introBlock

                NavigationLink(value: featured) {
                    TodaysNoteCard(card: featured)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)

                SectionHeader(title: "짧지만 깊은 문장의 미학", action: { selectedTab = .archive })
                curatedCarousel

                SectionHeader(title: "곧 공개될 각본", actionTitle: nil)
                scheduleGrid
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)

                SectionHeader(title: "지난 기록", action: { selectedTab = .archive })
                Hairline()
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
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { CardDetailView(card: $0) }
        .task { await load() }
    }

    private var topBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Daily Script")
                .font(.headlineSerif(24))
                .foregroundStyle(.espresso)
            Spacer()
            Button { selectedTab = .settings } label: {
                Text("마이페이지").labelCaps()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var introBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Self.formattedToday).labelCaps()
            Text("오늘의 각본")
                .font(.displaySerif(34))
                .foregroundStyle(.espresso)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }

    private var curatedCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(curated.isEmpty ? [Card.sample, .sample, .sample] : curated) { card in
                    NavigationLink(value: card) {
                        NoteCard(card: card)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
    }

    private var scheduleGrid: some View {
        let placeholders: [(Date, String)] = [
            (Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now, "내일의 한 줄"),
            (Calendar.current.date(byAdding: .day, value: 2, to: .now) ?? .now, "잔잔한 어느 오후"),
            (Calendar.current.date(byAdding: .day, value: 4, to: .now) ?? .now, "다음 주의 다른 호흡"),
        ]
        return HStack(spacing: 8) {
            ForEach(0..<placeholders.count, id: \.self) { i in
                ScheduleCard(publishAt: placeholders[i].0, title: placeholders[i].1)
            }
        }
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
        }
    }
}

#Preview {
    @Previewable @State var sel: Tab = .home
    return NavigationStack {
        HomeView(selectedTab: $sel)
    }
}
