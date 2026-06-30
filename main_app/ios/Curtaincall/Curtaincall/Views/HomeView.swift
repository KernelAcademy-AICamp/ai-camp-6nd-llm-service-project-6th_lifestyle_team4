import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    /// TODAY(center) 재탭 토큰 — 증가하면 새 명대사 새로고침(상단 버튼과 동일 경로).
    var reselect: Int = 0
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.requestLogin) private var requestLogin   // 로그인 유도 → 루트 인증 모달 직접 호출
    @Namespace private var heroNS

    @State private var allCards: [Card] = []
    @State private var todayCard: Card?
    @State private var todayShowOriginal = false
    @State private var recent: [Card] = []
    @State private var hasLoaded = false
    @State private var isLoading = false
    @State private var fetchFailed = false
    @State private var showAccountPrompt = false
    // 프롬프트 카피 — 북마크 게이트(기본) ↔ 새로고침 한도 모달에서 갈아끼운다.
    @State private var promptTitle = "북마크는 회원 전용"
    @State private var promptMessage = "마음에 든 명대사를 보관하려면 로그인이 필요해요."
    @State private var bookmarkCounts: [Int: Int] = [:]
    @State private var shareCard: Card?
    @State private var shareCountOverrides: [Int: Int] = [:]   // cardId → 낙관적 공유 수
    // 새로고침 토스트('갱신됨') — 헤더 새로고침 버튼과 당겨서 새로고침이 공유. 당겨서
    // 새로고침은 실타래 회전 인디케이터(`.yarnRefresh`, Android RefreshableBox 미러).
    @State private var refreshToast: String?

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
            if fetchFailed {
                FetchErrorBanner { Task { await reload(deterministic: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 32)
                    Text(Self.formattedToday)
                        .labelCaps()
                        .frame(maxWidth: .infinity)
                    Spacer().frame(height: 8)
                    ZStack(alignment: .trailing) {
                        Text("오늘의 명대사")
                            .font(.displaySerif(28))
                            .foregroundStyle(.espresso)
                            .frame(maxWidth: .infinity)
                        Button { handleRefreshTap() } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 18, weight: .regular))
                                .foregroundStyle(.walnut)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.paper))
                                .overlay(Circle().stroke(Color.latte, lineWidth: 0.5))
                                .shadow(color: Color.black.opacity(0.12), radius: 3, x: 0, y: 2)
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoading)
                    }
                    Spacer().frame(height: 20)

                    if let card = todayCard {
                        if card.hasHomeOriginalLanguage {
                            HStack {
                                Spacer()
                                LangToggle(showOriginal: $todayShowOriginal)
                            }
                            .padding(.bottom, 12)
                        }
                        todayCardView(card)
                    } else if isLoading {
                        VStack(alignment: .leading, spacing: 0) {
                            TodayCardBody(card: nil, isLoading: true, showOriginal: false)
                            Spacer().frame(height: 20)
                            Text("Read Full Script").editorialButton(style: .filled)
                        }
                        .padding(20)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
                    }

                    Spacer().frame(height: 56)
                    Hairline()

                    HStack(alignment: .bottom) {
                        Text("지난 기록")
                            .font(.headlineSerif(22))
                            .foregroundStyle(.espresso)
                        Spacer()
                        Button { selectedTab = .archive } label: {
                            Text("VIEW LIBRARY").labelCaps()
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 12)

                    if !recent.isEmpty {
                        ForEach(recent) { card in
                            NavigationLink(value: card) {
                                ArchiveRow(card: card)
                            }
                            .buttonStyle(.plain)
                            .cardContextMenu(card)
                            .cardHeroSource(card.cardId)
                        }
                    } else {
                        Text("새로고침하면 이전 카드가 여기에 쌓입니다.")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .padding(.vertical, 16)
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
            // 당겨서 새로고침 — 실타래 회전 인디케이터(Feed·공지와 공유). 헤더 버튼과 같은
            // 익명 3회 제한 게이트를 통과(랜덤 새 카드 + '갱신됨' 토스트는 reload 안에서).
            .yarnRefresh { await pullToRefresh() }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        // Hero morph: inject the surface namespace to descendant cells (nil under
        // Reduce Motion disables the morph). Destination opts in explicitly below.
        .environment(\.cardHeroNamespace, reduceMotion ? nil : heroNS)
        .navigationDestination(for: Card.self) {
            CardDetailView(card: $0) {
                showAccountPrompt = false
                requestLogin()   // 카드 상세 댓글 게이트 → 인증 모달 직접 호출
            }
            .cardHeroDestination($0.cardId, in: heroNS, enabled: !reduceMotion)
        }
        // 공유 시트 — 완료 시에만 카운트 +1 (취소는 무시), PWA bumpShareCount 미러.
        .sheet(item: $shareCard) { card in
            ActivityShareSheet(items: ActivityShareSheet.items(for: card)) { completed in
                if completed { bumpShare(card) }
            }
        }
        .task { await loadOnce() }
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        // Onboarding finished (prefSelected flips true) → make the first,
        // preference-weighted today pick that loadOnce held back.
        .onChange(of: prefs.prefSelected) { _, selected in
            if selected { Task { await loadOnce() } }
        }
        .overlay {
            if showAccountPrompt {
                AccountRequiredPrompt(
                    title: promptTitle,
                    message: promptMessage,
                    onLogin: {
                        showAccountPrompt = false
                        requestLogin()   // MY 탭 이동 대신 인증 모달 직접 호출(스크롤 헌트 제거)
                    },
                    onClose: { showAccountPrompt = false }
                )
            }
        }
        // 갱신됨 토스트 — 하단(yarn 네비 버튼 위), PWA toast('갱신됨') 미러.
        .overlay(alignment: .bottom) {
            if let refreshToast {
                Text(refreshToast)
                    .font(.bodySans(13))
                    .foregroundStyle(Color.paper)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.espresso))
                    .padding(.bottom, 130)
                    .transition(.opacity)
            }
        }
        // 센터(TODAY) 재탭 → 새 명대사 (상단 새로고침 버튼과 동일: 익명 3회 제한·토스트 포함).
        .onChange(of: reselect) { _, _ in handleRefreshTap() }
    }

    private func todayCardView(_ card: Card) -> some View {
        let keywords = card.displayKeywords(original: todayShowOriginal)
        return VStack(alignment: .leading, spacing: 0) {
            NavigationLink(value: card) {
                TodayCardBody(card: card, isLoading: isLoading, showOriginal: todayShowOriginal)
            }
            .buttonStyle(.plain)
            .cardContextMenu(card)
            .cardHeroSource(card.cardId)

            // 카드 우측 하단 — 북마크(아이콘+수) · 공유(아이콘+수). PWA today-card 하단 행
            // (index.html:1796-1805). 링크 밖 실제 버튼이라 탭이 상세 이동으로 새지 않는다.
            HStack(spacing: 18) {
                Spacer()
                Button { toggleBookmark(cardId: card.cardId) } label: {
                    VStack(spacing: 3) {
                        Image(systemName: bookmarks.isBookmarked(card.cardId) ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 22, weight: .regular))
                            .foregroundStyle(bookmarks.isBookmarked(card.cardId) ? Color.cta : .walnut)
                        Text("\(bookmarkCounts[card.cardId] ?? 0)")
                            .font(.bodySans(10)).foregroundStyle(.walnut)
                    }
                }
                .buttonStyle(.plain)
                // 공유 — 실제 공유 완료 시 share_count +1(낙관적 +1 후 RPC), PWA bumpShareCount.
                Button { shareCard = card } label: {
                    VStack(spacing: 3) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 22, weight: .regular))
                            .foregroundStyle(.walnut)
                        Text("\(shareCountOverrides[card.cardId] ?? (card.shareCount ?? 0))")
                            .font(.bodySans(10)).foregroundStyle(.walnut)
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 14)

            Spacer().frame(height: 14)
            Hairline()
            Spacer().frame(height: 12)
            if !keywords.isEmpty {
                HStack(spacing: 12) {
                    ForEach(keywords, id: \.self) { kw in
                        Text("#\(kw)").font(.bodySans(14)).foregroundStyle(.walnut)
                    }
                }
            }
            Spacer().frame(height: 20)
            NavigationLink(value: card) {
                Text("Read Full Script").editorialButton(style: .filled)
            }
            .buttonStyle(.plain)
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }

    private static var formattedToday: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy년 M월 d일"
        return f.string(from: .now)
    }

    private func loadOnce() async {
        if hasLoaded { return }
        // Hold the first today-pick until first-run onboarding finishes — the
        // picker covers Home while prefs are still empty, so picking now would
        // produce a non-preference-weighted card. Returning users (prefSelected
        // already true) fall straight through and pick immediately, as before.
        guard prefs.prefSelected else { return }
        await reload(deterministic: true)
        hasLoaded = true
    }

    /// deterministic == true → today's seed pick (stable per day).
    /// deterministic == false → random refresh, excluding recently shown.
    private func reload(deterministic: Bool) async {
        isLoading = true
        defer { isLoading = false }
        do {
            if allCards.isEmpty {
                allCards = try await Supa.shared.fetchCards()
            }
            fetchFailed = false
            let pick: Card?
            if deterministic {
                pick = Recommend.pickToday(
                    all: allCards,
                    tasteEnabled: prefs.tasteEnabled,
                    bookmarkCards: bookmarks.bookmarkCards,
                    prefs: prefs.userPrefs
                )
            } else {
                pick = Recommend.pickRandom(
                    all: allCards,
                    tasteEnabled: prefs.tasteEnabled,
                    bookmarkCards: bookmarks.bookmarkCards,
                    recentIds: prefs.recentlyShown,
                    prefs: prefs.userPrefs
                )
            }
            if let pick { prefs.rememberShown(pick.cardId) }
            todayCard = pick
            todayShowOriginal = false  // 새 카드는 항상 한국어부터 (PWA와 동일)
            recent = buildRecent()
            await refreshBookmarkCounts(for: [pick].compactMap { $0 } + recent)
        } catch {
            fetchFailed = true
        }
        // 새로고침(랜덤) 완료 시 갱신됨/갱신 실패 토스트 — 버튼·당김 둘 다 여기로 모인다
        // (초기/시드 로드는 deterministic=true 라 토스트 없음). PWA toast('갱신됨') 미러.
        if !deterministic {
            showRefreshToast(fetchFailed ? "갱신 실패" : "갱신됨")
        }
    }

    private func showRefreshToast(_ msg: String) {
        withAnimation(.easeInOut(duration: 0.2)) { refreshToast = msg }
        Task {
            try? await Task.sleep(nanoseconds: 1_600_000_000)   // PWA 1600ms
            withAnimation(.easeInOut(duration: 0.2)) {
                if refreshToast == msg { refreshToast = nil }
            }
        }
    }

    /// 공유 완료 시 share_count +1 — 낙관적 로컬 증가 후 RPC, 결과로 정정. PWA bumpShareCount
    /// 미러(액션이 아니라 실제 공유 완료에 연결). 익명도 허용(RPC 가 SECURITY DEFINER).
    private func bumpShare(_ card: Card) {
        let current = shareCountOverrides[card.cardId] ?? (card.shareCount ?? 0)
        shareCountOverrides[card.cardId] = current + 1   // 낙관적
        Task {
            if let newCount = try? await Supa.shared.incrementShareCount(cardId: card.cardId) {
                shareCountOverrides[card.cardId] = newCount   // 서버 권위값으로 정정
            }
        }
    }

    /// 익명 3회 제한 게이트(PWA refreshTodayCard / REFRESH_LIMIT) — 통과하면 true
    /// (익명이면 카운트 +1 포함), 한도 도달이면 '3번까지' 모달을 띄우고 false. 회원은
    /// 항상 true. 헤더 버튼·센터 재탭·당겨서 새로고침이 모두 이 게이트를 통과한다.
    private func passAnonRefreshGate() -> Bool {
        guard session.isAnonymous else { return true }
        if AnonRefreshLimit.atLimit {
            promptTitle = "새로운 명대사는 3번까지"
            promptMessage = "오늘 명대사를 3번 받아보셨어요.\n로그인하면 무제한으로 고전 명대사를 즐길 수 있어요."
            showAccountPrompt = true
            return false
        }
        AnonRefreshLimit.bump()
        return true
    }

    /// TODAY 새로고침(헤더 버튼·센터 재탭) — 익명 게이트 통과 시 새 카드.
    private func handleRefreshTap() {
        guard passAnonRefreshGate() else { return }
        Task { await reload(deterministic: false) }
    }

    /// 당겨서 새로고침 — 헤더 버튼과 동일한 익명 3회 제한을 적용(같은 게이트). 한도면
    /// 모달만 띄우고 새로고침하지 않으므로 기본 스피너도 즉시 끝난다.
    private func pullToRefresh() async {
        guard passAnonRefreshGate() else { return }
        await reload(deterministic: false)
    }

    private func toggleBookmark(cardId: Int) {
        guard !session.isAnonymous else {
            promptTitle = "북마크는 회원 전용"
            promptMessage = "마음에 든 명대사를 보관하려면 로그인이 필요해요."
            showAccountPrompt = true
            return
        }
        Task {
            await bookmarks.toggle(userId: session.userId, cardId: cardId)
            await refreshBookmarkCounts(for: [todayCard].compactMap { $0 } + recent)
        }
    }

    private func refreshBookmarkCounts(for cards: [Card]) async {
        let ids = Array(Set(cards.map(\.cardId)))
        guard !ids.isEmpty else {
            bookmarkCounts = [:]
            return
        }
        do {
            bookmarkCounts = try await Supa.shared.fetchBookmarkCounts(cardIds: ids)
        } catch {
            // Keep counts cosmetic; failures should not block reading.
        }
    }


    /// 지난 기록 — recently shown cards (newest first), excluding the current one.
    private func buildRecent() -> [Card] {
        let ids = Array(prefs.recentlyShown.dropLast().reversed().prefix(3))
        return ids.compactMap { id in allCards.first { $0.cardId == id } }
    }
}

/// 카드 상단~인용~출처(탭하면 상세). 하단 액션 행/구분선/키워드/Read 버튼은 상위
/// `todayCardView` 가 링크 밖에서 그린다(북마크·공유 버튼이 탭을 가로채지 않도록).
private struct TodayCardBody: View {
    let card: Card?
    let isLoading: Bool
    let showOriginal: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                if let format = card?.work.format.label(original: showOriginal), !format.isEmpty {
                    Chip(text: format, filled: true)
                }
                // PWA renderCountsForToday: 포맷 칩 옆에 조회 · 댓글 (북마크 수는 하단 아이콘으로
                // 이동, m-app.js:2027/2245). 키워드는 하단 해시태그로만 표시(상단 칩 없음).
                if let card {
                    HStack(spacing: 6) {
                        Label(Self.countText(card.viewCount ?? 0), systemImage: "eye")
                        Text("·").foregroundStyle(.walnut)
                        Label(Self.countText(card.commentCount ?? 0), systemImage: "bubble.right")
                    }
                    .font(.bodySans(12))
                    .foregroundStyle(.walnut)
                    .labelStyle(.titleAndIcon)
                    .padding(.leading, 2)
                }
                Spacer()
            }
            Spacer().frame(height: 20)
            if let speaker {
                Text(speaker)
                    .font(.bodySans(17))
                    .fontWeight(.bold)
                    .foregroundStyle(.espresso)
                Spacer().frame(height: 12)
            }
            Text(card.map { "\u{201C}\($0.displayQuote(original: showOriginal))\u{201D}" } ?? (isLoading ? "불러오는 중…" : "—"))
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
                .bookLeading(size: 22)
            if let workLine {
                Spacer().frame(height: 20)
                Text(workLine)
                    .font(.bodySans(16))
                    .foregroundStyle(.walnut)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Speaker is derived from the displayed script by matching `work.characters`.
    /// In the ENG view the script is English while characters are Korean names,
    /// PWA formatCount 미러 — 1000 미만은 그대로, 이상은 k 표기.
    static func countText(_ v: Int) -> String {
        if v < 1_000 { return "\(v)" }
        let k = Double(v) / 1_000
        return k >= 10 ? "\(Int(k.rounded()))k" : "\((k * 10).rounded() / 10)k"
    }

    /// so no match is found and the speaker line is simply hidden (never wrong,
    /// never blank content).
    private var speaker: String? {
        guard let card else { return nil }
        let names = card.work.characters
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !names.isEmpty else { return nil }
        for line in card.displayScript(original: showOriginal).components(separatedBy: .newlines).prefix(6) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            let head = trimmed.components(separatedBy: CharacterSet(charactersIn: ":：(")).first ?? trimmed
            if names.contains(head) { return head }
        }
        return nil
    }

    private var workLine: String? {
        guard let card else { return nil }
        let displayTitle = card.work.displayTitle(original: showOriginal)
        let displaySubtitle = card.work.displaySubtitle(original: showOriginal)
        let title = displaySubtitle?.isEmpty == false
            ? "<\(displayTitle)> \(displaySubtitle!)"
            : "<\(displayTitle)>"
        let format = card.work.format.label(original: showOriginal)
        return format.isEmpty ? "— \(title)" : "— \(format) \(title)"
    }
}
