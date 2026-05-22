import SwiftUI

struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var cards: [Card] = []
    @State private var hasLoaded = false

    private let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16),
    ]

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    intro
                    if cards.isEmpty {
                        Text("아직 저장한 노트가 없어요")
                            .font(.metaSans(12))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 64)
                    } else {
                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(cards) { card in
                                NavigationLink(value: card) {
                                    libraryThumb(card)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 48)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { CardDetailView(card: $0) }
        .task { await load() }
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 32, height: 32, alignment: .leading)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("내 라이브러리").labelCaps(color: .espresso)
            Spacer()
            Color.clear.frame(width: 32, height: 32)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("내 라이브러리")
                .font(.displaySerif(32))
                .foregroundStyle(.espresso)
            Text("읽은 노트는 여기 모아둬요. 언제든 다시 펼쳐 볼 수 있어요.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .bookLeading(size: 14)
        }
        .padding(.bottom, 8)
    }

    private func libraryThumb(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Color.sand.opacity(0.5)
                Text(String(card.work.title.prefix(1)))
                    .font(.displaySerif(48))
                    .foregroundStyle(.walnut)
            }
            .aspectRatio(3/4, contentMode: .fit)
            .frame(maxWidth: .infinity)

            Text(card.work.title)
                .font(.titleSerif(14))
                .foregroundStyle(.espresso)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
    }

    private func load() async {
        if hasLoaded { return }
        do {
            // Placeholder: show all fetched cards as if saved. Will be replaced by real saved-state.
            cards = try await SupabaseClient.shared.fetchCards(limit: 12)
            hasLoaded = true
        } catch {
        }
    }
}

#Preview {
    NavigationStack { LibraryView() }
}
