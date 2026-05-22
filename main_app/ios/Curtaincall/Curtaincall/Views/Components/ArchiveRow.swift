import SwiftUI

struct ArchiveRow: View {
    let card: Card
    let daysAgo: Int

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    let meta = metaLine
                    if !meta.isEmpty {
                        Text(meta).labelCaps()
                        Spacer().frame(height: 6)
                    }
                    Text(card.work.title)
                        .font(.titleSerif(16))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 4)
                    Text(card.quote)
                        .font(.bodySans(14))
                        .foregroundStyle(.walnut)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.sand)
            }
            .padding(.vertical, 20)
            .contentShape(Rectangle())
            Hairline()
        }
    }

    private var metaLine: String {
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
        let comps = Calendar.current.dateComponents([.month, .day], from: date)
        let datePart = "\(comps.month ?? 0). \(comps.day ?? 0)"
        let format = card.work.format.rawValue
        return "\(datePart)  —  \(format)"
    }
}

#Preview {
    VStack(spacing: 0) {
        ArchiveRow(card: .sample, daysAgo: 1)
        ArchiveRow(card: .sample, daysAgo: 2)
    }
    .padding(.horizontal, 20)
    .background(Color.paper)
}
