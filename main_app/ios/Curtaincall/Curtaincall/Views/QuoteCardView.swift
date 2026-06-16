import SwiftUI

/// A typeset quote card for sharing — the card's quote in NanumMyeongjo with
/// work attribution on the editorial paper/espresso palette, sized as a portrait
/// card for Messages / Instagram stories. Rasterized via `ImageRenderer` and
/// shared as an image (see `QuoteShareLink`).
///
/// The exported image is **always the light cream/ink palette at a fixed text
/// size** (the renderer pins `colorScheme`/`dynamicTypeSize`), so a shared card
/// looks intentional regardless of the user's dark-mode / Dynamic Type settings.
/// In-app the source view still respects tokens; only the export is pinned.
struct QuoteCardView: View {
    let card: Card

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("DAILY SCRIPT").labelCaps(color: .walnut, size: 10)
                Spacer()
            }

            Spacer(minLength: 36)

            Text("\u{201C}")
                .font(.displaySerif(60))
                .foregroundStyle(Color.sand)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.bottom, -18)

            Text(quote)
                .font(.custom("NanumMyeongjo", size: quoteFontSize))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .lineSpacing(quoteFontSize * 0.5)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)

            Spacer(minLength: 28)

            Rectangle().fill(Color.sand).frame(width: 36, height: 1)
            Spacer().frame(height: 14)

            if !title.isEmpty {
                Text(title)
                    .font(.titleSerif(15))
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !attribution.isEmpty {
                Spacer().frame(height: 6)
                Text(attribution)
                    .labelCaps(color: .walnut, size: 11)
                    .multilineTextAlignment(.center)
            }

            Spacer(minLength: 36)

            // Whisper-subtle wordmark.
            (Text("Daily Script ").foregroundColor(.walnut)
                + Text(".").foregroundColor(.cta))
                .font(.titleSerif(13))
        }
        .padding(.horizontal, 34)
        .padding(.vertical, 40)
        .frame(width: 360)
        .frame(minHeight: 460)
        .background(Color.paper)
    }

    // MARK: - Content

    private var quote: String {
        card.quote
            .replacingOccurrences(of: "**", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var title: String {
        card.work.title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Author · year · format — only the non-empty parts.
    private var attribution: String {
        [card.work.author,
         card.work.releaseYear.map(String.init),
         card.work.format.displayName]
            .compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// Shrink the quote as it gets longer so the card stays balanced.
    private var quoteFontSize: CGFloat {
        switch quote.count {
        case ..<60:   return 30
        case ..<120:  return 26
        case ..<200:  return 22
        default:      return 19
        }
    }
}

// MARK: - Rendering + share

extension QuoteCardView {
    /// Rasterize the card to a shareable image. Pins light appearance + a fixed
    /// Dynamic Type size so every exported card is the same deliberate look.
    @MainActor
    static func shareImage(for card: Card) -> Image? {
        let renderer = ImageRenderer(
            content: QuoteCardView(card: card)
                .environment(\.colorScheme, .light)
                .environment(\.dynamicTypeSize, .large)
        )
        renderer.scale = 3   // @3x — crisp on any device / when re-shared
        guard let ui = renderer.uiImage else { return nil }
        return Image(uiImage: ui)
    }

    static func shareTitle(_ card: Card) -> String {
        let t = card.work.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "명대사" : t
    }

    /// Plain-text fallback if rasterization ever fails.
    static func shareText(_ card: Card) -> String {
        let q = card.quote.replacingOccurrences(of: "**", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let title = card.work.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? "\u{201C}\(q)\u{201D}" : "\u{201C}\(q)\u{201D}\n— \(title)"
    }
}

/// Reusable share entry point — shares the typeset quote-card image (falling back
/// to plain text if rendering fails). The label is the tappable control.
struct QuoteShareLink<Label: View>: View {
    let card: Card
    @ViewBuilder var label: () -> Label

    var body: some View {
        if let image = QuoteCardView.shareImage(for: card) {
            ShareLink(
                item: image,
                preview: SharePreview(QuoteCardView.shareTitle(card), image: image)
            ) { label() }
        } else {
            ShareLink(item: QuoteCardView.shareText(card)) { label() }
        }
    }
}
