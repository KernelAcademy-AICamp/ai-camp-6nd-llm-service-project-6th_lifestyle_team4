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
            .font(.titleSerif(16))
            .foregroundStyle(style == .filled ? Color.paper : Color.espresso)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 20)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(style == .filled ? Color.espresso : Color.paper)
            )
            .overlay {
                if style == .outlined {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.walnut, lineWidth: 0.5)
                }
            }
    }
}

#Preview {
    VStack(spacing: 16) {
        Text("전체 대본 읽기").editorialButton(style: .filled)
        Text("대본 수집하기").editorialButton(style: .outlined)
    }
    .padding(24)
    .background(Color.paper)
}
