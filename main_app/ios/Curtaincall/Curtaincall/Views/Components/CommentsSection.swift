import SwiftUI
import Combine

/// Bubbles "the comment composer is focused" up to `RootView` so it can hide the
/// tab bar while the keyboard is up. Default false; any focused composer wins.
struct ComposerFocusedPreferenceKey: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

@MainActor
final class CommentsModel: ObservableObject {
    @Published var comments: [Comment] = []
    @Published var likes: [Int: Set<Int>] = [:]
    @Published var submitting = false
    @Published var errorMessage: String?
    @Published var replyingTo: Comment?
    @Published var editingCommentId: Int?

    private let cardId: Int
    init(cardId: Int) { self.cardId = cardId }

    func load() async {
        do {
            let cs = try await Supa.shared.loadComments(cardId: cardId)
            comments = cs
            let rows = try await Supa.shared.loadLikes(commentIds: cs.map { $0.commentId })
            var map: [Int: Set<Int>] = [:]
            for r in rows { map[r.commentId, default: []].insert(r.userId) }
            likes = map
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submit(userId: Int, nickname: String, body: String) async {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !submitting else { return }
        submitting = true
        do {
            let added = try await Supa.shared.addComment(
                cardId: cardId,
                userId: userId,
                body: trimmed,
                authorNickname: nickname.isEmpty ? nil : nickname,
                parentCommentId: replyingTo?.commentId
            )
            if !comments.contains(where: { $0.commentId == added.commentId }) {
                comments.append(added)
            }
            replyingTo = nil
        } catch {
            errorMessage = "댓글 작성 실패: \(error.localizedDescription)"
        }
        submitting = false
    }

    func toggleLike(userId: Int, commentId: Int) async {
        let original = likes[commentId] ?? []
        let wasLiked = original.contains(userId)
        var updated = original
        if wasLiked { updated.remove(userId) } else { updated.insert(userId) }
        likes[commentId] = updated
        do {
            try await Supa.shared.setLike(commentId: commentId, userId: userId, liked: !wasLiked)
        } catch {
            likes[commentId] = original
            errorMessage = "반응 처리 실패: \(error.localizedDescription)"
        }
    }

    func delete(userId: Int, commentId: Int) async {
        do {
            try await Supa.shared.deleteComment(commentId: commentId, userId: userId)
            comments.removeAll { $0.commentId == commentId || $0.parentCommentId == commentId }
            if replyingTo?.commentId == commentId { replyingTo = nil }
            if editingCommentId == commentId { editingCommentId = nil }
        } catch {
            errorMessage = "삭제 실패: \(error.localizedDescription)"
        }
    }

    func update(userId: Int, commentId: Int, body: String) async {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !submitting else { return }
        submitting = true
        do {
            let updated = try await Supa.shared.updateComment(commentId: commentId, userId: userId, body: trimmed)
            if let index = comments.firstIndex(where: { $0.commentId == commentId }) {
                comments[index] = updated
            }
            editingCommentId = nil
        } catch {
            errorMessage = "수정 실패: \(error.localizedDescription)"
        }
        submitting = false
    }

    /// Top-level comments paired with their replies (1 level deep, normalized).
    var grouped: [(top: Comment, replies: [Comment])] {
        let byId = Dictionary(comments.map { ($0.commentId, $0) }, uniquingKeysWith: { a, _ in a })
        func rootOf(_ c: Comment) -> Int {
            guard let pid = c.parentCommentId else { return c.commentId }
            if let parent = byId[pid], let gp = parent.parentCommentId { return gp }
            return pid
        }
        let repliesByRoot = Dictionary(grouping: comments.filter { $0.parentCommentId != nil }, by: rootOf)
        return comments.filter { $0.parentCommentId == nil }
            .map { (top: $0, replies: repliesByRoot[$0.commentId] ?? []) }
    }
}

struct CommentsSection: View {
    @ObservedObject var model: CommentsModel
    let userId: Int?
    let isAnonymous: Bool
    let nickname: String

    @State private var editDraft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("댓글 \(model.comments.count)").labelCaps()
            Spacer().frame(height: 16)

            if isAnonymous {
                Text("로그인 후 댓글과 하트를 남길 수 있어요.")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 8)
            }

            if let err = model.errorMessage {
                Spacer().frame(height: 8)
                Text(err).font(.bodySans(12)).foregroundStyle(.cta)
            }

            Spacer().frame(height: 20)

            if model.comments.isEmpty {
                Text("아직 댓글이 없어요. 첫 감상을 남겨보세요.")
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 8)
            } else {
                ForEach(model.grouped, id: \.top.id) { group in
                    commentRow(group.top, isReply: false)
                    ForEach(group.replies) { reply in
                        commentRow(reply, isReply: true)
                    }
                }
            }
        }
        .task { await model.load() }
    }

    private func commentRow(_ c: Comment, isReply: Bool) -> some View {
        let likeUsers = model.likes[c.commentId] ?? []
        let likedByMe = userId != nil && likeUsers.contains(userId!)
        let isMine = userId != nil && c.userId == userId!
        let isEditing = model.editingCommentId == c.commentId

        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text((isReply ? "↳ " : "") + (c.authorNickname ?? "익명"))
                    .font(.titleSerif(15))
                    .foregroundStyle(.espresso)
                Spacer()
                Text(Self.relativeTime(c.createdAt)).labelCaps()
            }
            if isEditing {
                editBox
            } else {
                Text(c.body)
                    .font(.bodySans(14))
                    .foregroundStyle(.espresso)
                    .bookLeading(size: 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 16) {
                if !isEditing {
                    Button {
                        if let uid = userId, !isAnonymous {
                            Task { await model.toggleLike(userId: uid, commentId: c.commentId) }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: likedByMe ? "heart.fill" : "heart").font(.system(size: 14))
                            Text("\(likeUsers.count)").font(.bodySans(12))
                        }
                        .foregroundStyle(likedByMe ? Color.cta : .walnut)
                    }
                    .buttonStyle(.plain)
                    if !isReply && !isAnonymous {
                        Button { model.replyingTo = c } label: { Text("REPLY").labelCaps() }
                            .buttonStyle(.plain)
                    }
                }
                Spacer()
                if isMine {
                    if isEditing {
                        Button {
                            model.editingCommentId = nil
                            editDraft = ""
                        } label: { Text("CANCEL").labelCaps() }
                            .buttonStyle(.plain)
                        Button {
                            if let uid = userId {
                                Task { await model.update(userId: uid, commentId: c.commentId, body: editDraft) }
                            }
                        } label: { Text("SAVE").labelCaps(color: .cta) }
                            .buttonStyle(.plain)
                            .disabled(model.submitting || editDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    } else {
                        Button {
                            editDraft = c.body
                            model.editingCommentId = c.commentId
                        } label: { Text("EDIT").labelCaps() }
                            .buttonStyle(.plain)
                        Button {
                            if let uid = userId {
                                Task { await model.delete(userId: uid, commentId: c.commentId) }
                            }
                        } label: { Text("DELETE").labelCaps() }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 2)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.paper))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.latte, lineWidth: 0.5))
        .padding(.leading, isReply ? 24 : 0)
        .padding(.bottom, 10)
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

    static func relativeTime(_ iso: String) -> String {
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
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy.MM.dd"
        return f.string(from: date)
    }
}

/// Chat-style comment composer — the inner content of a `dockedBottomBar`, which
/// supplies the solid background, top hairline, and safe-area/keyboard/scroll
/// behavior. A growing field with the "등록" submit inline on the trailing edge,
/// enabled only when there's non-blank text.
struct CommentComposer: View {
    @ObservedObject var model: CommentsModel
    let userId: Int?
    let nickname: String
    var focused: FocusState<Bool>.Binding

    @State private var draft = ""

    private var trimmed: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var canSend: Bool { !model.submitting && !trimmed.isEmpty }

    var body: some View {
        VStack(spacing: 8) {
            if model.replyingTo != nil || (focused.wrappedValue && !draft.isEmpty) {
                HStack(spacing: 8) {
                    if let target = model.replyingTo {
                        Text("↳ \(target.authorNickname ?? "익명")에게 답글").labelCaps(color: .cta)
                        Button { model.replyingTo = nil } label: {
                            Text("취소").font(.bodySans(12)).foregroundStyle(.walnut)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    if focused.wrappedValue && !draft.isEmpty {
                        Text("\(draft.count)/500").labelCaps()
                    }
                }
            }

            HStack(alignment: .bottom, spacing: 0) {
                TextField(
                    model.replyingTo == nil ? "이 명대사에 대한 생각을 남겨보세요…" : "답글을 남기세요…",
                    text: $draft,
                    axis: .vertical
                )
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .lineLimit(1...5)
                .focused(focused)
                .padding(.leading, 16)
                .padding(.vertical, 10)
                .onChange(of: draft) { _, newValue in
                    if newValue.count > 500 { draft = String(newValue.prefix(500)) }
                }

                Button(action: send) {
                    Text("등록")
                        .labelCaps(color: canSend ? .paper : .walnut)
                        .padding(.horizontal, 16)
                        .frame(height: 36)
                        .background(
                            RoundedRectangle(cornerRadius: 18)
                                .fill(canSend ? Color.espresso : Color.latte)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .padding(4)
            }
            .background(RoundedRectangle(cornerRadius: 22).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.latte, lineWidth: 0.5))
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private func send() {
        guard canSend, let uid = userId else { return }
        let body = trimmed
        draft = ""
        Task { await model.submit(userId: uid, nickname: nickname, body: body) }
    }
}
