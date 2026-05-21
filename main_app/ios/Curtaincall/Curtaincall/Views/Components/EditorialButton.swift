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
            .labelCaps(color: style == .filled ? .paperWhite : .inkBlack)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(style == .filled ? Color.inkBlack : Color.paperWhite)
            .overlay {
                if style == .outlined {
                    Rectangle().stroke(Color.inkBlack, lineWidth: 1)
                }
            }
    }
}

#Preview {
    VStack(spacing: 16) {
        Text("READ FULL SCRIPT").editorialButton(style: .filled)
        Text("COLLECT SCRIPT ARTIFACT").editorialButton(style: .outlined)
    }
    .padding(24)
}
