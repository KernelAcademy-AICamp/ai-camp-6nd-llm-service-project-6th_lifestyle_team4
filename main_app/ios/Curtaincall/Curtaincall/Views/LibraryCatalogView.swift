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
    /// RootView 가 Library 재탭/탭 복귀 시 증가시키는 신호 — 펼친 책(selectedWork)을
    /// 닫아 목록(루트)으로 복귀시킨다(#120 후속, OpenedBookView 오버레이 누락 보완).
    var reselect: Int = 0
    @Environment(\.requestLogin) private var requestLogin   // 로그인 유도 → 루트 인증 모달 직접 호출

    @StateObject private var model = LibraryCatalogModel()
    @State private var selectedGenre: WorkFormat?
    @State private var searchText = ""
    @State private var page = 0
    @State private var selectedWork: ShelfWork?
    @State private var contentWidth: CGFloat = 0
    @State private var sort: LibrarySort = .alpha   // 가나다순(기본) ⇄ 최신등록순 (Android LibrarySort)

    private static let pageSize = 12          // 4열 × 3행 (Android LibraryPageSize)
    private static let genreOrder: [WorkFormat] = [
        .movie, .drama, .musical, .opera, .play, .novel, .poem, .essay, .prose,
    ]

    /// 정렬 옵션 — Android `LibrarySort` 미러: 가나다순(기본) / 최신등록순. (장르순 없음)
    private enum LibrarySort {
        case alpha, latest
        var label: String { self == .alpha ? "가나다순" : "최신등록순" }
    }

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
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
                        Spacer().frame(height: 16)
                        metaRow
                        Spacer().frame(height: 12)
                        genreChips
                        Spacer().frame(height: 10)
                        searchField
                        Spacer().frame(height: 20)
                        if filteredBooks.isEmpty {
                            noResultState
                        } else {
                            grid   // 페이지 바는 스크롤 밖, 화면 하단에 고정(아래 pinnedPageBar).
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
            // 페이지 바 — 스크롤과 함께 사라지지 않게 화면 하단(탭바 위)에 고정.
            // 결과 없음/1페이지면 숨김. RootView 가 탭바를 safeAreaInset 으로 깔아 바로 위에 붙는다.
            if !model.books.isEmpty, !filteredBooks.isEmpty, pageCount > 1 {
                pinnedPageBar
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .onPreferenceChange(CatalogWidthKey.self) { contentWidth = $0 }
        .onChange(of: searchText) { _, _ in page = 0 }
        .navigationDestination(for: Card.self) { card in
            CardDetailView(card: card) { requestLogin() }   // 댓글 게이트 → 인증 모달 직접 호출
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
        // 탭을 떠났다 돌아오거나 Library 탭 재탭 시 펼친 책을 닫아 목록으로 복귀.
        .onChange(of: reselect) { _, _ in selectedWork = nil }
    }

    // MARK: - Derived data

    private var totalCards: Int { model.books.reduce(0) { $0 + $1.cards.count } }

    private var filteredBooks: [ShelfWork] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let base = model.books.filter { b in
            if let selectedGenre, b.format != selectedGenre {
                return false
            }
            guard !q.isEmpty else { return true }
            return b.series.lowercased().contains(q)
                || (b.subtitle ?? "").lowercased().contains(q)
                || (b.author ?? "").lowercased().contains(q)
        }
        // 정렬 — Android librarySortComparator 미러: 가나다순(displayTitle 한글 콜레이션) /
        // 최신등록순(작품 카드의 최대 card_id 내림차순 = 가장 최근 등록된 작품).
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
        // 카운트 라벨 + 오른쪽 끝 정렬 토글(가나다순 ⇄ 최신등록순) — Android metaRow/SortToggle 미러.
        HStack(spacing: 8) {
            Text("전체 \(model.books.count)권  ·  명대사 \(totalCards)편").labelCaps()
            Spacer(minLength: 8)
            sortToggle
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// 정렬 토글 — 현재 정렬 라벨 + 화살표 아이콘. 탭하면 가나다순 ⇄ 최신등록순 전환(페이지 리셋).
    /// Android SortToggle(SwapVert + label, Paper/Latte 보더) 미러.
    private var sortToggle: some View {
        Button {
            sort = (sort == .alpha) ? .latest : .alpha
            page = 0
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 11, weight: .regular))
                Text(sort.label)
                    .font(.custom("Pretendard-Medium", size: 11))
            }
            .foregroundStyle(.walnut)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.latte, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("정렬: \(sort.label). 탭하면 전환")
    }

    private var genreChips: some View {
        // PWA renderShelfChips: GENRE_ORDER 의 사용 가능한 장르만 — "기타" 칩 없음.
        let available = Set(model.books.map(\.format))
        // 가로 스크롤 대신 다음 줄로 wrap(FlowLayout) — 모든 장르 칩이 한눈에 보인다.
        return FlowLayout(spacing: 8, lineSpacing: 8) {
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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    /// 하단 고정 페이지 바 — 상단 Hairline + paper 배경(불투명, 스크롤된 그리드가 뒤로 안 비침).
    private var pinnedPageBar: some View {
        VStack(spacing: 0) {
            Hairline()
            pageBar
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
        }
        .background(Color.paper)
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
            QuietLoadingLabel()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 24)
        } else if model.loadError {
            FetchErrorBanner { Task { await model.load(force: true) } }
                .padding(.horizontal, -20)   // 배너 자체 좌우 패딩과 정렬
        } else {
            // PWA archive-empty: menu_book + 헤드라인 + 서브라인 (index.html:1863-1866).
            EmptyStateView(icon: "book", iconSize: 48,
                           headline: "표시할 작품이 없습니다.",
                           subline: "잠시 후 다시 시도해주세요.")
        }
    }

    private var noResultState: some View {
        // PWA archive-no-result: search_off + 헤드라인 + 서브라인 (index.html:1869-1872).
        EmptyStateView(icon: "magnifyingglass", iconSize: 42,
                       headline: "검색 결과가 없습니다",
                       subline: "다른 단어로 시도해보세요")
    }
}

/// PWA 빈/검색결과 상태 — 아이콘(sand) + 헤드라인(serif/espresso) + 서브라인(walnut),
/// 가운데 정렬. 카탈로그·북마크 서가 공용.
struct EmptyStateView: View {
    let icon: String
    let iconSize: CGFloat
    let headline: String
    let subline: String

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: icon)
                .font(.system(size: iconSize, weight: .regular))
                .foregroundStyle(.sand)
            Spacer().frame(height: 16)
            Text(headline)
                .font(.headlineSerif(18))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 8)
            Text(subline)
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
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
