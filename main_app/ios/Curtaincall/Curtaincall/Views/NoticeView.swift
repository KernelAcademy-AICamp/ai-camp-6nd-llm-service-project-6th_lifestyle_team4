import SwiftUI

struct NoticeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var prefs: PrefsStore
    @State private var notices: [Notice] = []
    @State private var isLoading = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 24)
                    Text("공지사항")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 24)

                    if isLoading && notices.isEmpty {
                        Text("Loading⋯")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else if notices.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "megaphone")
                                .font(.system(size: 46, weight: .regular))
                                .foregroundStyle(.sand)
                            Text("아직 공지사항이 없습니다.")
                                .font(.titleSerif(18))
                                .foregroundStyle(.espresso)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                    } else {
                        ForEach(notices) { notice in
                            NoticeCard(notice: notice)
                            Spacer().frame(height: 14)
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

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, 8)
        .frame(height: 44)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(tagLabel)
                    .font(.custom("Pretendard-Medium", size: 11))
                    .tracking(1.4)
                    .foregroundStyle(tagForeground)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(tagBackground)
                Text(Self.dateText(notice.createdAt))
                    .font(.bodySans(11))
                    .foregroundStyle(.walnut)
                Spacer()
            }
            Spacer().frame(height: 12)
            Text(notice.title)
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)
            Text(notice.body)
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .bookLeading(size: 14)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.cardWarm))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.latte, lineWidth: 0.5))
    }

    private var tagLabel: String {
        switch notice.tag.lowercased() {
        case "update": return "UPDATE"
        case "event": return "EVENT"
        default: return "NOTICE"
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
        notice.tag.lowercased() == "event" ? Color.roast : Color.paper
    }

    private static func dateText(_ iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "yyyy.MM.dd"
        return formatter.string(from: date)
    }
}
