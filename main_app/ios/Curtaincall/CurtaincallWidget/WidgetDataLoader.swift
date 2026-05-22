import Foundation

struct WidgetCard {
    let cardId: Int
    let quote: String
    let workTitle: String
}

enum WidgetDataLoader {
    // Duplicated from Curtaincall/Config.swift — the widget target intentionally
    // doesn't import the app's networking layer (keeps it independently buildable).
    private static let supabaseURL = URL(string: "https://hixymiidpxnnovtmsvfp.supabase.co")!
    private static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeHltaWlkcHhubm92dG1zdmZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjY1OTIsImV4cCI6MjA5NDgwMjU5Mn0.dkGd2pTtkz6euRVgMa6vXdOkHmV74M4nfXpY6Al3vbA"

    static func fetchLatest() async -> WidgetCard? {
        var components = URLComponents(
            url: supabaseURL.appendingPathComponent("rest/v1/cards"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "select", value: "card_id,quote,works(title)"),
            URLQueryItem(name: "order", value: "card_id.desc"),
            URLQueryItem(name: "limit", value: "1"),
        ]

        var request = URLRequest(url: components.url!)
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        struct Row: Decodable {
            let cardId: Int
            let quote: String
            let works: Work?
            struct Work: Decodable { let title: String }
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return nil
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let rows = try decoder.decode([Row].self, from: data)
            guard let row = rows.first else { return nil }
            return WidgetCard(cardId: row.cardId, quote: row.quote, workTitle: row.works?.title ?? "")
        } catch {
            return nil
        }
    }
}
