import SwiftUI

private struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct ContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct CardDetailView: View {
    let card: Card
    @Environment(\.dismiss) private var dismiss
    @State private var isBookmarked = false
    @State private var scrollOffset: CGFloat = 0
    @State private var contentHeight: CGFloat = 1
    @State private var viewportHeight: CGFloat = 1

    private var progress: CGFloat {
        let scrollable = max(contentHeight - viewportHeight, 1)
        return min(max(scrollOffset / scrollable, 0), 1)
    }

    var body: some View {
        GeometryReader { outer in
            ZStack(alignment: .top) {
                Color.paper.ignoresSafeArea()
                scrollContent
                topBar
                    .background(Color.paper.opacity(0.95))
                HStack { Spacer(); progressIndicator }
                    .padding(.trailing, 6)
                    .padding(.top, 80)
                VStack { Spacer(); bottomCTA }
            }
            .onAppear { viewportHeight = outer.size.height }
            .onChange(of: outer.size.height) { _, h in viewportHeight = h }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var scrollContent: some View {
        ScrollView {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: ScrollOffsetKey.self,
                    value: -proxy.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            VStack(alignment: .leading, spacing: 0) {
                heroBlock
                contentBlock
            }
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: ContentHeightKey.self, value: proxy.size.height)
                }
            )
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetKey.self) { scrollOffset = $0 }
        .onPreferenceChange(ContentHeightKey.self) { contentHeight = $0 }
    }

    private var heroBlock: some View {
        ZStack(alignment: .bottomLeading) {
            heroImage
                .frame(maxWidth: .infinity)
                .frame(height: 320)
                .clipped()
            LinearGradient(
                colors: [Color.black.opacity(0), Color.black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 200)
            .frame(maxWidth: .infinity, alignment: .bottom)

            VStack(alignment: .leading, spacing: 8) {
                if let category = card.category, !category.isEmpty {
                    CategoryBadge(code: category)
                }
                Text(card.work.title)
                    .font(.displaySerif(32))
                    .foregroundStyle(.paper)
                    .fixedSize(horizontal: false, vertical: true)
                if let author = card.work.author {
                    Text(author)
                        .font(.metaSans(12))
                        .foregroundStyle(.paper.opacity(0.85))
                }
            }
            .padding(20)
        }
    }

    @ViewBuilder
    private var heroImage: some View {
        if let url = card.imageUrl, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                default: heroPlaceholder
                }
            }
        } else {
            heroPlaceholder
        }
    }

    private var heroPlaceholder: some View {
        ZStack {
            Color.roast
            Text(String(card.work.title.prefix(1)))
                .font(.displaySerif(120))
                .foregroundStyle(Color.sand.opacity(0.7))
        }
    }

    private var contentBlock: some View {
        VStack(alignment: .leading, spacing: 24) {
            metadataStrip
            Text(card.scriptExcerpt)
                .font(.bodySans(15))
                .foregroundStyle(.espresso)
                .bookLeading(size: 15)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let rating = card.rating {
                StarRating(value: rating, count: card.ratingCount)
            }
            Text("한정판 디지털 매뉴스크립트 #\(String(format: "%04d", card.cardId))")
                .labelCaps()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 8)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 140)
    }

    private var metadataStrip: some View {
        HStack(spacing: 18) {
            Text("장면 \(card.cardId)").labelCaps()
            Text(card.work.format.displayName).labelCaps()
            if let year = card.work.releaseYear {
                Text(String(year)).labelCaps()
            }
            Spacer()
        }
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 32, height: 32, alignment: .leading)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("DAILY SCRIPT").labelCaps(color: .espresso)
            Spacer()
            Button { isBookmarked.toggle() } label: {
                Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 32, height: 32, alignment: .trailing)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .top)
        .frame(height: 56, alignment: .center)
    }

    private var progressIndicator: some View {
        GeometryReader { geo in
            let trackHeight = geo.size.height
            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color.espresso)
                    .frame(width: 2, height: trackHeight * progress)
                Spacer(minLength: 0)
            }
            .frame(width: 2, height: trackHeight)
            .background(Color.latte.frame(width: 2))
        }
        .frame(width: 2, height: 180)
    }

    private var bottomCTA: some View {
        VStack(spacing: 0) {
            Hairline()
            Button(action: {}) {
                Text("라이브러리에 저장").editorialButton(style: .filled)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(Color.paper)
    }
}

#Preview {
    NavigationStack {
        CardDetailView(card: .sample)
    }
}
