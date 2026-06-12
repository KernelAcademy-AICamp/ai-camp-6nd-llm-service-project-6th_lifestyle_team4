import SwiftUI
import UIKit

/// Read-only, drag-selectable script text for highlight creation.
///
/// SwiftUI `Text` exposes no selectable range, so the script is rendered in a
/// `UITextView` — but tamed so it reads as editorial, not a raw text field:
///   • selection is tinted highlight-yellow (Android `HighlightSelectionColors`
///     / PWA `.hl-rect`), not the system blue,
///   • the system Copy / Select-all edit menu is suppressed,
///   • the selected substring is reported up so `CardDetailView` floats its own
///     coral "하이라이트 추가" pill instead of OS chrome.
/// The monospaced + speaker-bold script is rendered via `NSAttributedString`
/// over a clear (paper) background; height self-sizes inside the SwiftUI scroll.
struct SelectableScriptText: UIViewRepresentable {
    let attributed: NSAttributedString
    @Binding var selection: String

    // Highlight yellow (Android HighlightSelectionColors / PWA .hl-rect F4C20D).
    static let highlightYellow = UIColor(red: 0xF4 / 255, green: 0xC2 / 255, blue: 0x0D / 255, alpha: 1)

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let tv = HighlightTextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false                 // self-size within the SwiftUI ScrollView
        tv.backgroundColor = .clear
        // No extra horizontal inset/padding — CardDetailView already pads the
        // column. The default lineFragmentPadding (5) + textContainerInset
        // (8,0) are what shift/clip the text, so zero them out explicitly.
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        // Wrap to the view's width instead of growing to the intrinsic line width.
        tv.textContainer.widthTracksTextView = true
        tv.textContainer.lineBreakMode = .byWordWrapping
        tv.tintColor = Self.highlightYellow         // selection fill + grab handles
        tv.delegate = context.coordinator
        // Don't let the long monospaced lines force an over-wide intrinsic width;
        // width comes from the SwiftUI proposal via sizeThatFits below.
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        tv.setContentHuggingPriority(.defaultLow, for: .horizontal)
        tv.attributedText = attributed
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        // Language toggle (KR↔ENG) rebuilds the attributed text.
        if !tv.attributedText.isEqual(to: attributed) {
            tv.attributedText = attributed
        }
        // Collapse the live selection when SwiftUI clears it (after save/cancel).
        if selection.isEmpty, let r = tv.selectedTextRange, !r.isEmpty {
            tv.selectedTextRange = nil
        }
    }

    /// Pin the width to the SwiftUI-proposed container width (so text wraps
    /// inside it rather than overflowing at its intrinsic line width), and
    /// report the wrapped height for that width.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0, width.isFinite else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        private let parent: SelectableScriptText
        init(_ parent: SelectableScriptText) { self.parent = parent }

        func textViewDidChangeSelection(_ textView: UITextView) {
            let text: String
            if let r = textView.selectedTextRange, !r.isEmpty {
                text = textView.text(in: r) ?? ""
            } else {
                text = ""
            }
            // Don't mutate SwiftUI state during the view-update pass.
            DispatchQueue.main.async {
                if self.parent.selection != text { self.parent.selection = text }
            }
        }

        // iOS 16+: return an empty menu → no Copy/Select-all popover over the script.
        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            UIMenu(children: [])
        }
    }
}

/// UITextView that refuses every editing-menu action — belt-and-suspenders with
/// the delegate's empty `editMenu`, also covering the pre-iOS-16 callout path.
/// Selection gestures still work (they don't route through `canPerformAction`).
private final class HighlightTextView: UITextView {
    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool { false }
}
