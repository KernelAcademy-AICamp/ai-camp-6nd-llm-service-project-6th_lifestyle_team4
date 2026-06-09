import SwiftUI
import UIKit

struct CardDetailView: View {
    let card: Card
    let onLoginRequested: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @StateObject private var comments: CommentsModel
    @State private var showAccountPrompt = false
    @State private var displayedViewCount: Int
    @State private var bookmarkCount = 0
    @State private var didIncrementView = false
    @State private var showOriginal = false
    @FocusState private var composerFocused: Bool

    init(card: Card, onLoginRequested: (() -> Void)? = nil) {
        self.card = card
        self.onLoginRequested = onLoginRequested
        _comments = StateObject(wrappedValue: CommentsModel(cardId: card.cardId))
        _displayedViewCount = State(initialValue: card.viewCount ?? 0)
    }

    private var bookmarked: Bool { bookmarks.isBookmarked(card.cardId) }

    private var showSignificance: Bool {
        let f = card.work.format.rawValue.lowercased()
        return !(card.significance ?? "").isEmpty && (f == "opera" || f == "play")
    }

    var body: some View {
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

                    scriptText
                        .tracking(0.28)
                        .lineSpacing(8)
                        .fixedSize(horizontal: false, vertical: true)
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
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
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
        .task { await loadCountsAndIncrementView() }
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
    }

    /// Script excerpt with speaker lines (matching work.characters) bolded.
    /// In the ENG view the script is English while characters are Korean names,
    /// so no line matches and nothing is bolded — content still shows in full.
    private var scriptText: Text {
        let names = Set(card.work.characters.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        let lines = card.displayScript(original: showOriginal).components(separatedBy: "\n")
        var result = AttributedString()
        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let namePart = trimmed.components(separatedBy: "(").first?.trimmingCharacters(in: .whitespaces) ?? trimmed
            let isSpeaker = !trimmed.isEmpty && (names.contains(trimmed) || names.contains(namePart))
            var segment = AttributedString(line)
            segment.font = .system(size: 14, design: .monospaced).weight(isSpeaker ? .bold : .regular)
            segment.foregroundColor = .espresso
            result += segment
            if i < lines.count - 1 { result += AttributedString("\n") }
        }
        return Text(result)
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
