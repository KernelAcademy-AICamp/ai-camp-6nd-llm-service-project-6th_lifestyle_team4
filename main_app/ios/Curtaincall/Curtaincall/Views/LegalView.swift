import SwiftUI

// MARK: - Document model
//
// Mirrors the Android renderer (LegalScreen.kt: DocBlock / DocSection / LegalDoc),
// which itself transcribes /m/terms.html · /m/privacy.html. Kept as a small data
// model so the Terms and Privacy documents share one renderer.

enum DocBlock {
    case para(String)
    case ordered([String])
    case unordered([String])
    case sub(String)
    case table(headers: [String], rows: [[String]])
}

struct DocSection {
    let heading: String
    let blocks: [DocBlock]
}

struct LegalDoc {
    let barTitle: String
    let docTitle: String
    let effectiveDate: String
    let intro: String
    let sections: [DocSection]
    let footer: String
}

// MARK: - Renderer

struct LegalView: View {
    @Environment(\.dismiss) private var dismiss
    let doc: LegalDoc

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 24)
                    Text(doc.docTitle)
                        .font(.headlineSerif(26))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 6)
                    Text(doc.effectiveDate)
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                    Spacer().frame(height: 24)
                    boldRuns(doc.intro, size: 15)
                        .foregroundStyle(.roast)
                        .bookLeading(size: 15)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    ForEach(Array(doc.sections.enumerated()), id: \.offset) { i, section in
                        sectionView(section, isFirst: i == 0)
                    }

                    Spacer().frame(height: 28)
                    Hairline()
                    Spacer().frame(height: 16)
                    Text(doc.footer)
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Spacer()
            Text(doc.barTitle)
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
                .lineLimit(1)
            Spacer()
            // Balances the chevron so the title stays centered.
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    @ViewBuilder
    private func sectionView(_ section: DocSection, isFirst: Bool) -> some View {
        if isFirst {
            Spacer().frame(height: 24)
        } else {
            Spacer().frame(height: 24)
            Hairline()
            Spacer().frame(height: 18)
        }
        Text(section.heading)
            .font(.titleSerif(17))
            .foregroundStyle(.espresso)
            .frame(maxWidth: .infinity, alignment: .leading)
        Spacer().frame(height: 12)
        ForEach(Array(section.blocks.enumerated()), id: \.offset) { _, block in
            blockView(block)
        }
    }

    @ViewBuilder
    private func blockView(_ block: DocBlock) -> some View {
        switch block {
        case .para(let text):
            boldRuns(text, size: 15)
                .foregroundStyle(.roast)
                .bookLeading(size: 15)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer().frame(height: 12)
        case .ordered(let items):
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                markerItem(marker: "\(i + 1).", text: item)
            }
            Spacer().frame(height: 6)
        case .unordered(let items):
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                markerItem(marker: "•", text: item)
            }
            Spacer().frame(height: 6)
        case .sub(let heading):
            Spacer().frame(height: 4)
            Text(heading)
                .font(.uiSans(15, weight: .medium))
                .foregroundStyle(.espresso)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer().frame(height: 8)
        case .table(let headers, let rows):
            docTable(headers: headers, rows: rows)
        }
    }

    private func markerItem(marker: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Text(marker)
                .font(.bodySans(15))
                .foregroundStyle(.roast)
                .frame(width: 22, alignment: .leading)
            boldRuns(text, size: 15)
                .foregroundStyle(.roast)
                .bookLeading(size: 15)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.bottom, 8)
    }

    private func docTable(headers: [String], rows: [[String]]) -> some View {
        VStack(spacing: 0) {
            tableRow(cells: headers, header: true)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                Hairline()
                tableRow(cells: row, header: false)
            }
        }
        .overlay(Rectangle().stroke(Color.latte, lineWidth: 0.5))
        .padding(.bottom, 12)
    }

    private func tableRow(cells: [String], header: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                Text(cell)
                    .font(.bodySans(12))
                    .foregroundStyle(header ? Color.espresso : .roast)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(header ? Color.latte : Color.clear)
    }

    /// Renders Android's bold-only markdown: `**…**` spans become medium-weight
    /// runs (Pretendard-Medium), everything else stays regular. Mirrors
    /// `Markdown.bold()` exactly — no other markdown is interpreted, so stray
    /// punctuation/URLs in the legal copy render verbatim.
    private func boldRuns(_ s: String, size: CGFloat) -> Text {
        s.components(separatedBy: "**").enumerated().reduce(Text("")) { acc, pair in
            let (i, part) = pair
            let font: Font = i % 2 == 1 ? .uiSans(size, weight: .medium) : .bodySans(size)
            return acc + Text(part).font(font)
        }
    }
}

#if DEBUG
#Preview {
    NavigationStack { LegalView(doc: .terms) }
}
#endif
