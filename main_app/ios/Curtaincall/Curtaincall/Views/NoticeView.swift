import SwiftUI

/// 공지사항 — Android-parity (NoticeScreen.kt). Top-bar title, Korean tag labels,
/// relative-time stamps, collapse/expand with a markdown subset, and the warm-card
/// styling. Read-only over `public.notices`.
struct NoticeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var prefs: PrefsStore
    @State private var notices: [Notice] = []
    @State private var isLoading = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    Spacer().frame(height: 4)
                    if isLoading && notices.isEmpty {
                        centeredNote("불러오는 중⋯")
                    } else if notices.isEmpty {
                        centeredNote("등록된 공지가 없습니다.")
                    } else {
                        ForEach(notices) { notice in
                            NoticeCard(notice: notice)
                        }
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
            .refreshable { await load() }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
    }

    // 다른 하위 페이지(내 댓글·보관함·약관)와 동일한 상단 바 — Android ActivityTopBar 대응
    // (iOS엔 공유 컴포넌트가 없어 화면 내부에 동일 형태로 구성).
    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("공지사항")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 8)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func centeredNote(_ text: String) -> some View {
        Text(text)
            .font(.bodySans(14))
            .foregroundStyle(.walnut)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 80)
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            notices = try await Supa.shared.fetchNotices()
            prefs.markNoticesSeen(notices.map(\.noticeId).max() ?? 0)
        } catch {
            notices = []
        }
    }
}

private struct NoticeCard: View {
    let notice: Notice

    @State private var expanded = false
    @State private var isTruncated = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(tagLabel)
                    .font(.custom("Pretendard-Medium", size: 11))
                    .tracking(1.4)
                    .foregroundStyle(tagForeground)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 3)
                    .background(tagBackground, in: RoundedRectangle(cornerRadius: 4))
                if notice.pinned {
                    Text("📌").font(.system(size: 12))
                }
                Spacer()
                Text(Self.relativeTime(notice.createdAt))
                    .font(.bodySans(11))
                    .foregroundStyle(.walnut)
            }
            Spacer().frame(height: 12)
            Text(notice.title)
                .font(.titleSerif(16))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            bodyView
            if isTruncated {
                Spacer().frame(height: 10)
                HStack(spacing: 4) {
                    Text(expanded ? "접기" : "더보기")
                        .font(.bodySans(11))
                        .foregroundStyle(.walnut)
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.walnut)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.cardWarm))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.latte, lineWidth: 0.5))
        .contentShape(Rectangle())
        .onTapGesture {
            guard isTruncated else { return }
            withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
        }
    }

    @ViewBuilder
    private var bodyView: some View {
        if expanded {
            Text(Self.markdownBody(notice.body))
                .font(.bodySans(14))
                .foregroundStyle(.roast)
                .bookLeading(size: 14)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            // 3줄 미리보기. 숨은 전체-높이 사본과 비교해 넘칠 때만 더보기 토글을 노출
            // (Android onTextLayout hasVisualOverflow 대응).
            let preview = Self.noticePreview(notice.body)
            Text(preview)
                .font(.bodySans(14))
                .foregroundStyle(.roast)
                .bookLeading(size: 14)
                .lineLimit(3)
                .background(
                    GeometryReader { visible in
                        Text(preview)
                            .font(.bodySans(14))
                            .bookLeading(size: 14)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(width: visible.size.width, alignment: .topLeading)
                            .background(GeometryReader { full in
                                Color.clear
                                    .onAppear { setTruncated(full.size.height, visible.size.height) }
                                    .onChange(of: full.size.height) { _, h in
                                        setTruncated(h, visible.size.height)
                                    }
                            })
                            .hidden()
                    }
                )
        }
    }

    private func setTruncated(_ fullHeight: CGFloat, _ visibleHeight: CGFloat) {
        let truncated = fullHeight - visibleHeight > 1
        if truncated != isTruncated { isTruncated = truncated }
    }

    // MARK: - Tag (Android TagChip mapping)

    private var tagLabel: String {
        switch notice.tag.lowercased() {
        case "update": return "업데이트"
        case "event": return "이벤트"
        default: return "공지"
        }
    }

    private var tagBackground: Color {
        switch notice.tag.lowercased() {
        case "update": return .cta
        case "event": return .highlight
        default: return .espresso
        }
    }

    private var tagForeground: Color {
        switch notice.tag.lowercased() {
        case "update": return .white
        case "event": return Color(hex: 0x2C2620)   // fixed dark on the always-yellow chip
        default: return .paper
        }
    }

    // MARK: - Relative time (ports CommentsSection.kt relativeTime)

    static func relativeTime(_ iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let diff = max(0, Date().timeIntervalSince(date))
        let minutes = Int(diff / 60)
        if minutes < 1 { return "방금" }
        if minutes < 60 { return "\(minutes)분 전" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)시간 전" }
        let days = hours / 24
        if days < 7 { return "\(days)일 전" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "yyyy.MM.dd"
        return f.string(from: date)
    }

    // MARK: - Markdown subset (Android NoticeBody / noticePreview)

    /// Collapsed preview — flatten the markdown to plain text (strip heading/bullet
    /// markers + `**`, drop image lines) so a 3-line clamp reads cleanly.
    static func noticePreview(_ body: String) -> String {
        body.split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !isImageLine($0) }
            .map { line -> String in
                line
                    .replacingOccurrences(of: #"^#{1,3}\s+"#, with: "", options: .regularExpression)
                    .replacingOccurrences(of: #"^[-•]\s+"#, with: "", options: .regularExpression)
                    .replacingOccurrences(of: "**", with: "")
            }
            .joined(separator: " ")
    }

    /// Expanded body — render the markdown subset (bold/italic/links + line breaks)
    /// via native `AttributedString(markdown:)`, no dependency. Headings → bold and
    /// bullets → "• " are pre-normalised into that inline subset; image lines are
    /// dropped (no image loader), mirroring Android NoticeBody.
    static func markdownBody(_ body: String) -> AttributedString {
        let normalised = body.split(separator: "\n", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !isImageLine($0) }
            .map { line -> String in
                if let h = line.range(of: #"^#{1,3}\s+"#, options: .regularExpression) {
                    return "**" + line[h.upperBound...].trimmingCharacters(in: .whitespaces) + "**"
                }
                if let b = line.range(of: #"^[-•]\s+"#, options: .regularExpression) {
                    return "•\u{00A0}" + line[b.upperBound...].trimmingCharacters(in: .whitespaces)
                }
                return line
            }
            .joined(separator: "\n")

        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: true,
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: normalised, options: options))
            ?? AttributedString(normalised)
    }

    private static func isImageLine(_ line: String) -> Bool {
        line.range(of: #"^!\[.*\]\(https://.*\)$"#, options: .regularExpression) != nil
    }
}
