import SwiftUI

struct SimpleCardView: View {
    let card: Card

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\u{201C}\(card.quote)\u{201D}")
                .font(.title2)
                .fontWeight(.semibold)
                .fixedSize(horizontal: false, vertical: true)

            KeywordChips(keywords: card.keywords)

            Text(card.work.title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    ScrollView {
        SimpleCardView(card: .sample)
            .padding()
    }
}
