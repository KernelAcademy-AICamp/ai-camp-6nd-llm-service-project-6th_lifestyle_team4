import SwiftUI
import UIKit

/// Detail for a saved highlight — the passage plus its own comments (nested
/// replies + heart-likes), mirroring Android's HighlightDetailSheet.
///
/// Reuses the shared `CommentsModel` + `CommentsSection` + `CommentComposer` via
/// the `.highlight` backend. Pushed in the Feed `NavigationStack` (not a sheet)
/// so the keyboard-aware `dockedBottomBar` composer behaves exactly as on
/// CardDetail. "카드 보기" routes through the caller (Feed's existing card
/// destination) to avoid a duplicate Card navigationDestination in the stack.
struct HighlightDetailView: View {
    let highlight: CardHighlight
    /// Open the parent card — provided by Feed so it reuses Feed's own card push.
    let onOpenCard: (Card) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession
    @StateObject private var comments: CommentsModel
    @FocusState private var composerFocused: Bool

    init(highlight: CardHighlight, onOpenCard: @escaping (Card) -> Void) {
        self.highlight = highlight
        self.onOpenCard = onOpenCard
        _comments = StateObject(wrappedValue: CommentsModel(backend: .highlight(highlight.highlightId)))
    }

    private var authorName: String {
        let n = highlight.authorNickname ?? ""
        return n.isEmpty ? "익명" : n
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    Spacer().frame(height: 32)
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
                // simultaneousGesture (not onTapGesture) so child buttons/links
                // still fire while a tap also dismisses the keyboard.
                .contentShape(Rectangle())
                .simultaneousGesture(TapGesture().onEnded { composerFocused = false })
            }
            .scrollDismissesKeyboard(.interactively)
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
        .onChange(of: comments.replyingTo?.commentId) { _, newValue in
            if newValue != nil { composerFocused = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            if composerFocused { composerFocused = false }
        }
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("하이라이트")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
    }

    private var header: some View {
        VStack(alignment: .center, spacing: 0) {
            Spacer().frame(height: 24)
            Text(authorName)
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
            Text(highlight.selectedText)
                .font(.titleSerif(17))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .bookLeading(size: 17)
                .fixedSize(horizontal: false, vertical: true)
            if let note = highlight.userNote, !note.isEmpty {
                Spacer().frame(height: 14)
                Text(note)
                    .font(.bodySans(13))
                    .foregroundStyle(.walnut)
                    .multilineTextAlignment(.center)
                    .bookLeading(size: 13)
            }
            if let card = highlight.card {
                Spacer().frame(height: 22)
                Button { onOpenCard(card) } label: { Text("카드 보기") }
                    .buttonStyle(EditorialButtonStyle(.outlined))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var metaText: String {
        var parts: [String] = []
        if let f = highlight.card?.work.format.displayName, !f.isEmpty { parts.append(f) }
        if let date = highlight.createdDate { parts.append(Self.dateText(date)) }
        return parts.joined(separator: " · ")
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }
}
