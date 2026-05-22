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
    private static let sample = WidgetCard(quote: "나 날고 있어!", workTitle: "Titanic")

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
    let entry: CurtaincallEntry

    init(entry: CurtaincallEntry) {
        self.entry = entry
        WidgetFonts.registerIfNeeded()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(displayQuote)
                .font(.custom("NanumMyeongjo", size: 18))
                .foregroundStyle(quoteColor)
                .lineSpacing(4)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let title = entry.card?.workTitle, !title.isEmpty {
                Text(title.uppercased())
                    .font(.custom("Pretendard-Medium", size: 10))
                    .tracking(10 * 0.2)
                    .foregroundStyle(metaColor)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(bgColor, for: .widget)
    }

    private var displayQuote: String {
        if let q = entry.card?.quote {
            return "\u{201C}\(q)\u{201D}"
        }
        return "오늘의 한 줄을 불러오는 중"
    }
}

struct CurtaincallWidget: Widget {
    let kind: String = "CurtaincallWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CurtaincallWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Daily Script")
        .description("매일의 한 줄을 홈 화면에서.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    CurtaincallWidget()
} timeline: {
    CurtaincallEntry(date: .now, card: WidgetCard(quote: "나 날고 있어!", workTitle: "Titanic"))
    CurtaincallEntry(date: .now, card: nil)
}
