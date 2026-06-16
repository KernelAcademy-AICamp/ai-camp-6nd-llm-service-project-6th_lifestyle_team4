import SwiftUI
import UIKit

struct CardDetailView: View {
    let card: Card
    let onLoginRequested: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var yarn: YarnStore
    @StateObject private var comments: CommentsModel
    @State private var showAccountPrompt = false
    /// 실타래 게이트 — 잔액 부족이면 카드 내용을 가리고 충전을 유도한다.
    @State private var gate: GateState = .checking
    @State private var showYarnPurchase = false
    @State private var displayedViewCount: Int
    @State private var bookmarkCount = 0
    @State private var didIncrementView = false
    @State private var showOriginal = false
    @FocusState private var composerFocused: Bool
    // Highlight creation (select script text → save passage).
    @State private var highlightSelection = ""
    @State private var showHighlightSheet = false
    @State private var showHighlightLogin = false
    @State private var highlightSaving = false
    @State private var highlightToast: String?

    init(card: Card, onLoginRequested: (() -> Void)? = nil) {
        self.card = card
        self.onLoginRequested = onLoginRequested
        _comments = StateObject(wrappedValue: CommentsModel(backend: .card(card.cardId)))
        _displayedViewCount = State(initialValue: card.viewCount ?? 0)
    }

    private var bookmarked: Bool { bookmarks.isBookmarked(card.cardId) }

    private var showSignificance: Bool {
        let f = card.work.format.rawValue.lowercased()
        return !(card.significance ?? "").isEmpty && (f == "opera" || f == "play")
    }

    var body: some View {
        gatedContent
            .background(Color.paper)
            .toolbar(.hidden, for: .navigationBar)
            .task { await runOpenFlow() }
            // 충전 시트가 닫히면(구매 성공 등) 게이트를 자동 재평가 — 잠금 화면에서
            // 충전 후 뒤로 나갔다 다시 들어오지 않아도 그 자리에서 열린다.
            .sheet(isPresented: $showYarnPurchase, onDismiss: {
                Task { await reEvaluateGateAfterPurchase() }
            }) { YarnPurchaseView() }
    }

    /// 게이트 상태별 화면. **`.open` 일 때만** 카드 본문을 트리에 만든다 —
    /// 그 전(.checking)엔 본문/스크립트/메타데이터가 존재하지 않아 읽기·텍스트 선택이 불가능하다.
    @ViewBuilder
    private var gatedContent: some View {
        switch gate {
        case .open: cardContent
        case .checking: checkingCover
        case .locked: yarnGateOverlay
        }
    }

    /// 잔액 확인 전 불투명 커버 — 카드 본문을 만들지 않는다(읽기 불가).
    private var checkingCover: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(.espresso)
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .frame(height: 64)
                Spacer()
                Text("불러오는 중⋯")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                Spacer()
            }
        }
    }

    /// 카드 본문 — 게이트가 `.open` 일 때만 렌더된다.
    private var cardContent: some View {
        VStack(spacing: 0) {
            detailTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .center, spacing: 0) {
                    Spacer().frame(height: 40)
                    metadataChipsRow
                    Spacer().frame(height: 10)
                    CardCountsRow(viewCount: displayedViewCount, bookmarkCount: bookmarkCount)
                    Spacer().frame(height: 28)

                    if card.hasOriginalLanguage {
                        HStack {
                            Text(showOriginal ? "View in Korean" : "원문(영문)으로 보기")
                                .labelCaps()
                            Spacer()
                            LangToggle(showOriginal: $showOriginal)
                        }
                        Spacer().frame(height: 24)
                    }

                    if let desc = card.displayDescription(original: showOriginal), !desc.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("SCENE")
                                .labelCaps()
                                .opacity(0.7)
                            Text(desc)
                                .font(.bodySans(16))
                                .foregroundStyle(.walnut)
                                .multilineTextAlignment(.leading)
                                .bookLeading(size: 16)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 16)
                        .padding(.horizontal, 18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.latte, lineWidth: 0.5)
                        )
                        Spacer().frame(height: 24)
                    }

                    SelectableScriptText(attributed: scriptAttributed, selection: $highlightSelection)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if showSignificance, let sig = card.displaySignificance(original: showOriginal) {
                        Spacer().frame(height: 32)
                        Hairline()
                        Spacer().frame(height: 24)
                        Text("작품의 의의").labelCaps()
                        Spacer().frame(height: 12)
                        Text(sig)
                            .font(.bodySans(16))
                            .foregroundStyle(.espresso)
                            .bookLeading(size: 16)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer().frame(height: 48)
                    Hairline()
                    Spacer().frame(height: 32)

                    Button {
                        toggleBookmark()
                    } label: {
                        Text(bookmarked ? "Collected" : "Collect Script Artifact")
                    }
                    .buttonStyle(EditorialButtonStyle(.outlined))

                    Spacer().frame(height: 16)
                    Text("Limited Edition Digital Manuscript #\(String(format: "%04d", card.cardId))")
                        .labelCaps()

                    Spacer().frame(height: 40)
                    Hairline()
                    Spacer().frame(height: 28)
                    CommentsSection(
                        model: comments,
                        userId: session.userId,
                        isAnonymous: session.isAnonymous,
                        nickname: session.nickname
                    )

                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                // Tap an empty area to dismiss the keyboard. simultaneousGesture
                // (not onTapGesture) so it fires alongside child buttons/links
                // instead of consuming their taps. Pairs with scroll-dismiss below.
                .contentShape(Rectangle())
                .simultaneousGesture(TapGesture().onEnded { composerFocused = false })
            }
            .scrollDismissesKeyboard(.interactively)
            // Docked composer: solid bar, scroll content inset by its height
            // (nothing hides behind it), flush above the tab bar when unfocused,
            // dropping into the safe area above the keyboard when focused.
            .dockedBottomBar(isActive: !session.isAnonymous, clearTabBar: !composerFocused) {
                CommentComposer(
                    model: comments,
                    userId: session.userId,
                    nickname: session.nickname,
                    focused: $composerFocused
                )
            }
        }
        .preference(key: ComposerFocusedPreferenceKey.self, value: composerFocused)
        // Tapping REPLY on a comment focuses the composer (keyboard up).
        .onChange(of: comments.replyingTo?.commentId) { _, newValue in
            if newValue != nil { composerFocused = true }
        }
        // Backstop: any keyboard dismissal path (interactive swipe, tap-away,
        // return key) clears focus so the tab bar reliably restores — @FocusState
        // alone doesn't always flip false on interactive dismissal.
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            if composerFocused { composerFocused = false }
        }
        .overlay {
            if showAccountPrompt {
                AccountRequiredPrompt {
                    showAccountPrompt = false
                    onLoginRequested?()
                } onClose: {
                    showAccountPrompt = false
                }
            }
        }
        // Floating coral pill — appears while a non-blank script range is
        // selected (Android #hl-add-btn). Sits above the docked composer for
        // members. Gated on the TRIMMED selection so a whitespace-only drag
        // never enables save (the DB CHECK requires 1–2000 non-blank chars).
        .overlay(alignment: .bottomTrailing) {
            if !trimmedHighlight.isEmpty {
                Button {
                    if session.isAnonymous { showHighlightLogin = true }
                    else { showHighlightSheet = true }
                } label: {
                    Text("하이라이트 추가")
                        .font(.uiSans(14, weight: .medium))
                        .tracking(0.8)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 13)
                        .background(Capsule().fill(Color.cta))
                        .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
                }
                .buttonStyle(.plain)
                .padding(.trailing, 18)
                .padding(.bottom, session.isAnonymous ? 28 : 92)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: trimmedHighlight.isEmpty)
        // Members-only: RLS blocks anonymous JWTs from inserting highlights.
        .overlay {
            if showHighlightLogin {
                AccountRequiredPrompt(
                    title: "하이라이트는 회원 전용",
                    message: "구절을 저장하려면 로그인이 필요해요."
                ) {
                    showHighlightLogin = false
                    onLoginRequested?()
                } onClose: {
                    showHighlightLogin = false
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let highlightToast {
                Text(highlightToast)
                    .font(.bodySans(13))
                    .foregroundStyle(.paper)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(Color.espresso))
                    .padding(.bottom, 100)
                    .transition(.opacity)
            }
        }
        .sheet(isPresented: $showHighlightSheet) {
            HighlightComposeSheet(
                selectedText: highlightSelection,
                saving: highlightSaving,
                onCancel: { showHighlightSheet = false },
                onSave: { note in Task { await saveHighlight(note: note) } }
            )
        }
    }

    /// Script excerpt as an NSAttributedString for the selectable text view —
    /// speaker lines (matching work.characters) bolded, monospaced 14, espresso,
    /// line-spacing 8, kern 0.28 (matching the previous SwiftUI Text). In the ENG
    /// view the script is English while characters are Korean names, so no line
    /// matches and nothing is bolded — content still shows in full.
    private var scriptAttributed: NSAttributedString {
        let names = Set(card.work.characters.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        let lines = card.displayScript(original: showOriginal).components(separatedBy: "\n")
        let para = NSMutableParagraphStyle()
        para.lineSpacing = 8
        let result = NSMutableAttributedString()
        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let namePart = trimmed.components(separatedBy: "(").first?.trimmingCharacters(in: .whitespaces) ?? trimmed
            let isSpeaker = !trimmed.isEmpty && (names.contains(trimmed) || names.contains(namePart))
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 14, weight: isSpeaker ? .bold : .regular),
                .foregroundColor: Self.espressoUIColor,
                .paragraphStyle: para,
                .kern: 0.28,
            ]
            result.append(NSAttributedString(string: line, attributes: attrs))
            if i < lines.count - 1 { result.append(NSAttributedString(string: "\n", attributes: attrs)) }
        }
        return result
    }

    /// Adaptive espresso ink, matching `Color.espresso` (DesignTokens) for UIKit.
    private static let espressoUIColor = UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0xFA / 255, green: 0xF8 / 255, blue: 0xF2 / 255, alpha: 1)
            : UIColor(red: 0x0E / 255, green: 0x0C / 255, blue: 0x0A / 255, alpha: 1)
    }

    /// The selection with surrounding whitespace removed — the pill and save are
    /// gated on this being non-empty so a whitespace-only drag can't reach the DB.
    private var trimmedHighlight: String {
        highlightSelection.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func saveHighlight(note: String) async {
        guard let uid = session.userId, !trimmedHighlight.isEmpty, !highlightSaving else { return }
        highlightSaving = true
        do {
            try await Supa.shared.addHighlight(
                cardId: card.cardId,
                userId: uid,
                selectedText: highlightSelection,
                userNote: note,
                authorNickname: session.nickname.isEmpty ? nil : session.nickname
            )
            showHighlightSheet = false
            highlightSelection = ""   // collapses the live selection via updateUIView
            showHighlightToast("하이라이트를 피드에 저장했어요.")
        } catch {
            showHighlightToast("저장에 실패했어요.")
        }
        highlightSaving = false
    }

    private func showHighlightToast(_ msg: String) {
        withAnimation { highlightToast = msg }
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation { highlightToast = nil }
        }
    }

    private var detailTopBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)

            Spacer()
            VStack(spacing: 2) {
                Text("DAILY SCRIPT").labelCaps()
                Text(card.work.displayTitle(original: showOriginal))
                    .font(.headlineSerif(20))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                if let subtitle = card.work.displaySubtitle(original: showOriginal), !subtitle.isEmpty {
                    Text(subtitle)
                        .labelCaps()
                        .lineLimit(1)
                }
            }
            Spacer()

            Button {
                toggleBookmark()
            } label: {
                Image(systemName: bookmarked ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(bookmarked ? Color.cta : .walnut)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }

    private func toggleBookmark() {
        guard !session.isAnonymous else {
            showAccountPrompt = true
            return
        }
        Task {
            await bookmarks.toggle(userId: session.userId, cardId: card.cardId)
            await loadBookmarkCount()
        }
    }

    /// 게이트 진행 상태. `.checking` 동안은 콘텐츠를 그대로 보여주고(낙관적),
    /// 차단 확정되면 `.locked` 오버레이로 덮는다.
    enum GateState { case checking, open, locked }

    /// 카드 열람 흐름 — PWA `openDetail` 순서 미러: 첫 열람 보상(+1) 먼저, 그다음 게이트.
    ///  보상이 먼저라 새 카드의 첫 열람은 +1 로 자가 충전된다(신규 사용자 잠금 방지).
    ///  게이트: 3일 언락/투어면 무료, 아니면 consume_yarn 1 차감. 부족하면 잠금.
    private func runOpenFlow() async {
        // 보상은 그대로 유지 (PWA 는 reward + gate 둘 다 한다).
        await yarn.rewardFirstOpen(cardId: card.cardId, userId: session.userId)
        // TODO(coach): iOS 코치 투어 도입 시 tourActive 를 실제 상태로 연결 (현재 스텁 false).
        let decision = await yarn.gateOpen(cardId: card.cardId, userId: session.userId, tourActive: false)
        switch decision {
        case .allowed:
            gate = .open
            await loadCountsAndIncrementView()
        case .blocked:
            gate = .locked
        }
    }

    /// 충전 시트가 닫힌 뒤 재평가 — 잠금 상태에서만. 구매로 잔액이 생겼으면
    /// gateOpen 이 1 차감 + 언락 후 `.open` 으로 전환해 그 자리에서 본문을 드러낸다.
    /// 구매 없이 닫았으면 consume_yarn 이 -1 → 잠금 유지(미차감).
    private func reEvaluateGateAfterPurchase() async {
        guard gate == .locked else { return }
        let decision = await yarn.gateOpen(cardId: card.cardId, userId: session.userId, tourActive: false)
        if case .allowed = decision {
            gate = .open
            await loadCountsAndIncrementView()
        }
    }

    /// 잔액 부족 게이트 — 불투명 paper 패널로 카드 내용을 가린다(열람 차단).
    private var yarnGateOverlay: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(.espresso)
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .frame(height: 64)
                Spacer()
                Image("daily-script-bar")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 64, height: 64)
                    .clipShape(Circle())
                    .opacity(0.6)
                Spacer().frame(height: 20)
                Text("실타래가 부족해요")
                    .font(.titleSerif(20))
                    .foregroundStyle(.espresso)
                Spacer().frame(height: 10)
                Text("이 카드를 열려면 실타래가 필요해요.\n충전하면 계속 읽을 수 있어요.")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 14)
                Spacer().frame(height: 28)
                Button { showYarnPurchase = true } label: {
                    Text("충전하러 가기")
                }
                .buttonStyle(EditorialButtonStyle(.filled))
                Spacer().frame(height: 12)
                Button { dismiss() } label: {
                    Text("닫기").labelCaps()
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, 32)
        }
    }

    private func loadCountsAndIncrementView() async {
        await loadBookmarkCount()
        guard !didIncrementView else { return }
        didIncrementView = true
        displayedViewCount += 1
        do {
            try await Supa.shared.incrementCardView(cardId: card.cardId)
        } catch {
            displayedViewCount = max(0, displayedViewCount - 1)
        }
    }

    private func loadBookmarkCount() async {
        do {
            bookmarkCount = try await Supa.shared.fetchBookmarkCounts(cardIds: [card.cardId])[card.cardId] ?? 0
        } catch {
            // Cosmetic count only.
        }
    }

    private var metadataChipsRow: some View {
        HStack(spacing: 12) {
            let items: [String] = [
                card.work.format.label(original: showOriginal),
                card.work.displayAuthor(original: showOriginal)?.uppercased() ?? "",
                card.work.releaseYear.map(String.init) ?? "",
            ].filter { !$0.isEmpty }
            ForEach(items, id: \.self) { v in
                Text(v).labelCaps()
            }
        }
    }
}
