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
    @State private var moderationToast: String?

    private func showModerationToast(_ message: String) {
        withAnimation { moderationToast = message }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            withAnimation { if moderationToast == message { moderationToast = nil } }
        }
    }

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
            // 남의 하이라이트면 신고·차단(App Store 1.2). 내 것이면 빈 칸으로 제목 가운데 정렬 유지.
            if session.userId != highlight.userId {
                ModerationMenu(
                    target: .highlight(highlight.highlightId),
                    authorUserId: highlight.userId,
                    onToast: showModerationToast,
                    onBlocked: { dismiss() }   // 차단 후 상세 닫기 — 차단 콘텐츠 잔류 방지
                )
                .frame(width: 40, height: 40)
            } else {
                Color.clear.frame(width: 40, height: 40)
            }
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
            // WorkCover: cover_url 아트워크 로드(WorkCoverCache), 없으면 가죽 폴백.
            // 기존 HighlightBookCover 는 가죽 전용이라 표지가 안 떴음(Daily 와 동일 버그).
            WorkCover(work: highlight.card?.work, width: 132, height: 188)
            Spacer().frame(height: 22)
            // 화자 라벨이 LLM 출력에 `**크레온**` 마크다운으로 들어올 수 있어 그대로 노출되던 문제 fix —
            // AttributedString(markdown:) 으로 ** 마커를 볼드로 변환. inlineOnlyPreservingWhitespace
            // 옵션으로 줄바꿈 보존.
            Text(highlight.selectedText.markdownBold)
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
