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

    @State private var category: FeedCategory = .today
    @State private var posts: [FeedPost] = []
    @State private var highlights: [CardHighlight] = []
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
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Spacer().frame(height: 24).id(Self.topID)
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
                        Spacer().frame(height: 104)
                    }
                    .padding(.horizontal, 20)
                }
                .refreshable { await reload() }
                .onChange(of: reselect) { _, _ in
                    selectedCard = nil
                    selectedHighlight = nil
                    withAnimation { proxy.scrollTo(Self.topID, anchor: .top) }
                    Task { await reload() }
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
            Task { await bookmarks.load(userId: userId) }
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
            FeedPostDetailSheet(post: post) { card in
                detailPost = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { selectedCard = card }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
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

    private var categoryChips: some View {
        HStack(spacing: 8) {
            FeedChip(title: "나의 감상평", isSelected: category == .today) {
                category = .today
            }
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
                    FeedPostCard(post: post, onToast: showToast) { detailPost = post }
                }
            case .highlight:
                ForEach(visibleHighlights) { highlight in
                    HighlightFeedCard(highlight: highlight, onToast: showToast) {
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
            composeError = "등록 실패: \(error.localizedDescription)"
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
struct FeedWriteCat: View {
    let onTap: () -> Void

    /// PWA #feed-fab 아이콘 색 (#FFFDF7) — 주황 원 위라 라이트/다크 모두 크림 고정.
    private static let fabIcon = Color(red: 1.0, green: 0.992, blue: 0.969)

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            // 주황 원형 연필 FAB — 52pt, cta 배경, 크림 연필 아이콘 + 주황 그림자.
            // (PWA index.html #feed-fab: 52×52, --cta, edit 아이콘, shadow 0 4 14 cta/.38)
            Button(action: onTap) {
                Image(systemName: "pencil")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundStyle(Self.fabIcon)
                    .frame(width: 52, height: 52)
                    .background(Circle().fill(Color.cta))
                    .shadow(color: Color.cta.opacity(0.38), radius: 7, x: 0, y: 4)
            }
            .buttonStyle(FeedFabButtonStyle())
            .offset(x: -34)               // 고양이 머리(중앙) 위로
            Image("cat_pen")
                .resizable()
                .scaledToFit()
                .frame(height: 92)        // Android CatHeightFeed=92 (#76 유지)
                .offset(y: -4)
                .allowsHitTesting(false)
        }
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

/// Post card header — avatar + nickname + "한 줄 리뷰 · time". Shared by the real
/// post card, the sample card, and the detail sheet.
private struct FeedPostHeader: View {
    let nickname: String
    let timeText: String

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
                Text("한 줄 리뷰 · \(timeText)")
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
    var onToast: (String) -> Void = { _ in }
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

        // 남의 글에만 신고·차단 메뉴(App Store 1.2). 헤더 우상단 빈 공간에 띄운다.
        if session.userId != post.userId {
            ModerationMenu(
                target: .feedPost(post.postId),
                authorUserId: post.userId,
                onToast: onToast
            )
            .padding(.top, 8)
            .padding(.trailing, 6)
        }
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
    var onToast: (String) -> Void = { _ in }
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
                Text(highlight.selectedText.markdownBold)
                    .font(.titleSerif(15))
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 15)
                    .padding(.horizontal, 28)
                    .fixedSize(horizontal: false, vertical: true)
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

        // 남의 하이라이트에만 신고·차단 메뉴(App Store 1.2).
        if session.userId != highlight.userId {
            ModerationMenu(
                target: .highlight(highlight.highlightId),
                authorUserId: highlight.userId,
                onToast: onToast
            )
            .padding(.top, 6)
            .padding(.trailing, 4)
        }
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

    private static func dateText(_ date: Date) -> String {
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
    let onOpenCard: (Card) -> Void
    @Environment(\.dismiss) private var dismiss
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

    init(post: FeedPost, onOpenCard: @escaping (Card) -> Void) {
        self.post = post
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
            .padding(.horizontal, 16)
            .padding(.top, 6)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let card = post.card {
                        quoteCard(card)
                        Spacer().frame(height: 20)
                    }
                    FeedPostHeader(
                        nickname: post.authorNickname?.ifEmpty("익명") ?? "익명",
                        timeText: FeedTime.relative(post.createdAt)
                    )
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
            // 회원만 작성 — 익명은 CommentsSection 로그인 프롬프트만(RLS 도 익명 insert 차단).
            .dockedBottomBar(isActive: !session.isAnonymous, clearTabBar: true) {
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
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(card.work.feedTitle)
                        .font(.headlineSerif(22))
                        .foregroundStyle(.espresso)
                        .lineLimit(1)
                    Text("#\(card.cardId)").labelCaps(size: 10)
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
