import SwiftUI
import UIKit

// Adaptive palette. Light is the original cream/ink editorial look; dark inverts
// paper↔espresso so existing call sites (`.paper` surfaces, `.espresso` ink and
// filled buttons) flip correctly. Driven by the app's preferredColorScheme.
private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

private func adaptive(light: UInt32, dark: UInt32) -> Color {
    Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
    })
}

extension Color {
    static let espresso = adaptive(light: 0x0E0C0A, dark: 0xFAF8F2)
    static let roast = adaptive(light: 0x2C2620, dark: 0xE6DFD1)
    static let walnut = adaptive(light: 0x6B5D4F, dark: 0xB0A290)
    static let paper = adaptive(light: 0xFAF8F2, dark: 0x0E0C0A)
    static let latte = adaptive(light: 0xE8E1D3, dark: 0x2A2620)
    static let sand = adaptive(light: 0xC9B89A, dark: 0x7A6B57)
    static let highlight = adaptive(light: 0xF4C20D, dark: 0xF4C20D)
    static let cta = adaptive(light: 0xD85A30, dark: 0xE0683E)

    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension ShapeStyle where Self == Color {
    static var espresso: Color { .espresso }
    static var roast: Color { .roast }
    static var walnut: Color { .walnut }
    static var paper: Color { .paper }
    static var latte: Color { .latte }
    static var sand: Color { .sand }
    static var highlight: Color { .highlight }
    static var cta: Color { .cta }
}

struct Hairline: View {
    var color: Color = .latte
    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 1)
    }
}
