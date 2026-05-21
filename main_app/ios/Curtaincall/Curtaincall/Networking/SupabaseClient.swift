import Foundation

enum SupabaseError: Error, LocalizedError, Sendable {
    case invalidResponse
    case http(status: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Supabase 응답을 해석할 수 없습니다."
        case .http(let status, let body):
            return "Supabase 오류 (\(status)): \(body)"
        }
    }
}

final class SupabaseClient {
    static let shared = SupabaseClient()

    private let baseURL: URL
    private let anonKey: String
    private let session: URLSession
    private let decoder: JSONDecoder

    init(
        baseURL: URL = Config.supabaseURL,
        anonKey: String = Config.supabaseAnonKey,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        self.session = session
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = d
    }

    func fetchCards(limit: Int = 50) async throws -> [Card] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("rest/v1/cards"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "select", value: "*,work:works(title,format,author,release_year)"),
            URLQueryItem(name: "order", value: "card_id.desc"),
            URLQueryItem(name: "limit", value: String(limit)),
        ]

        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw SupabaseError.http(status: http.statusCode, body: body)
        }
        return try decoder.decode([Card].self, from: data)
    }
}
