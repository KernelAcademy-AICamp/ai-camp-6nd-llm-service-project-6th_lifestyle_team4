import SwiftUI

/// "내 댓글" — a signed-in member's own comments, newest first, each with its
/// parent card. Mirrors Android's MyCommentsScreen: list + inline edit/delete,
/// tap a row to open the parent card. Reads via `Supa.loadCommentsByUser`
/// (read-only); edit/delete reuse the existing `updateComment`/`deleteComment`.
struct MyCommentsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AuthSession

    @State private var comments: [MyComment] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var editingId: Int?
    @State private var editDraft = ""
    @State private var working = false
    @State private var pendingDeleteId: Int?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            content
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { card in
            CardDetailView(card: card)
        }
        .task { await load() }
        .alert("댓글 삭제", isPresented: Binding(
            get: { pendingDeleteId != nil },
            set: { if !$0 { pendingDeleteId = nil } }
        )) {
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                if let id = pendingDeleteId { Task { await delete(commentId: id) } }
            }
        } message: {
            Text("이 댓글을 삭제할까요?")
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
            Text("내 댓글")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Color.clear.frame(width: 40, height: 40)
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    @ViewBuilder
    private var content: some View {
        if loading && comments.isEmpty {
            centeredNote("불러오는 중⋯")
        } else if let errorText, comments.isEmpty {
            centeredNote(errorText, isError: true)
        } else if comments.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(comments) { comment in
                        commentRow(comment)
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Row

    @ViewBuilder
    private func commentRow(_ comment: MyComment) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !metaLine(comment).isEmpty {
                Text(metaLine(comment))
                    .labelCaps()
                    .lineLimit(2)
                Spacer().frame(height: 6)
            }

            if editingId == comment.commentId {
                editBox
                Spacer().frame(height: 8)
                linkRow {
                    linkButton("Cancel", color: .walnut) { editingId = nil }
                    linkButton("Save", color: .cta) { Task { await saveEdit(comment) } }
                }
            } else {
                // Tapping the body opens the parent card; the action buttons sit
                // outside the link so they aren't swallowed by it.
                Group {
                    if let card = comment.card {
                        NavigationLink(value: card) { bodyText(comment) }
                            .buttonStyle(.plain)
                    } else {
                        bodyText(comment)
                    }
                }
                Spacer().frame(height: 10)
                linkRow {
                    linkButton("Edit", color: .walnut) {
                        editingId = comment.commentId
                        editDraft = comment.body
                    }
                    linkButton("Delete", color: .cta) { pendingDeleteId = comment.commentId }
                }
            }
        }
        .padding(.vertical, 18)
        Hairline()
    }

    private func bodyText(_ comment: MyComment) -> some View {
        Text(comment.body)
            .font(.bodySans(14))
            .foregroundStyle(.espresso)
            .bookLeading(size: 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .multilineTextAlignment(.leading)
    }

    private var editBox: some View {
        ZStack(alignment: .topLeading) {
            if editDraft.isEmpty {
                Text("댓글을 수정하세요…")
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
                    if newValue.count > 500 { editDraft = String(newValue.prefix(500)) }
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

    // MARK: - Empty / note states

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

    private var emptyState: some View {
        VStack(spacing: 0) {
            Spacer()
            Image(systemName: "text.bubble")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(.sand)
            Spacer().frame(height: 14)
            Text("아직 단 댓글이 없어요")
                .font(.titleSerif(18))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text("명대사에 첫 댓글을 남겨보세요.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }

    // MARK: - Meta line

    /// "M. d  a h:mm  —  {작품 제목}  —  댓글|답글", mirroring Android's MyCommentRow.
    private func metaLine(_ comment: MyComment) -> String {
        var parts: [String] = []
        if let date = comment.createdDate { parts.append(Self.dateText(date)) }
        let title = comment.card?.work.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        parts.append(title.isEmpty ? "—" : title)
        parts.append(comment.isReply ? "↳ 답글" : "댓글")
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
            comments = try await Supa.shared.loadCommentsByUser(userId: uid)
        } catch {
            errorText = "댓글을 불러오지 못했어요."
        }
        loading = false
    }

    private func saveEdit(_ comment: MyComment) async {
        let trimmed = editDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let uid = session.userId, !trimmed.isEmpty, !working else { return }
        working = true
        do {
            _ = try await Supa.shared.updateComment(
                commentId: comment.commentId, userId: uid, body: trimmed
            )
            if let idx = comments.firstIndex(where: { $0.commentId == comment.commentId }) {
                comments[idx].body = trimmed
            }
            editingId = nil
        } catch {
            errorText = "수정에 실패했어요."
        }
        working = false
    }

    private func delete(commentId: Int) async {
        guard let uid = session.userId, !working else { return }
        working = true
        do {
            try await Supa.shared.deleteComment(commentId: commentId, userId: uid)
            comments.removeAll { $0.commentId == commentId }
            if editingId == commentId { editingId = nil }
        } catch {
            errorText = "삭제에 실패했어요."
        }
        working = false
    }
}
