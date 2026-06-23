import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    /// TODAY(center) 재탭 토큰 — 증가하면 새 명대사 새로고침(상단 버튼과 동일 경로).
    var reselect: Int = 0
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
    // 당겨서 새로고침(Android RefreshableBox 미러: 실타래가 위에서 내려와 회전) + 갱신됨 토스트.
    @State private var pullDistance: CGFloat = 0
    @State private var pullArmed = false
    @State private var pullRefreshing = false
    @State private var pullCooldown = false   // 새로고침 직후 상단 복귀까지 인디케이터 재표시 억제
    @State private var spinAngle: Double = 0
    @State private var refreshToast: String?
    private let pullThreshold: CGFloat = 90

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
            // 당겨서 새로고침 — 스크롤이 위로 당겨진 거리를 추적, 임계 넘겨 놓으면 실행.
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in
                handlePull(offsetY: y)
            }
            .overlay(alignment: .top) { yarnPullIndicator }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        // Hero morph: inject the surface namespace to descendant cells (nil under
        // Reduce Motion disables the morph). Destination opts in explicitly below.
        .environment(\.cardHeroNamespace, reduceMotion ? nil : heroNS)
        .navigationDestination(for: Card.self) {
            CardDetailView(card: $0) {
                showAccountPrompt = false
                selectedTab = .settings
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
                        selectedTab = .settings
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
        // 새로고침 중에만 실타래를 연속 회전(750ms/회전, Android YarnRefreshIndicator).
        // 새로고침 중엔 실타래를 연속 회전(750ms/회전, Android YarnRefreshIndicator —
        // refreshing 동안 infiniteRepeatable linear). 센터 탭의 1회 .yarnSpin 과는 별개:
        // 인디케이터는 reload 가 길어져도 끝까지 돌아야 하므로 continuous 유지.
        .onChange(of: pullRefreshing) { _, refreshing in
            if refreshing {
                spinAngle = 0
                withAnimation(.linear(duration: 0.75).repeatForever(autoreverses: false)) {
                    spinAngle = 360
                }
            } else {
                spinAngle = 0
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

    /// Android YarnRefreshIndicator 미러 — 당기는 거리만큼 위에서 내려오며 페이드·확대·
    /// 살짝 감기고(windup), 새로고침 중엔 연속 회전. 실타래 = 하단탭 홈 버튼 아이콘.
    private var yarnPullIndicator: some View {
        let size: CGFloat = 50   // 상단 새로고침 실타래 — 네비 센터(54)보다 작게
        let restY: CGFloat = 16
        let shown: CGFloat = pullRefreshing ? 1 : min(1, pullDistance / pullThreshold)
        let translateY = -size + shown * (size + restY)
        let rotation: Double = pullRefreshing ? spinAngle : Double(shown) * 200
        return Image("daily-script-bar")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .opacity(Double(shown))
            .scaleEffect(0.5 + 0.5 * shown)
            .rotationEffect(.degrees(rotation))
            .offset(y: translateY)
            .allowsHitTesting(false)
    }

    /// 스크롤 당김 추적 — 임계(pullThreshold) 넘기면 arm, 손 떼고 상단 복귀 시 1회 실행.
    private func handlePull(offsetY: CGFloat) {
        guard !pullRefreshing else { return }
        let pull = max(0, -offsetY)
        // 새로고침 직후: 스크롤이 상단으로 튕겨 돌아오는 동안 잔여 당김값 때문에 실타래가
        // 깜빡 다시 떴다 사라지는 버그(갱신됨 토스트와 겹쳐 더 도드라짐) 방지 — 바운스백
        // 동안 인디케이터를 숨긴다. 해제는 pullRefresh 의 '시간 기반' 타이머가 하므로
        // 여기서 스크롤 콜백으로 해제하지 않는다(콜백이 더 안 와도 갇히지 않게).
        if pullCooldown {
            pullDistance = 0
            return
        }
        pullDistance = pull
        if pull >= pullThreshold { pullArmed = true }
        if pullArmed && pull <= 1 {
            pullArmed = false
            pullRefresh()
        }
    }

    /// 당겨서 새로고침 — 실타래 스피너를 돌리며 reload(랜덤). 토스트는 reload 안에서.
    /// (헤더 새로고침 버튼은 reload 를 직접 호출 → 같은 토스트, 버튼 라인은 안 건드림.)
    private func pullRefresh() {
        Task {
            pullRefreshing = true
            await reload(deterministic: false)
            // 끝나는 순간 인디케이터 즉시 숨김 + 바운스백 동안 재표시 억제(깜빡임 제거).
            pullDistance = 0
            pullCooldown = true
            pullRefreshing = false
            // 쿨다운을 '시간 기반'으로 해제 — 스크롤이 이미 정지해 콜백이 더 안 와도
            // 갇히지 않아 다음 당김을 먹지 않는다(Codex 리뷰). 바운스백(~0.3s)을 덮는 0.4s.
            try? await Task.sleep(nanoseconds: 400_000_000)
            pullCooldown = false
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

    /// TODAY 새로고침 — 비회원은 하루 3번 제한(PWA refreshTodayCard / REFRESH_LIMIT).
    /// 한도 도달 시 '새로운 명대사는 3번까지' 모달, 아니면 카운트 +1 후 새 카드. 회원은 무제한.
    private func handleRefreshTap() {
        if session.isAnonymous {
            if AnonRefreshLimit.atLimit {
                promptTitle = "새로운 명대사는 3번까지"
                promptMessage = "오늘 명대사를 3번 받아보셨어요.\n로그인하면 무제한으로 고전 명대사를 즐길 수 있어요."
                showAccountPrompt = true
                return
            }
            AnonRefreshLimit.bump()
        }
        Task { await reload(deterministic: false) }
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
            Text(card.map { "\u{201C}\($0.displayQuote(original: showOriginal))\u{201D}" } ?? (isLoading ? "Loading…" : "—"))
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
