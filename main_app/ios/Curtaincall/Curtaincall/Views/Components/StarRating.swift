import SwiftUI

struct StarRating: View {
    let value: Double
    let count: Int?

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "star.fill")
                .font(.system(size: 11))
                .foregroundStyle(.highlight)
            Text(String(format: "%.1f", value))
                .font(.uiSans(12, weight: .medium))
                .foregroundStyle(.espresso)
                .monospacedDigit()
            if let count {
                Text("(\(formatted(count)))")
                    .font(.metaSans(12))
                    .foregroundStyle(.walnut)
                    .monospacedDigit()
            }
        }
    }

    private func formatted(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }
}

#Preview {
    VStack(spacing: 12) {
        StarRating(value: 4.6, count: 2643)
        StarRating(value: 3.2, count: nil)
    }
    .padding()
    .background(Color.paper)
}
