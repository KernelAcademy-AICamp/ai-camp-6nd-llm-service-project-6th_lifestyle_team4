import SwiftUI

/// 피드에서 카드/하이라이트 상세가 푸시(item 기반 nav)되면 true. RootView 가 읽어
/// 글쓰기 고양이(FeedWriteCat)를 그 위로 새지 않게 숨긴다 — PWA 는 상세 화면에서
/// 글쓰기 fab 을 숨긴다(m-app.js: "카드 상세에서는 글쓰기 연필 fab 절대 안 보임").
struct FeedDetailPresentedPreferenceKey: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

struct FeedView: View {
    @Binding var selectedTab: Tab
    /// Bumped by RootView each time the already-active Feed tab is tapped — drives
    /// scroll-to-top + refresh.
    var reselect: Int = 0
    /// Bumped by RootView when the (RootView-owned) write bubble is tapped — routes
    /// to `handleWriteTap` so the category-aware toast/picker stays in FeedView.
    var writeTrigger: Int = 0
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var moderation: ModerationStore
    @Environment(\.requestLogin) private var requestLogin   // 로그인 유도 → 루트 인증 모달 직접 호출

    private static let topID = "feedTop"
    // content_likes target_type (043_content_likes.sql).
    private static let likeFeedPost = "feed_post"
    private static let likeHighlight = "highlight"

    @State private var category: FeedCategory = .today
    @State private var posts: [FeedPost] = []
    @State private var highlights: [CardHighlight] = []
    // 콘텐츠 좋아요(043) — id → {count, liked}. 비어 있으면 0/미좋아요로 표시.
    @State private var postLikes: [Int: ContentLikeUI] = [:]
    @State private var highlightLikes: [Int: ContentLikeUI] = [:]
    // 타깃별 토글 RPC 진행 중 가드 — 연타로 RPC 가 동시 실행되면 응답 역전으로
    // 하트/카운트가 실제 서버 상태와 어긋날 수 있어, 진행 중인 타깃의 재탭은 무시한다.
    @State private var likesInFlight: Set<String> = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showPicker = false
    @State private var composeCard: Card?
    @State private var selectedCard: Card?
    @State private var selectedHighlight: CardHighlight?
    @State private var detailPost: FeedPost?
    @State private var toastMessage: String?
    @State private var isSubmitting = false
    @State private var composeError: String?
    @State private var showWritePrompt = false   // 익명 글쓰기 → 로그인 모달

    // 차단한 사용자의 글/하이라이트는 가린다(App Store 1.2 — 차단 후 콘텐츠 비노출).
    private var visiblePosts: [FeedPost] {
        posts.filter { !moderation.isBlocked($0.userId) }
    }
    private var visibleHighlights: [CardHighlight] {
        highlights.filter { !moderation.isBlocked($0.userId) }
    }

    private var isEmpty: Bool {
        switch category {
        case .today: return visiblePosts.isEmpty
        case .highlight: return visibleHighlights.isEmpty
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead()
            // 피드 헤더(제목·태그라인·카테고리 필터)는 스크롤과 함께 사라지지 않도록
            // 매스트헤드 아래에 고정(ScrollView 밖)한다. 본문(글 목록)만 스크롤된다.
            feedHeader
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // 스크롤-투-탑 앵커(reselect 시 사용) — 고정 헤더 바로 아래, 본문 최상단.
                        Color.clear.frame(height: 0).id(Self.topID)

                        if let errorMessage {
                            FeedInlineError(message: errorMessage)
                            Spacer().frame(height: 14)
                        }

                        if isLoading && isEmpty {
                            centeredNote("불러오는 중⋯")
                        } else if isEmpty {
                            // 나의 감상평이 비면 FEED_SAMPLES 폴백, 하이라이트는 안내문.
                            if category == .today {
                                feedSamples
                            } else {
                                centeredNote(category.emptyText)
                            }
                        } else {
                            feedList
                        }
                        // 끝 여백 — 필(64+마진)만이 아니라 **글쓰기 고양이 머리**까지 지나야
                        // 마지막 글의 작성자 줄·본문이 가려지지 않는다(외부 QA A-55; SE 실측:
                        // "걸리버 여행기/조너선 스위프트"가 고양이 몸통에 두 줄 다 잘렸다).
                        // 92(고양이 키) − 10(발이 필에 걸친 만큼) + 12(숨통) = +94.
                        Spacer().frame(height: EditorialTabBar.pillTopInset + 94)
                    }
                    .padding(.horizontal, 20)
                }
                .yarnRefresh { await reload() }
                .onChange(of: reselect) { _, _ in
                    selectedCard = nil
                    selectedHighlight = nil
                    withAnimation { proxy.scrollTo(Self.topID, anchor: .top) }
                    Task { await reload() }
                }
                // 페이지-속-페이지 — 피드 본문 영역을 감싸는 은은한 테두리(latte 0.5pt, 가로 12pt
                // 인셋). 글 목록이 이 프레임 안에서 스크롤돼 '페이지 안의 페이지' 느낌.
                // (정확한 인셋·하단 위치는 실기기 QA 조정 대상.)
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.latte, lineWidth: 0.5)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                        .allowsHitTesting(false)
                }
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        // 글쓰기 말풍선+고양이(FeedWriteCat)는 RootView 가 탭바 '위(앞)' 레이어에
        // 그린다 — 그래야 고양이가 탭바에 앉고(뒤로 가리지 않고) 말풍선이 머리 위에
        // 뜬다(Android BottomNavBar 구성). 탭은 writeTrigger 로 위임받아 처리.
        .onChange(of: writeTrigger) { _, _ in handleWriteTap() }
        .overlay(alignment: .bottom) {
            if let toastMessage {
                Text(toastMessage)
                    .font(.bodySans(13))
                    .foregroundStyle(Color.paper)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.espresso))
                    .padding(.bottom, 130)
                    .transition(.opacity)
            }
        }
        // 익명 글쓰기 → '로그인이 필요해요' 모달 (PWA openFeedPicker). 로그인/회원가입 → 설정.
        .overlay {
            if showWritePrompt {
                AccountRequiredPrompt(
                    title: "로그인이 필요해요",
                    message: category == .highlight
                        ? "북마크한 카드에 하이라이트를 남기려면 로그인이 필요해요."
                        : "북마크한 명대사에 한줄을 남기려면 로그인이 필요해요.",
                    onLogin: { showWritePrompt = false; requestLogin() },   // MY 이동 대신 인증 모달
                    onClose: { showWritePrompt = false }
                )
            }
        }
        .navigationDestination(item: $selectedCard) { card in
            CardDetailView(card: card) {
                requestLogin()   // 카드 상세 댓글 게이트 → 인증 모달 직접 호출(MY 스크롤 헌트 제거)
            }
        }
        .navigationDestination(item: $selectedHighlight) { highlight in
            HighlightDetailView(highlight: highlight) { card in
                selectedCard = card
            }
        }
        // 카드/하이라이트 상세가 열리면 RootView 가 글쓰기 고양이를 숨기도록 신호.
        // (item 기반 nav 라 feedPath 에 안 잡혀서, 이 신호가 없으면 고양이가 상세 위로 샌다.)
        .preference(
            key: FeedDetailPresentedPreferenceKey.self,
            value: selectedCard != nil || selectedHighlight != nil
        )
        .task {
            await bookmarks.load(userId: session.userId)
            await reload()
        }
        .onChange(of: session.userId) { _, userId in
            Task {
                await bookmarks.load(userId: userId)
                await loadLikes()   // 로그인/로그아웃 시 내 좋아요(하트 채움) 반영
            }
        }
        .sheet(isPresented: $showPicker) {
            FeedBookmarkPicker(
                title: category.pickerTitle,
                cards: bookmarks.bookmarkCards,
                onPick: handlePickedCard
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $composeCard) { card in
            FeedComposeSheet(
                card: card,
                isSubmitting: isSubmitting,
                errorMessage: composeError
            ) { body in
                Task { await submitPost(card: card, body: body) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        // 포스트 탭 → 인용 팝업 대신 상세 시트 (Android FeedPostDetailSheet).
        .sheet(item: $detailPost) { post in
            FeedPostDetailSheet(
                post: post,
                like: postLikes[post.postId],
                onToggleLike: { toggleLike(targetType: Self.likeFeedPost, targetId: post.postId) }
            ) { card in
                detailPost = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { selectedCard = card }
            }
            // Android 상세 시트 높이 미러 — .medium 은 뒤 카드 하트 이중 노출,
            // .large 는 피드를 전부 덮어 과함(기기 QA 왕복). Android 실측 ≈ 화면 80%.
            .presentationDetents([.fraction(0.8)])
            .presentationDragIndicator(.visible)
            // 위로 스크롤이 시트 확장(detent 협상)에 먼저 먹혀 '스크롤이 무겁게' 느껴지던
            // 문제(QA 지적) — 콘텐츠 스크롤을 우선한다. 시트 확장은 드래그 인디케이터로.
            .presentationContentInteraction(.scrolls)
        }
    }

    // 글쓰기 말풍선 탭 처리 — 익명은 토스트, 회원은 북마크 피커. 말풍선 UI 는 RootView
    // 의 FeedWriteCat 이 그리고, 탭 시 writeTrigger 를 올려 이 핸들러로 위임한다.
    private func handleWriteTap() {
        if session.isAnonymous {
            // PWA openFeedPicker: 익명이면 '로그인이 필요해요' 모달 (토스트 X).
            showWritePrompt = true
        } else {
            showPicker = true
        }
    }

    /// 고정 피드 헤더 — 매스트헤드 아래, ScrollView 위에 핀. 제목·태그라인·카테고리 필터.
    /// 본문이 위로 스크롤돼도 가려지도록 paper 배경(불투명). 패딩은 본문 VStack 에서 분리돼
    /// 나왔으므로 여기서 직접 적용한다.
    private var feedHeader: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 24)
            Text("피드")
                .font(.displaySerif(32))
                .foregroundStyle(.espresso)
            // PWA 피드 헤더 태그라인 (index.html:1882).
            Spacer().frame(height: 6)
            Text("매일 한 문장, 그리고 기억에 남은 장면들")
                .font(.bodySans(13))
                .foregroundStyle(.walnut)
            Spacer().frame(height: 18)
            categoryChips
            Spacer().frame(height: 20)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .background(Color.paper)
    }

    private var categoryChips: some View {
        HStack(spacing: 8) {
            FeedChip(title: "나의 감상평", isSelected: category == .today) {
                category = .today
            }
            .coachAnchor("feed_today_chip")
            FeedChip(title: "하이라이트", isSelected: category == .highlight) {
                category = .highlight
            }
        }
    }

    private var feedList: some View {
        VStack(spacing: 12) {
            switch category {
            case .today:
                ForEach(visiblePosts) { post in
                    FeedPostCard(
                        post: post,
                        like: postLikes[post.postId],
                        onToast: showToast,
                        onToggleLike: { toggleLike(targetType: Self.likeFeedPost, targetId: post.postId) }
                    ) { detailPost = post }
                }
            case .highlight:
                ForEach(visibleHighlights) { highlight in
                    HighlightFeedCard(
                        highlight: highlight,
                        like: highlightLikes[highlight.highlightId],
                        onToast: showToast,
                        onToggleLike: { toggleLike(targetType: Self.likeHighlight, targetId: highlight.highlightId) }
                    ) {
                        selectedHighlight = highlight
                    }
                }
            }
        }
    }

    // 빈 피드 폴백 — Android FEED_SAMPLES 예시 글(탭 불가, 표지·댓글 없음).
    private var feedSamples: some View {
        VStack(spacing: 12) {
            ForEach(FeedSample.all) { sample in
                FeedSampleCard(sample: sample)
            }
        }
    }

    private func centeredNote(_ text: String) -> some View {
        Text(text)
            .font(.bodySans(14))
            .foregroundStyle(.walnut)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
    }

    private func showToast(_ message: String) {
        withAnimation { toastMessage = message }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            withAnimation { if toastMessage == message { toastMessage = nil } }
        }
    }

    private func reload() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        // 새 새로고침이 진행 중인 요청을 대체하면 Task 취소(CancellationError)가 난다 —
        // 무해하므로 배너로 띄우지 않는다. 실제 오류만 로깅 + 일반 안내(원시 시스템
        // 문자열은 사용자에게 노출하지 않음).
        var hadGenuineError = false
        do {
            posts = try await Supa.shared.fetchFeedPosts()
        } catch {
            if !AppLog.isCancellation(error) {
                AppLog.error("feed posts fetch", error)
                hadGenuineError = true
            }
        }
        do {
            highlights = try await Supa.shared.fetchCardHighlights()
        } catch {
            if !AppLog.isCancellation(error) {
                AppLog.error("feed highlights fetch", error)
                hadGenuineError = true
            }
        }
        errorMessage = hadGenuineError ? "피드를 불러오지 못했어요. 잠시 후 다시 시도해주세요." : nil
        // content_likes(043) — 카운트(전체) + 내 좋아요(회원). 실패는 흡수(목록 표시 유지).
        await loadLikes()
    }

    /// 좋아요 상태 로드 — 전체 카운트(content_like_counts) + 내 좋아요(content_likes, 회원만).
    /// Android FeedViewModel.loadLikes 미러: 카운트 target ∪ 내가 누른 target 의 합집합으로 맵 구성.
    private func loadLikes() async {
        let uid = session.userId
        let anon = session.isAnonymous
        let postCounts = (try? await Supa.shared.fetchContentLikeCounts(targetType: Self.likeFeedPost)) ?? [:]
        let hlCounts = (try? await Supa.shared.fetchContentLikeCounts(targetType: Self.likeHighlight)) ?? [:]
        var myPost: Set<Int> = []
        var myHl: Set<Int> = []
        if let uid, !anon {   // 게스트는 내 좋아요 건너뜀
            myPost = (try? await Supa.shared.fetchMyContentLikes(userId: uid, targetType: Self.likeFeedPost)) ?? []
            myHl = (try? await Supa.shared.fetchMyContentLikes(userId: uid, targetType: Self.likeHighlight)) ?? []
        }
        var pl: [Int: ContentLikeUI] = [:]
        for id in Set(postCounts.keys).union(myPost) {
            pl[id] = ContentLikeUI(count: postCounts[id] ?? 0, liked: myPost.contains(id))
        }
        var hl: [Int: ContentLikeUI] = [:]
        for id in Set(hlCounts.keys).union(myHl) {
            hl[id] = ContentLikeUI(count: hlCounts[id] ?? 0, liked: myHl.contains(id))
        }
        postLikes = pl
        highlightLikes = hl
    }

    /// 좋아요 토글 — 익명은 로그인 안내 토스트(Android 게스트 가드). 회원은 낙관적 업데이트
    /// 후 RPC, 성공하면 서버 {liked,count} 로 확정, 실패하면 원복. 같은 타깃의 RPC 가
    /// 진행 중이면 재탭 무시(연타 레이스 — 응답 역전/이중 롤백 방지).
    private func toggleLike(targetType: String, targetId: Int) {
        guard let uid = session.userId, !session.isAnonymous else {
            showToast("로그인하면 좋아요를 남길 수 있어요")
            return
        }
        let key = "\(targetType)#\(targetId)"
        guard !likesInFlight.contains(key) else { return }
        let isPost = (targetType == Self.likeFeedPost)
        let current = (isPost ? postLikes[targetId] : highlightLikes[targetId]) ?? ContentLikeUI(count: 0, liked: false)
        let optimistic = ContentLikeUI(
            count: max(0, current.count + (current.liked ? -1 : 1)),
            liked: !current.liked
        )
        if isPost { postLikes[targetId] = optimistic } else { highlightLikes[targetId] = optimistic }
        likesInFlight.insert(key)
        Task {
            defer { likesInFlight.remove(key) }
            do {
                let res = try await Supa.shared.toggleContentLike(userId: uid, targetType: targetType, targetId: targetId)
                let val = ContentLikeUI(count: res.count, liked: res.liked)
                if isPost { postLikes[targetId] = val } else { highlightLikes[targetId] = val }
            } catch {
                if !AppLog.isCancellation(error) { AppLog.error("toggle content like", error) }
                if isPost { postLikes[targetId] = current } else { highlightLikes[targetId] = current }
            }
        }
    }

    private func handlePickedCard(_ card: Card) {
        showPicker = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            switch category {
            case .today:
                composeError = nil
                composeCard = card
            case .highlight:
                selectedCard = card
            }
        }
    }

    private func submitPost(card: Card, body: String) async {
        guard !isSubmitting else { return }
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let userId = session.userId else {
            composeError = "로그인이 필요합니다."
            return
        }
        isSubmitting = true
        composeError = nil
        defer { isSubmitting = false }
        do {
            let nickname = session.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
            try await Supa.shared.addFeedPost(
                cardId: card.cardId,
                userId: userId,
                body: text,
                authorNickname: nickname.isEmpty ? nil : nickname
            )
            posts = try await Supa.shared.fetchFeedPosts()
            category = .today
            composeCard = nil
        } catch {
            // 원문 금지 — Supabase/URLSession 문구는 영문이라 한국어 UI 에 그대로 튄다(A-85).
            AppLog.error("feed post (feed)", error)
            composeError = "감상평을 등록하지 못했어요. 잠시 후 다시 시도해주세요."
        }
    }
}

private enum FeedCategory {
    case today
    case highlight

    var emptyText: String {
        switch self {
        case .today:
            return "아직 올라온 한줄이 없어요.\n첫 글을 남겨보세요."
        case .highlight:
            // PWA 두 줄 가이드 (index.html:1899-1900).
            return "아직 하이라이트가 없어요\n명대사 본문을 길게 눌러 한 구절을 하이라이트해보세요."
        }
    }

    var pickerTitle: String {
        switch self {
        case .today:
            return "어떤 명대사에 한줄을 남길까요?"
        case .highlight:
            return "어떤 카드에 하이라이트를 남길까요?"
        }
    }
}

private struct FeedChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Pretendard-Medium", size: 12))
                .foregroundStyle(isSelected ? Color.paper : Color.walnut)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 4).fill(isSelected ? Color.espresso : Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(isSelected ? Color.espresso : Color.latte, lineWidth: 0.8))
        }
        .buttonStyle(.plain)
    }
}

/// 글쓰기 FAB 누름 피드백 — PWA `#feed-fab:active { transform: scale(0.94) }` 미러.
private struct FeedFabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// 피드 글쓰기 — PWA(web_pwa) `#feed-fab` 미러: cat_pen 고양이 머리 위에 떠 있는
/// 주황 원형 연필 버튼. **RootView 가 탭바 '위(앞)' 레이어에 그린다** → 고양이가
/// 탭바에 앉고(뒤로 가리지 않고) 버튼이 머리 위에 뜬다. 버튼만 탭 가능(고양이는
/// click-through). 탭은 `onTap` 으로 위임. (고양이는 #76 그대로 유지.)
/// 글쓰기 FAB — 주황 원형 + 통통한 연필(커스텀 feed-pencil 에셋, 뾰족한 심). Android 처럼
/// 고양이와 **분리(decouple)**해 우측 하단(네비바 레벨)에 둔다(FeedScreen FAB BottomEnd).
struct FeedWriteFab: View {
    let onTap: () -> Void

    /// PWA #feed-fab 아이콘 색 (#FFFDF7) — 주황 원 위라 라이트/다크 모두 크림 고정.
    private static let fabIcon = Color(red: 1.0, green: 0.992, blue: 0.969)

    var body: some View {
        // (PWA index.html #feed-fab: 52×52, --cta, shadow 0 4 14 cta/.38)
        Button(action: onTap) {
            // Android FAB(Icons.Outlined.Edit) 미러 — 통통한 연필, 밑줄 없음
            // (기기 QA 라운드3: pencil.line 의 밑줄 제거 + 더 두껍게).
            Image(systemName: "pencil")
                .font(.system(size: 25, weight: .black))
                .foregroundStyle(Self.fabIcon)
                .frame(width: 52, height: 52)
                .background(Circle().fill(Color.cta))
                .shadow(color: Color.cta.opacity(0.38), radius: 7, x: 0, y: 4)
        }
        .buttonStyle(FeedFabButtonStyle())
        .accessibilityLabel("한 줄 쓰기")
    }
}

/// 글쓰기 고양이(cat_pen) — 좌측 하단 장식(Android cat-left, CatHBiasFeed=-1). 비상호작용.
struct FeedWriteCat: View {
    var body: some View {
        Image("cat_pen")
            .resizable()
            .scaledToFit()
            .frame(height: 92)            // Android CatHeightFeed=92 (#76 유지)
            .allowsHitTesting(false)
    }
}

private struct FeedInlineError: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.bodySans(12))
            .foregroundStyle(.cta)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.cta.opacity(0.5), lineWidth: 0.5))
    }
}

/// 콘텐츠 좋아요 UI 상태 — 카운트 + 내가 눌렀는지(content_likes 043).
private struct ContentLikeUI: Equatable {
    var count: Int
    var liked: Bool
}

/// 피드 카드 우상단 좋아요 하트(+수). 누르면 부모 onToggleLike(낙관적 토글). 좋아요=cta
/// 채운 하트, 미좋아요=walnut 빈 하트. 카운트 0이면 숨긴다(SS3a/Android 패리티).
private struct FeedLikeButton: View {
    let like: ContentLikeUI?
    let action: () -> Void

    var body: some View {
        let liked = like?.liked ?? false
        let count = like?.count ?? 0
        return Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .foregroundStyle(liked ? Color.cta : Color.walnut)
                // 카운트 슬롯은 항상 렌더(0이면 투명) — 조건부 삽입이면 0→1에서 버튼 폭이
                // 늘며 우측 정렬된 하트가 왼쪽으로 '점프'한다(QA 지적). 자리를 예약해 하트를
                // 고정하고, monospacedDigit 으로 같은 자릿수 안에서는 폭이 불변.
                Text("\(max(count, 0))")
                    .font(.bodySans(12))
                    .monospacedDigit()
                    .foregroundStyle(.walnut)
                    .opacity(count > 0 ? 1 : 0)
            }
            .font(.system(size: 15, weight: .regular))
            .frame(minWidth: 32, minHeight: 32)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(liked ? "좋아요 취소" : "좋아요")
        .accessibilityValue("\(count)")
    }
}

/// Post card header — avatar + nickname + "한 줄 리뷰 · time". Shared by the real
/// post card, the sample card, and the detail sheet.
private struct FeedPostHeader: View {
    let nickname: String
    let timeText: String
    /// 메타 줄 오버라이드 — 목록 카드는 기본("한 줄 리뷰 · {상대시간}", Android 목록과
    /// 동일), 상세 시트는 Android AuthorRow 처럼 모니커 없이 작성일시만 넘긴다.
    var metaOverride: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color.latte)
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.walnut)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(nickname)
                    .font(.bodySans(15))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                Text(metaOverride ?? "한 줄 리뷰 · \(timeText)")
                    .font(.bodySans(11))
                    .foregroundStyle(.roast)
            }
            Spacer()
        }
        .padding(16)
    }
}

private struct FeedPostCard: View {
    let post: FeedPost
    var like: ContentLikeUI? = nil
    var onToast: (String) -> Void = { _ in }
    var onToggleLike: () -> Void = {}
    let onTap: () -> Void
    @EnvironmentObject private var session: AuthSession

    var body: some View {
        ZStack(alignment: .topTrailing) {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                FeedPostHeader(
                    nickname: post.authorNickname?.ifEmpty("익명") ?? "익명",
                    timeText: FeedTime.relative(post.createdAt)
                )
                Text(post.body)
                    .font(.headlineSerif(18))
                    .fontWeight(.bold)
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 18)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 40)
                    .background(Color.cardWarm)

                // 책 줄 + 초판 표지가 오른쪽 아래로 '빼꼼' (cover_url, 없으면 가죽 폴백).
                ZStack(alignment: .bottomTrailing) {
                    VStack(alignment: .leading, spacing: 4) {
                        // PWA buildFeedItem: displayTitle(title) — 제목만(부제 제외).
                        Text(post.card?.work.title ?? "—")
                            .font(.bodySans(15))
                            .foregroundStyle(.espresso)
                            .lineLimit(1)
                        if let author = post.card?.work.author, !author.isEmpty {
                            Text(author)
                                .font(.bodySans(13))
                                .foregroundStyle(.walnut)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .padding(.trailing, 68)   // keep the title clear of the cover
                    WorkCover(work: post.card?.work, width: 60, height: 86, compact: true)
                        .padding(.trailing, 20)
                        .offset(y: 20)        // peek below the clipped card edge
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.paper)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: Color.black.opacity(0.10), radius: 6, x: 0, y: 3)
        }
        .buttonStyle(.plain)

        // 우상단 — 좋아요 하트(+수) + (남의 글이면)신고 메뉴(App Store 1.2). 카드 Button
        // 밖 레이어라 탭이 상세 이동으로 새지 않는다. 신고는 하트와 나란히 두므로 ⋯ 대신 flag.
        HStack(spacing: 2) {
            FeedLikeButton(like: like, action: onToggleLike)
            if session.userId != post.userId {
                ModerationMenu(
                    target: .feedPost(post.postId),
                    authorUserId: post.userId,
                    onToast: onToast,
                    icon: "flag"
                )
            }
        }
        .padding(.top, 8)
        .padding(.trailing, 6)
        }
    }
}

/// Empty-feed sample card — same layout as a post, no cover/tap (Android FEED_SAMPLES).
private struct FeedSample: Identifiable {
    let nick: String
    let timeAgo: String
    let body: String
    let title: String
    let author: String
    var id: String { nick }

    static let all: [FeedSample] = [
        .init(nick: "춤추는 늑대", timeAgo: "방금",
              body: "처음 읽었을 때보다 다시 펼쳤을 때 더 좋았다.\n홈즈의 관찰력은 결국 사람을 향한 관심이라는 걸 이제야 알겠다.",
              title: "셜록 홈즈", author: "아서 코난 도일"),
        .init(nick: "별 보는 고양이", timeAgo: "12시간 전",
              body: "사느냐 죽느냐, 그 한 줄 앞에서 한참을 멈췄다.\n오래된 문장인데 하나도 낡지 않았다.",
              title: "햄릿", author: "윌리엄 셰익스피어"),
        .init(nick: "댄싱 울프", timeAgo: "3시간 전",
              body: "추리보다 인물이 남는 이야기.\n다 읽고 나면 사건은 잊혀도 그 새벽의 공기는 오래 기억에 남는다.",
              title: "셜록 홈즈", author: "아서 코난 도일"),
        .init(nick: "노래하는 강아지", timeAgo: "3일 전",
              body: "아무 일도 일어나지 않는데 자꾸 마음이 움직인다.\n체호프는 늘 그런 식이다.",
              title: "바냐 아저씨", author: "안톤 체호프"),
        .init(nick: "책 읽는 여우", timeAgo: "5일 전",
              body: "개츠비가 바라본 초록 불빛이 오늘따라 내 것처럼 느껴졌다.",
              title: "위대한 개츠비", author: "F. 스콧 피츠제럴드"),
    ]
}

private struct FeedSampleCard: View {
    let sample: FeedSample

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FeedPostHeader(nickname: sample.nick, timeText: sample.timeAgo)
            Text(sample.body)
                .font(.headlineSerif(18))
                .fontWeight(.bold)
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .bookLeading(size: 18)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 28)
                .padding(.vertical, 40)
                .background(Color.cardWarm)
            VStack(alignment: .leading, spacing: 4) {
                Text(sample.title).font(.bodySans(15)).foregroundStyle(.espresso).lineLimit(1)
                Text(sample.author).font(.bodySans(13)).foregroundStyle(.walnut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.paper)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.10), radius: 6, x: 0, y: 3)
    }
}

private struct HighlightFeedCard: View {
    let highlight: CardHighlight
    var like: ContentLikeUI? = nil
    var onToast: (String) -> Void = { _ in }
    var onToggleLike: () -> Void = {}
    let onTap: () -> Void
    @EnvironmentObject private var session: AuthSession

    var body: some View {
        ZStack(alignment: .topTrailing) {
        Button(action: onTap) {
            VStack(alignment: .center, spacing: 0) {
                Text(highlight.authorNickname?.ifEmpty("익명") ?? "익명")
                    .font(.bodySans(14))
                    .fontWeight(.semibold)
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                if !metaText.isEmpty {
                    Spacer().frame(height: 6)
                    Text(metaText).labelCaps(size: 10).lineLimit(1)
                }
                Spacer().frame(height: 22)
                // 실제 초판 표지 (cover_url) → 없으면 가죽 폴백.
                WorkCover(work: highlight.card?.work)
                // 표지 아래 — 제목 + 작가 · 연도 (Android .hl-book-info).
                Spacer().frame(height: 12)
                Text(highlight.card?.work.title ?? "—")
                    .font(.titleSerif(14))
                    .fontWeight(.semibold)
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                if !authorYear.isEmpty {
                    Spacer().frame(height: 3)
                    Text(authorYear)
                        .font(.bodySans(11))
                        .foregroundStyle(.walnut)
                        .multilineTextAlignment(.center)
                }
                Spacer().frame(height: 22)
                Text("“")
                    .font(.headlineSerif(22))
                    .foregroundStyle(.sand)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 22)
                // LLM 출력의 `**화자**` 마커가 그대로 노출되던 문제 — markdownBold 로 볼드 변환.
                // 긴 구절은 4줄로 접고 '더 보기/접기'(PWA·Android FoldableText 패리티).
                FoldableText(text: highlight.selectedText.markdownBold, font: .titleSerif(15), leading: 15)
                    .padding(.horizontal, 28)
                Text("”")
                    .font(.headlineSerif(22))
                    .foregroundStyle(.sand)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.trailing, 22)
                // userNote 는 상세 시트에서만 (Android 패리티) — 카드에선 제거.
                Spacer().frame(height: 18)
                Text("#\(highlight.cardId)")
                    .labelCaps(size: 10)
            }
            .padding(.horizontal, 18)
            .padding(.top, 28)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity)
            // 사각 모서리 + cardWarm + 0.5 latte 테두리 (Android HighlightCard).
            .background(Color.cardWarm)
            .overlay(Rectangle().stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)

        // 우상단 — 좋아요 하트(+수) + (남의 하이라이트면)신고 메뉴(App Store 1.2).
        HStack(spacing: 2) {
            FeedLikeButton(like: like, action: onToggleLike)
            if session.userId != highlight.userId {
                ModerationMenu(
                    target: .highlight(highlight.highlightId),
                    authorUserId: highlight.userId,
                    onToast: onToast,
                    icon: "flag"
                )
            }
        }
        .padding(.top, 6)
        .padding(.trailing, 4)
        }
    }

    private var metaText: String {
        [highlight.card?.work.format.displayName, highlight.createdDate.map(Self.dateText)]
            .compactMap { v in (v?.isEmpty == false) ? v : nil }
            .joined(separator: "  ·  ")
    }

    private var authorYear: String {
        [highlight.card?.work.author, highlight.card?.work.releaseYear.map(String.init)]
            .compactMap { v in (v?.isEmpty == false) ? v : nil }
            .joined(separator: " · ")
    }

    /// nonisolated — 순수 날짜 포맷인데 `map(Self.dateText)` 로 함수 참조를
    /// nonisolated 클로저에 넘기면 파일 기본 MainActor 격리 때문에 경고가 난다.
    private nonisolated static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }
}

/// Post detail sheet (Android FeedPostDetailSheet). Shows the review + its source
/// card; "명대사 읽어보기" opens the full card. Below the body, the PWA feed_post_comments
/// section (list + compose, 500자, 로그인 게이트) via the shared CommentsModel(.feedPost).
private struct FeedPostDetailSheet: View {
    let post: FeedPost
    /// 목록과 동일한 좋아요 소스(FeedView.postLikes) — 시트에서 토글해도 목록 카드
    /// 하트/카운트가 함께 갱신된다(부모 상태 공유).
    let like: ContentLikeUI?
    let onToggleLike: () -> Void
    let onOpenCard: (Card) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.requestLogin) private var requestLogin   // 비로그인 안내 탭 → 인증 모달
    @EnvironmentObject private var session: AuthSession
    @StateObject private var comments: CommentsModel
    @FocusState private var composerFocused: Bool
    @State private var moderationToast: String?

    private func showModerationToast(_ message: String) {
        withAnimation { moderationToast = message }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            withAnimation { if moderationToast == message { moderationToast = nil } }
        }
    }

    init(post: FeedPost, like: ContentLikeUI?, onToggleLike: @escaping () -> Void, onOpenCard: @escaping (Card) -> Void) {
        self.post = post
        self.like = like
        self.onToggleLike = onToggleLike
        self.onOpenCard = onOpenCard
        _comments = StateObject(wrappedValue: CommentsModel(backend: .feedPost(post.postId)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header — "DAILY SCRIPT" 라벨 + 닫기 (Android HeaderRow 공용).
            HStack {
                Text("DAILY SCRIPT")
                    .font(.custom("Pretendard-Medium", size: 11))
                    .tracking(2.2)
                    .foregroundStyle(.walnut)
                Spacer()
                // 남의 글이면 신고·차단(App Store 1.2). 댓글 신고는 아래 CommentsSection.
                if session.userId != post.userId {
                    ModerationMenu(
                        target: .feedPost(post.postId),
                        authorUserId: post.userId,
                        onToast: showModerationToast,
                        onBlocked: { dismiss() }   // 차단 후 상세 닫기 — 차단 콘텐츠 잔류 방지
                    )
                }
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.espresso)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
            }
            // "DAILY SCRIPT" 라벨이 시트 모서리·드래그 핸들에 붙어 보이던 문제(QA) —
            // Android HeaderRow 수준의 여백(가로 20 · 위 18 · 아래 6)으로 숨통.
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 6)
            // ScrollViewReader 는 ScrollView 소유자인 여기서 감싼다 — 답글 진입 시
            // 대상 댓글 상단 스크롤(replyAutoScroll)이 이 프록시로 동작한다.
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let card = post.card {
                        quoteCard(card)
                        Spacer().frame(height: 20)
                    }
                    FeedPostHeader(
                        nickname: post.authorNickname?.ifEmpty("익명") ?? "익명",
                        timeText: FeedTime.relative(post.createdAt),
                        // 상세는 Android AuthorRow 패리티 — "한 줄 리뷰" 모니커 없이
                        // 작성일시("M. d 오전/오후 h:mm")만.
                        metaOverride: FeedTime.stamp(post.createdAt)
                    )
                    // 하트+카운트 — 작성자 행 트레일링(아바타·닉네임과 인라인). 목록과
                    // 같은 상태 소스라 시트 토글이 목록 카드에도 반영된다. 게스트 탭은
                    // 시트 안 토스트(하단 토스트는 시트에 가려 보이지 않음).
                    .overlay(alignment: .trailing) {
                        FeedLikeButton(like: like) {
                            if session.isAnonymous {
                                showModerationToast("로그인하면 좋아요를 남길 수 있어요")
                            } else {
                                onToggleLike()
                            }
                        }
                        .padding(.trailing, 16)
                    }
                    Spacer().frame(height: 16)
                    Text(post.body)
                        .font(.titleSerif(16))
                        .foregroundStyle(.espresso)
                        .bookLeading(size: 16)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                    Spacer().frame(height: 24)
                    Hairline().padding(.horizontal, 20)
                    Spacer().frame(height: 20)
                    // PWA 피드 게시물 댓글 — 공유 CommentsModel(.feedPost) 재사용.
                    CommentsSection(
                        model: comments,
                        userId: session.userId,
                        isAnonymous: session.isAnonymous,
                        nickname: session.nickname,
                        copy: .feedPost
                    )
                    .padding(.horizontal, 20)
                    Spacer().frame(height: 24)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            // REPLY 탭 → 대상 댓글을 상단(고정 헤더 아래)으로 (보드 #38, PWA scrollIntoView 미러).
            .replyAutoScroll(comments, proxy: proxy)
            // LOGIN+입력창은 하단 docked bar '한 자리'에서 토글한다 — PWA #fp-comment-form /
            // #fp-comment-login (둘 다 position:sticky;bottom:0)와 동일. 회원은 입력창,
            // 비로그인은 로그인 안내(탭하면 인증 모달; RLS 도 익명 insert 차단).
            .dockedBottomBar(isActive: true, clearTabBar: true) {
                if session.isAnonymous {
                    Button { requestLogin() } label: {
                        Text(CommentsCopy.feedPost.loginPrompt)
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .padding(.horizontal, 16)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    CommentComposer(
                        model: comments,
                        userId: session.userId,
                        nickname: session.nickname,
                        focused: $composerFocused,
                        placeholder: "이 글에 대한 생각을 남겨주세요…",
                        submitLabel: "등록"
                    )
                }
            }
            }
        }
        .background(Color.paper)
        .overlay(alignment: .bottom) {
            if let moderationToast {
                Text(moderationToast)
                    .font(.bodySans(13))
                    .foregroundStyle(Color.paper)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.espresso))
                    .padding(.bottom, 40)
                    .transition(.opacity)
            }
        }
    }

    /// 명대사 카드 — 인용 + 출처 + "명대사 읽어보기"(카드 상세로). Android QuoteCard 미러.
    private func quoteCard(_ card: Card) -> some View {
        let source = [card.work.feedTitle, card.work.author]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        return VStack(spacing: 0) {
            Text("\"\(card.quote)\"")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .bookLeading(size: 22)
                .fixedSize(horizontal: false, vertical: true)
            if !source.isEmpty {
                Spacer().frame(height: 16)
                Text("— \(source)")
                    .labelCaps(color: .walnut, size: 11)
                    .multilineTextAlignment(.center)
            }
            Spacer().frame(height: 24)
            Button { onOpenCard(card) } label: {
                Text("명대사 읽어보기")
            }
            .buttonStyle(EditorialButtonStyle(.outlined))
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
        .background(Color.cardWarm)
        .overlay(Rectangle().stroke(Color.latte, lineWidth: 0.5))
    }
}

private struct FeedBookmarkPicker: View {
    let title: String
    let cards: [Card]
    let onPick: (Card) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text(title)
                    .font(.headlineSerif(22))
                    .foregroundStyle(.espresso)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.walnut)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 18)
            Hairline()
            Spacer().frame(height: 16)   // 닫기 버튼/헤더와 본문 사이 여백(Android 팝업 정도)
            if cards.isEmpty {
                Text("아직 북마크한 명대사가 없어요.\n마음에 드는 명대사를 먼저 보관해보세요.")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .bookLeading(size: 14)
                    .padding(20)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(cards) { card in
                            Button {
                                onPick(card)
                            } label: {
                                FeedPickRow(card: card)
                            }
                            .buttonStyle(.plain)
                            Hairline()
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .background(Color.paper)
    }
}

private struct FeedPickRow: View {
    let card: Card

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text(metaText).labelCaps(size: 10)
                Text(card.work.feedTitle)
                    .font(.headlineSerif(17))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                Text(Self.oneLine(card.quote))
                    .font(.bodySans(13))
                    .foregroundStyle(.walnut)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(.sand)
        }
        .padding(.vertical, 15)
    }

    private var metaText: String {
        [card.work.format.displayName, card.work.releaseYear.map(String.init)]
            .compactMap { v in (v?.isEmpty == false) ? v : nil }
            .joined(separator: " · ")
    }

    private static func oneLine(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

private struct FeedComposeSheet: View {
    let card: Card
    let isSubmitting: Bool
    let errorMessage: String?
    let onSubmit: (String) -> Void

    @State private var draft = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    // 제목 + 작품 번호(#)를 같은 줄에(Tier1 write-pill).
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(card.work.feedTitle)
                            .font(.headlineSerif(22))
                            .foregroundStyle(.espresso)
                            .lineLimit(1)
                        Text("#\(card.cardId)").labelCaps(size: 10)
                    }
                    // 작품 상세(형식 · 연도 · 작가) 한 줄 — 제목 아래.
                    let detail = [card.work.format.displayName, card.work.releaseYear.map(String.init), card.work.author]
                        .compactMap { v in (v?.isEmpty == false) ? v : nil }
                        .joined(separator: " · ")
                    if !detail.isEmpty {
                        Text(detail).labelCaps(size: 10).lineLimit(1)
                    }
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.walnut)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 16)
            Hairline()
            VStack(alignment: .leading, spacing: 12) {
                Text("이 명대사에 대한 한줄을 남겨보세요.")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                TextEditor(text: $draft)
                    .font(.bodySans(15))
                    .foregroundStyle(.espresso)
                    .frame(minHeight: 120)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
                    .onChange(of: draft) { _, newValue in
                        if newValue.count > 300 { draft = String(newValue.prefix(300)) }
                    }
                Text("\(draft.count)/300자")
                    .font(.bodySans(12))
                    .foregroundStyle(.walnut)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                if let errorMessage {
                    Text(errorMessage)
                        .font(.bodySans(12))
                        .foregroundStyle(.cta)
                }
                Button {
                    onSubmit(draft)
                } label: {
                    Text(isSubmitting ? "등록 중⋯" : "등록 하기")
                        .opacity(canSubmit ? 1 : 0.45)
                }
                .buttonStyle(EditorialButtonStyle(.filled))
                .disabled(!canSubmit)
            }
            .padding(20)
        }
        .background(Color.paper)
    }

    private var canSubmit: Bool {
        !isSubmitting && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private enum FeedTime {
    static func relative(_ iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let diff = max(0, Date.now.timeIntervalSince(date))
        let minutes = Int(diff / 60)
        if minutes < 1 { return "방금" }
        if minutes < 60 { return "\(minutes)분 전" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)시간 전" }
        let days = hours / 24
        if days < 7 { return "\(days)일 전" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy.MM.dd"
        return f.string(from: date)
    }

    /// 절대 작성일시 — Android formatBookmarkDate 미러("M. d  오전/오후 h:mm").
    /// 피드 글 상세 헤더(AuthorRow 패리티)용.
    static func stamp(_ iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "M. d  a h:mm"
        return f.string(from: date)
    }
}

private extension Work {
    var feedTitle: String {
        if let subtitle, !subtitle.isEmpty {
            return "\(title) · \(subtitle)"
        }
        return title
    }

    var feedSource: String {
        [feedTitle, author]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " · ")
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
