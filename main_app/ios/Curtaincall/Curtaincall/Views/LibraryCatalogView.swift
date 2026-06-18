import Combine
import SwiftUI

/// 도서 카탈로그 — Library 탭. 전체 작품(카드가 있는 작품)을 4열 그리드로 보여준다.
/// Android `LibraryScreen`/`LibraryViewModel` 미러: 데이터 소스는 별도 `works`
/// 쿼리가 아니라 `cards`(+nested works, limit 500)를 받아 작품 단위로 묶고
/// (Android `fetchAllCards` + `buildBooks`), 정렬·필터·페이지네이션은 모두
/// 클라이언트에서 처리한다. 로그인 없이(익명) 접근 가능 — Android + P0-6 동일.
struct LibraryCatalogView: View {
    @Binding var selectedTab: Tab
    @Binding var path: NavigationPath

    @StateObject private var model = LibraryCatalogModel()
    @State private var sort: CatalogSort = .alpha
    @State private var selectedGenre: WorkFormat?
    @State private var searchText = ""
    @State private var page = 0
    @State private var selectedWork: ShelfWork?
    @State private var contentWidth: CGFloat = 0

    /// Android `LibrarySort`: 가나다순(기본) / 최신등록순.
    enum CatalogSort {
        case alpha, latest
        var label: String { self == .alpha ? "가나다순" : "최신등록순" }
    }

    private static let pageSize = 12          // 4열 × 3행 (Android LibraryPageSize)
    private static let genreOrder: [WorkFormat] = [
        .movie, .drama, .musical, .opera, .play, .novel, .poem, .essay, .prose,
    ]

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead(onMyPage: { selectedTab = .settings })
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 24)
                    Text("도서 카탈로그")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)

                    if model.books.isEmpty {
                        Spacer().frame(height: 24)
                        loadOrEmptyState
                    } else {
                        Spacer().frame(height: 6)
                        metaRow
                        Spacer().frame(height: 12)
                        genreChips
                        Spacer().frame(height: 10)
                        searchField
                        Spacer().frame(height: 20)
                        if filteredBooks.isEmpty {
                            noResultState
                        } else {
                            grid
                            if pageCount > 1 {
                                Spacer().frame(height: 24)
                                pageBar
                            }
                        }
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: CatalogWidthKey.self, value: geo.size.width)
                    }
                )
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .onPreferenceChange(CatalogWidthKey.self) { contentWidth = $0 }
        .onChange(of: searchText) { _, _ in page = 0 }
        .navigationDestination(for: Card.self) { card in
            CardDetailView(card: card) { selectedTab = .settings }
        }
        // 책 탭 → ArchiveView 와 동일한 OpenedBookView 가 펼쳐지며 그 작품의 카드를
        // 보여주고, 카드 탭 시 상세로 push(서가와 같은 동작).
        .overlay {
            if let work = selectedWork {
                OpenedBookView(
                    work: work,
                    volumeNo: (filteredBooks.firstIndex { $0.id == work.id } ?? 0) + 1,
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
        .task { await model.load() }
    }

    // MARK: - Derived data

    private var totalCards: Int { model.books.reduce(0) { $0 + $1.cards.count } }

    private var filteredBooks: [ShelfWork] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let base = model.books.filter { b in
            if let selectedGenre {
                if selectedGenre == .unknown {
                    if Self.genreOrder.contains(b.format) { return false }
                } else if b.format != selectedGenre {
                    return false
                }
            }
            guard !q.isEmpty else { return true }
            return b.series.lowercased().contains(q)
                || (b.subtitle ?? "").lowercased().contains(q)
                || (b.author ?? "").lowercased().contains(q)
        }
        switch sort {
        case .alpha:
            return base.sorted { displayTitle($0).localizedStandardCompare(displayTitle($1)) == .orderedAscending }
        case .latest:
            return base.sorted { ($0.cards.map(\.cardId).max() ?? 0) > ($1.cards.map(\.cardId).max() ?? 0) }
        }
    }

    private var pageCount: Int {
        max(1, (filteredBooks.count + Self.pageSize - 1) / Self.pageSize)
    }
    private var effectivePage: Int { min(max(0, page), pageCount - 1) }
    private var pageBooks: [ShelfWork] {
        Array(filteredBooks.dropFirst(effectivePage * Self.pageSize).prefix(Self.pageSize))
    }

    private var cellWidth: CGFloat {
        // contentWidth = 패딩 포함 콘텐츠 폭. 안쪽 = -40(좌우 20), 열 간격 12×3 = 36.
        let inner = contentWidth - 40 - 36
        return inner > 0 ? inner / 4 : 74
    }

    private func displayTitle(_ b: ShelfWork) -> String {
        if let s = b.subtitle, !s.isEmpty { return "\(b.series) \(s)" }
        return b.series
    }

    // MARK: - Header / meta

    private var metaRow: some View {
        HStack(alignment: .center) {
            Text("작품 \(model.books.count)권  ·  명대사 \(totalCards)편").labelCaps()
            Spacer()
            Button {
                sort = (sort == .alpha) ? .latest : .alpha
                page = 0
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.system(size: 11, weight: .regular))
                    Text(sort.label)
                        .font(.custom("Pretendard-Medium", size: 11))
                        .tracking(0.5)
                }
                .foregroundStyle(.walnut)
            }
            .buttonStyle(.plain)
        }
    }

    private var genreChips: some View {
        let available = Set(model.books.map(\.format))
        let otherCount = model.books.filter { !Self.genreOrder.contains($0.format) }.count
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { selectedGenre = nil; page = 0 } label: {
                    Chip(text: "All · \(model.books.count)", filled: selectedGenre == nil)
                }
                .buttonStyle(.plain)
                ForEach(Self.genreOrder.filter { available.contains($0) }, id: \.self) { format in
                    let count = model.books.filter { $0.format == format }.count
                    Button { selectedGenre = format; page = 0 } label: {
                        Chip(text: "\(format.displayName) · \(count)", filled: selectedGenre == format)
                    }
                    .buttonStyle(.plain)
                }
                if otherCount > 0 {
                    Button { selectedGenre = .unknown; page = 0 } label: {
                        Chip(text: "기타 · \(otherCount)", filled: selectedGenre == .unknown)
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

    // MARK: - Grid + pagination

    private var grid: some View {
        let cols = Array(repeating: GridItem(.fixed(cellWidth), spacing: 12, alignment: .top), count: 4)
        return LazyVGrid(columns: cols, alignment: .center, spacing: 16) {
            ForEach(pageBooks) { book in
                Button { selectedWork = book } label: {
                    VStack(spacing: 6) {
                        WorkCover(work: book.work, width: cellWidth, height: cellWidth * 188 / 132, compact: true)
                        Text(displayTitle(book).isEmpty ? "—" : displayTitle(book))
                            .font(.titleSerif(11))
                            .foregroundStyle(.espresso)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.75)
                            .frame(width: cellWidth)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var pageBar: some View {
        HStack(spacing: 8) {
            pageArrow("chevron.left", enabled: effectivePage > 0) { page = effectivePage - 1 }
            ForEach(pageWindow, id: \.self) { p in
                Button { page = p } label: {
                    Text("\(p + 1)")
                        .font(.custom("Pretendard-Medium", size: 13))
                        .foregroundStyle(p == effectivePage ? Color.paper : Color.walnut)
                        .frame(minWidth: 28, minHeight: 28)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(p == effectivePage ? Color.espresso : Color.clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(p == effectivePage ? Color.clear : Color.latte, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            pageArrow("chevron.right", enabled: effectivePage < pageCount - 1) { page = effectivePage + 1 }
        }
        .frame(maxWidth: .infinity)
    }

    private func pageArrow(_ icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(enabled ? Color.walnut : Color.latte)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private var pageWindow: [Int] {
        let maxButtons = 5
        if pageCount <= maxButtons { return Array(0..<pageCount) }
        let half = maxButtons / 2
        let start = max(0, min(effectivePage - half, pageCount - maxButtons))
        return Array(start..<(start + maxButtons))
    }

    // MARK: - States

    @ViewBuilder
    private var loadOrEmptyState: some View {
        if model.loading {
            Text("Loading⋯")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 24)
        } else if model.loadError {
            FetchErrorBanner { Task { await model.load(force: true) } }
                .padding(.horizontal, -20)   // 배너 자체 좌우 패딩과 정렬
        } else {
            Text("표시할 작품이 없습니다.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 24)
        }
    }

    private var noResultState: some View {
        Text("검색 결과가 없습니다.")
            .font(.bodySans(14))
            .foregroundStyle(.walnut)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 24)
    }
}

/// 카탈로그 데이터: `cards`(+nested works) 한 번 받아 작품 단위로 묶는다.
/// Android `LibraryViewModel`/`CardRepository.fetchAllCards` 미러.
@MainActor
final class LibraryCatalogModel: ObservableObject {
    @Published private(set) var books: [ShelfWork] = []
    @Published private(set) var loading = false
    @Published private(set) var loadError = false
    private var loaded = false

    func load(force: Bool = false) async {
        if loaded && !force { return }
        loading = true
        loadError = false
        do {
            let cards = try await Supa.shared.fetchCards(limit: 500)
            books = Self.groupBooks(cards)
            loaded = true
        } catch {
            loadError = true
        }
        loading = false
    }

    /// 카드를 (제목·부제·작가) 기준으로 묶어 작품 1권을 만든다(Android buildBooks
    /// 미러 — 단, series-pattern 병합은 생략). 카드가 없는 작품은 등장하지 않는다.
    static func groupBooks(_ cards: [Card]) -> [ShelfWork] {
        var grouped: [String: ShelfWork] = [:]
        var order: [String] = []
        for card in cards {
            let work = card.work
            let series = work.title
            let subtitle = work.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (subtitle?.isEmpty == false) ? subtitle! : series
            let key = [
                series.lowercased(),
                subtitle?.lowercased() ?? "",
                work.author?.lowercased() ?? "",
            ].joined(separator: "__")
            if grouped[key] == nil {
                grouped[key] = ShelfWork(
                    id: key,
                    series: series,
                    subtitle: (subtitle?.isEmpty == false) ? subtitle : nil,
                    title: title,
                    format: work.format,
                    author: work.author,
                    releaseYear: work.releaseYear,
                    work: work,
                    rows: []
                )
                order.append(key)
            }
            grouped[key]?.rows.append(ShelfRow(card: card, createdDate: nil))
        }
        return order.compactMap { grouped[$0] }
    }
}

private struct CatalogWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
