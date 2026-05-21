import SwiftUI

enum CardVariant: String, CaseIterable, Identifiable {
    case long
    case simple

    var id: String { rawValue }

    var label: String {
        switch self {
        case .long: return "긴 카드"
        case .simple: return "짧은 카드"
        }
    }
}

struct CardFeedView: View {
    @State private var cards: [Card] = []
    @State private var isLoading = false
    @State private var loadError: String?
    @State private var variant: CardVariant = .long

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Curtaincall")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Picker("표시 모드", selection: $variant) {
                            ForEach(CardVariant.allCases) { v in
                                Text(v.label).tag(v)
                            }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 170)
                    }
                }
                .task { await load() }
                .refreshable { await load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && cards.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let loadError, cards.isEmpty {
            ContentUnavailableView {
                Label("불러오기 실패", systemImage: "exclamationmark.triangle")
            } description: {
                Text(loadError)
            } actions: {
                Button("다시 시도") {
                    Task { await load() }
                }
            }
        } else if cards.isEmpty {
            ContentUnavailableView(
                "카드가 없습니다",
                systemImage: "rectangle.stack",
                description: Text("아직 등록된 카드가 없습니다.")
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(cards) { card in
                        switch variant {
                        case .long:
                            LongCardView(card: card)
                        case .simple:
                            SimpleCardView(card: card)
                        }
                    }
                }
                .padding()
            }
        }
    }

    private func load() async {
        if isLoading { return }
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            cards = try await SupabaseClient.shared.fetchCards()
        } catch {
            loadError = error.localizedDescription
        }
    }
}

#Preview {
    CardFeedView()
}
