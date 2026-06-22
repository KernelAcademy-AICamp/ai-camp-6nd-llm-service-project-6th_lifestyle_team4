import SwiftUI
import UIKit

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
    static func shareUIImage(for card: Card) -> UIImage? {
        let renderer = ImageRenderer(
            content: QuoteCardView(card: card)
                .environment(\.colorScheme, .light)
                .environment(\.dynamicTypeSize, .large)
        )
        renderer.scale = 3   // @3x — crisp on any device / when re-shared
        return renderer.uiImage
    }

    @MainActor
    static func shareImage(for card: Card) -> Image? {
        shareUIImage(for: card).map { Image(uiImage: $0) }
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

/// UIActivityViewController 래퍼 — `ShareLink` 와 달리 완료 콜백을 제공한다. 공유가
/// **실제로 완료**됐을 때(취소 아님)만 `onComplete(true)` 를 호출해, PWA 처럼 그때
/// 공유 카운트를 올린다. 공유 콘텐츠는 QuoteShareLink 와 동일(이미지→텍스트 폴백).
struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    let onComplete: (_ completed: Bool) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.completionWithItemsHandler = { _, completed, _, _ in onComplete(completed) }
        return vc
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}

    /// 공유 아이템 — 타이포 카드 이미지(렌더 실패 시 텍스트 폴백).
    @MainActor
    static func items(for card: Card) -> [Any] {
        QuoteCardView.shareUIImage(for: card).map { [$0] } ?? [QuoteCardView.shareText(card)]
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
