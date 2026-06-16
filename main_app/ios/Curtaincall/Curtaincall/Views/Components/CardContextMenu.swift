import SwiftUI

/// App-level "go to login" action — set once in `RootView` to switch to the My
/// tab. Lets a deep cell's context-menu account prompt route to sign-in without
/// plumbing `selectedTab` through every surface. Default is a no-op.
struct RequestLoginKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}
extension EnvironmentValues {
    var requestLogin: () -> Void {
        get { self[RequestLoginKey.self] }
        set { self[RequestLoginKey.self] = newValue }
    }
}

/// iOS-only context-menu peek for card cells (Daily / Home / Archive). Long-press
/// shows an editorial preview (quote + work) and quick actions. **Open is the
/// native preview tap** — it triggers the underlying `NavigationLink`, so it
/// routes through `CardDetailView`'s yarn gate (no bypass, no double-navigation).
///
/// Apply to the existing `NavigationLink(value: card)` cells via `.cardContextMenu(card)`.
private struct CardContextMenuModifier: ViewModifier {
    let card: Card
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var bookmarks: BookmarkStore
    @Environment(\.requestLogin) private var requestLogin
    @State private var showAccountPrompt = false

    func body(content: Content) -> some View {
        content
            .contextMenu {
                Button {
                    if session.isAnonymous {
                        showAccountPrompt = true
                    } else {
                        Task { await bookmarks.toggle(userId: session.userId, cardId: card.cardId) }
                    }
                } label: {
                    Label(bookmarked ? "북마크 해제" : "북마크 저장",
                          systemImage: bookmarked ? "bookmark.slash" : "bookmark")
                }
                // 기본 공유 — 일반 텍스트(명대사). #10 의 타이포 명대사 카드 공유가 이걸 대체.
                ShareLink(item: shareText) {
                    Label("공유", systemImage: "square.and.arrow.up")
                }
            } preview: {
                cardPeek
            }
            // 비회원 북마크 시도 → 기존 회원 전용 프롬프트. 셀 bounds 에 갇히지 않도록
            // 전체화면으로 띄우고(투명 배경) 프롬프트 자체의 딤을 쓴다.
            .fullScreenCover(isPresented: $showAccountPrompt) {
                AccountRequiredPrompt {
                    showAccountPrompt = false
                    requestLogin()
                } onClose: {
                    showAccountPrompt = false
                }
                .presentationBackground(.clear)
            }
    }

    private var bookmarked: Bool { bookmarks.isBookmarked(card.cardId) }

    /// 미리보기 — 명대사(세리프) + 작품/작가. 차분하고 미니멀한 에디토리얼 톤.
    private var cardPeek: some View {
        VStack(spacing: 14) {
            Text("\u{201C}\(peekQuote)\u{201D}")
                .font(.titleSerif(20))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .bookLeading(size: 20)
                .fixedSize(horizontal: false, vertical: true)
            if !meta.isEmpty {
                Text(meta).labelCaps(color: .walnut, size: 11)
            }
        }
        .padding(28)
        .frame(width: 300)
        .background(Color.paper)
    }

    private var peekQuote: String {
        let q = card.quote.trimmingCharacters(in: .whitespacesAndNewlines)
        return String(q.prefix(160))
    }

    private var meta: String {
        [card.work.title, card.work.author]
            .compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var shareText: String {
        meta.isEmpty ? peekQuote : "\u{201C}\(peekQuote)\u{201D}\n— \(meta)"
    }
}

extension View {
    /// iOS-only long-press peek + quick actions for a card cell. See `CardContextMenuModifier`.
    func cardContextMenu(_ card: Card) -> some View {
        modifier(CardContextMenuModifier(card: card))
    }
}
