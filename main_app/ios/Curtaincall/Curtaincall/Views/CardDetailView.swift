import SwiftUI

struct CardDetailView: View {
    let card: Card
    @Environment(\.dismiss) private var dismiss
    @State private var bookmarked = false

    private var showSignificance: Bool {
        let f = card.work.format.rawValue.lowercased()
        return !(card.significance ?? "").isEmpty && (f == "opera" || f == "play")
    }

    var body: some View {
        VStack(spacing: 0) {
            detailTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .center, spacing: 0) {
                    Spacer().frame(height: 40)
                    metadataChipsRow
                    Spacer().frame(height: 28)

                    if let desc = card.excerptDescription, !desc.isEmpty {
                        Text(desc)
                            .font(.bodySans(16))
                            .foregroundStyle(.walnut)
                            .multilineTextAlignment(.center)
                            .bookLeading(size: 16)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer().frame(height: 24)
                    }

                    Text(card.scriptExcerpt)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundStyle(.espresso)
                        .tracking(0.28)
                        .lineSpacing(8)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if showSignificance, let sig = card.significance {
                        Spacer().frame(height: 32)
                        Hairline()
                        Spacer().frame(height: 24)
                        Text("작품의 의의").labelCaps()
                        Spacer().frame(height: 12)
                        Text(sig)
                            .font(.bodySans(16))
                            .foregroundStyle(.espresso)
                            .bookLeading(size: 16)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer().frame(height: 48)
                    Hairline()
                    Spacer().frame(height: 32)

                    Button { bookmarked.toggle() } label: {
                        Text(bookmarked ? "Collected" : "Collect Script Artifact")
                            .editorialButton(style: .outlined)
                    }
                    .buttonStyle(.plain)

                    Spacer().frame(height: 16)
                    Text("Limited Edition Digital Manuscript #\(String(format: "%04d", card.cardId))")
                        .labelCaps()
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var detailTopBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)

            Spacer()
            VStack(spacing: 2) {
                Text("DAILY SCRIPT").labelCaps()
                Text(card.work.title)
                    .font(.headlineSerif(20))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
            }
            Spacer()

            Button { bookmarked.toggle() } label: {
                Image(systemName: bookmarked ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(bookmarked ? Color.cta : .walnut)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private var metadataChipsRow: some View {
        HStack(spacing: 12) {
            let items: [String] = [
                card.work.format.rawValue.uppercased(),
                card.work.author?.uppercased() ?? "",
                card.work.releaseYear.map(String.init) ?? "",
            ].filter { !$0.isEmpty }
            ForEach(items, id: \.self) { v in
                Text(v).labelCaps()
            }
        }
    }
}

#Preview {
    NavigationStack {
        CardDetailView(card: .sample)
    }
}
