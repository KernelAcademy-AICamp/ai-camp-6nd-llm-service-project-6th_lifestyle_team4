import SwiftUI

extension Font {
    static func editorialSerif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

struct LabelCaps: ViewModifier {
    var color: Color = .onSurfaceVariant

    func body(content: Content) -> some View {
        content
            .font(.system(size: 12, weight: .bold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundStyle(color)
    }
}

extension View {
    func labelCaps(color: Color = .onSurfaceVariant) -> some View {
        modifier(LabelCaps(color: color))
    }
}
