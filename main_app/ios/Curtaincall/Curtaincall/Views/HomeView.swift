import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: Tab
    /// TODAY(center) 재탭 토큰 — 증가하면 새 명대사 새로고침(상단 버튼과 동일 경로).
    var reselect: Int = 0
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var prefs: PrefsStore
    @EnvironmentObject private var coach: CoachController
    @EnvironmentObject private var network: NetworkMonitor
    @Environment(\.appOfflineNoticeActive) private var appOfflineNoticeActive
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
    @State private var bookmarkHaptic = 0

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
            // 전역 오프라인 스트립이 이미 같은 사실을 말하고 있으면 화면별 배너는 숨긴다.
            if fetchFailed && !appOfflineNoticeActive {
                FetchErrorBanner { Task { await reload(deterministic: true) } }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 32)
                    Text(Self.formattedToday)
                        .labelCaps()
                        .frame(maxWidth: .infinity)
                    Spacer().frame(height: 8)
                    // 새로고침 버튼 제거 — 갱신은 '당겨서 새로고침' + TODAY 탭 재선택(handleRefreshTap)으로 유지.
                    Text("오늘의 명대사")
                        .font(.displaySerif(28))
                        .foregroundStyle(.espresso)
                        .frame(maxWidth: .infinity)
                    Spacer().frame(height: 20)

                    if let card = todayCard {
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
                    } else if fetchFailed {
                        // 캐시가 하나도 없는 채로 실패한 경우(오프라인 콜드 스타트). 예전엔
                        // 이 자리가 통째로 비어 '지난 기록'만 덩그러니 남아 고장난 화면처럼
                        // 보였다 — 무엇이 없는지, 무엇을 하면 되는지 명시한다(H-27).
                        VStack(spacing: 12) {
                            Text("오늘의 명대사를 불러오지 못했어요.")
                                .font(.bodySans(14))
                                .foregroundStyle(.walnut)
                                .multilineTextAlignment(.center)
                            Button { Task { await reload(deterministic: true) } } label: {
                                Text("다시 시도").editorialButton(style: .filled)
                            }
                            .buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                        .padding(.horizontal, 20)
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
                    // 104 = 필 블록 보상 — safeAreaInset 은 TabView 페이지에 전파되지 않아
                    // 40 이면 스크롤 끝(지난 기록)이 글래스 필 뒤에 멈춘다(기기 QA, Feed 동일 값).
                    Spacer().frame(height: 104)
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
            // 상세에서 북마크를 걸고 돌아오면 홈의 숫자가 그대로였다(외부 QA H-33).
            // 카드를 다시 고르거나 로딩 상태로 되돌리지 않고 **숫자만** 다시 읽는다 —
            // 같은 오늘 카드가 유지돼야 한다는 게 이 항목의 요건이다.
            .onDisappear {
                Task { await refreshBookmarkCounts(for: [todayCard].compactMap { $0 } + recent) }
            }
        }
        // 공유 시트 — 완료 시에만 카운트 +1 (취소는 무시), PWA bumpShareCount 미러.
        .sheet(item: $shareCard) { card in
            ActivityShareSheet(items: ActivityShareSheet.items(for: card)) { completed in
                if completed { bumpShare(card) }
            }
        }
        .task { await loadOnce() }
        .sensoryFeedback(.impact(flexibility: .soft), trigger: bookmarkHaptic)
        .task { await bookmarks.load(userId: session.userId) }
        .onChange(of: session.userId) { _, newValue in
            Task { await bookmarks.load(userId: newValue) }
        }
        // 연결 회복 → 실패로 멈춘 화면의 자기 복구(H-24 의 화면 계층 몫, #200 후속).
        // RootView 는 세션·회원 데이터만 되살린다 — 오늘 카드는 이 화면의 hasLoaded
        // 래치 뒤라 신호를 직접 받아야 한다. **실패 상태일 때만** 돈다: 멀쩡한 화면의
        // 카드를 바꿔치기하지 않는다(H-27 비파괴 원칙). deterministic 재시도라 익명
        // 쿼터와도 무관하다(수동 '다시 시도' 버튼과 같은 경로).
        .onChange(of: network.reconnectToken) { _, _ in
            Task {
                // ⚠️ **진행 중인 로드가 끝난 뒤에** 판단한다. 지금 당장 fetchFailed 를 보면
                // 오프라인 콜드 스타트에서 신호가 통째로 버려진다 — `.task` 의 첫 요청이 아직
                // 도는 중이라 fetchFailed 는 아직 false 이고, 그 요청은 곧 실패하는데 다음
                // 토큰은 오지 않아 실패 화면에 영구히 갇힌다(리뷰 P1). #200 에서 부트스트랩에
                // 대해 고친 것과 같은 타이밍 문제라 같은 방식으로 맞춘다.
                //
                // 토큰이 연달아 와도 안전하다: MainActor 직렬 실행이라 먼저 깬 Task 가
                // reload 첫 줄에서 isLoading=true 를 세운 뒤에야 다른 Task 가 돌고, 그때는
                // 다시 대기로 들어간다. 그 사이 복구에 성공했으면 아래 가드가 걸러낸다.
                while isLoading { try? await Task.sleep(nanoseconds: 200_000_000) }
                // 비파괴 가드는 그대로 — 멀쩡히 그려진 화면의 카드는 바꾸지 않는다.
                guard fetchFailed else { return }
                await reload(deterministic: true)
            }
        }
        // 신원 초기화 — PrefsStore 가 로컬을 비운 '뒤' 신호가 온다. UserDefaults 만 지우면
        // 이미 그려진 이전 사용자의 오늘 카드·최근 목록이 게스트에게 그대로 보였다(P1).
        // hasLoaded 를 되돌려 loadOnce 를 다시 태운다 — prefSelected 는 유지되므로
        // 온보딩이 다시 뜨지는 않는다.
        .onChange(of: prefs.identityResetToken) { _, _ in
            todayCard = nil
            recent = []
            hasLoaded = false
            Task { await loadOnce() }
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
            // KR/ENG 토글 — 카드 밖(위)에서 카드 '안' 우상단으로 이동(원문 있는 카드만).
            if card.hasHomeOriginalLanguage {
                HStack {
                    Spacer()
                    LangToggle(showOriginal: $todayShowOriginal)
                }
                .padding(.bottom, 12)
            }
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
                // 투어 중에만 프레임 발행 — 스크롤 안 앵커는 매 프레임 global frame 이
                // 변해 preference 전파 → RootView 리렌더 → 글래스 필 재합성으로 TODAY
                // 스크롤이 버벅였다(기기 QA). 비활성 시 상수 빈 값이라 전파 비용 0.
                .coachAnchor("today_bookmark", active: coach.active)
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
            .coachAnchor("today_read", active: coach.active)   // 위와 동일 — 투어 중에만 발행
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
    /// `refundQuotaOnFailure`: **이 호출이** 익명 쿼터를 소모했는가(게이트가 소모 시점에
    /// 기록). 실패 환불은 이 값만 본다 — 완료 시점의 세션 상태는 믿지 않는다.
    private func reload(deterministic: Bool, refundQuotaOnFailure: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        // 이번 새로고침이 **실제로 서버에 닿았는지**. 예전엔 fetch 가 throw 할 때만 실패로
        // 쳤는데, `allCards` 가 이미 차 있으면 그 fetch 자체를 건너뛴다. 그래서 비행기
        // 모드로 당겨서 새로고침해도 메모리 풀에서 카드를 새로 뽑고 '갱신됨' 토스트까지
        // 띄웠다 — 오래된 내용을 방금 받아온 것처럼 보여준 셈이다(외부 QA H-27).
        //
        // ⚠️ 순서가 요건이다: **서버 확인이 끝나기 전에는 아무 상태도 커밋하지 않는다.**
        // 처음 고칠 때는 실패 '보고'만 바로잡고 카드 교체는 그대로 뒀는데, 그러면 오프라인
        // 새로고침이 여전히 카드를 바꿔놓고 나서 실패를 알렸다 — 사용자 입장에선 실패했다면서
        // 화면은 바뀐 셈이다(리뷰 지적). 후보 선정 → 서버 확인 → **그때만** 커밋.
        var reachedServer = true
        do {
            if allCards.isEmpty {
                allCards = try await CardCache.shared.cards()   // 세션 공유(무료 티어 부하↓)
            }
            // 1) 후보만 고른다 — 여기까지는 화면에 아무 영향이 없다.
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
            // 2) 서버 확인 겸 카운트 수집. 커밋 후 화면에 나타날 수 있는 카드 전부를 미리
            //    묻는다 — 현재 오늘 카드는 커밋 뒤 '지난 기록'으로 내려가므로 함께 포함한다.
            let probe = ([pick, todayCard].compactMap { $0 } + recent)
            let counts = await fetchCounts(for: probe)
            reachedServer = counts != nil
            // 3) 커밋 여부.
            //    · 카운트를 받았으면 당연히 커밋.
            //    · 못 받았어도 **지킬 화면이 없으면**(아직 오늘 카드가 없다) 커밋한다.
            //      커밋 보류는 '실패한 새로고침이 멀쩡한 화면을 바꿔놓는 것'을 막으려는
            //      장치인데, 보여줄 카드가 애초에 없으면 막을 대상도 없다. 여기서 무조건
            //      보류하면 카운트 조회 한 번 실패했다고 카드 자체를 못 보여주게 된다
            //      (숫자는 장식인데 본문을 잃는 셈 — 첫 로드 회귀).
            if counts != nil || todayCard == nil {
                if let pick { prefs.rememberShown(pick.cardId) }
                todayCard = pick
                coach.tourCard = pick   // 코치 투어 openDetail 대상(실제 오늘 카드)

                todayShowOriginal = false  // 새 카드는 항상 한국어부터 (PWA와 동일)
                recent = buildRecent()
                bookmarkCounts = counts ?? [:]
            }
            // 커밋을 보류한 경우 화면은 이전 상태 그대로 — reachedServer=false 로 배너가 뜬다.
        } catch {
            reachedServer = false
        }
        fetchFailed = !reachedServer
        // 익명 3회 제한은 '새 명대사를 받았을 때'의 대가다. 실패해서 카드가 그대로면
        // 소모분을 돌려준다 — 안 그러면 비행기 모드에서 당기기만 해도 한도가 닳는다.
        // 판단 기준은 오직 '이 요청이 소모했는가'(파라미터). deterministic 여부나 지금의
        // isAnonymous 를 다시 볼 필요가 없다 — 소모한 요청만 true 를 들고 온다.
        if refundQuotaOnFailure, !reachedServer { AnonRefreshLimit.refund() }
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

    /// 익명 3회 제한 게이트(PWA refreshTodayCard / REFRESH_LIMIT) — 통과 여부와 함께
    /// **이 호출이 쿼터를 실제로 소모했는지**를 돌려준다. 환불 판단은 완료 시점의
    /// `session.isAnonymous` 를 다시 읽으면 안 된다(리뷰 지적) — 요청이 도는 사이 로그인/
    /// 로그아웃이 끼면, 소모한 쿼터를 못 돌려받거나(익명 시작→회원 종료) 소모하지도 않은
    /// 쿼터를 돌려줘 공짜 새로고침이 생긴다(회원 시작→익명 종료). 소모 사실은 소모한
    /// 시점에 기록해 요청에 딸려 보낸다. 회원은 항상 (true, false).
    private func passAnonRefreshGate() -> (pass: Bool, consumedQuota: Bool) {
        guard session.isAnonymous else { return (true, false) }
        if AnonRefreshLimit.atLimit {
            promptTitle = "새로운 명대사는 3번까지"
            promptMessage = "오늘 명대사를 3번 받아보셨어요.\n로그인하면 무제한으로 고전 명대사를 즐길 수 있어요."
            showAccountPrompt = true
            return (false, false)
        }
        AnonRefreshLimit.bump()
        return (true, true)
    }

    /// TODAY 새로고침(헤더 버튼·센터 재탭) — 익명 게이트 통과 시 새 카드.
    private func handleRefreshTap() {
        let gate = passAnonRefreshGate()
        guard gate.pass else { return }
        Task { await reload(deterministic: false, refundQuotaOnFailure: gate.consumedQuota) }
    }

    /// 당겨서 새로고침 — 헤더 버튼과 동일한 익명 3회 제한을 적용(같은 게이트). 한도면
    /// 모달만 띄우고 새로고침하지 않으므로 기본 스피너도 즉시 끝난다.
    private func pullToRefresh() async {
        let gate = passAnonRefreshGate()
        guard gate.pass else { return }
        await reload(deterministic: false, refundQuotaOnFailure: gate.consumedQuota)
    }

    private func toggleBookmark(cardId: Int) {
        guard !session.isAnonymous else {
            promptTitle = "북마크는 회원 전용"
            promptMessage = "마음에 든 명대사를 보관하려면 로그인이 필요해요."
            showAccountPrompt = true
            return
        }
        bookmarkHaptic += 1
        Task {
            await bookmarks.toggle(userId: session.userId, cardId: cardId)
            await refreshBookmarkCounts(for: [todayCard].compactMap { $0 } + recent)
        }
    }

    /// 카운트를 **읽어서 돌려주기만** 한다(상태 미변경). nil = 서버에 닿지 못함.
    ///
    /// 상태를 바꾸지 않는 게 요점이다 — `reload` 는 이 결과로 '커밋할지'를 정하므로,
    /// 여기서 미리 `bookmarkCounts` 를 갱신해버리면 실패한 새로고침이 화면 일부만 바꾸는
    /// 어중간한 상태가 된다. 카드 풀이 이미 메모리에 있으면 이 호출이 그 새로고침의
    /// **유일한 네트워크 왕복**이라, 도달 여부의 판정 지점이기도 하다(H-27).
    private func fetchCounts(for cards: [Card]) async -> [Int: Int]? {
        let ids = Array(Set(cards.map(\.cardId)))
        guard !ids.isEmpty else { return [:] }   // 부를 대상이 없다 = 네트워크 실패가 아니다
        return try? await Supa.shared.fetchBookmarkCounts(cardIds: ids)
    }

    /// 숫자만 조용히 갱신(북마크 토글 직후·상세 복귀). 실패하면 이전 숫자를 그대로 둔다 —
    /// 여기서의 실패는 장식 갱신 실패라 읽기를 막지 않는다.
    private func refreshBookmarkCounts(for cards: [Card]) async {
        if let counts = await fetchCounts(for: cards) { bookmarkCounts = counts }
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
                // 장르 배지 — Android 미러: 항상 영어 라벨(Chip 이 대문자화) + 장르별
                // 가죽 톤 색(chipColor). 기존엔 KR/ENG 토글을 따라 한글·espresso 단색이라
                // 장르 구분이 안 됐다(기기 QA).
                if let fmt = card?.work.format, !fmt.displayNameEnglish.isEmpty {
                    Chip(text: fmt.displayNameEnglish, filled: true, fillColor: fmt.chipColor)
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
