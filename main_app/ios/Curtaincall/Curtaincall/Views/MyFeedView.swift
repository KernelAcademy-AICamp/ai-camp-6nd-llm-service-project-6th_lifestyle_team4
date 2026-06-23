import SwiftUI

/// "내 피드" — a signed-in member's own feed activity: their **오늘의 한줄**
/// (feed_posts) and **하이라이트** (card_highlights), newest first, each with its
/// parent card. Mirrors the PWA's MY FEED (`myfeedCategory` 'comment'|'highlight',
/// `editingMyFeedId`) and the existing `MyCommentsView` pattern: list + inline
/// edit/delete, tap a row to open its detail. One-liners support inline edit +
/// delete; highlights support delete. Reads/writes are all `user_id`-scoped.
struct MyFeedView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession

    enum Tab { case oneLiners, highlights }

    @State private var tab: Tab = .oneLiners
    @State private var posts: [FeedPost] = []
    @State private var highlights: [CardHighlight] = []
    @State private var loading = true
    @State private var errorText: String?

    // Inline edit (one-liners only) + delete confirmations.
    @State private var editingPostId: Int?
    @State private var editDraft = ""
    @State private var working = false
    @State private var pendingDeletePostId: Int?
    @State private var pendingDeleteHighlightId: Int?

    // Detail navigation — reuses FeedView's destinations.
    @State private var selectedCard: Card?
    @State private var selectedHighlight: CardHighlight?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            tabBar
            content
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $selectedCard) { card in
            CardDetailView(card: card)
        }
        .navigationDestination(item: $selectedHighlight) { highlight in
            HighlightDetailView(highlight: highlight) { card in
                selectedCard = card
            }
        }
        .task { await load() }
        .alert("한줄 삭제", isPresented: Binding(
            get: { pendingDeletePostId != nil },
            set: { if !$0 { pendingDeletePostId = nil } }
        )) {
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                if let id = pendingDeletePostId { Task { await deletePost(id) } }
            }
        } message: {
            Text("이 한줄을 삭제할까요?")
        }
        .alert("하이라이트 삭제", isPresented: Binding(
            get: { pendingDeleteHighlightId != nil },
            set: { if !$0 { pendingDeleteHighlightId = nil } }
        )) {
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                if let id = pendingDeleteHighlightId { Task { await deleteHighlight(id) } }
            }
        } message: {
            Text("이 하이라이트를 삭제할까요?")
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
            Text("내 피드")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private var tabBar: some View {
        HStack(spacing: 8) {
            tabChip("오늘의 한줄", active: tab == .oneLiners) { tab = .oneLiners }
            tabChip("하이라이트", active: tab == .highlights) { tab = .highlights }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func tabChip(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Pretendard-Medium", size: 13))
                .foregroundStyle(active ? Color.paper : .walnut)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(active ? Color.espresso : Color.sand.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var content: some View {
        if loading && posts.isEmpty && highlights.isEmpty {
            centeredNote("불러오는 중⋯")
        } else if let errorText, posts.isEmpty && highlights.isEmpty {
            centeredNote(errorText, isError: true)
        } else {
            switch tab {
            case .oneLiners:
                if posts.isEmpty { emptyState(icon: "text.quote", title: "아직 남긴 한줄이 없어요", note: "명대사에 오늘의 한줄을 남겨보세요.") }
                else { list { ForEach(posts) { postRow($0) } } }
            case .highlights:
                if highlights.isEmpty { emptyState(icon: "highlighter", title: "아직 저장한 하이라이트가 없어요", note: "카드 본문에서 구절을 드래그해 저장해보세요.") }
                else { list { ForEach(highlights) { highlightRow($0) } } }
            }
        }
    }

    private func list<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                content()
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - One-liner row (inline edit + delete)

    @ViewBuilder
    private func postRow(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            let meta = metaLine(date: post.createdDate, card: post.card)
            if !meta.isEmpty {
                Text(meta).labelCaps().lineLimit(2)
                Spacer().frame(height: 6)
            }

            if editingPostId == post.postId {
                editBox
                Spacer().frame(height: 6)
                HStack {
                    Spacer()
                    Text("\(editDraft.count)/300자")
                        .font(.bodySans(11))
                        .foregroundStyle(.walnut)
                }
                Spacer().frame(height: 8)
                linkRow {
                    linkButton("Cancel", color: .walnut) { editingPostId = nil }
                    linkButton("Save", color: .cta) { Task { await saveEdit(post) } }
                }
            } else {
                Button { selectedCard = post.card } label: {
                    Text(post.body)
                        .font(.bodySans(14))
                        .foregroundStyle(.espresso)
                        .bookLeading(size: 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                .disabled(post.card == nil)
                Spacer().frame(height: 10)
                linkRow {
                    linkButton("Edit", color: .walnut) {
                        editingPostId = post.postId
                        editDraft = post.body
                    }
                    linkButton("Delete", color: .cta) { pendingDeletePostId = post.postId }
                }
            }
        }
        .padding(.vertical, 18)
        Hairline()
    }

    // MARK: - Highlight row (delete only)

    @ViewBuilder
    private func highlightRow(_ highlight: CardHighlight) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            let meta = metaLine(date: highlight.createdDate, card: highlight.card)
            if !meta.isEmpty {
                Text(meta).labelCaps().lineLimit(2)
                Spacer().frame(height: 6)
            }
            Button { selectedHighlight = highlight } label: {
                VStack(alignment: .leading, spacing: 8) {
                    // LLM 출력의 `**화자**` 마커가 그대로 노출되던 문제 — markdownBold 로 볼드 변환.
                    Text("“") + Text(highlight.selectedText.markdownBold) + Text("”")
                        .font(.bodySans(14))
                        .foregroundStyle(.espresso)
                        .bookLeading(size: 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                    if let note = highlight.userNote?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                        Text(note)
                            .font(.bodySans(13))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer().frame(height: 10)
            linkRow {
                linkButton("Delete", color: .cta) { pendingDeleteHighlightId = highlight.highlightId }
            }
        }
        .padding(.vertical, 18)
        Hairline()
    }

    // MARK: - Shared row pieces (mirror MyCommentsView)

    private var editBox: some View {
        ZStack(alignment: .topLeading) {
            if editDraft.isEmpty {
                Text("한줄을 수정하세요…")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
            }
            TextEditor(text: $editDraft)
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .frame(minHeight: 64)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .scrollContentBackground(.hidden)
                .onChange(of: editDraft) { _, newValue in
                    // feed_posts.body DB CHECK is 1–300 chars (017_feed_posts.sql),
                    // matching FeedView's composer — cap here so an edit can't fail on save.
                    if newValue.count > 300 { editDraft = String(newValue.prefix(300)) }
                }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }

    private func linkRow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(spacing: 16) {
            Spacer()
            content()
        }
        .frame(maxWidth: .infinity)
    }

    private func linkButton(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).labelCaps(color: color)
        }
        .buttonStyle(.plain)
        .disabled(working)
    }

    private func centeredNote(_ text: String, isError: Bool = false) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.bodySans(14))
                .foregroundStyle(isError ? Color.cta : .walnut)
                .padding(24)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func emptyState(icon: String, title: String, note: String) -> some View {
        VStack(spacing: 0) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(.sand)
            Spacer().frame(height: 14)
            Text(title)
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text(note)
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }

    /// "M. d  a h:mm  —  {작품 제목}", mirroring MyCommentsView's meta line.
    private func metaLine(date: Date?, card: Card?) -> String {
        var parts: [String] = []
        if let date { parts.append(Self.dateText(date)) }
        let title = card?.work.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        parts.append(title.isEmpty ? "—" : title)
        return parts.joined(separator: "  —  ")
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M. d  a h:mm"
        return formatter.string(from: date)
    }

    // MARK: - Data

    private func load() async {
        guard let uid = session.userId else { loading = false; return }
        loading = true
        errorText = nil
        do {
            async let p = Supa.shared.fetchMyFeedPosts(userId: uid)
            async let h = Supa.shared.fetchMyHighlights(userId: uid)
            posts = try await p
            highlights = try await h
        } catch {
            errorText = "내 피드를 불러오지 못했어요."
        }
        loading = false
    }

    private func saveEdit(_ post: FeedPost) async {
        let trimmed = editDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let uid = session.userId, !trimmed.isEmpty, !working else { return }
        working = true
        do {
            try await Supa.shared.updateFeedPost(postId: post.postId, userId: uid, body: trimmed)
            if let idx = posts.firstIndex(where: { $0.postId == post.postId }) {
                posts[idx] = post.withBody(trimmed)
            }
            editingPostId = nil
        } catch {
            errorText = "수정에 실패했어요."
        }
        working = false
    }

    private func deletePost(_ postId: Int) async {
        guard let uid = session.userId, !working else { return }
        working = true
        do {
            try await Supa.shared.deleteFeedPost(postId: postId, userId: uid)
            posts.removeAll { $0.postId == postId }
            if editingPostId == postId { editingPostId = nil }
        } catch {
            errorText = "삭제에 실패했어요."
        }
        working = false
    }

    private func deleteHighlight(_ highlightId: Int) async {
        guard let uid = session.userId, !working else { return }
        working = true
        do {
            try await Supa.shared.deleteHighlight(highlightId: highlightId, userId: uid)
            highlights.removeAll { $0.highlightId == highlightId }
        } catch {
            errorText = "삭제에 실패했어요."
        }
        working = false
    }
}
