import SwiftUI

extension Color {
    static let espresso = Color(hex: 0x0E0C0A)
    static let roast = Color(hex: 0x2C2620)
    static let walnut = Color(hex: 0x6B5D4F)
    static let paper = Color(hex: 0xFAF8F2)
    static let latte = Color(hex: 0xE8E1D3)
    static let sand = Color(hex: 0xC9B89A)
    static let highlight = Color(hex: 0xF4C20D)
    static let cta = Color(hex: 0xD85A30)

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
