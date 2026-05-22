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

    func body(content: Content) -> some View {
        content
            .labelCaps(color: style == .filled ? .paper : .espresso)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(style == .filled ? Color.espresso : Color.clear)
            )
            .overlay {
                if style == .outlined {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.walnut, lineWidth: 1)
                }
            }
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
