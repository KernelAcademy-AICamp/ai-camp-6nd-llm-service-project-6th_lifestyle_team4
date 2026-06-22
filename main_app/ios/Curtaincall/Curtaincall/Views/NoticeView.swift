import SwiftUI

/// 공지사항 — PWA 일치. 상단 타이틀+서브라인("업데이트와 소식"), 영문 태그
/// (UPDATE/NOTICE/EVENT), 절대 날짜("YYYY. M. D"), 핀 마커 없음. 본문은 더보기
/// 접기 유지(iOS finish) + 마크다운 서브셋. Read-only over `public.notices`.
struct NoticeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var prefs: PrefsStore
    @State private var notices: [Notice] = []
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    Spacer().frame(height: 4)
                    if isLoading && notices.isEmpty {
                        centeredNote("불러오는 중⋯")
                    } else if let loadError, notices.isEmpty {
                        centeredNote(loadError, error: true)
                    } else if notices.isEmpty {
                        noticeEmpty
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
            VStack(spacing: 2) {
                Text("공지사항")
                    .font(.headlineSerif(20))
                    .foregroundStyle(.espresso)
                // PWA 헤더 서브라인 "업데이트와 소식" (index.html:1914).
                Text("업데이트와 소식")
                    .font(.bodySans(11))
                    .foregroundStyle(.walnut)
            }
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 8)
        .frame(height: 56)
        .overlay(alignment: .bottom) { Hairline() }
    }

    // PWA notice-empty: campaign(메가폰) 아이콘 + 헤드라인 + 서브라인 (index.html:1918-1921).
    private var noticeEmpty: some View {
        VStack(spacing: 0) {
            Image(systemName: "megaphone")
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(.sand)
            Spacer().frame(height: 14)
            Text("아직 공지가 없어요")
                .font(.headlineSerif(18))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text("새로운 소식이 올라오면 여기에 표시됩니다.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // Android CenteredNote — 에러일 때 Cta(코랄)로 표시.
    private func centeredNote(_ text: String, error: Bool = false) -> some View {
        Text(text)
            .font(.bodySans(14))
            .foregroundStyle(error ? Color.cta : Color.walnut)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 80)
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            notices = try await Supa.shared.fetchNotices()
            prefs.markNoticesSeen(notices.map(\.noticeId).max() ?? 0)
        } catch {
            // Android: state.error = e.message ?: "불러오기 실패" — 조용히 삼키지 않고 노출.
            notices = []
            loadError = error.localizedDescription.isEmpty ? "불러오기 실패" : error.localizedDescription
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
                // PWA: pinned 는 정렬에만 반영, 핀 마커(📌)는 렌더하지 않음.
                Spacer()
                Text(Self.absoluteDate(notice.createdAt))
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
                        .font(.system(size: 18, weight: .regular))
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
            NoticeMarkdownBody(source: notice.body)
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

    // PWA NOTICE_TAG_LABEL — 영문 대문자, 미지정 태그는 그대로 대문자화 (m-app.js:7834,7904).
    private var tagLabel: String {
        switch notice.tag.lowercased() {
        case "update": return "UPDATE"
        case "notice": return "NOTICE"
        case "event": return "EVENT"
        default: return notice.tag.uppercased()
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

    // MARK: - Absolute date (PWA formatNoticeDate)

    /// PWA `formatNoticeDate` — "YYYY. M. D" (앞자리 0 없음, 끝 마침표 없음).
    /// 예: "2026. 6. 22" (m-app.js:7875-7881).
    static func absoluteDate(_ iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0). \(c.month ?? 0). \(c.day ?? 0)"
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

    private static func isImageLine(_ line: String) -> Bool {
        line.range(of: #"^!\[.*\]\(https://.*\)$"#, options: .regularExpression) != nil
    }
}

/// Expanded notice body — rendered line-by-line to mirror Android `NoticeBody`:
/// headings in Espresso (6pt before / 2pt after), bullets "•  " with 2pt row
/// padding, blank lines as 10pt gaps, inline **bold** via `AttributedString`.
/// Image lines are dropped (no image loader).
private struct NoticeMarkdownBody: View {
    let source: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                switch line.kind {
                case .blank:
                    Spacer().frame(height: 10)
                case .heading:
                    Spacer().frame(height: 6)
                    Text(Self.inline(line.text))
                        .font(.custom("Pretendard-Medium", size: 14))
                        .foregroundStyle(.espresso)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 2)
                case .bullet:
                    HStack(alignment: .top, spacing: 0) {
                        Text("•  ").font(.bodySans(14)).foregroundStyle(.roast)
                        Text(Self.inline(line.text))
                            .font(.bodySans(14))
                            .foregroundStyle(.roast)
                            .bookLeading(size: 14)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 2)
                case .text:
                    Text(Self.inline(line.text))
                        .font(.bodySans(14))
                        .foregroundStyle(.roast)
                        .bookLeading(size: 14)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private enum Kind { case blank, heading, bullet, text }
    private struct Line { let kind: Kind; let text: String }

    private var lines: [Line] {
        source.split(separator: "\n", omittingEmptySubsequences: false).compactMap { raw in
            let t = raw.trimmingCharacters(in: .whitespaces)
            if t.range(of: #"^!\[.*\]\(https://.*\)$"#, options: .regularExpression) != nil { return nil }
            if t.isEmpty { return Line(kind: .blank, text: "") }
            if let h = t.range(of: #"^#{1,3}\s+"#, options: .regularExpression) {
                return Line(kind: .heading, text: String(t[h.upperBound...]).trimmingCharacters(in: .whitespaces))
            }
            if let b = t.range(of: #"^[-•]\s+"#, options: .regularExpression) {
                return Line(kind: .bullet, text: String(t[b.upperBound...]).trimmingCharacters(in: .whitespaces))
            }
            return Line(kind: .text, text: t)
        }
    }

    private static func inline(_ s: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: true,
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: s, options: options)) ?? AttributedString(s)
    }
}
