import SwiftUI

struct ArchiveView: View {
    @State private var cards: [Card] = []
    @State private var hasLoaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                titleBlock
                Hairline()
                if cards.isEmpty {
                    Text("기록이 없습니다")
                        .labelCaps()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 48)
                } else {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { idx, card in
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
            Text("기록 \(cards.count)개").labelCaps()
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var titleBlock: some View {
        Text("지난 기록")
            .font(.editorialSerif(32, weight: .semibold))
            .foregroundStyle(.inkBlack)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
    }

    private func load() async {
        if hasLoaded { return }
        do {
            cards = try await SupabaseClient.shared.fetchCards()
            hasLoaded = true
        } catch {
            // Silent fallback — keep empty list.
        }
    }
}

#Preview {
    NavigationStack { ArchiveView() }
}
