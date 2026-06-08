import SwiftUI

enum EditorialButtonStyle {
    case filled
    case outlined
}

extension View {
    func editorialButton(style: EditorialButtonStyle) -> some View {
        modifier(EditorialButtonModifier(style: style))
    }
}

private struct EditorialButtonModifier: ViewModifier {
    let style: EditorialButtonStyle
    @State private var isPressed = false

    /// Press feedback in design tokens, matching Android's SharpButton:
    /// filled espresso → roast; outlined picks up a faint espresso wash.
    private var fill: Color {
        switch style {
        case .filled: return isPressed ? .roast : .espresso
        case .outlined: return isPressed ? Color.espresso.opacity(0.06) : .clear
        }
    }

    func body(content: Content) -> some View {
        content
            .labelCaps(color: style == .filled ? .paper : .espresso)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(fill)
            )
            .overlay {
                if style == .outlined {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.walnut, lineWidth: 1)
                }
            }
            .animation(.easeOut(duration: 0.12), value: isPressed)
            // Track touch-down/up without consuming the enclosing Button's tap.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in if !isPressed { isPressed = true } }
                    .onEnded { _ in isPressed = false }
            )
    }
}

#Preview {
    VStack(spacing: 16) {
        Text("Read Full Script").editorialButton(style: .filled)
        Text("Collect Script Artifact").editorialButton(style: .outlined)
    }
    .padding(24)
    .background(Color.paper)
}
