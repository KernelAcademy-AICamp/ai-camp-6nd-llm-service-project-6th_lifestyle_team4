import CoreText
import SwiftUI
import UIKit
import WidgetKit

private extension Color {
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

// Adaptive — light vs dark mode is driven by the iOS system setting.
private let bgColor = Color(
    light: Color(red: 0xFA / 255.0, green: 0xF8 / 255.0, blue: 0xF2 / 255.0), // paper
    dark:  Color(red: 0x0E / 255.0, green: 0x0C / 255.0, blue: 0x0A / 255.0)  // ink-black
)
private let quoteColor = Color(
    light: Color(red: 0x0E / 255.0, green: 0x0C / 255.0, blue: 0x0A / 255.0), // espresso
    dark:  Color(red: 0xFA / 255.0, green: 0xF8 / 255.0, blue: 0xF2 / 255.0)  // paper
)
private let metaColor = Color(
    light: Color(red: 0x6B / 255.0, green: 0x5D / 255.0, blue: 0x4F / 255.0), // walnut
    dark:  Color(red: 0x9C / 255.0, green: 0x8E / 255.0, blue: 0x80 / 255.0)  // warm-gray
)

enum WidgetFonts {
    private static let registerOnce: Void = {
        let files = [
            ("NanumMyeongjo-Regular", "ttf"),
            ("Pretendard-Medium", "otf"),
        ]
        for (name, ext) in files {
            guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }()
    static func registerIfNeeded() { _ = registerOnce }
}

struct CurtaincallEntry: TimelineEntry {
    let date: Date
    let card: WidgetCard?
}

struct Provider: TimelineProvider {
    private static let sample = WidgetCard(cardId: 1, quote: "나 날고 있어!", workTitle: "Titanic")

    func placeholder(in context: Context) -> CurtaincallEntry {
        CurtaincallEntry(date: .now, card: Provider.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (CurtaincallEntry) -> Void) {
        completion(CurtaincallEntry(date: .now, card: Provider.sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CurtaincallEntry>) -> Void) {
        Task {
            let card = await WidgetDataLoader.fetchLatest()
            let entry = CurtaincallEntry(date: .now, card: card)
            let refreshAt = Calendar.current.date(byAdding: .hour, value: 1, to: .now)
                ?? Date().addingTimeInterval(3600)
            completion(Timeline(entries: [entry], policy: .after(refreshAt)))
        }
    }
}

struct CurtaincallWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CurtaincallEntry

    init(entry: CurtaincallEntry) {
        self.entry = entry
        WidgetFonts.registerIfNeeded()
    }

    var body: some View {
        content.widgetURL(deepLinkURL)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemSmall:          smallView
        case .accessoryRectangular: rectangularView
        case .accessoryInline:      inlineView
        case .accessoryCircular:    circularView
        default:                    mediumView   // .systemMedium (+ any future fallback)
        }
    }

    // MARK: - Home Screen / StandBy (full-color)

    /// Existing medium layout — unchanged.
    private var mediumView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(displayQuote)
                .font(.custom("NanumMyeongjo", size: 18))
                .foregroundStyle(quoteColor)
                .lineSpacing(4)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 12)
            workTitle(size: 15)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(bgColor, for: .widget)
    }

    /// Compact square for the Home Screen small slot **and StandBy**. Smaller type
    /// and tighter spacing so the quote stays legible at StandBy viewing distance.
    private var smallView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(displayQuote)
                .font(.custom("NanumMyeongjo", size: 15))
                .foregroundStyle(quoteColor)
                .lineSpacing(3)
                .lineLimit(5)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            workTitle(size: 11).lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(bgColor, for: .widget)
    }

    // MARK: - Lock Screen accessories (system vibrant/tinted rendering)

    /// Lock Screen rectangular: 1–2 line quote + work title. No custom colors — the
    /// system renders accessory widgets in a vibrant monochrome material; the title
    /// is `widgetAccentable` so it adopts the user's Lock Screen tint.
    private var rectangularView: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(displayQuote)
                .font(.custom("NanumMyeongjo", size: 14))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if let title = workTitleText {
                Text(title.uppercased())
                    .font(.custom("Pretendard-Medium", size: 10))
                    .tracking(1)
                    .lineLimit(1)
                    .widgetAccentable()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(.clear, for: .widget)
    }

    /// Lock Screen inline: a single short line beside the clock (no long text).
    private var inlineView: some View {
        Text("\u{201C}\(snippet)\u{201D}")
            .containerBackground(.clear, for: .widget)
    }

    /// Lock Screen circular: a minimal app mark, no text. Standard translucent
    /// accessory background; glyph is `widgetAccentable` for the Lock Screen tint.
    private var circularView: some View {
        Image(systemName: "quote.bubble.fill")
            .font(.system(size: 20))
            .widgetAccentable()
            .containerBackground(for: .widget) { AccessoryWidgetBackground() }
    }

    // MARK: - Shared

    @ViewBuilder
    private func workTitle(size: CGFloat) -> some View {
        if let title = workTitleText {
            Text(title.uppercased())
                .font(.custom("Pretendard-Medium", size: size))
                .tracking(size * 0.2)
                .foregroundStyle(quoteColor)
        }
    }

    private var workTitleText: String? {
        guard let t = entry.card?.workTitle, !t.isEmpty else { return nil }
        return t
    }

    private var deepLinkURL: URL? {
        guard let id = entry.card?.cardId else { return nil }
        return URL(string: "curtaincall://card/\(id)")
    }

    private var displayQuote: String {
        if let q = entry.card?.quote, !q.isEmpty {
            return "\u{201C}\(q)\u{201D}"
        }
        return "오늘의 한 줄을 불러오는 중"
    }

    /// Very short snippet for the inline accessory (system truncates anyway).
    private var snippet: String {
        guard let q = entry.card?.quote, !q.isEmpty else { return "오늘의 한 줄" }
        return String(q.prefix(22))
    }
}

struct CurtaincallWidget: Widget {
    let kind: String = "CurtaincallWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CurtaincallWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Daily Script")
        .description("매일의 한 줄을 홈 화면·잠금화면·StandBy에서.")
        .supportedFamilies([
            .systemSmall,        // also surfaces the widget in StandBy
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular,
        ])
    }
}

private let sampleCard = WidgetCard(cardId: 1, quote: "나 날고 있어!", workTitle: "Titanic")

#Preview(as: .systemMedium) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: sampleCard)
    CurtaincallEntry(date: .now, card: nil)
}

#Preview(as: .systemSmall) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: sampleCard)
}

#Preview(as: .accessoryRectangular) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: sampleCard)
}

#Preview(as: .accessoryInline) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: sampleCard)
}

#Preview(as: .accessoryCircular) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: sampleCard)
}
