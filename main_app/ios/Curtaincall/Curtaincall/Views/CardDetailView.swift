import SwiftUI

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

                    if let desc = card.excerptDescription, !desc.isEmpty {
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

                    if showSignificance, let sig = card.significance {
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
                            .editorialButton(style: .outlined)
                    }
                    .buttonStyle(.plain)

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
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
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
    private var scriptText: Text {
        let names = Set(card.work.characters.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        let lines = card.scriptExcerpt.components(separatedBy: "\n")
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
                Text(card.work.title)
                    .font(.headlineSerif(20))
                    .foregroundStyle(.espresso)
                    .lineLimit(1)
                if let subtitle = card.work.subtitle, !subtitle.isEmpty {
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
                card.work.format.displayName,
                card.work.author?.uppercased() ?? "",
                card.work.releaseYear.map(String.init) ?? "",
            ].filter { !$0.isEmpty }
            ForEach(items, id: \.self) { v in
                Text(v).labelCaps()
            }
        }
    }
}
