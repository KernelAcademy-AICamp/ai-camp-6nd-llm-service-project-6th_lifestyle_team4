import SwiftUI

struct ArchiveView: View {
    @Binding var selectedTab: Tab
    @Binding var path: NavigationPath
    /// True when pushed as the Settings 북마크 sub-page — shows a back bar instead
    /// of the app masthead (Android's full-screen ArchiveScreen has a back top bar).
    var asSubPage = false
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var session: AuthSession
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var selectedGenre: WorkFormat?
    @State private var selectedWork: ShelfWork?

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
            if asSubPage {
                subPageBar
            } else {
                AppMasthead()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 24)
                    Text("북마크")   // PWA 북마크 서가 헤더 (index.html:2304)
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    if !bookmarks.bookmarks.isEmpty {
                        Spacer().frame(height: 6)
                        Text("소장 \(allWorks.count)권  ·  명대사 \(bookmarks.bookmarks.count)편").labelCaps()
                    }

                    Spacer().frame(height: 12)
                    genreChips
                    Spacer().frame(height: 10)
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
        .navigationDestination(for: Card.self) { card in
            CardDetailView(card: card) { selectedTab = .settings }
        }
        // Leather "open the book" modal: the tapped spine swings its cover open
        // to reveal the saved quotes, over a scrim that stops above the tab bar
        // so the nav stays live. Tapping a quote closes the book and pushes the
        // card onto the Library stack (so the Library tab can pop back to it).
        .overlay {
            if let work = selectedWork {
                OpenedBookView(
                    work: work,
                    volumeNo: (allWorks.firstIndex { $0.id == work.id } ?? 0) + 1,
                    onOpen: { card in
                        selectedWork = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            path.append(card)
                        }
                    },
                    onClose: { selectedWork = nil }
                )
            }
        }
        .task { await bookmarks.load(userId: session.userId) }
    }

    // 설정에서 push 됐을 때의 상단 바 — 다른 하위 페이지(공지·내 댓글)와 동일한
    // chevron.left 백 버튼. 본문 상단의 큰 "수집한 대본" 타이틀이 제목 역할.
    private var subPageBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, 8)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private var genreChips: some View {
        // PWA renderShelfChips: 사용 가능한 장르만 — "기타" 칩 없음(서가 그룹핑은 유지).
        let available = Set(allWorks.map(\.format))
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { selectedGenre = nil } label: {
                    Chip(text: "All · \(allWorks.count)", filled: selectedGenre == nil)
                }
                .buttonStyle(.plain)
                ForEach(Self.genreOrder.filter { available.contains($0) }, id: \.self) { format in
                    let count = allWorks.filter { $0.format == format }.count
                    Button { selectedGenre = format } label: {
                        Chip(text: "\(format.displayName) · \(count)", filled: selectedGenre == format)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(.walnut)
            TextField("", text: $searchText)
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .overlay(alignment: .leading) {
                    if searchText.isEmpty {
                        Text("작품 제목으로 검색")
                            .font(.bodySans(14))
                            .foregroundStyle(.sand)
                            .allowsHitTesting(false)
                    }
                }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
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
        // PWA bm-empty: bookmark_border + 헤드라인 + 서브라인 (index.html:2317-2320).
        EmptyStateView(icon: "bookmark", iconSize: 48,
                       headline: "아직 보관한 명대사가 없습니다.",
                       subline: "마음에 드는 명대사를 북마크하면 여기에 모입니다.")
    }

    private var noResultState: some View {
        // PWA bm-no-result: search_off + 헤드라인 + 서브라인 (index.html:2322-2325).
        EmptyStateView(icon: "magnifyingglass", iconSize: 42,
                       headline: "검색 결과가 없습니다",
                       subline: "다른 단어로 시도해보세요")
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
            // PWA workGroupKey: series/subtitle/author 만 (format 제외) — 같은 작품이
            // 두 포맷이어도 한 권으로 병합 (m-app.js:2377-2381).
            let key = [
                series.lowercased(),
                subtitle?.lowercased() ?? "",
                work.author?.lowercased() ?? "",
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
                    work: work,
                    rows: []
                )
            }
            grouped[key]?.rows.append(ShelfRow(card: card, createdDate: row.createdDate))
        }
        return grouped.values.sorted {
            let s = $0.series.localizedCompare($1.series)
            if s != .orderedSame { return s == .orderedAscending }
            return $0.title.localizedCompare($1.title) == .orderedAscending
        }
    }
}

/// A "book" on the shelf — a work grouped from its cards. Shared by the bookmark
/// bookshelf (ArchiveView) and the Library catalog (LibraryCatalogView): the
/// bookshelf fills `rows` from bookmarks (with saved dates), the catalog from all
/// cards (no dates). Both feed the same `OpenedBookView`.
struct ShelfWork: Identifiable {
    let id: String
    let series: String
    let subtitle: String?
    let title: String
    let format: WorkFormat
    let author: String?
    let releaseYear: Int?
    /// Representative work — for the catalog cell's `WorkCover` (cover_url).
    let work: Work?
    var rows: [ShelfRow]

    var cards: [Card] { rows.map(\.card) }
}

/// One card in a `ShelfWork`, with an optional saved-date (bookmarks only).
struct ShelfRow: Identifiable {
    let card: Card
    let createdDate: Date?
    var id: Int { card.cardId }
}

private struct GenreShelf: View {
    let format: WorkFormat
    let works: [ShelfWork]
    let onSelect: (ShelfWork) -> Void

    private var tallestSpine: CGFloat {
        works.map { BookSpine.spineHeight(for: $0) }.max() ?? 200
    }

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
            // Size to the tallest spine (Android's spine height grows with the
            // title) plus the top/bottom shelf padding, so nothing clips.
            .frame(height: tallestSpine + 38)
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
                LinearGradient(
                    colors: [
                        Color(hex: palette.back),
                        Color(hex: 0x1B0E06),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                woodBand(height: 16)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.black.opacity(0.28), lineWidth: 0.5)
        )
    }

    private func woodBand(height: CGFloat) -> some View {
        LinearGradient(
            colors: [
                Color(hex: palette.frameLight),
                Color(hex: palette.frame),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: height)
    }
}

/// The gilt ribbon-bookmark glyph stamped at the head of each spine — a
/// rectangle notched into an inverted-V at the bottom (matching Android's
/// `BookmarkGilt` vector), so it reads as a bookmark rather than SF's filled pin.
private struct BookmarkGiltShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - rect.height * 0.32))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

private struct BookSpine: View {
    let work: ShelfWork
    let action: () -> Void

    private var count: Int { work.rows.count }
    private var width: CGFloat { CGFloat(44 + min(20, count * 3)) }
    private var fontSize: CGFloat { Self.spineFontSize(work.title.count) }
    private var height: CGFloat { Self.spineHeight(for: work) }

    /// The title split into words; each word renders as a vertical run of its
    /// glyphs (every glyph, never truncated) with a gap between words — the
    /// same spine layout Android uses.
    private var titleWords: [[String]] {
        work.title
            .split(separator: " ", omittingEmptySubsequences: true)
            .map { $0.map(String.init) }
    }

    /// Android's spine font ramp by full title length.
    static func spineFontSize(_ titleLen: Int) -> CGFloat {
        if titleLen <= 5 { return 16 }
        if titleLen <= 8 { return 14 }
        if titleLen <= 12 { return 12 }
        return 11
    }

    /// Android's spine height: `max(200, 110 + titleLen * (fontSize + 4))`.
    static func spineHeight(for work: ShelfWork) -> CGFloat {
        let titleLen = work.title.count
        let perChar = spineFontSize(titleLen) + 4
        return max(200, 110 + CGFloat(titleLen) * perChar)
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
                        BookmarkGiltShape()
                            .fill(gold)
                            .frame(width: 8, height: 11)
                        Text("\(count)")
                            .font(.headlineSerif(9))
                    }
                    .frame(height: 24)
                    Spacer(minLength: 3)
                    VStack(spacing: 0) {
                        ForEach(Array(titleWords.enumerated()), id: \.offset) { wordIndex, word in
                            if wordIndex > 0 {
                                Spacer().frame(height: fontSize * 0.45)
                            }
                            ForEach(Array(word.enumerated()), id: \.offset) { _, character in
                                Text(character)
                                    .font(.headlineSerif(fontSize))
                                    .fontWeight(.bold)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                                    .frame(width: width - 10, height: fontSize + 4)
                            }
                        }
                    }
                    .frame(maxHeight: .infinity)
                    Spacer(minLength: 3)
                    Text(work.format.displayName.uppercased())
                        .font(.headlineSerif(8))
                        .tracking(1.2)
                        .foregroundStyle(gilt)
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
    private var leatherHex: UInt32 { bookLeatherHex(for: work.title) }
    private var leather: Color { Color(hex: leatherHex) }
    private var leatherShadow: Color { bookLeatherBlend(leatherHex, with: 0x000000, amount: 0.24) }
    private var leatherDeepShadow: Color { bookLeatherBlend(leatherHex, with: 0x000000, amount: 0.30) }
    private var leatherHighlight: Color { bookLeatherBlend(leatherHex, with: 0xFFFFFF, amount: 0.07) }
}

/// Stable per-title leather color (same hash the spines use) so the opened
/// cover matches the book on the shelf. File-scope so `BookSpine` and the
/// opened-book cover share one source of truth.
private func bookLeatherHex(for title: String) -> UInt32 {
    let palette: [UInt32] = [
        0x0E0C0A, 0x5A2A24, 0x2F3A30, 0x293541,
        0x6A4A30, 0x40303B, 0x3A463F, 0x1F2A3A,
        0x4A2B1A, 0x3D2E22, 0x26393B, 0x2E2538,
    ]
    let hash = title.unicodeScalars.reduce(0) { (($0 &* 31) &+ Int($1.value)) & 0x7fffffff }
    return palette[hash % palette.count]
}

private func bookLeatherBlend(_ hex: UInt32, with target: UInt32, amount: Double) -> Color {
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

/// Centered "open the book" modal. A leather cover (matching the shelf spine)
/// swings open on its left hinge to reveal the paged contents underneath, over
/// a dimming scrim that stops above the tab bar so the nav buttons stay live.
/// The swing + haptic are gated on Reduce Motion: with it on, the book is
/// presented already-open (no rotation, no haptic).
struct OpenedBookView: View {
    let work: ShelfWork
    let volumeNo: Int
    let onOpen: (Card) -> Void
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var opened = false
    @State private var hapticTrigger = false

    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width - 48, 440)
            let h = geo.size.height * 0.82
            ZStack {
                Color.black.opacity(opened ? 0.55 : 0)
                    .ignoresSafeArea(edges: .top)
                    .contentShape(Rectangle())
                    .onTapGesture { dismiss() }

                ZStack {
                    // Page-edge thickness peeking out on the right.
                    ForEach(0..<3, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 7)
                            .fill(Color(hex: 0xEFE7D6))
                            .overlay(
                                RoundedRectangle(cornerRadius: 7)
                                    .stroke(Color.black.opacity(0.06), lineWidth: 0.5)
                            )
                            .frame(width: w, height: h)
                            .offset(x: CGFloat(3 * (i + 1)), y: CGFloat(2 * (i + 1)))
                    }

                    BookPage(
                        work: work,
                        volumeNo: volumeNo,
                        onOpen: onOpen,
                        onClose: { dismiss() }
                    )
                    .frame(width: w, height: h)

                    // The cover, swinging open on the left hinge and fading as it
                    // passes edge-on so its back face never shows mirrored text.
                    BookCover(work: work, volumeNo: volumeNo)
                        .frame(width: w, height: h)
                        .rotation3DEffect(
                            .degrees(opened ? -168 : -4),
                            axis: (x: 0, y: 1, z: 0),
                            anchor: .leading,
                            anchorZ: 0,
                            perspective: 0.55
                        )
                        .opacity(opened ? 0 : 1)
                        .shadow(color: .black.opacity(0.45), radius: 14, x: 10, y: 8)
                }
                .frame(width: w, height: h)
                .shadow(color: .black.opacity(0.4), radius: 28, x: 0, y: 16)
                .scaleEffect(opened ? 1 : 0.9)
                .opacity(opened ? 1 : 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: hapticTrigger)
        .onAppear {
            if reduceMotion {
                opened = true
            } else {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.74)) { opened = true }
                hapticTrigger.toggle()
            }
        }
    }

    private func dismiss() {
        guard !reduceMotion else { opened = false; onClose(); return }
        withAnimation(.easeIn(duration: 0.3)) { opened = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { onClose() }
    }
}

/// The leather front cover, embossed with gilt title — same per-title leather
/// color as the shelf spine so the book you tapped is the book that opens.
private struct BookCover: View {
    let work: ShelfWork
    let volumeNo: Int

    private var leatherHex: UInt32 { bookLeatherHex(for: work.title) }
    private var leather: Color { Color(hex: leatherHex) }
    private var gold: Color { Color(hex: 0xE6CC82) }
    private var gilt: Color { Color(hex: 0xC9A24B) }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7)
                .fill(LinearGradient(
                    stops: [
                        .init(color: bookLeatherBlend(leatherHex, with: 0x000000, amount: 0.30), location: 0),
                        .init(color: leather.opacity(0.97), location: 0.12),
                        .init(color: bookLeatherBlend(leatherHex, with: 0xFFFFFF, amount: 0.06), location: 0.5),
                        .init(color: leather.opacity(0.95), location: 0.86),
                        .init(color: bookLeatherBlend(leatherHex, with: 0x000000, amount: 0.34), location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                ))

            // Gilt frame border.
            RoundedRectangle(cornerRadius: 3)
                .stroke(gold.opacity(0.7), lineWidth: 1)
                .padding(16)

            VStack(spacing: 22) {
                Text("DAILY SCRIPT")
                    .font(.custom("Pretendard-Medium", size: 11))
                    .tracking(3.5)
                Rectangle().fill(gilt.opacity(0.7)).frame(width: 40, height: 1)
                Text(work.title)
                    .font(.displaySerif(30))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                if let author = work.author, !author.isEmpty {
                    Text(author.uppercased())
                        .font(.custom("Pretendard-Medium", size: 12))
                        .tracking(2.5)
                }
                Spacer().frame(height: 12)
                Text("VOL. \(volumeNo)")
                    .font(.headlineSerif(15))
            }
            .foregroundStyle(gold)
            .shadow(color: .black.opacity(0.5), radius: 1, x: 0, y: 1)
            .padding(.horizontal, 34)
            .padding(.vertical, 46)
        }
        // Dark hinge band down the left spine edge.
        .overlay(alignment: .leading) {
            LinearGradient(
                colors: [Color.black.opacity(0.42), Color.black.opacity(0.04)],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: 14)
        }
        .clipShape(RoundedRectangle(cornerRadius: 7))
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .stroke(Color.black.opacity(0.3), lineWidth: 0.5)
        )
    }
}

/// The opened page: ruled paper with a leather gutter, the collected quotes,
/// and a close affordance.
private struct BookPage: View {
    let work: ShelfWork
    let volumeNo: Int
    let onOpen: (Card) -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(work.subtitle == nil
                         ? "COLLECTED · VOLUME #\(String(format: "%02d", volumeNo))"
                         : "\(work.series.uppercased()) · VOLUME #\(String(format: "%02d", volumeNo))")
                        .labelCaps(size: 12)
                    Text(work.title)
                        .font(.displaySerif(26))
                        .foregroundStyle(.espresso)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([work.format.displayName.uppercased(), work.author, work.releaseYear.map(String.init)]
                        .compactMap { $0 }
                        .joined(separator: " · "))
                        .labelCaps(size: 12)
                }
                Spacer()
                Button { onClose() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.walnut)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 30)
            .padding(.trailing, 12)
            .padding(.top, 28)
            .padding(.bottom, 20)

            Rectangle().fill(Color.sand).frame(height: 0.5)
                .padding(.leading, 22).padding(.trailing, 6)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(work.rows) { row in
                        let card = row.card
                        Button {
                            onOpen(card)
                        } label: {
                            VStack(alignment: .leading, spacing: 12) {
                                if let date = row.createdDate {
                                    Text(Self.dateText(date)).labelCaps(size: 12)
                                }
                                Text("\"\(card.quote)\"")
                                    .font(.titleSerif(18))
                                    .foregroundStyle(.espresso)
                                    .lineSpacing(3)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let desc = card.excerptDescription, !desc.isEmpty {
                                    Text(desc)
                                        .font(.bodySans(13))
                                        .foregroundStyle(.walnut)
                                        .lineLimit(2)
                                }
                            }
                            .padding(18)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.cardWarm)
                            // Sand left-accent bar + faint hairline border.
                            .overlay(alignment: .leading) {
                                Rectangle().fill(Color.sand).frame(width: 3)
                            }
                            .overlay(Rectangle().stroke(Color.latte, lineWidth: 0.5))
                            // "#cardId" serial, top-right.
                            .overlay(alignment: .topTrailing) {
                                Text("#\(card.cardId)")
                                    .font(.bodySans(9))
                                    .foregroundStyle(.sand)
                                    .padding(.top, 10)
                                    .padding(.trailing, 12)
                            }
                        }
                        .buttonStyle(.plain)
                        .cardContextMenu(card)
                    }
                }
                .padding(.leading, 30)
                .padding(.trailing, 16)
                .padding(.vertical, 20)
            }
        }
        .background {
            ZStack {
                Color.paper
                RuledLinesBackground()
                // Leather gutter binding down the left edge.
                LinearGradient(
                    colors: [
                        bookLeatherBlend(bookLeatherHex(for: work.title), with: 0x000000, amount: 0.2),
                        Color(hex: bookLeatherHex(for: work.title)),
                    ],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 7))
        .overlay(
            RoundedRectangle(cornerRadius: 7).stroke(Color.latte, lineWidth: 0.5)
        )
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }
}

/// Faint horizontal rule lines down the page, like a notebook leaf.
private struct RuledLinesBackground: View {
    var body: some View {
        Canvas { ctx, size in
            let gap: CGFloat = 30
            var y = gap
            while y < size.height {
                var path = Path()
                path.move(to: CGPoint(x: 14, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(path, with: .color(Color.walnut.opacity(0.07)), lineWidth: 0.5)
                y += gap
            }
        }
        .allowsHitTesting(false)
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
