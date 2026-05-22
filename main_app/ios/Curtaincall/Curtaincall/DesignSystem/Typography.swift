import SwiftUI

private enum FontName {
    static let serif = "NanumMyeongjo"
    static let sansRegular = "Pretendard-Regular"
    static let sansMedium = "Pretendard-Medium"
}

extension Font {
    static func displaySerif(_ size: CGFloat = 32) -> Font {
        .custom(FontName.serif, size: size)
    }
    static func headlineSerif(_ size: CGFloat = 22) -> Font {
        .custom(FontName.serif, size: size)
    }
    static func titleSerif(_ size: CGFloat = 16) -> Font {
        .custom(FontName.serif, size: size)
    }
    static func numericSerif(_ size: CGFloat = 28) -> Font {
        .custom(FontName.serif, size: size)
    }

    static func bodySans(_ size: CGFloat = 15) -> Font {
        .custom(FontName.sansRegular, size: size)
    }
    static func metaSans(_ size: CGFloat = 12) -> Font {
        .custom(FontName.sansRegular, size: size)
    }
    static func uiSans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(weight == .medium ? FontName.sansMedium : FontName.sansRegular, size: size)
    }
}

struct LabelCaps: ViewModifier {
    var color: Color = .walnut
    var size: CGFloat = 11

    func body(content: Content) -> some View {
        content
            .font(.custom(FontName.sansMedium, size: size))
            .textCase(.uppercase)
            .tracking(size * 0.18)
            .foregroundStyle(color)
    }
}

extension View {
    func labelCaps(color: Color = .walnut, size: CGFloat = 11) -> some View {
        modifier(LabelCaps(color: color, size: size))
    }

    func bookLeading(size: CGFloat = 15) -> some View {
        lineSpacing(size * 0.6)
    }
}
