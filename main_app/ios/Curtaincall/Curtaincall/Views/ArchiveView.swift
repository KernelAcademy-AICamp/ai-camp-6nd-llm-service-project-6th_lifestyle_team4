import SwiftUI

struct ArchiveView: View {
    @EnvironmentObject private var bookmarks: BookmarkStore
    @EnvironmentObject private var session: AuthSession

    var body: some View {
        VStack(spacing: 0) {
            archiveTopBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 40)
                    Text("수집한 대본")
                        .font(.displaySerif(32))
                        .foregroundStyle(.espresso)
                    if !bookmarks.bookmarks.isEmpty {
                        Spacer().frame(height: 6)
                        Text("소장 \(bookmarks.bookmarks.count)편").labelCaps()
                    }
                    Spacer().frame(height: 32)
                    Hairline()

                    if !bookmarks.bookmarks.isEmpty {
                        ForEach(bookmarks.bookmarks) { row in
                            if let card = row.card {
                                NavigationLink(value: card) {
                                    ArchiveRow(card: card, daysAgo: 1)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    } else {
                        Text("아직 북마크한 카드가 없습니다.")
                            .font(.bodySans(14))
                            .foregroundStyle(.walnut)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 48)
                    }
                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(Color.paper)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Card.self) { CardDetailView(card: $0) }
        .task { await bookmarks.load(userId: session.userId) }
    }

    private var archiveTopBar: some View {
        HStack(alignment: .center) {
            Text("Daily Script")
                .font(.headlineSerif(22))
                .foregroundStyle(.espresso)
            Spacer()
            ZStack {
                Rectangle().stroke(Color.walnut, lineWidth: 0.5)
                Text(String(session.nickname.prefix(1)).uppercased().ifEmpty("D"))
                    .labelCaps(color: .espresso)
            }
            .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .background(Color.paper)
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
