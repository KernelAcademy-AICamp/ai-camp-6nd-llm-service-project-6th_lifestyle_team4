import SwiftUI

struct ArchiveRow: View {
    let card: Card
    /// When this card was collected/shown, if known. When nil only the format
    /// is shown — we never fabricate a date.
    var date: Date? = nil

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
        let format = card.work.format.displayName
        guard let date else { return format }
        let comps = Calendar.current.dateComponents([.month, .day], from: date)
        let datePart = "\(comps.month ?? 0). \(comps.day ?? 0)"
        return format.isEmpty ? datePart : "\(datePart)  —  \(format)"
    }
}

#Preview {
    VStack(spacing: 0) {
        ArchiveRow(card: .sample, date: .now)
        ArchiveRow(card: .sample)
    }
    .padding(.horizontal, 20)
    .background(Color.paper)
}
