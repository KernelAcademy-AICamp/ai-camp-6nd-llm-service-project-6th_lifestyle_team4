import SwiftUI

extension Color {
    static let paperWhite = Color(hex: 0xFFFFFF)
    static let inkBlack = Color(hex: 0x1A1A1A)
    static let onSurfaceVariant = Color(hex: 0x444748)
    static let signatureOrange = Color(hex: 0xFF5126)
    static let borderSubtle = Color(hex: 0xE2E2E4)
    static let surfaceMuted = Color(hex: 0xF5F5F5)

    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension ShapeStyle where Self == Color {
    static var paperWhite: Color { .paperWhite }
    static var inkBlack: Color { .inkBlack }
    static var onSurfaceVariant: Color { .onSurfaceVariant }
    static var signatureOrange: Color { .signatureOrange }
    static var borderSubtle: Color { .borderSubtle }
    static var surfaceMuted: Color { .surfaceMuted }
}

struct Hairline: View {
    var color: Color = .borderSubtle
    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 1)
    }
}
