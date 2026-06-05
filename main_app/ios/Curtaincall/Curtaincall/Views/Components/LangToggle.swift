import SwiftUI

/// Compact KR / ENG segmented control for switching a card between the Korean
/// (default) view and its original-language source. Mirrors the PWA's language
/// toggle; styled to the Long Black aesthetic (paper surface, espresso active
/// fill, walnut inactive ink) — no new colors.
///
/// Only render this when the card actually has original-language content
/// (`Card.hasOriginalLanguage`); it carries no affordance of its own for the
/// missing-original case.
struct LangToggle: View {
    @Binding var showOriginal: Bool

    var body: some View {
        HStack(spacing: 0) {
            segment("KR", active: !showOriginal) { showOriginal = false }
            segment("ENG", active: showOriginal) { showOriginal = true }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 7).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.latte, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("언어")
        .accessibilityValue(showOriginal ? "원문" : "한국어")
    }

    private func segment(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Pretendard-Medium", size: 11))
                .tracking(11 * 0.16)
                .foregroundStyle(active ? Color.paper : Color.walnut)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 5)
                        .fill(active ? Color.espresso : Color.clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#if DEBUG
#Preview {
    @Previewable @State var on = false
    return LangToggle(showOriginal: $on)
        .padding(24)
        .background(Color.paper)
}
#endif
