import SwiftUI

struct NoteCard: View {
    let card: Card

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .topTrailing) {
                imageBlock
                if let category = card.category, !category.isEmpty {
                    CategoryBadge(code: category)
                        .padding(8)
                }
                authorOverlay
            }
            .aspectRatio(16/10, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .background(Color.latte)

            VStack(alignment: .leading, spacing: 6) {
                Text(card.work.title)
                    .font(.titleSerif(16))
                    .foregroundStyle(.espresso)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let rating = card.rating {
                    StarRating(value: rating, count: card.ratingCount)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .frame(width: 240)
        .background(Color.paper)
        .overlay(
            Rectangle().stroke(Color.latte, lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private var imageBlock: some View {
        if let url = card.imageUrl, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().aspectRatio(contentMode: .fill)
                default:
                    placeholderFill
                }
            }
        } else {
            placeholderFill
        }
    }

    private var placeholderFill: some View {
        ZStack {
            Color.sand.opacity(0.5)
            Text(String(card.work.title.prefix(1)))
                .font(.displaySerif(48))
                .foregroundStyle(.walnut)
        }
    }

    private var authorOverlay: some View {
        VStack {
            Spacer()
            HStack {
                if let author = card.work.author, !author.isEmpty {
                    Text(author)
                        .font(.uiSans(12, weight: .medium))
                        .foregroundStyle(.paper)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.45))
                }
                Spacer()
            }
            .padding(8)
        }
    }
}

#Preview {
    HStack(spacing: 16) {
        NoteCard(card: .sample)
    }
    .padding()
    .background(Color.paper)
}
