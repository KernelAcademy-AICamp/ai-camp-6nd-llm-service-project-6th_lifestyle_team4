import SwiftUI

struct LongCardView: View {
    let card: Card

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\u{201C}\(card.quote)\u{201D}")
                .font(.title2)
                .fontWeight(.semibold)
                .fixedSize(horizontal: false, vertical: true)

            ScrollView {
                Text(card.scriptExcerpt)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 2)
            }
            .frame(maxHeight: 140)
            .padding(12)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            if let description = card.excerptDescription, !description.isEmpty {
                Text(description)
                    .font(.footnote)
                    .italic()
                    .foregroundStyle(.secondary)
            }

            KeywordChips(keywords: card.keywords)

            HStack(spacing: 20) {
                MeterRow(label: "온도", value: card.temperature, accent: .orange)
                MeterRow(label: "강도", value: card.intensity, accent: .red)
            }

            Divider()

            VStack(alignment: .leading, spacing: 3) {
                Text(card.work.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                workMetaLine
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var workMetaLine: some View {
        HStack(spacing: 6) {
            if let author = card.work.author, !author.isEmpty {
                Text(author)
            }
            if let year = card.work.releaseYear {
                if card.work.author?.isEmpty == false {
                    Text("·")
                }
                Text(String(year))
            }
            if card.work.author?.isEmpty == false || card.work.releaseYear != nil {
                Text("·")
            }
            Text(card.work.format.displayName)
        }
    }
}

private struct MeterRow: View {
    let label: String
    let value: Int
    let accent: Color

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 3) {
                ForEach(1...5, id: \.self) { i in
                    Circle()
                        .fill(i <= value ? accent : Color.secondary.opacity(0.25))
                        .frame(width: 7, height: 7)
                }
            }
        }
    }
}

#Preview {
    ScrollView {
        LongCardView(card: .sample)
            .padding()
    }
}
