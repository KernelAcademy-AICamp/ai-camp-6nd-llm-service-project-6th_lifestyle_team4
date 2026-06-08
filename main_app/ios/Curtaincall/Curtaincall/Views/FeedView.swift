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
    @State private var quotePopupCard: Card?
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
                        Spacer().frame(height: 6)
                        Text("매일 한 문장, 그리고 기억에 남은 장면들")
                            .font(.bodySans(12))
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
                            centeredNote(category.emptyText)
                        } else {
                            feedList
                        }
                        Spacer().frame(height: 104)
                    }
                    .padding(.horizontal, 20)
                }
                .refreshable { await reload() }
                // Tapping the active Feed tab: dismiss any pushed detail, snap to
                // the top, and re-fetch — the same refresh as pull-to-refresh.
                .onChange(of: reselect) { _, _ in
                    selectedCard = nil
                    withAnimation { proxy.scrollTo(Self.topID, anchor: .top) }
                    Task { await reload() }
                }
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !session.isAnonymous {
                HStack {
                    Spacer()
                    feedActionButton
                }
                .padding(.top, 12)
                .padding(.trailing, 20)
                .padding(.bottom, 16)
                .background(Color.paper)
                .overlay(alignment: .top) { Hairline() }
            }
        }
        .navigationDestination(item: $selectedCard) { card in
            CardDetailView(card: card) {
                selectedTab = .settings
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
        .overlay {
            if let quotePopupCard {
                FeedQuotePopup(card: quotePopupCard) {
                    self.quotePopupCard = nil
                }
            }
        }
    }

    private var feedActionButton: some View {
        Button { showPicker = true } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(Color.paper)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.espresso))
                .shadow(color: Color.black.opacity(0.20), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
    }

    private var categoryChips: some View {
        HStack(spacing: 8) {
            FeedChip(title: "오늘의 한줄", isSelected: category == .today) {
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
                    FeedPostCard(post: post) {
                        if let card = post.card { quotePopupCard = card }
                    }
                }
            case .highlight:
                ForEach(highlights) { highlight in
                    HighlightFeedCard(highlight: highlight) {
                        if let card = highlight.card { selectedCard = card }
                    }
                }
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
            return "아직 하이라이트가 없어요."
        }
    }

    var pickerTitle: String {
        switch self {
        case .today:
            return "어떤 명대사에 한줄을 남길까요?"
        case .highlight:
            return "어떤 카드로 이동할까요?"
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

private struct FeedPostCard: View {
    let post: FeedPost
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(Color.latte)
                        Image(systemName: "pencil")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(.walnut)
                    }
                    .frame(width: 42, height: 42)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(post.authorNickname?.ifEmpty("익명") ?? "익명")
                            .font(.bodySans(15))
                            .foregroundStyle(.espresso)
                            .lineLimit(1)
                        Text("한 줄 리뷰 · \(Self.relativeTime(post.createdAt))")
                            .font(.bodySans(11))
                            .foregroundStyle(.roast)
                    }
                    Spacer()
                }
                .padding(16)

                Text(post.body)
                    .font(.headlineSerif(18))
                    .fontWeight(.bold)
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 18)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 36)
                    .background(Color(hex: 0xF4EFE6))

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
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private static func relativeTime(_ iso: String) -> String {
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

private struct HighlightFeedCard: View {
    let highlight: CardHighlight
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .center, spacing: 0) {
                Text(highlight.authorNickname?.ifEmpty("익명") ?? "익명")
                    .font(.bodySans(14))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                Spacer().frame(height: 6)
                Text(metaText)
                    .labelCaps(size: 10)
                    .lineLimit(1)
                Spacer().frame(height: 22)
                HighlightBookCover(work: highlight.card?.work)
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
                if let note = highlight.userNote, !note.isEmpty {
                    Spacer().frame(height: 12)
                    Text(note)
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                        .multilineTextAlignment(.center)
                        .bookLeading(size: 13)
                        .padding(.horizontal, 24)
                }
                Spacer().frame(height: 16)
                Text("#\(highlight.cardId)")
                    .labelCaps(size: 10)
            }
            .padding(.top, 26)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: 0xF4EFE6)))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private var metaText: String {
        let format = highlight.card?.work.format.displayName
        let date = highlight.createdDate.map(Self.dateText)
        return [format, date]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " · ")
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }
}

private struct HighlightBookCover: View {
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

    private var leatherHex: UInt32 {
        Self.leatherColor(for: work?.title ?? "?")
    }
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
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
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
                        .editorialButton(style: .filled)
                        .opacity(canSubmit ? 1 : 0.45)
                }
                .buttonStyle(.plain)
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

private struct FeedQuotePopup: View {
    let card: Card
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.espresso.opacity(0.62)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
            VStack(spacing: 0) {
                Text("“\(card.quote)”")
                    .font(.headlineSerif(22))
                    .foregroundStyle(.espresso)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 22)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: 18)
                Text("— \(card.work.feedSource)")
                    .labelCaps()
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 34)
            .frame(maxWidth: 420)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
            .padding(28)
        }
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
