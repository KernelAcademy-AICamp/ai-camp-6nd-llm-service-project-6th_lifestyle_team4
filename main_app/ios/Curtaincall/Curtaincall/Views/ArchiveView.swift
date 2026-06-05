import SwiftUI

struct ArchiveView: View {
    @Binding var selectedTab: Tab
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var session: AuthSession

    @State private var searchText = ""
    @State private var selectedGenre: WorkFormat?
    @State private var selectedWork: ShelfWork?
    @State private var selectedCard: Card?

    private var allWorks: [ShelfWork] {
        Self.group(bookmarks.bookmarks)
    }

    private var filteredWorks: [ShelfWork] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return allWorks.filter { work in
            if let selectedGenre, work.format != selectedGenre { return false }
            guard !query.isEmpty else { return true }
            return work.title.lowercased().contains(query)
                || work.series.lowercased().contains(query)
                || (work.subtitle ?? "").lowercased().contains(query)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            archiveTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 24)
                    Text("수집한 대본")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    if !bookmarks.bookmarks.isEmpty {
                        Spacer().frame(height: 6)
                        Text("소장 \(allWorks.count)권 · 명대사 \(bookmarks.bookmarks.count)편").labelCaps()
                    }

                    Spacer().frame(height: 24)
                    genreChips
                    Spacer().frame(height: 14)
                    searchField
                    Spacer().frame(height: 24)

                    if bookmarks.bookmarks.isEmpty {
                        emptyState
                    } else if filteredWorks.isEmpty {
                        noResultState
                    } else {
                        shelves
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $selectedCard) { card in
            CardDetailView(card: card) { selectedTab = .settings }
        }
        .sheet(item: $selectedWork) { work in
            BookSheet(work: work) { card in
                selectedWork = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                    selectedCard = card
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .task { await bookmarks.load(userId: session.userId) }
    }

    private var archiveTopBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                Text(String(session.nickname.prefix(1)).uppercased().ifEmpty("D"))
                    .labelCaps(color: .espresso)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private var genreChips: some View {
        let available = Set(allWorks.map(\.format))
        return FlowLayout(spacing: 6, lineSpacing: 8) {
            ArchiveFilterChip(
                title: "All · \(allWorks.count)",
                isSelected: selectedGenre == nil
            ) {
                selectedGenre = nil
            }
            ForEach(Self.genreOrder.filter { available.contains($0) }, id: \.self) { format in
                let count = allWorks.filter { $0.format == format }.count
                ArchiveFilterChip(
                    title: "\(format.displayName) · \(count)",
                    isSelected: selectedGenre == format
                ) {
                    selectedGenre = format
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(.walnut)
            TextField("작품 제목으로 검색", text: $searchText)
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Color.paper)
        .overlay(Rectangle().stroke(Color.walnut, lineWidth: 0.5))
    }

    private var shelves: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(Self.genreOrder.filter { genre in filteredWorks.contains { $0.format == genre } }, id: \.self) { genre in
                let works = filteredWorks.filter { $0.format == genre }
                GenreShelf(format: genre, works: works) { work in
                    selectedWork = work
                }
            }

            let other = filteredWorks.filter { !Self.genreOrder.contains($0.format) }
            if !other.isEmpty {
                GenreShelf(format: .unknown, works: other) { work in
                    selectedWork = work
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bookmark")
                .font(.system(size: 54, weight: .regular))
                .foregroundStyle(.sand)
            Text("아직 수집한 대본이 없습니다.")
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Text("오늘의 명대사를 북마크하면 여기에 모입니다.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private var noResultState: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48, weight: .regular))
                .foregroundStyle(.sand)
            Text("검색 결과가 없습니다")
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Text("다른 단어로 시도해보세요")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private static let genreOrder: [WorkFormat] = [
        .movie, .drama, .musical, .opera, .play, .novel, .poem, .essay, .prose
    ]

    private static func group(_ rows: [BookmarkRow]) -> [ShelfWork] {
        var grouped: [String: ShelfWork] = [:]
        for row in rows {
            guard let card = row.card else { continue }
            let work = card.work
            let series = work.title
            let subtitle = work.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = subtitle?.isEmpty == false ? subtitle! : series
            let key = [
                series.lowercased(),
                subtitle?.lowercased() ?? "",
                work.author?.lowercased() ?? "",
                work.format.rawValue,
            ].joined(separator: "__")

            if grouped[key] == nil {
                grouped[key] = ShelfWork(
                    id: key,
                    series: series,
                    subtitle: subtitle?.isEmpty == false ? subtitle : nil,
                    title: title,
                    format: work.format,
                    author: work.author,
                    releaseYear: work.releaseYear,
                    rows: []
                )
            }
            grouped[key]?.rows.append(row)
        }
        return grouped.values.sorted {
            let s = $0.series.localizedCompare($1.series)
            if s != .orderedSame { return s == .orderedAscending }
            return $0.title.localizedCompare($1.title) == .orderedAscending
        }
    }
}

private struct ShelfWork: Identifiable {
    let id: String
    let series: String
    let subtitle: String?
    let title: String
    let format: WorkFormat
    let author: String?
    let releaseYear: Int?
    var rows: [BookmarkRow]

    var cards: [Card] { rows.compactMap(\.card) }
}

private struct ArchiveFilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Pretendard-Medium", size: 11))
                .tracking(1.1)
                .foregroundStyle(isSelected ? Color.paper : Color.walnut)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(isSelected ? Color.espresso : Color.paper)
                .overlay(Rectangle().stroke(isSelected ? Color.espresso : Color.walnut, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }
}

private struct GenreShelf: View {
    let format: WorkFormat
    let works: [ShelfWork]
    let onSelect: (ShelfWork) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(format == .unknown ? "기타" : format.displayName)
                    .font(.titleSerif(18))
                    .foregroundStyle(.espresso)
                Spacer()
                Text("\(works.count) \(works.count == 1 ? "BOOK" : "BOOKS")").labelCaps()
            }
            .padding(.horizontal, 4)

            ZStack(alignment: .bottom) {
                ShelfWood(format: format)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 7) {
                        ForEach(works) { work in
                            BookSpine(work: work) {
                                onSelect(work)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 20)
                    .padding(.bottom, 18)
                }
            }
            .frame(height: 232)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .shadow(color: Color.black.opacity(0.28), radius: 8, x: 0, y: 4)
        }
    }
}

private struct BookshelfPalette {
    let frame: UInt32
    let frameLight: UInt32
    let back: UInt32

    static func palette(for format: WorkFormat) -> BookshelfPalette {
        switch format {
        case .drama:
            return BookshelfPalette(frame: 0x6B4A2A, frameLight: 0x947040, back: 0x3F2A14)
        case .musical:
            return BookshelfPalette(frame: 0x5A2818, frameLight: 0x7E3A28, back: 0x321008)
        case .opera:
            return BookshelfPalette(frame: 0x26180E, frameLight: 0x3F2A1A, back: 0x140A05)
        case .play:
            return BookshelfPalette(frame: 0x3F2818, frameLight: 0x5C3A24, back: 0x241408)
        case .novel:
            return BookshelfPalette(frame: 0x4A4036, frameLight: 0x6B5E50, back: 0x2C2620)
        case .poem:
            return BookshelfPalette(frame: 0x27393B, frameLight: 0x3E585A, back: 0x142021)
        case .essay, .prose:
            return BookshelfPalette(frame: 0x3A4030, frameLight: 0x58604A, back: 0x20241A)
        default:
            return BookshelfPalette(frame: 0x4A2A18, frameLight: 0x6E4A2E, back: 0x2E1D10)
        }
    }
}

private struct ShelfWood: View {
    let format: WorkFormat
    private var palette: BookshelfPalette { .palette(for: format) }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color(hex: palette.frame))
            VStack(spacing: 0) {
                woodBand(height: 14)
                ZStack {
                    LinearGradient(
                        colors: [
                            Color(hex: palette.back),
                            Color(hex: 0x1B0E06),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    LinearGradient(
                        colors: [
                            Color.black.opacity(0.22),
                            Color.black.opacity(0.48),
                            Color.black.opacity(0.58),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    ShelfShadowTexture()
                }
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color(hex: 0xFFEBC0).opacity(0.14))
                        .frame(height: 1)
                        .padding(.horizontal, 10)
                }
                woodBand(height: 16)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.black.opacity(0.28), lineWidth: 0.5)
        )
    }

    private func woodBand(height: CGFloat) -> some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(hex: palette.frameLight),
                    Color(hex: palette.frame),
                    Color(hex: 0x2E180B),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            WoodGrain()
            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color(hex: 0xFFEBC0).opacity(0.18))
                    .frame(height: 0.5)
                Spacer()
                Rectangle()
                    .fill(Color.black.opacity(0.42))
                    .frame(height: 0.5)
            }
        }
        .frame(height: height)
    }
}

private struct BookSpine: View {
    let work: ShelfWork
    let action: () -> Void

    private var count: Int { work.rows.count }
    private var width: CGFloat { CGFloat(36 + min(12, count * 2)) }
    private var height: CGFloat {
        let titleLen = compactTitle.count
        return CGFloat(154 + min(34, titleLen * 3))
    }
    private var compactTitle: String {
        let title = work.title.components(separatedBy: .whitespacesAndNewlines).joined()
        return title.isEmpty ? work.title : title
    }
    private var spineTitleCharacters: [String] {
        let limit = 8
        let visible = compactTitle.prefix(limit).map(String.init)
        return compactTitle.count > limit ? visible + ["…"] : visible
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 2)
                    .fill(
                        LinearGradient(
                            stops: [
                                .init(color: leatherShadow, location: 0),
                                .init(color: leather.opacity(0.96), location: 0.25),
                                .init(color: leatherHighlight, location: 0.56),
                                .init(color: leather.opacity(0.94), location: 0.78),
                                .init(color: leatherDeepShadow, location: 1),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 2)
                            .stroke(Color.black.opacity(0.28), lineWidth: 0.5)
                    )
                    .overlay(edgeTooling)
                VStack {
                    goldBand
                    Spacer()
                    goldBand
                }
                .padding(.vertical, 14)

                VStack(spacing: 5) {
                    VStack(spacing: 1) {
                        Image(systemName: "bookmark.fill")
                            .font(.system(size: 8, weight: .regular))
                        Text("\(count)")
                            .font(.headlineSerif(9))
                    }
                    .frame(height: 24)
                    Spacer(minLength: 3)
                    VStack(spacing: 1) {
                        ForEach(Array(spineTitleCharacters.enumerated()), id: \.offset) { _, character in
                            Text(character)
                                .font(.headlineSerif(10))
                                .fontWeight(.bold)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .frame(width: width - 10, height: 11)
                        }
                    }
                    .frame(maxHeight: .infinity)
                    Spacer(minLength: 3)
                    Text(work.format.displayName.uppercased())
                        .font(.custom("Pretendard-Medium", size: 6.5))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .foregroundStyle(gold)
                .shadow(color: Color.black.opacity(0.52), radius: 0.8, x: 0, y: 1)
                .padding(.horizontal, 5)
                .padding(.top, 26)
                .padding(.bottom, 26)
            }
            .frame(width: width, height: height)
            .clipped()
            .contentShape(Rectangle())
            .shadow(color: Color.black.opacity(0.30), radius: 2, x: 1.5, y: 0)
        }
        .buttonStyle(.plain)
    }

    private var goldBand: some View {
        VStack(spacing: 2) {
            Rectangle()
                .fill(gold.opacity(0.78))
                .frame(height: 1)
            Rectangle()
                .fill(gilt.opacity(0.50))
                .frame(height: 1)
        }
        .padding(.horizontal, 7)
        .frame(height: 4)
    }

    private var edgeTooling: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Color.black.opacity(0.22))
                .frame(width: 2)
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(width: 1)
            Spacer()
            Rectangle()
                .fill(Color.white.opacity(0.07))
                .frame(width: 1)
            Rectangle()
                .fill(Color.black.opacity(0.16))
                .frame(width: 1)
        }
        .padding(.vertical, 2)
    }

    private var gold: Color { Color(hex: 0xE6CC82) }
    private var gilt: Color { Color(hex: 0xC9A24B) }
    private var leatherHex: UInt32 { Self.leatherColor(for: work.title) }
    private var leather: Color { Color(hex: leatherHex) }
    private var leatherShadow: Color { Self.blend(leatherHex, with: 0x000000, amount: 0.24) }
    private var leatherDeepShadow: Color { Self.blend(leatherHex, with: 0x000000, amount: 0.30) }
    private var leatherHighlight: Color { Self.blend(leatherHex, with: 0xFFFFFF, amount: 0.07) }

    private static func leatherColor(for title: String) -> UInt32 {
        let palette: [UInt32] = [
            0x0E0C0A, 0x5A2A24, 0x2F3A30, 0x293541,
            0x6A4A30, 0x40303B, 0x3A463F, 0x1F2A3A,
            0x4A2B1A, 0x3D2E22, 0x26393B, 0x2E2538,
        ]
        let hash = title.unicodeScalars.reduce(0) { (($0 &* 31) &+ Int($1.value)) & 0x7fffffff }
        return palette[hash % palette.count]
    }

    private static func blend(_ hex: UInt32, with target: UInt32, amount: Double) -> Color {
        let clamped = min(1, max(0, amount))
        let r = Double((hex >> 16) & 0xFF)
        let g = Double((hex >> 8) & 0xFF)
        let b = Double(hex & 0xFF)
        let tr = Double((target >> 16) & 0xFF)
        let tg = Double((target >> 8) & 0xFF)
        let tb = Double(target & 0xFF)
        return Color(
            red: (r + (tr - r) * clamped) / 255,
            green: (g + (tg - g) * clamped) / 255,
            blue: (b + (tb - b) * clamped) / 255
        )
    }
}

private struct WoodGrain: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                ForEach(0..<18, id: \.self) { index in
                    Rectangle()
                        .fill(Color.black.opacity(index.isMultiple(of: 3) ? 0.11 : 0.06))
                        .frame(width: index.isMultiple(of: 4) ? 1 : 0.5)
                        .offset(x: proxy.size.width * CGFloat(index) / 17)
                }
            }
        }
        .clipped()
    }
}

private struct ShelfShadowTexture: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color.white.opacity(0.08),
                    Color.clear,
                    Color.black.opacity(0.30),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    ForEach(0..<6, id: \.self) { index in
                        Rectangle()
                            .fill(Color.black.opacity(0.08))
                            .frame(height: 1)
                            .offset(y: proxy.size.height * CGFloat(index + 1) / 7)
                    }
                }
            }
        }
    }
}

private struct BookSheet: View {
    let work: ShelfWork
    let onOpen: (Card) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(work.subtitle == nil ? "Collected · Volume" : "\(work.series.uppercased()) · Volume")
                        .labelCaps()
                    Text(work.title)
                        .font(.displaySerif(30))
                        .foregroundStyle(.espresso)
                    Text([work.format.displayName.uppercased(), work.author, work.releaseYear.map(String.init)]
                        .compactMap { $0 }
                        .joined(separator: " · "))
                        .labelCaps()
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.walnut)
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(.plain)
            }
            .padding(20)

            Hairline()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(work.rows) { row in
                        if let card = row.card {
                            Button {
                                onOpen(card)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    if let date = row.createdDate {
                                        Text(Self.dateText(date)).labelCaps()
                                    }
                                    Text("\"\(card.quote)\"")
                                        .font(.titleSerif(16))
                                        .foregroundStyle(.espresso)
                                        .fixedSize(horizontal: false, vertical: true)
                                    if let desc = card.excerptDescription, !desc.isEmpty {
                                        Text(desc)
                                            .font(.bodySans(12))
                                            .foregroundStyle(.walnut)
                                            .lineLimit(2)
                                    }
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(RoundedRectangle(cornerRadius: 6).fill(Color.paper))
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.latte, lineWidth: 0.5))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text("— Daily Script · Limited Edition —")
                        .labelCaps()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 10)
                }
                .padding(20)
            }
        }
        .background(Color.paper)
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
