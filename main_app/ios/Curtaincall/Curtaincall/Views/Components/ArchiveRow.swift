import SwiftUI

struct ArchiveRow: View {
    let card: Card
    let daysAgo: Int

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(dateText).labelCaps()
                Text(card.work.title)
                    .font(.editorialSerif(18, weight: .semibold))
                    .foregroundStyle(.inkBlack)
                if let tagline = card.excerptDescription, !tagline.isEmpty {
                    Text(tagline)
                        .font(.system(size: 13))
                        .foregroundStyle(.onSurfaceVariant)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(.onSurfaceVariant)
                .padding(.top, 4)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 20)
        .contentShape(Rectangle())
    }

    private var dateText: String {
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy.MM.dd"
        return f.string(from: date)
    }
}

#Preview {
    VStack(spacing: 0) {
        ArchiveRow(card: .sample, daysAgo: 1)
        Hairline()
        ArchiveRow(card: .sample, daysAgo: 2)
    }
}
