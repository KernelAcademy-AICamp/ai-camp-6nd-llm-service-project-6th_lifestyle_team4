import SwiftUI

struct CardDetailView: View {
    let card: Card
    @Environment(\.dismiss) private var dismiss
    @State private var isBookmarked = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(card.work.title)
                        .font(.editorialSerif(34, weight: .semibold))
                        .foregroundStyle(.inkBlack)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    metadataStrip

                    Text(card.scriptExcerpt)
                        .font(.system(.callout, design: .monospaced))
                        .foregroundStyle(.inkBlack)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button(action: {}) {
                        Text("COLLECT SCRIPT ARTIFACT").editorialButton(style: .outlined)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)

                    Text("LIMITED EDITION DIGITAL MANUSCRIPT #\(String(format: "%04d", card.cardId))")
                        .labelCaps()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
                .padding(.bottom, 48)
            }
        }
        .background(Color.paperWhite)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.inkBlack)
                    .frame(width: 32, height: 32, alignment: .leading)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("DAILY SCRIPT").labelCaps()
            Spacer()
            Button { isBookmarked.toggle() } label: {
                Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.inkBlack)
                    .frame(width: 32, height: 32, alignment: .trailing)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
    }

    private var metadataStrip: some View {
        HStack(spacing: 18) {
            Text("SCENE \(card.cardId)").labelCaps().underline()
            Text(card.work.format.rawValue.uppercased()).labelCaps().underline()
            if let year = card.work.releaseYear {
                Text(String(year)).labelCaps().underline()
            }
            Spacer()
        }
    }
}

#Preview {
    NavigationStack {
        CardDetailView(card: .sample)
    }
}
