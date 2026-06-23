import SwiftUI
import Combine

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
}

// Android ContextCategories — 3 moods, matched purely on a card's structured
// keywords (flutter/"설레는 날" dropped; tone-score matching removed).
let contextCategories: [ContextCategory] = [
    ContextCategory(
        id: "comfort",
        label: "위로가 필요할 때",
        keywords: ["위로", "슬픔", "아픔", "상처", "눈물", "치유", "회복", "안식", "위안", "평온", "평화", "포근", "온기", "따뜻", "따스", "용서", "연민", "공감", "고통"]
    ),
    ContextCategory(
        id: "lonely",
        label: "먹먹한 밤",
        keywords: ["외로움", "그리움", "고독", "적막", "침묵", "회상", "공허", "먹먹", "쓸쓸", "회한", "이별", "상실", "그늘", "밤", "혼자", "홀로", "추억", "미련", "허무"]
    ),
    ContextCategory(
        id: "resolve",
        label: "결심이 필요할 때",
        keywords: ["결심", "의지", "도전", "용기", "운명", "신념", "다짐", "각오", "투지", "극복", "강인", "싸움", "꿈", "희망", "믿음", "열정", "성장", "자유", "선택", "시작", "변화", "두려움"]
    ),
]

/// PWA `_kwMatch`: equality, or a ≥2-char substring match in either direction.
private func kwMatch(_ catKw: String, _ cardKw: String) -> Bool {
    if catKw.isEmpty || cardKw.isEmpty { return false }
    if catKw == cardKw { return true }
    if catKw.count >= 2 && cardKw.contains(catKw) { return true }
    if cardKw.count >= 2 && catKw.contains(cardKw) { return true }
    return false
}

/// Keyword-only structured match (Android `filterContextualCards`): count the
/// category keywords that hit any of the card's structured keywords; keep cards with
/// ≥1 hit, sorted by hits desc then view-count desc, top 12. No quote/script
/// haystack, no tone score.
func filterContextualCards(_ cards: [Card], category: ContextCategory) -> [Card] {
    let scored: [(card: Card, hits: Int)] = cards.compactMap { card in
        let kws = card.keywords
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
        guard !kws.isEmpty else { return nil }
        let hits = category.keywords.filter { ck in
            let c = ck.lowercased()
            return kws.contains { kwMatch(c, $0) }
        }.count
        return hits == 0 ? nil : (card, hits)
    }
    return scored
        .sorted { $0.hits != $1.hits ? $0.hits > $1.hits : ($0.card.viewCount ?? 0) > ($1.card.viewCount ?? 0) }
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

/// 새 책 룰렛 카드들 중 최대 높이 추적용 — 회전/스와이프 시 아래 닷·표지줄이
/// 튀지 않도록 minHeight 로 고정(PWA measureMaxMainHeight + --newbook-main-min-h).
private struct NewBookCardHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct NewBookWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct DailyNewBooksSection: View {
    let cards: [Card]

    // PWA new-books 룰렛(m-app.js renderDailyNewBooks): 최신 9권을 10초마다 자동
    // 전환 + 좌우 스와이프 + 닷 트래킹. 사용자가 스와이프/닷 탭하면 자동순환 정지.
    @State private var idx = 0
    @State private var userInteracted = false
    @State private var maxCardHeight: CGFloat = 0
    @State private var slideDir = 1        // 전환 방향(1=다음, -1=이전) — PWA dir
    @State private var cardWidth: CGFloat = 0   // 40% 슬라이드 오프셋 계산용
    // @State 로 한 번만 생성 — View 재초기화마다 새 타이머가 생겨 카운트다운이
    // 리셋되는 것을 막는다(부모 잦은 렌더 시 회전 정지 방지).
    @State private var rotation = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    var body: some View {
        let books = Array(buildNewBooks(cards).prefix(9))   // PWA sorted.slice(0, 9)
        if !books.isEmpty {
            let safeIdx = min(idx, books.count - 1)
            // PWA rest = sorted.filter(idx != i) — 현재 메인을 뺀 나머지.
            let rest = books.enumerated().filter { $0.offset != safeIdx }.map(\.element)
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .top) {
                    // 9권 중 최대 높이 측정(숨김) — 카드 고정 높이용. 전환 시 아래 닷·표지줄
                    // 높이 튐 방지(PWA measureMaxMainHeight). 폭도 함께 캡처(슬라이드 오프셋).
                    ForEach(books) { b in
                        featuredContent(b)
                            .fixedSize(horizontal: false, vertical: true)
                            .background(GeometryReader { g in
                                Color.clear.preference(key: NewBookCardHeightKey.self, value: g.size.height)
                            })
                            .hidden()
                    }
                    // 단일 카드 — idx 가 바뀌면(스와이프/자동/닷) 같은 슬라이드+페이드 전환.
                    // PWA renderTemplate animate: 나가는 카드 40% 슬라이드+페이드, 들어오는
                    // 카드 반대쪽 40%에서 슬라이드+페이드. 끝에서 clamp(#79, wrap X) — 단,
                    // 자동회전·닷 탭은 wrap 유지.
                    featured(books[safeIdx])
                        .id(safeIdx)
                        .transition(rouletteTransition(dir: slideDir, width: cardWidth))
                        .frame(maxWidth: .infinity)
                }
                .frame(height: maxCardHeight > 0 ? maxCardHeight : 280, alignment: .top)
                .clipped()   // 슬라이드 중 카드가 섹션 밖으로 나가는 부분 가림(PWA overflow:hidden)
                .background(GeometryReader { g in
                    Color.clear.preference(key: NewBookWidthKey.self, value: g.size.width)
                })
                // 드래그 스와이프 — 카드 탭(상세)과 공존하도록 simultaneous. |dx|>45 & 가로 우세.
                .simultaneousGesture(
                    DragGesture(minimumDistance: 24)
                        .onEnded { v in
                            let dx = v.translation.width, dy = v.translation.height
                            guard books.count > 1, abs(dx) > 45, abs(dx) > abs(dy) else { return }
                            userInteracted = true
                            let dir = dx < 0 ? 1 : -1
                            let next = safeIdx + dir
                            guard next >= 0, next < books.count else { return }   // clamp
                            slideDir = dir
                            idx = next
                        }
                )
                if books.count > 1 {
                    newBookDots(count: books.count, active: safeIdx)
                }
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
            // PWA 전환 곡선/시간 ≈ in cubic-bezier(0.25,0.8,0.3,1) 420ms. idx 변경(스와이프·
            // 자동·닷) 모두 이 애니메이션으로 슬라이드+페이드된다.
            .animation(.timingCurve(0.25, 0.8, 0.3, 1, duration: 0.42), value: safeIdx)
            .onPreferenceChange(NewBookCardHeightKey.self) { h in
                if h > maxCardHeight { maxCardHeight = h }
            }
            .onPreferenceChange(NewBookWidthKey.self) { w in
                if w > 0 { cardWidth = w }
            }
            // 10초 자동 전환 — 사용자가 스와이프/닷 탭하기 전까지(PWA stopNewbooksRotation).
            .onReceive(rotation) { _ in
                guard books.count > 1, !userInteracted else { return }
                slideDir = 1
                idx = (min(idx, books.count - 1) + 1) % books.count
            }
        }
    }

    /// PWA `.newbook-dots`: 카드 바로 아래 가운데. 7pt 원, gap 7, 위 14pt. 활성=espresso
    /// (꽉 참)·비활성=sand. 개수는 책 수에 바인딩(하드코딩 X). 닷 탭 → 해당 책으로 점프.
    private func newBookDots(count: Int, active: Int) -> some View {
        HStack(spacing: 7) {
            ForEach(0..<count, id: \.self) { i in
                Button {
                    guard i != active else { return }
                    userInteracted = true
                    slideDir = i > active ? 1 : -1   // 방향 맞춰 슬라이드(컨테이너 .animation)
                    idx = i
                } label: {
                    Circle()
                        .fill(i == active ? Color.espresso : Color.sand)
                        .frame(width: 7, height: 7)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(i + 1)번째 새 책 보기")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 14)
    }

    /// PWA renderTemplate animate 미러 — 들어오는 카드는 진행방향 반대쪽 40%에서 슬라이드+
    /// 페이드인, 나가는 카드는 진행방향 40%로 슬라이드+페이드아웃. dir=1 다음 / -1 이전.
    private func rouletteTransition(dir: Int, width: CGFloat) -> AnyTransition {
        let dx = max(40, width * 0.4)   // PWA translateX 40%
        return .asymmetric(
            insertion: .offset(x: dir >= 0 ? dx : -dx).combined(with: .opacity),
            removal: .offset(x: dir >= 0 ? -dx : dx).combined(with: .opacity)
        )
    }

    /// 오늘 날짜 — 새 책 카드 안 상단(PWA new-books). 날짜=sand 볼드, 요일=cta.
    /// "YYYY년 M월 D일 {요일}요일" (web_pwa m-app.js dailyDateLabel 미러).
    private static var dateLabel: Text {
        let cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day, .weekday], from: .now)
        let days = ["일", "월", "화", "수", "목", "금", "토"]   // Calendar weekday: 1 = Sunday
        let weekday = days[((c.weekday ?? 1) - 1) % 7]
        // String 으로 먼저 조립 — Text(LocalizedStringKey) 정수 보간은 로캘 천단위
        // 구분자("2,026년")를 붙이므로 String 보간(구분자 없음) 후 verbatim 으로 넘긴다.
        let date = "\(c.year ?? 0)년 \(c.month ?? 0)월 \(c.day ?? 0)일 "
        return Text(date).foregroundColor(.sand).fontWeight(.bold)
            + Text("\(weekday)요일").foregroundColor(.cta)
    }

    /// 카드 시각 본문만 — NavigationLink/hero 없이. 페이저(TabView) 각 페이지와
    /// 숨김 높이 측정(중복 matchedTransitionSource 방지)에서 공유한다.
    private func featuredContent(_ book: DiscoveryWork) -> some View {
        let work = book.work
        let title = work.title.isEmpty ? "—" : work.title
        // PWA: author · {year}년 · GENRE_LABEL[format] (연도 뒤 '년').
        let yearText = work.releaseYear.map { "\($0)년" }
        let meta = [work.author, yearText, work.format.displayName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let subtitle = work.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let intro = work.intro?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned = cleanDiscoveryQuote(book.cards.first?.quote ?? "")
        let sample = String(cleaned.prefix(60))
        // PWA 제목: series/title (paper) + subtitle span(0.6em ≈ 17, sand).
        var titleText = Text(title).font(.displaySerif(28)).foregroundColor(.paper)
        if let subtitle, !subtitle.isEmpty {
            titleText = titleText + Text(" \(subtitle)").font(.titleSerif(17)).foregroundColor(.sand)
        }

        // PWA: HStack gap 20 / align center · content flex:1 + cover 82.
        return HStack(alignment: .center, spacing: 20) {
                VStack(alignment: .leading, spacing: 0) {
                    // 날짜 — 카드 안 상단(sand 볼드 + 요일 cta). 11px, mb 13.
                    Self.dateLabel
                        .font(.custom("Pretendard-Medium", size: 11))
                        .tracking(0.44)
                    Spacer().frame(height: 13)
                    // NEW 뱃지 — 10px, cta bg, padding 4/10, radius 12.
                    Text("NEW · 새로 들어온 고전")
                        .font(.custom("Pretendard-Medium", size: 10))
                        .tracking(1.5)
                        .foregroundStyle(Color.paper)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.cta))
                    Spacer().frame(height: 10)   // PWA 제목 margin-top 10
                    titleText
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 5)    // PWA 제목 margin-bottom 5
                    if !meta.isEmpty {
                        Text(meta)
                            .font(.custom("Pretendard-Regular", size: 11))
                            .tracking(0.55)
                            .foregroundStyle(Color.sand)
                            .lineLimit(1)
                            .padding(.leading, 3)   // PWA margin-left 3
                    }
                    Spacer().frame(height: 15)   // PWA 작가줄 margin-bottom 15
                    // 본문 — intro 있으면 3줄(serif), 없으면 샘플 인용(이탤릭). 14px latte, lh 1.75.
                    if let intro, !intro.isEmpty {
                        Text(intro)
                            .font(.titleSerif(14))
                            .foregroundStyle(Color.latte)
                            .lineLimit(3)
                            .bookLeading(size: 14)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if !sample.isEmpty {
                        Text("\"\(sample)\(cleaned.count >= 60 ? "⋯" : "")\"")
                            .font(.titleSerif(14))
                            .italic()
                            .foregroundStyle(Color.latte)
                            .lineLimit(3)
                            .bookLeading(size: 14)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                discoveryCover(work, width: 82)   // PWA cover width 82
            }
        .padding(.horizontal, 22)   // PWA padding 24px 22px
        .padding(.vertical, 24)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.espresso))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte.opacity(0.25), lineWidth: 0.5))
    }

    /// 탭하면 상세로(NavigationLink + hero). 페이저 각 페이지가 이 뷰다.
    private func featured(_ book: DiscoveryWork) -> some View {
        NavigationLink(value: book.representativeCard) {
            featuredContent(book)
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

    /// 표지 — Library 와 동일하게 WorkCover 사용(cover_url 아트워크 로드, 없으면 가죽).
    /// 기존 HighlightBookCover 는 가죽 전용이라 데일리에서 표지가 안 떴음.
    private func discoveryCover(_ work: Work, width: CGFloat) -> some View {
        WorkCover(work: work, width: width, height: 188 * width / 132, compact: true)
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
                Text("끌리는 주제를 골라, 새로운 문장을 만나보세요.")
                    .font(.bodySans(12))
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
                keywordChips(card)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.cardWarm))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .cardContextMenu(card)
        .cardHeroSource(card.cardId)
    }

    /// Android(DailyScreen.kt:657-675): 온도/감도/여운 톤 라벨 대신 카드 키워드
    /// 칩(#키워드, 최대 3개) — Cta 글자, Latte 알약 배경.
    @ViewBuilder
    private func keywordChips(_ card: Card) -> some View {
        let keywords = card.keywords
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .prefix(3)
        if !keywords.isEmpty {
            Spacer().frame(height: 16)
            HStack(spacing: 8) {
                ForEach(Array(keywords), id: \.self) { kw in
                    Text("#\(kw)")
                        .font(.custom("Pretendard-Medium", size: 11))
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.cta)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.latte))
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
                // 댓글 수: denormalized comment_count 컬럼(= Android의 aggregated map 폴백;
                // iOS엔 별도 집계 fetch가 없어 컬럼을 사용). 조회수와 함께 동일 가중치.
                let cm = card.commentCount ?? 0
                let vw = card.viewCount ?? 0
                return Ranked(card: card, bookmarks: bm, comments: cm, views: vw, score: bm + cm + vw)
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

/// Choose the daily Oz card, mirroring Android `DailyViewModel.chooseOzPick`:
/// build the pool from **selected themes (+ genre)** first, else **bookmark-keyword
/// taste**, else any card — so the personalized reason/meta the UI shows actually
/// reflects the card that was picked. Cached once per calendar day; the cache is
/// validated against theme first when themes are chosen, else against taste.
/// `today` is a yyyy-MM-dd string.
@MainActor
func chooseOzPick(cards: [Card], taste: Set<String>, prefs: PrefsStore, today: String) -> Card? {
    guard !cards.isEmpty else { return nil }
    let userPrefs = prefs.userPrefs
    // "상관없음"(any) 이면 주제 무시 (Android `!prefs.any` 게이트).
    let chosenThemes: Set<String> = userPrefs.any ? [] : Set(userPrefs.themes)
    let chosenGenres = Set(userPrefs.genres)

    func matchedTheme(_ card: Card) -> String? {
        guard !chosenThemes.isEmpty else { return nil }
        return CardTheme.cardThemeSet(card.keywords).first { chosenThemes.contains($0) }
    }

    // Cached daily pick — keep only if it still fits the active preference signal.
    if let id = prefs.ozDailyCardId(today: today),
       let cached = cards.first(where: { $0.cardId == id }) {
        let keep = chosenThemes.isEmpty
            ? (taste.isEmpty || cached.keywords.contains { taste.contains($0) })
            : (matchedTheme(cached) != nil)
        if keep { return cached }
    }

    // Pool — 주제 매칭(+장르 교집합) > 북마크 취향 > 전체.
    let pool: [Card]
    if !chosenThemes.isEmpty {
        var matched = cards.filter { matchedTheme($0) != nil }
        if !chosenGenres.isEmpty {
            let both = matched.filter { chosenGenres.contains($0.work.format.rawValue) }
            if !both.isEmpty { matched = both }   // 주제+장르 둘 다 맞으면 우선
        }
        pool = matched.isEmpty ? cards : matched
    } else if !taste.isEmpty {
        let m = cards.filter { card in card.keywords.contains { taste.contains($0) } }
        pool = m.isEmpty ? cards : m
    } else {
        pool = cards
    }
    let pick = pool.randomElement()
    if let pick { prefs.setOzDailyCard(today: today, cardId: pick.cardId) }
    return pick
}

/// Oz Pick (Android `DailyOzPick`). Personalized: nickname header + 장르/주제 meta +
/// theme-hit reason + library-cat-2 + book line. Guest (anon + no active prefs):
/// the "취향 알려주기" CTA instead. Read-only over existing prefs/nickname/taste.
struct DailyOzPickSection: View {
    let card: Card?
    let prefs: UserPrefs
    let isAnonymous: Bool
    let nickname: String
    let loginId: String
    /// The user's bookmark-keyword taste — drives the taste-hit reason line.
    let taste: Set<String>
    let onRequestPreferences: () -> Void

    /// Android `UserPrefs.hasActive()`: chose genres, or (not "상관없음" and chose themes).
    private var hasActive: Bool {
        !prefs.genres.isEmpty || (!prefs.any && !prefs.themes.isEmpty)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading
            if isAnonymous && !hasActive {
                Spacer().frame(height: 14)
                ctaCard
            } else if let card {
                Spacer().frame(height: 4)
                Text("오즈가 당신의 취향을 살펴 골랐어요.")
                    .font(.bodySans(13))
                    .foregroundStyle(.walnut)
                Spacer().frame(height: 12)
                personalizedCard(card)
            }
        }
    }

    /// "당신을 위한 Daily Script." — trailing period in Cta. (Text concatenation needs
    /// `foregroundColor`, the Text-returning variant.)
    private var heading: some View {
        Text("당신을 위한 ").font(.titleSerif(17)).foregroundColor(.espresso)
            + Text("Daily Script").font(.headlineSerif(22)).fontWeight(.bold).foregroundColor(.espresso)
            + Text(".").font(.headlineSerif(22)).fontWeight(.bold).foregroundColor(.cta)
    }

    private func personalizedCard(_ card: Card) -> some View {
        let work = card.work
        // 추천 한마디 — 고른 주제(themeHit) > 행동 취향(tasteHit) > 일반.
        let themeHit: String? = (!prefs.any && !prefs.themes.isEmpty)
            ? CardTheme.cardThemeSet(card.keywords).first { prefs.themes.contains($0) }
            : nil
        let tasteHit = card.keywords.first { taste.contains($0) }
        // 추천 한마디 — Android reason 문구와 동일(themeHit > tasteHit > 일반).
        let reason: String = {
            if let themeHit { return "'\(themeHit)' 이야기를 좋아한다면, 이 작품이 잘 맞을 거예요." }
            if let tasteHit { return "'\(tasteHit)'에 자주 머무는 당신이라면, 좋아할 한 문장이에요." }
            return "오즈가 오늘 골라드린 한 문장이에요."
        }()
        let genresJoined = prefs.genres.map(Self.genreLabel).joined(separator: ", ")
        let genreText = genresJoined.isEmpty ? "상관없음" : genresJoined
        let themesJoined = prefs.themes.joined(separator: ", ")
        let themeText = prefs.any ? "상관없음" : (themesJoined.isEmpty ? "상관없음" : themesJoined)

        return NavigationLink(value: card) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 16) {
                    Image("library-cat-2").resizable().scaledToFit().frame(width: 140)
                    VStack(alignment: .leading, spacing: 0) {
                        ozNameLine.lineLimit(1)
                        Spacer().frame(height: 6)
                        ozMetaLine("장르", genreText)
                        Spacer().frame(height: 2)
                        ozMetaLine("주제", themeText)
                    }
                    Spacer(minLength: 0)
                }
                Spacer().frame(height: 14)
                reasonBox(reason)
                Spacer().frame(height: 14)
                workRow(work)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.cardWarm))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .cardContextMenu(card)
        .cardHeroSource(card.cardId, dailyOwner: .oz)
    }

    private var ctaCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Image("library-cat-2").resizable().scaledToFit().frame(width: 140)
                VStack(alignment: .leading, spacing: 0) {
                    Text(nickname.isEmpty ? "게스트" : nickname)
                        .font(.bodySans(14)).fontWeight(.bold)
                        .foregroundStyle(.espresso).lineLimit(1)
                    Spacer().frame(height: 6)
                    Text("아직 당신의 취향을 몰라요")
                        .font(.custom("Pretendard-Medium", size: 11))
                        .foregroundStyle(.walnut)
                }
                Spacer(minLength: 0)
            }
            Spacer().frame(height: 14)
            reasonBox("좋아하는 장르와 주제만 알려주시면, 오즈가 매일 딱 맞는 한 문장을 골라드려요.")
            Spacer().frame(height: 14)
            Button(action: onRequestPreferences) {
                Text("취향 알려주기")
                    .font(.custom("Pretendard-Medium", size: 14)).fontWeight(.bold)
                    .foregroundStyle(Color.paper)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.cta))
            }
            .buttonStyle(.plain)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.cardWarm))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.latte, lineWidth: 0.5))
    }

    private func reasonBox(_ text: String) -> some View {
        Text(text)
            .font(.titleSerif(13)).foregroundStyle(.espresso).bookLeading(size: 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.latte))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.sand, lineWidth: 0.5))
    }

    private func workRow(_ work: Work) -> some View {
        HStack(alignment: .top, spacing: 12) {
            HighlightBookCover(work: work)
                .scaleEffect(56.0 / 132.0, anchor: .center)
                .frame(width: 56, height: 188 * 56 / 132)
            VStack(alignment: .leading, spacing: 4) {
                Text(work.title.isEmpty ? "—" : work.title)
                    .font(.titleSerif(15)).fontWeight(.bold)
                    .foregroundStyle(.espresso).lineLimit(2)
                let line = [work.author, work.releaseYear.map(String.init)]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !line.isEmpty {
                    Text(line).font(.bodySans(13)).foregroundStyle(.walnut).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// PWA Oz 호명 — 닉네임>아이디 + " 님"(님은 작게/walnut), 둘 다 없으면 "당신".
    /// "당신의 취향" 라벨 없이 바로 장르/주제 (m-app.js:3590-3593).
    private var ozNameLine: Text {
        let userName = !nickname.isEmpty ? nickname : loginId
        guard !userName.isEmpty else {
            return Text("당신").font(.bodySans(15)).fontWeight(.bold).foregroundColor(.espresso)
        }
        return Text(userName).font(.bodySans(15)).fontWeight(.bold).foregroundColor(.espresso)
            + Text(" 님").font(.bodySans(11)).foregroundColor(.walnut)
    }

    private func ozMetaLine(_ label: String, _ value: String) -> some View {
        (Text(label).font(.custom("Pretendard-Medium", size: 11)).foregroundColor(.espresso)
            + Text(" : \(value)").font(.custom("Pretendard-Regular", size: 11)).foregroundColor(.walnut))
            .lineLimit(2)
    }

    private static func genreLabel(_ format: String) -> String {
        let label = WorkFormat(rawValue: format.lowercased())?.displayName ?? ""
        return label.isEmpty ? "기타" : label
    }
}

// MARK: - Notice carousel

/// Top-of-Daily notice strip — up to 3 notices, auto-rotating every 10s
/// (Android `DailyNoticeRow`). Tapping opens the full Notice screen.
struct DailyNoticeCarousel: View {
    let notices: [Notice]

    // 10초마다 회전 + PWA 크로스페이드(제목만 opacity 0→swap→1, 각 200ms).
    @State private var idx = 0
    @State private var titleOpacity = 1.0
    @State private var rotation = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    var body: some View {
        let items = Array(notices.prefix(3))
        if !items.isEmpty {
            NavigationLink {
                NoticeView()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "megaphone")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(Color.cta)
                    Text(items[min(idx, items.count - 1)].title)
                        .font(.bodySans(13))
                        .fontWeight(.medium)
                        .foregroundStyle(.espresso)
                        .lineLimit(1)
                        .opacity(titleOpacity)   // PWA daily-notice-title-line 페이드
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
                .shadow(color: Color.black.opacity(0.08), radius: 5, x: 0, y: 2)
                .contentShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            // PWA renderDailyNotice: 제목을 200ms 페이드아웃 → 교체 → 200ms 페이드인.
            .onReceive(rotation) { _ in
                guard items.count > 1 else { return }
                withAnimation(.easeInOut(duration: 0.2)) { titleOpacity = 0 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    idx = (idx + 1) % items.count
                    withAnimation(.easeInOut(duration: 0.2)) { titleOpacity = 1 }
                }
            }
        }
    }
}
