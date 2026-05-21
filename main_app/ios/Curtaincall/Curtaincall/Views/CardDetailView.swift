import SwiftUI

struct CardDetailView: View {
    let card: Card

    var body: some View {
        Text(card.work.title)
            .font(.editorialSerif(24, weight: .semibold))
            .padding()
    }
}

#Preview {
    NavigationStack { CardDetailView(card: .sample) }
}
