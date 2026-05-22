import SwiftUI

struct ArchiveView: View {
    @State private var cards: [Card] = []
    @State private var hasLoaded = false
    @State private var fetchFailed = false

    var body: some View {
        VStack(spacing: 0) {
            archiveTopBar
            Hairline()
            if fetchFailed {
                FetchErrorBanner { Task { await reload() } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 40)
                    Text("지난 기록")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 32)
                    Hairline()
                    if !cards.isEmpty {
                        ForEach(Array(cards.enumerated()), id: \.element.id) { idx, card in
                            NavigationLink(value: card) {
                                ArchiveRow(card: card, daysAgo: idx + 1)
                            }
                            .buttonStyle(.plain)
                        }
                    } else if !fetchFailed {
                        Text("아직 북마크한 카드가 없습니다.")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 48)
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

    private var archiveTopBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                Text("박").labelCaps(color: .espresso)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private func loadOnce() async {
        if hasLoaded { return }
        await reload()
    }

    private func reload() async {
        do {
            cards = try await SupabaseClient.shared.fetchCards()
            hasLoaded = true
            fetchFailed = false
        } catch {
            fetchFailed = true
        }
    }
}

#Preview {
    NavigationStack { ArchiveView() }
}
