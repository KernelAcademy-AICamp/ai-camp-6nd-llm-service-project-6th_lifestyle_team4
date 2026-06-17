import SwiftUI

// Daily/Discovery — Home "New Books" + "Contextual" sections.
// Ported from Android `ui/daily/DailyScreen.kt` (DailyNewBooks / DailyContextual /
// ContextCategories / filterContextualCards / toneLabels / normTone). Korean
// labels and keyword lists are kept verbatim. Read-only UI over the existing
// card set — no new fetch, no data-layer or auth changes. Android's
// daily_newbook_clicked / daily_contextual_clicked analytics are intentionally
// dropped (no analytics in this app).

// MARK: - Tone helpers (verbatim port)

/// Normalize a raw tone value into 0…1, tolerating 0–1, 1–10, and 0–100 scales.
func normTone(_ n: Double) -> Double? {
    guard n.isFinite else { return nil }
    if n > 10.0 { return min(1.0, max(0.0, n / 100.0)) }
    if n > 1.0 { return min(1.0, max(0.0, n / 10.0)) }
    return min(1.0, max(0.0, n))
}

struct ToneLabelSet {
    let temp: String?
    let intensity: String?
    let aftertaste: String?
}

func toneLabels(_ card: Card) -> ToneLabelSet {
    let t = normTone(Double(card.temperature))
    let i = normTone(Double(card.intensity))
    let temp: String?
    if let t {
        temp = t < 0.2 ? "차가움" : t < 0.4 ? "차분함" : t < 0.6 ? "미지근" : t < 0.8 ? "따스함" : "뜨거움"
    } else { temp = nil }
    let intensity: String?
    if let i {
        intensity = i < 0.2 ? "잔잔" : i < 0.4 ? "조용" : i < 0.6 ? "적당" : i < 0.8 ? "짙음" : "강렬"
    } else { intensity = nil }
    let baseLen: Int = {
        let sig = card.significance?.count ?? 0
        return sig > 0 ? sig : card.scriptExcerpt.count / 8
    }()
    let aftertaste: String?
    if baseLen <= 0 { aftertaste = nil }
    else { aftertaste = baseLen < 40 ? "짧음" : baseLen < 80 ? "담백" : baseLen < 140 ? "보통" : baseLen < 220 ? "깊음" : "길음" }
    return ToneLabelSet(temp: temp, intensity: intensity, aftertaste: aftertaste)
}

// MARK: - Contextual categories (verbatim port)

struct ContextCategory: Identifiable {
    let id: String
    let label: String
    let keywords: [String]
    /// (normalized temperature, normalized intensity) → score, per Android.
    let toneScore: (Double?, Double?) -> Int
}

let contextCategories: [ContextCategory] = [
    ContextCategory(
        id: "comfort",
        label: "위로가 필요할 때",
        keywords: ["위로", "슬픔", "아픔", "눈물", "치유", "회복", "안식", "평온", "포근", "따뜻", "따스", "기댐", "감싸", "쓰다듬", "받아들", "용서", "슬퍼", "아파"],
        toneScore: { t, i in
            (t != nil && t! < 0.6 ? 2 : (t != nil && t! < 0.8 ? 1 : 0)) + (i != nil && i! < 0.7 ? 1 : 0)
        }
    ),
    ContextCategory(
        id: "flutter",
        label: "설레는 날",
        keywords: ["사랑", "설렘", "첫사랑", "두근", "떨림", "봄", "꽃", "만남", "청춘", "달콤", "가슴", "설레", "연인", "키스", "입맞춤", "미소", "눈빛", "입술"],
        toneScore: { t, i in
            (t != nil && t! > 0.5 ? 2 : (t != nil && t! > 0.3 ? 1 : 0)) + (i != nil && i! > 0.4 ? 1 : 0)
        }
    ),
    ContextCategory(
        id: "lonely",
        label: "먹먹한 밤",
        keywords: ["외로움", "그리움", "고독", "적막", "침묵", "회상", "공허", "먹먹", "쓸쓸", "낙엽", "회한", "밤하늘", "혼자", "홀로", "잊혀", "그립", "추억", "낙심", "비"],
        toneScore: { t, i in
            (t != nil && t! < 0.5 ? 2 : 0) + (i != nil && i! < 0.5 ? 2 : (i != nil && i! < 0.7 ? 1 : 0))
        }
    ),
    ContextCategory(
        id: "resolve",
        label: "결심이 필요할 때",
        keywords: ["결심", "의지", "도전", "용기", "운명", "신념", "다짐", "각오", "맞서", "투지", "이겨", "포기하지", "나아", "극복", "굳건", "강인", "싸움", "꿈", "희망", "믿음"],
        toneScore: { t, i in
            (i != nil && i! > 0.6 ? 2 : (i != nil && i! > 0.4 ? 1 : 0)) + (t != nil && t! > 0.5 ? 1 : 0)
        }
    ),
]

/// Score each card by keyword hits (×3) plus the category tone bonus; keep the
/// top 12. A stable descending sort (score, then original order) mirrors
/// Kotlin's `sortedByDescending` on the card_id-desc input list.
func filterContextualCards(_ cards: [Card], category: ContextCategory) -> [Card] {
    let scored: [(index: Int, card: Card, score: Int)] = cards.enumerated().compactMap { index, card in
        let haystack = (
            card.keywords.joined(separator: " ") + " " +
            card.quote + " " +
            card.scriptExcerpt + " " +
            (card.significance ?? "")
        ).lowercased()
        let hits = category.keywords.filter { haystack.contains($0.lowercased()) }.count
        guard hits > 0 else { return nil }
        let score = hits * 3 + category.toneScore(normTone(Double(card.temperature)), normTone(Double(card.intensity)))
        return (index, card, score)
    }
    return scored
        .sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
        .prefix(12)
        .map { $0.card }
}

// MARK: - New Books grouping

/// A work grouped from the full card set, ordered by recency. Works have no id
/// on iOS, so cards are grouped by a title/subtitle/author/format key (same
/// shape as ArchiveView) and recency is the max card_id in the group.
struct DiscoveryWork: Identifiable {
    let id: String
    let work: Work
    let cards: [Card]
    let newestCardId: Int
    /// The work's newest card — the tap target ("open work" → its card detail).
    let representativeCard: Card
}

func buildNewBooks(_ cards: [Card]) -> [DiscoveryWork] {
    var groups: [String: [Card]] = [:]
    var order: [String] = []
    for card in cards {
        let w = card.work
        let key = [
            w.title.lowercased(),
            (w.subtitle ?? "").lowercased(),
            (w.author ?? "").lowercased(),
            w.format.rawValue,
        ].joined(separator: "__")
        if groups[key] == nil { order.append(key) }
        groups[key, default: []].append(card)
    }
    return order.compactMap { key -> DiscoveryWork? in
        guard let group = groups[key],
              let rep = group.max(by: { $0.cardId < $1.cardId }) else { return nil }
        return DiscoveryWork(
            id: key,
            work: group[0].work,
            cards: group,
            newestCardId: rep.cardId,
            representativeCard: rep
        )
    }
    .sorted { $0.newestCardId > $1.newestCardId }
}

/// Minimal quote cleanup for previews — strips bold markers and flattens
/// newlines so a truncated sample reads cleanly (Android `Markdown.cleanQuote`).
func cleanDiscoveryQuote(_ s: String) -> String {
    s.replacingOccurrences(of: "**", with: "")
        .replacingOccurrences(of: "\n", with: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

// MARK: - New Books section

struct DailyNewBooksSection: View {
    let cards: [Card]

    var body: some View {
        let books = buildNewBooks(cards)
        if let main = books.first {
            let rest = Array(books.dropFirst().prefix(8))
            VStack(alignment: .leading, spacing: 0) {
                featured(main)
                if !rest.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(rest) { restCover($0) }
                        }
                        .padding(.top, 16)
                        .padding(.bottom, 8)
                    }
                }
            }
        }
    }

    private func featured(_ book: DiscoveryWork) -> some View {
        let work = book.work
        let title = work.title.isEmpty ? "—" : work.title
        let meta = [work.author, work.releaseYear.map(String.init), work.format.displayName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let cleaned = cleanDiscoveryQuote(book.cards.first?.quote ?? "")
        let sample = String(cleaned.prefix(60))

        return NavigationLink(value: book.representativeCard) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("NEW · 새로 들어온 고전")
                        .font(.custom("Pretendard-Medium", size: 10))
                        .tracking(1.5)
                        .foregroundStyle(Color.paper)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.cta))
                    Spacer().frame(height: 14)
                    Text(title)
                        .font(.displaySerif(28))
                        .foregroundStyle(Color.paper)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 8)
                    if !meta.isEmpty {
                        Text(meta)
                            .labelCaps(color: .sand, size: 10)
                            .lineLimit(1)
                    }
                    if !sample.isEmpty {
                        Spacer().frame(height: 12)
                        Text("\"\(sample)\(cleaned.count >= 60 ? "⋯" : "")\"")
                            .font(.titleSerif(13))
                            .italic()
                            .foregroundStyle(Color.latte)
                            .bookLeading(size: 13)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                discoveryCover(work, width: 90)
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.espresso))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte.opacity(0.25), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .cardContextMenu(book.representativeCard)
        .cardHeroSource(book.representativeCard.cardId, dailyOwner: .newBooks)
    }

    private func restCover(_ book: DiscoveryWork) -> some View {
        NavigationLink(value: book.representativeCard) {
            VStack(spacing: 0) {
                discoveryCover(book.work, width: 82)
                Spacer().frame(height: 8)
                Text(book.work.title.isEmpty ? "—" : book.work.title)
                    .font(.titleSerif(11))
                    .fontWeight(.semibold)
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                    .multilineTextAlignment(.center)
                if let author = book.work.author, !author.isEmpty {
                    Text(author)
                        .font(.bodySans(10))
                        .foregroundStyle(.walnut)
                        .lineLimit(1)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(width: 82)
        }
        .buttonStyle(.plain)
        .cardContextMenu(book.representativeCard)
        .cardHeroSource(book.representativeCard.cardId, dailyOwner: .newBooks)
    }

    /// Reuse the existing `Work`-based leather cover (shared with Feed /
    /// HighlightDetail), scaled to the requested width keeping the 132×188 ratio.
    private func discoveryCover(_ work: Work, width: CGFloat) -> some View {
        HighlightBookCover(work: work)
            .scaleEffect(width / 132, anchor: .center)
            .frame(width: width, height: 188 * width / 132)
    }
}

// MARK: - Contextual section

struct DailyContextualSection: View {
    let cards: [Card]
    @State private var selected = "comfort"

    var body: some View {
        if !cards.isEmpty {
            let category = contextCategories.first { $0.id == selected } ?? contextCategories[0]
            let card = filterContextualCards(cards, category: category).first
            VStack(alignment: .leading, spacing: 0) {
                Text("이럴 땐, 이런 문장")
                    .font(.headlineSerif(22))
                    .foregroundStyle(.espresso)
                Spacer().frame(height: 4)
                Text("지금 마음에 맞춰 한 문장을 골라드려요")
                    .font(.bodySans(13))
                    .foregroundStyle(.walnut)
                Spacer().frame(height: 14)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(contextCategories) { chip($0) }
                    }
                }
                Spacer().frame(height: 16)
                if let card {
                    contextualCard(card)
                } else {
                    Text("이 분위기에 맞는 카드는 아직 준비 중이에요")
                        .font(.bodySans(14))
                        .foregroundStyle(.walnut)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }
            }
        }
    }

    private func chip(_ c: ContextCategory) -> some View {
        let active = selected == c.id
        return Button { selected = c.id } label: {
            Text(c.label)
                .font(.bodySans(12))
                .foregroundStyle(active ? Color.paper : .walnut)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 4).fill(active ? Color.espresso : Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(active ? Color.espresso : Color.latte, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func contextualCard(_ card: Card) -> some View {
        let labels = toneLabels(card)
        let meta = [card.work.title, card.work.author]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        return NavigationLink(value: card) {
            VStack(spacing: 0) {
                Text("\"\(String(cleanDiscoveryQuote(card.quote).prefix(120)))\"")
                    .font(.titleSerif(18))
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 18)
                    .fixedSize(horizontal: false, vertical: true)
                if !meta.isEmpty {
                    Spacer().frame(height: 14)
                    Text(meta)
                        .labelCaps(color: .walnut, size: 11)
                        .multilineTextAlignment(.center)
                }
                toneLabelRow(labels)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .cardContextMenu(card)
        .cardHeroSource(card.cardId)
    }

    @ViewBuilder
    private func toneLabelRow(_ labels: ToneLabelSet) -> some View {
        let items: [(String, String)] = [
            ("온도", labels.temp), ("감도", labels.intensity), ("여운", labels.aftertaste),
        ].compactMap { key, value in value.map { (key, $0) } }
        if !items.isEmpty {
            Spacer().frame(height: 14)
            HStack(spacing: 14) {
                ForEach(items, id: \.0) { key, value in
                    Text("\(key) \(value)")
                        .font(.custom("Pretendard-Medium", size: 11))
                        .foregroundStyle(Color.cta)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Trending

/// Compact count formatting (Android `formatCount`): raw under 1000, else "k"
/// with one decimal below 10k.
func formatCount(_ n: Int?) -> String {
    let v = max(0, n ?? 0)
    if v < 1000 { return String(v) }
    let k = Double(v) / 1000.0
    if k >= 10 { return "\(Int(k.rounded()))k" }
    return "\((k * 10).rounded() / 10.0)k"
}

struct DailyTrendingSection: View {
    let cards: [Card]
    /// Bookmark counts for the full set (existing `fetchBookmarkCounts`).
    let bookmarkCounts: [Int: Int]
    /// Open the full library/list — reuses existing navigation (tab switch).
    let onOpenAll: () -> Void

    private struct Ranked: Identifiable {
        let card: Card
        let bookmarks: Int
        let comments: Int
        let views: Int
        let score: Int
        var id: Int { card.cardId }
    }

    var body: some View {
        let scored: [Ranked] = cards
            .filter { !$0.quote.isEmpty }
            .map { card in
                let bm = bookmarkCounts[card.cardId] ?? 0
                let cm = card.commentCount ?? 0
                let vw = card.viewCount ?? 0
                return Ranked(card: card, bookmarks: bm, comments: cm, views: vw, score: bm * 10 + cm * 5 + vw)
            }
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.card.cardId > $1.card.cardId }
        let top = Array(scored.prefix(3))
        if !top.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("이번 주 인기 대사")
                        .font(.headlineSerif(22))
                        .foregroundStyle(.espresso)
                    Spacer()
                    Button(action: onOpenAll) {
                        Text("전체 ›")
                            .font(.bodySans(13))
                            .foregroundStyle(.walnut)
                    }
                    .buttonStyle(.plain)
                }
                Spacer().frame(height: 14)
                ForEach(Array(top.enumerated()), id: \.element.id) { index, item in
                    NavigationLink(value: item.card) {
                        HStack(alignment: .top, spacing: 14) {
                            Text("\(index + 1)")
                                .font(.headlineSerif(22))
                                .foregroundStyle(.espresso)
                                .frame(width: 20, alignment: .leading)
                            VStack(alignment: .leading, spacing: 8) {
                                Text("\"\(String(cleanDiscoveryQuote(item.card.quote).prefix(80)))\"")
                                    .font(.titleSerif(14))
                                    .foregroundStyle(.espresso)
                                    .bookLeading(size: 14)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("북마크 \(formatCount(item.bookmarks))   조회 \(formatCount(item.views))   댓글 \(formatCount(item.comments))")
                                    .font(.bodySans(12))
                                    .foregroundStyle(.walnut)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .cardContextMenu(item.card)
                    .cardHeroSource(item.card.cardId, dailyOwner: .trending)
                    Rectangle().fill(Color.latte).frame(height: 0.5)
                }
            }
        }
    }
}

// MARK: - Oz Pick

/// Choose the daily Oz card: prefer a card whose keywords intersect the user's
/// bookmark-keyword "taste", else any card. Cached once per calendar day, but
/// re-promoted to a taste-matching card once taste exists (Android
/// `DailyViewModel.chooseOzPick`). `today` is a yyyy-MM-dd string.
@MainActor
func chooseOzPick(cards: [Card], taste: Set<String>, prefs: PrefsStore, today: String) -> Card? {
    guard !cards.isEmpty else { return nil }
    if let id = prefs.ozDailyCardId(today: today),
       let cached = cards.first(where: { $0.cardId == id }),
       taste.isEmpty || cached.keywords.contains(where: { taste.contains($0) }) {
        return cached
    }
    let matched = taste.isEmpty ? [] : cards.filter { card in card.keywords.contains { taste.contains($0) } }
    let pick = (matched.isEmpty ? cards : matched).randomElement()
    if let pick { prefs.setOzDailyCard(today: today, cardId: pick.cardId) }
    return pick
}

struct DailyOzPickSection: View {
    let card: Card
    /// The user's bookmark-keyword taste — drives the personalized reason line.
    let taste: Set<String>

    var body: some View {
        let matched = card.keywords.first { taste.contains($0) }
        let reason = matched.map { "'\($0)'에 자주 머무는 당신이라면, 좋아할 한 문장이에요." }
            ?? "오즈가 오늘 골라드린 한 문장이에요."
        let work = card.work
        let meta = ["당신의 취향", work.format.displayName.isEmpty ? nil : work.format.displayName, matched]
            .compactMap { $0 }
            .joined(separator: " · ")

        VStack(alignment: .leading, spacing: 0) {
            Text("오즈의 오늘의 추천")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 14)
            NavigationLink(value: card) {
                VStack(alignment: .leading, spacing: 0) {
                    // Header — 오즈 label + meta. The Android cat image is optional
                    // and not bundled on iOS, so it's simply omitted.
                    HStack(spacing: 12) {
                        if let catImage = UIImage(named: "cat_shelf_few") {
                            Image(uiImage: catImage)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 72)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("오즈")
                                .font(.bodySans(14))
                                .fontWeight(.bold)
                                .foregroundStyle(.espresso)
                            Text(meta)
                                .font(.bodySans(11))
                                .foregroundStyle(.walnut)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    Spacer().frame(height: 14)
                    Text(reason)
                        .font(.titleSerif(13))
                        .foregroundStyle(.espresso)
                        .bookLeading(size: 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.latte))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.sand, lineWidth: 0.5))
                    Spacer().frame(height: 14)
                    HStack(alignment: .top, spacing: 12) {
                        HighlightBookCover(work: work)
                            .scaleEffect(56.0 / 132.0, anchor: .center)
                            .frame(width: 56, height: 188 * 56 / 132)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(work.title.isEmpty ? "—" : work.title)
                                .font(.titleSerif(15))
                                .fontWeight(.bold)
                                .foregroundStyle(.espresso)
                                .lineLimit(2)
                            let line = [work.author, work.releaseYear.map(String.init)]
                                .compactMap { $0 }
                                .filter { !$0.isEmpty }
                                .joined(separator: " · ")
                            if !line.isEmpty {
                                Text(line)
                                    .font(.bodySans(13))
                                    .foregroundStyle(.walnut)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            .cardContextMenu(card)
            .cardHeroSource(card.cardId, dailyOwner: .oz)
        }
    }
}

// MARK: - Notice carousel

/// Top-of-Daily notice strip — up to 3 notices, auto-rotating every 10s
/// (Android `DailyNoticeRow`). Tapping opens the full Notice screen.
struct DailyNoticeCarousel: View {
    let notices: [Notice]

    var body: some View {
        let items = Array(notices.prefix(3))
        if !items.isEmpty {
            NavigationLink {
                NoticeView()
            } label: {
                TimelineView(.periodic(from: .now, by: 10)) { context in
                    let idx = items.count > 1
                        ? Int(context.date.timeIntervalSince1970 / 10) % items.count
                        : 0
                    HStack(spacing: 10) {
                        Image(systemName: "megaphone")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(Color.cta)
                        Text(items[min(idx, items.count - 1)].title)
                            .font(.bodySans(13))
                            .fontWeight(.medium)
                            .foregroundStyle(.espresso)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text("›")
                            .font(.titleSerif(16))
                            .foregroundStyle(.walnut)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.latte))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.sand, lineWidth: 0.5))
                    .contentShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Recent (다시 만나기)

/// Re-surface the most recently bookmarked card (Android `DailyRecent`).
struct DailyRecentSection: View {
    let card: Card
    let bookmarkedAt: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("다시 만나기")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text("지난주 담아둔 문장, 다시 읽어볼까요")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 14)
            NavigationLink(value: card) {
                HStack(alignment: .top, spacing: 14) {
                    HighlightBookCover(work: card.work)
                        .scaleEffect(64.0 / 132.0, anchor: .center)
                        .frame(width: 64, height: 188 * 64 / 132)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\"\(cleanDiscoveryQuote(card.quote))\"")
                            .font(.titleSerif(14))
                            .foregroundStyle(.espresso)
                            .bookLeading(size: 14)
                            .lineLimit(4)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(card.work.title.isEmpty ? "—" : card.work.title) · \(bookmarkAgeText(bookmarkedAt)) 북마크")
                            .labelCaps(color: .walnut, size: 11)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            .cardContextMenu(card)
            .cardHeroSource(card.cardId, dailyOwner: .recent)
        }
    }
}

/// Coarse relative age for the recent bookmark line (Android `bookmarkAge`).
func bookmarkAgeText(_ date: Date?) -> String {
    guard let date else { return "" }
    let days = Calendar.current.dateComponents([.day], from: date, to: .now).day ?? 0
    if days <= 0 { return "오늘" }
    if days == 1 { return "어제" }
    if days < 7 { return "\(days)일 전" }
    return "\(days / 7)주 전"
}
