import Foundation

/// Posts user feedback to the shared Google Apps Script endpoint, form-urlencoded.
/// Mirrors Android `FeedbackApi.kt` and `web_pwa/api/feedback.js` — the SAME
/// endpoint and the SAME field set (`rating`/`gender`/`age`/`liked`/`improve`/
/// `message`/`email`/`page`). The Apps Script 302-redirects on success; URLSession
/// follows it automatically. No third-party dependency — URLSession only.
enum FeedbackApi {
    /// Public endpoint, identical to `FeedbackApi.kt:18` / `web_pwa/api/feedback.js:17`.
    private static let endpoint = URL(string:
        "https://script.google.com/macros/s/AKfycbxhzZUOrfnN-kfLoj2zXvPinBR_po7zclUmEcXjRa66f0la8C0GGYRzNrRfn7eKUxn6rw/exec")!

    /// Submits one feedback entry. `rating` is 1–5 (required by the form); every
    /// other field may be empty. Throws on transport error or a non-2xx/3xx
    /// response so the caller can offer a retry.
    static func submit(
        rating: Int,
        gender: String,
        age: String,
        liked: String,
        improve: String,
        message: String,
        email: String
    ) async throws {
        // Same key order + names as the Android/PWA payload; `page` identifies the
        // client (Android sends "android", web sends the URL — iOS sends "ios").
        let fields: [(String, String)] = [
            ("rating", String(rating)),
            ("gender", gender),
            ("age", age),
            ("liked", liked),
            ("improve", improve),
            ("message", message),
            ("email", email),
            ("page", "ios"),
        ]
        let body = fields
            .map { "\($0.0)=\(formEncode($0.1))" }
            .joined(separator: "&")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded;charset=UTF-8",
                         forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(body.utf8)
        request.timeoutInterval = 15

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<400).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    /// `application/x-www-form-urlencoded` encoding — percent-encode everything
    /// except RFC 3986 unreserved characters. Encoding spaces as `%20` (rather
    /// than `+`) keeps any literal `+` the user typed intact through Apps Script.
    private static func formEncode(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}
