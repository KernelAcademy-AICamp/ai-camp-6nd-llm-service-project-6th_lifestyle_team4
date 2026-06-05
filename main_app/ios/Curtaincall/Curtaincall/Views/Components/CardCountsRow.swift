import SwiftUI

struct CardCountsRow: View {
    let viewCount: Int
    let bookmarkCount: Int

    var body: some View {
        HStack(spacing: 8) {
            Label(Self.format(viewCount), systemImage: "eye")
            Text("·")
            Label(Self.format(bookmarkCount), systemImage: "bookmark")
        }
        .font(.bodySans(12))
        .foregroundStyle(.walnut)
        .labelStyle(.titleAndIcon)
    }

    private static func format(_ value: Int) -> String {
        if value < 1_000 { return "\(value)" }
        let thousands = Double(value) / 1_000
        if thousands >= 10 { return "\(Int(thousands.rounded()))k" }
        let rounded = (thousands * 10).rounded() / 10
        return "\(rounded)k"
    }
}
