import SwiftUI

enum EditorialButtonKind {
    case filled
    case outlined
}

extension View {
    /// Static editorial-button visual for a label (no interaction). Use for
    /// decorative call-to-action text. Real `Button`s should use
    /// `.buttonStyle(EditorialButtonStyle(...))`, which adds press feedback
    /// without a gesture (a `DragGesture` here used to eat the Button's tap).
    func editorialButton(style: EditorialButtonKind, pressed: Bool = false) -> some View {
        modifier(EditorialButtonModifier(kind: style, pressed: pressed))
    }
}

/// The editorial button as a proper `ButtonStyle`: same visual as
/// `editorialButton`, plus press feedback driven by `configuration.isPressed`.
/// No gesture is involved, so the Button's own tap is never intercepted.
struct EditorialButtonStyle: ButtonStyle {
    let kind: EditorialButtonKind
    init(_ kind: EditorialButtonKind) { self.kind = kind }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .editorialButton(style: kind, pressed: configuration.isPressed)
    }
}

private struct EditorialButtonModifier: ViewModifier {
    let kind: EditorialButtonKind
    let pressed: Bool

    /// Press feedback in design tokens, matching Android's SharpButton:
    /// filled espresso → roast; outlined picks up a faint espresso wash.
    private var fill: Color {
        switch kind {
        case .filled: return pressed ? .roast : .espresso
        case .outlined: return pressed ? Color.espresso.opacity(0.06) : .clear
        }
    }

    func body(content: Content) -> some View {
        content
            .labelCaps(color: kind == .filled ? .paper : .espresso)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(fill)
            )
            .overlay {
                if kind == .outlined {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.walnut, lineWidth: 1)
                }
            }
            .animation(.easeOut(duration: 0.12), value: pressed)
    }
}

#Preview {
    VStack(spacing: 16) {
        Text("Read Full Script").editorialButton(style: .filled)
        Text("Collect Script Artifact").editorialButton(style: .outlined)
        Button("Tappable") {}.buttonStyle(EditorialButtonStyle(.filled))
    }
    .padding(24)
    .background(Color.paper)
}
