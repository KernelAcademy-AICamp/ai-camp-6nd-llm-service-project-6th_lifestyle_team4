import SwiftUI

struct FeedView: View {
    @Binding var selectedTab: Tab
    /// Bumped by RootView each time the already-active Feed tab is tapped — drives
    /// scroll-to-top + refresh.
    var reselect: Int = 0
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore

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

    private var isEmpty: Bool {
        switch category {
        case .today: return posts.isEmpty
        case .highlight: return highlights.isEmpty
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            AppMasthead(onMyPage: { selectedTab = .settings })
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Spacer().frame(height: 24).id(Self.topID)
                        Text("피드")
                            .font(.displaySerif(32))
                            .foregroundStyle(.espresso)
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
        // 글쓰기 말풍선 pill — 로그인 여부와 무관하게 항상 표시 (비로그인은 토스트만).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Spacer()
                writePill
            }
            .padding(.top, 12)
            .padding(.trailing, 20)
            .padding(.bottom, 16)
            .background(Color.paper)
            .overlay(alignment: .top) { Hairline() }
        }
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
        .navigationDestination(item: $selectedCard) { card in
            CardDetailView(card: card) {
                selectedTab = .settings
            }
        }
        .navigationDestination(item: $selectedHighlight) { highlight in
            HighlightDetailView(highlight: highlight) { card in
                selectedCard = card
            }
        }
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

    // 글쓰기 말풍선 pill (cat_pen 고양이가 "글쓰기"라 말하는 듯한 모양). 익명은 토스트만.
    private var writePill: some View {
        Button {
            if session.isAnonymous {
                showToast(category == .highlight
                          ? "로그인 후 하이라이트를 남길 수 있어요."
                          : "로그인 후 나의 감상평을 남길 수 있어요.")
            } else {
                showPicker = true
            }
        } label: {
            VStack(alignment: .trailing, spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.espresso)
                    Text("글쓰기")
                        .font(.custom("Pretendard-Medium", size: 14))
                        .foregroundStyle(.espresso)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 18).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.espresso, lineWidth: 1.5))
                BubbleTail()
                    .fill(Color.paper)
                    .overlay(BubbleTail().stroke(Color.espresso, lineWidth: 1.5))
                    .frame(width: 16, height: 9)
                    .padding(.trailing, 18)
                    .offset(y: -1.5)   // overlap the bubble border so the top edge is hidden
            }
        }
        .buttonStyle(.plain)
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
                ForEach(posts) { post in
                    FeedPostCard(post: post) { detailPost = post }
                }
            case .highlight:
                ForEach(highlights) { highlight in
                    HighlightFeedCard(highlight: highlight) {
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
        var errors: [String] = []
        do {
            posts = try await Supa.shared.fetchFeedPosts()
        } catch {
            errors.append(error.localizedDescription)
        }
        do {
            highlights = try await Supa.shared.fetchCardHighlights()
        } catch {
            errors.append(error.localizedDescription)
        }
        errorMessage = errors.isEmpty ? nil : errors.joined(separator: " / ")
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
            return "아직 하이라이트가 없어요. 명대사 본문을 길게 눌러 저장해보세요."
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

/// Speech-bubble tail triangle pointing down-right (Android Canvas tail).
private struct BubbleTail: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width * 0.38, y: rect.height))
        p.closeSubpath()
        return p
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
    let onTap: () -> Void

    var body: some View {
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
                        Text(post.card?.work.feedTitle ?? "—")
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
    let onTap: () -> Void

    var body: some View {
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
                Text(highlight.selectedText)
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
/// card; "원문 카드 보기" opens the full card. NOTE: the feed_post_comments list/compose
/// is deferred — iOS has no post-comments networking yet (separate backend PR).
private struct FeedPostDetailSheet: View {
    let post: FeedPost
    let onOpenCard: (Card) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header — "DAILY SCRIPT" 라벨 + 닫기 (Android HeaderRow 공용).
            HStack {
                Text("DAILY SCRIPT")
                    .font(.custom("Pretendard-Medium", size: 11))
                    .tracking(2.2)
                    .foregroundStyle(.walnut)
                Spacer()
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
                    Spacer().frame(height: 28)
                }
            }
        }
        .background(Color.paper)
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

/// Solid leather cover (used by HighlightDetailView / DailyDiscovery / ArchiveView).
/// The feed now uses the shared `BookCover` (cover_url + leather); this stays for the
/// other screens until they migrate (PR-I).
struct HighlightBookCover: View {
    let work: Work?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(
                    LinearGradient(
                        colors: [leatherShadow, leather, leatherHighlight],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .shadow(color: Color.black.opacity(0.24), radius: 8, x: 0, y: 6)
            Rectangle()
                .fill(Color.black.opacity(0.28))
                .frame(width: 5)
                .frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.white.opacity(0.22), lineWidth: 0.5)
                .padding(7)
            VStack(spacing: 10) {
                Text(work?.title ?? "—")
                    .font(.headlineSerif(17))
                    .fontWeight(.bold)
                    .foregroundStyle(Color.paper)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                if let subtitle = work?.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.titleSerif(12))
                        .foregroundStyle(Color.paper.opacity(0.90))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
                if let author = work?.author, !author.isEmpty {
                    Text(author)
                        .labelCaps(color: Color.paper.opacity(0.75), size: 9)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 18)
        }
        .frame(width: 132, height: 188)
    }

    private var leatherHex: UInt32 { Self.leatherColor(for: work?.title ?? "?") }
    private var leather: Color { Color(hex: leatherHex) }
    private var leatherShadow: Color { Self.blend(leatherHex, with: 0x000000, amount: 0.24) }
    private var leatherHighlight: Color { Self.blend(leatherHex, with: 0xFFFFFF, amount: 0.08) }

    private static func leatherColor(for title: String) -> UInt32 {
        let palette: [UInt32] = [
            0x0E0C0A, 0x5A2A24, 0x2F3A30, 0x293541,
            0x6A4A30, 0x40303B, 0x3A463F, 0x1F2A3A,
            0x4A2B1A, 0x3D2E22, 0x26393B, 0x2E2538,
        ]
        let hash = title.unicodeScalars.reduce(0) { (($0 &* 31) &+ Int($1.value)) & 0x7fffffff }
        return palette[hash % palette.count]
    }

    private static func blend(_ hex: UInt32, with target: UInt32, amount: Double) -> Color {
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
            .padding(.top, 18)
            .padding(.bottom, 12)
            Hairline()
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
            .padding(20)
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
