import SwiftUI
import UIKit

struct CardDetailView: View {
    let card: Card
    let onLoginRequested: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.requestLibrary) private var requestLibrary
    @Environment(\.requestFeed) private var requestFeed
    @State private var scrolledPast = false
    // 오늘의 한줄 — 피드 한줄(feed_posts) 작성 (카드 댓글이 아님; Android DetailScreen 패리티).
    @State private var showFeedCompose = false
    @State private var feedSubmitting = false
    @State private var feedComposeError: String?
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var yarn: YarnStore
    @StateObject private var comments: CommentsModel
    @State private var showAccountPrompt = false
    /// 실타래 게이트 — 잔액 부족이면 카드 내용을 가리고 충전을 유도한다.
    @State private var gate: GateState = .checking
    // v1: 충전 시트 대신, 비로그인 안내 팝업의 '회원가입·로그인' 이 기존 인증 모달을 띄운다.
    @State private var showSignIn = false
    /// 공유용 명대사 카드 이미지 — 콘텐츠 표시 시 1회 렌더해 캐시.
    @State private var shareCardImage: Image?
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
        // PWA: 네 프롬프트(screen/opera/play/literature) 모두 significance 를 생성하므로
        // format 게이팅 없이 값이 있으면 표시 (m-app.js:5895-5900).
        !(card.significance ?? "").isEmpty
    }

    var body: some View {
        gatedContent
            .background(Color.paper)
            .toolbar(.hidden, for: .navigationBar)
            .task { await runOpenFlow() }
            // 충전 시트가 닫히면(구매 성공 등) 게이트를 자동 재평가 — 잠금 화면에서
            // 충전 후 뒤로 나갔다 다시 들어오지 않아도 그 자리에서 열린다.
            // 비로그인 안내 팝업 → 기존 인증 모달(#97 SignInSheet) 재사용(새 시트 아님).
            // 닫힌 뒤 게이트 재평가 — 가입+출석으로 잔액이 생겼으면 그 자리에서 열린다.
            .sheet(isPresented: $showSignIn, onDismiss: {
                Task { await reEvaluateGate() }
            }) { SignInSheet() }
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
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .center, spacing: 0) {
                    Color.clear.frame(height: 0).id("detailTop")
                    Spacer().frame(height: 40)
                    metadataBlock
                    Spacer().frame(height: 28)

                    if card.hasOriginalLanguage {
                        Hairline()
                        HStack {
                            Text(showOriginal ? "한국어로 보기" : "원문(영문)으로 보기")
                                .font(.bodySans(14))
                                .foregroundStyle(.walnut)
                            Spacer()
                            LangToggle(showOriginal: $showOriginal)
                        }
                        .padding(.vertical, 14)
                        Hairline()
                        Spacer().frame(height: 24)
                    }

                    if let desc = card.displayDescription(original: showOriginal), !desc.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("SCENE")
                                .labelCaps()
                                .opacity(0.7)
                            Text(desc.markdownBold)   // **…** 볼드 렌더(마커 제거)
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
                        Text(sig.markdownBold)   // **…** 볼드 렌더(마커 제거)
                            .font(.bodySans(16))
                            .foregroundStyle(.espresso)
                            .multilineTextAlignment(.center)
                            .bookLeading(size: 16)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity)
                    }

                    Spacer().frame(height: 48)
                    Hairline()
                    Spacer().frame(height: 32)

                    // 오늘의 한줄 남기기 — 이 카드로 피드 한줄(feed_posts)을 작성한다
                    // (Android DetailScreen: FeedComposeSheet → submitFeedPost → 피드 이동).
                    // 카드 댓글(card_comments)이 아님. 먼저 북마크를 보장하고(Android 동일),
                    // 익명은 토스트만. 상단 바 북마크 토글은 그대로.
                    Button {
                        if session.isAnonymous {
                            showHighlightToast("로그인 후 나의 감상평을 남길 수 있어요.")
                        } else {
                            if !bookmarked { toggleBookmark() }
                            feedComposeError = nil
                            showFeedCompose = true
                        }
                    } label: {
                        Text("북마크하고 나의 감상평 작성하기")
                    }
                    .buttonStyle(EditorialButtonStyle(.filled))

                    Spacer().frame(height: 10)
                    Button {
                        requestLibrary()
                    } label: {
                        Text("라이브러리 가서 책 더 읽어보기")
                    }
                    .buttonStyle(EditorialButtonStyle(.outlined))

                    Spacer().frame(height: 16)
                    // edition_note: Android는 고정 문자열 리소스("Limited Edition Digital
                    // Manuscript") + 카드 id — per-card 필드가 없어 기존 텍스트가 이미 동일.
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
            // 본문을 80% 이상 스크롤하면 상단 이동 FAB 노출.
            .onScrollGeometryChange(for: Bool.self) { geo in
                let maxY = geo.contentSize.height - geo.containerSize.height
                return maxY > 1 && geo.contentOffset.y > maxY * 0.8
            } action: { _, past in
                if past != scrolledPast {
                    withAnimation(.easeInOut(duration: 0.15)) { scrolledPast = past }
                }
            }
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
            // 상단 이동 FAB — 하이라이트 핀과 겹치지 않게 선택 중엔 숨김.
            .overlay(alignment: .bottomTrailing) {
                if scrolledPast && trimmedHighlight.isEmpty {
                    Button {
                        withAnimation { proxy.scrollTo("detailTop", anchor: .top) }
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.espresso)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.paper))
                            .overlay(Circle().stroke(Color.latte, lineWidth: 0.5))
                            .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 18)
                    .padding(.bottom, session.isAnonymous ? 28 : 92)
                    .transition(.opacity)
                }
            }
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
        .sheet(isPresented: $showFeedCompose) {
            FeedOneLinerComposeSheet(
                card: card,
                submitting: feedSubmitting,
                errorMessage: feedComposeError
            ) { body in
                Task { await submitFeedOneLiner(body) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    /// Writes a feed one-liner (feed_posts) for this card, then routes to Feed —
    /// the existing `addFeedPost` write the Feed tab uses, no new logic.
    private func submitFeedOneLiner(_ body: String) async {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !feedSubmitting, let uid = session.userId else { return }
        feedSubmitting = true
        feedComposeError = nil
        do {
            let nick = session.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
            try await Supa.shared.addFeedPost(
                cardId: card.cardId,
                userId: uid,
                body: text,
                authorNickname: nick.isEmpty ? nil : nick
            )
            feedSubmitting = false
            showFeedCompose = false
            requestFeed()   // 작성 후 피드로 이동 (Android)
        } catch {
            feedSubmitting = false
            feedComposeError = "등록 실패: \(error.localizedDescription)"
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
        // 본문 정렬 — 관리자 편집에서 저장된 text_align 적용. NULL 이면 format 기본 (poem=center, else=left). (migration 042)
        switch card.displayTextAlign(original: showOriginal) {
        case "center": para.alignment = .center
        case "right":  para.alignment = .right
        default:       para.alignment = .left
        }
        let result = NSMutableAttributedString()
        // 라벨에 따라붙는 마침표/콜론/세미콜론/콤마/느낌·물음표 제거 후 names 매칭 —
        // LLM 출력의 "Romeo.", "노라:", "햄릿;" 같은 형식도 등장인물명으로 인식.
        let trailingPunct = CharacterSet(charactersIn: ".,:;!?！？：")
        func attrs(bold: Bool) -> [NSAttributedString.Key: Any] {
            [
                .font: UIFont.monospacedSystemFont(ofSize: 14, weight: bold ? .bold : .regular),
                .foregroundColor: Self.espressoUIColor,
                .paragraphStyle: para,
                .kern: 0.28,
            ]
        }
        for (i, line) in lines.enumerated() {
            // **…** 마크다운 볼드 파싱 — 마커 제거 + 안쪽 볼드(LLM 화자 라벨 "**잭**" 등).
            let segments = Self.boldSegments(line)
            // 화자 라인 전체 볼드 — 마커 제거된 텍스트로 등장인물명 매칭(마커 없는 "노라:"도 포함).
            let cleaned = segments.map(\.text).joined()
            let trimmed = cleaned.trimmingCharacters(in: .whitespaces)
            let namePart = trimmed.components(separatedBy: "(").first?.trimmingCharacters(in: .whitespaces) ?? trimmed
            let trimmedNorm = trimmed.trimmingCharacters(in: trailingPunct).trimmingCharacters(in: .whitespaces)
            let nameNorm = namePart.trimmingCharacters(in: trailingPunct).trimmingCharacters(in: .whitespaces)
            let isSpeaker = !trimmed.isEmpty && (
                names.contains(trimmed) || names.contains(namePart) ||
                names.contains(trimmedNorm) || names.contains(nameNorm)
            )
            for seg in segments {
                result.append(NSAttributedString(string: seg.text, attributes: attrs(bold: seg.bold || isSpeaker)))
            }
            if i < lines.count - 1 { result.append(NSAttributedString(string: "\n", attributes: attrs(bold: false))) }
        }
        return result
    }

    /// `**…**` 스팬을 (텍스트, 볼드) 런으로 분해하고 `**` 마커는 제거한다. 짝이 맞는
    /// 쌍만 볼드로 처리하고, 짝 없는 `**`/단일 `*` 는 본문 그대로 둔다(literal).
    private static let boldRegex = try! NSRegularExpression(pattern: "\\*\\*(.+?)\\*\\*")
    private static func boldSegments(_ line: String) -> [(text: String, bold: Bool)] {
        let ns = line as NSString
        guard ns.length > 0 else { return [(line, false)] }
        var segs: [(String, Bool)] = []
        var cursor = 0
        boldRegex.enumerateMatches(in: line, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
            guard let m else { return }
            let full = m.range
            if full.location > cursor {
                segs.append((ns.substring(with: NSRange(location: cursor, length: full.location - cursor)), false))
            }
            segs.append((ns.substring(with: m.range(at: 1)), true))
            cursor = full.location + full.length
        }
        if cursor < ns.length { segs.append((ns.substring(from: cursor), false)) }
        return segs.isEmpty ? [(line, false)] : segs
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

            // 타이포 명대사 카드 이미지 공유 (#10). 이미지는 .task 에서 1회 렌더해 캐시
            // (탑바 재평가마다 ImageRenderer 가 도는 것을 피한다). 렌더 전엔 흐린 자리표시.
            Group {
                if let shareCardImage {
                    ShareLink(item: shareCardImage,
                              preview: SharePreview(QuoteCardView.shareTitle(card), image: shareCardImage)) {
                        shareIcon
                    }
                } else {
                    shareIcon.opacity(0.4)
                }
            }
            .buttonStyle(.plain)

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

    private var shareIcon: some View {
        Image(systemName: "square.and.arrow.up")
            .font(.system(size: 18, weight: .regular))
            .foregroundStyle(.walnut)
            .frame(width: 40, height: 40)
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
            shareCardImage = QuoteCardView.shareImage(for: card)   // 콘텐츠 열릴 때 1회 렌더
            await loadCountsAndIncrementView()
        case .blocked:
            gate = .locked
        }
    }

    /// 충전 시트가 닫힌 뒤 재평가 — 잠금 상태에서만. 구매로 잔액이 생겼으면
    /// gateOpen 이 1 차감 + 언락 후 `.open` 으로 전환해 그 자리에서 본문을 드러낸다.
    /// 구매 없이 닫았으면 consume_yarn 이 -1 → 잠금 유지(미차감).
    /// 인증 모달이 닫힌 뒤 게이트 재평가 — 로그인+출석(+100)으로 잔액이 생겼으면
    /// gateOpen 이 1 차감·언락 후 `.open` 으로 전환해 그 자리에서 본문을 드러낸다.
    /// 잔액이 그대로면 consume_yarn 이 -1 → 잠금 유지(미차감).
    private func reEvaluateGate() async {
        guard gate == .locked else { return }
        let decision = await yarn.gateOpen(cardId: card.cardId, userId: session.userId, tourActive: false)
        if case .allowed = decision {
            gate = .open
            await loadCountsAndIncrementView()
        }
    }

    /// 실타래 부족 게이트 — 인증 상태별 안내 팝업(적립 전용, 충전 진입 없음).
    /// 이 화면은 '3일 무료 재열람 창이 지난 옛 카드'를 0 잔액으로 다시 열 때만 뜬다 —
    /// 새 명대사는 항상 무료라 카피가 '앱 전체 잠김'을 암시하지 않게 한다. 잠금 상태에선
    /// 카드 본문 자체가 트리에 없어, 불투명 paper + 옅은 dim 위에 MEMBERS 모달
    /// (AccountRequiredPrompt) 스타일의 안내 카드를 올린다.
    private var yarnGateOverlay: some View {
        let isAnon = session.isAnonymous
        let title = isAnon ? "다시 읽으려면 실타래가 필요해요" : "실타래가 부족해요"
        let message = isAnon
            ? "회원가입하고 매일 출석하면 실타래를 받아, 예전에 읽은 명대사도 다시 펼쳐볼 수 있어요. 새로운 명대사는 언제나 무료예요."
            : "내일 출석하면 실타래를 받아 다시 읽을 수 있어요. 새로운 명대사는 언제나 무료로 열람할 수 있어요."
        return ZStack {
            Color.paper.ignoresSafeArea()                       // 잠긴 카드 차단(본문 미생성)
            Color.espresso.opacity(0.18).ignoresSafeArea()      // 모달 대비용 옅은 dim
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
            }
            // 안내 카드 — MEMBERS 모달 스타일(paper · latte 보더 · 라운드 8).
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.headlineSerif(22))
                    .foregroundStyle(.espresso)
                Spacer().frame(height: SheetMetrics.titleToBody)
                Text(message)
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .bookLeading(size: 14)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: SheetMetrics.bodyToButton)
                if isAnon {
                    Button { showSignIn = true } label: {
                        Text("회원가입 · 로그인")
                    }
                    .buttonStyle(EditorialButtonStyle(.filled))
                    Spacer().frame(height: SheetMetrics.buttonGap)
                    Button { dismiss() } label: {
                        Text("닫기").labelCaps()
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
                } else {
                    Button { dismiss() } label: {
                        Text("닫기")
                    }
                    .buttonStyle(EditorialButtonStyle(.filled))
                }
            }
            .padding(SheetMetrics.cardPadding)
            .frame(maxWidth: 340)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
            .shadow(color: Color.black.opacity(0.10), radius: 16, x: 0, y: 6)
            .padding(.horizontal, 24)
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

    /// Two centered lines: FORMAT · AUTHOR / YEAR · 👁 · 🔖 · 💬.
    /// PWA 상세 메타 행 순서 — 조회 · 북마크 · 댓글 (m-app.js:2166-2170).
    private var metadataBlock: some View {
        VStack(spacing: 6) {
            let head: [String] = [
                card.work.format.label(original: showOriginal),
                card.work.displayAuthor(original: showOriginal)?.uppercased() ?? "",
            ].filter { !$0.isEmpty }
            if !head.isEmpty {
                HStack(spacing: 12) {
                    ForEach(head, id: \.self) { Text($0).labelCaps() }
                }
            }
            HStack(spacing: 6) {
                if let year = card.work.releaseYear.map(String.init) {
                    Text(year).labelCaps()
                    Text("·").font(.bodySans(12)).foregroundStyle(.walnut)
                }
                Label(Self.countLabel(displayedViewCount), systemImage: "eye")
                Text("·").font(.bodySans(12)).foregroundStyle(.walnut)
                Label(Self.countLabel(bookmarkCount), systemImage: "bookmark")
                Text("·").font(.bodySans(12)).foregroundStyle(.walnut)
                Label(Self.countLabel(comments.comments.count), systemImage: "bubble.right")
            }
            .font(.bodySans(12))
            .foregroundStyle(.walnut)
            .labelStyle(.titleAndIcon)
        }
        .frame(maxWidth: .infinity)
    }

    private static func countLabel(_ value: Int) -> String {
        if value < 1_000 { return "\(value)" }
        let thousands = Double(value) / 1_000
        if thousands >= 10 { return "\(Int(thousands.rounded()))k" }
        return "\((thousands * 10).rounded() / 10)k"
    }
}

private struct RequestLibraryKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

private struct RequestFeedKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    /// Switch to the LIBRARY (Archive) tab — injected by RootView, mirroring
    /// `requestLogin`. Used by Card Detail's "서재로 가기" button.
    var requestLibrary: () -> Void {
        get { self[RequestLibraryKey.self] }
        set { self[RequestLibraryKey.self] = newValue }
    }

    /// Switch to the FEED tab — injected by RootView. Used after the Card Detail
    /// "오늘의 한줄 남기기" feed-post submit routes to Feed.
    var requestFeed: () -> Void {
        get { self[RequestFeedKey.self] }
        set { self[RequestFeedKey.self] = newValue }
    }
}

/// Compact feed one-liner composer for the current card (Card Detail "오늘의 한줄").
/// Mirrors FeedView's compose sheet; the actual write is `Supa.addFeedPost`.
private struct FeedOneLinerComposeSheet: View {
    let card: Card
    let submitting: Bool
    let errorMessage: String?
    let onSubmit: (String) -> Void

    @State private var draft = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(card.work.displayTitle(original: false))
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
                    .onChange(of: draft) { _, v in if v.count > 300 { draft = String(v.prefix(300)) } }
                Text("\(draft.count)/300자")
                    .font(.bodySans(12))
                    .foregroundStyle(.walnut)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                if let errorMessage {
                    Text(errorMessage).font(.bodySans(12)).foregroundStyle(.cta)
                }
                Button { onSubmit(draft) } label: {
                    Text(submitting ? "등록 중⋯" : "등록 하기")
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
        !submitting && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
