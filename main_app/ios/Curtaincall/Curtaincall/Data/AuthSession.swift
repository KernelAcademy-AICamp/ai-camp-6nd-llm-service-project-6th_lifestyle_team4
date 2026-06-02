import Foundation
import Combine
import Supabase

/// App session: anonymous bootstrap + ID/password login + nickname, mirroring
/// the PWA. Comments/likes require a non-anonymous session (RLS), so login maps
/// the entered ID to a synthetic email identical to the web app.
@MainActor
final class AuthSession: ObservableObject {

    @Published var ready = false
    @Published var userId: Int?
    @Published var isAnonymous = true
    @Published var nickname = ""
    @Published var errorMessage: String?

    @Published var authInProgress = false
    @Published var authMessage: String?

    private var auth: AuthClient { Supa.shared.client.auth }

    func start() async {
        await bootstrap()
    }

    func bootstrap(migrateFromUserId: Int? = nil, carryNickname: String? = nil) async {
        do {
            if auth.currentSession == nil {
                _ = try await auth.signInAnonymously()
            }
            guard let user = auth.currentUser else {
                throw NSError(domain: "auth", code: 0,
                              userInfo: [NSLocalizedDescriptionKey: "세션을 만들 수 없습니다."])
            }
            let anon = user.isAnonymous
            let anonId = user.id.uuidString

            if let existing = try await Supa.shared.findUser(anonymousId: anonId) {
                var nick = existing.nickname ?? ""
                if nick.isEmpty && anon {
                    nick = Self.randomCuteNickname()
                    try? await Supa.shared.updateNickname(userId: existing.userId, nickname: nick)
                }
                userId = existing.userId
                isAnonymous = anon
                nickname = nick
            } else {
                let starting = (carryNickname?.isEmpty == false) ? carryNickname! : Self.randomCuteNickname()
                let row = try await Supa.shared.insertUser(anonymousId: anonId, nickname: starting)
                userId = row.userId
                isAnonymous = anon
                nickname = row.nickname ?? starting
                if !anon, let old = migrateFromUserId, old != row.userId {
                    try? await Supa.shared.migrateBookmarks(oldUserId: old, newUserId: row.userId)
                }
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        ready = true
    }

    func signIn(id: String, password: String, signUp: Bool) async {
        guard !authInProgress else { return }
        guard let email = Self.idToEmail(id) else { authMessage = "아이디를 입력해주세요."; return }
        guard !password.isEmpty else { authMessage = "비밀번호를 입력해주세요."; return }

        authInProgress = true
        authMessage = nil
        let prevUserId = userId
        let prevNickname = nickname
        do {
            if signUp {
                _ = try await auth.signUp(email: email, password: password)
            }
            // Ensure a non-anonymous session is active.
            if auth.currentUser?.isAnonymous != false {
                _ = try await auth.signIn(email: email, password: password)
            }
            await bootstrap(migrateFromUserId: prevUserId, carryNickname: prevNickname)
            authMessage = signUp ? "가입 완료" : "로그인 됐어요"
        } catch {
            authMessage = Self.friendlyAuthError(error.localizedDescription)
        }
        authInProgress = false
    }

    func signOut() async {
        try? await auth.signOut()
        await bootstrap()
        authMessage = nil
    }

    func updateNickname(_ newName: String) async {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let uid = userId else { return }
        guard !trimmed.isEmpty else { authMessage = "이름을 입력해주세요"; return }
        guard trimmed.count <= 24 else { authMessage = "24자 이하로 입력해주세요"; return }
        do {
            try await Supa.shared.updateNickname(userId: uid, nickname: trimmed)
            nickname = trimmed
            authMessage = "이름이 변경됐어요"
        } catch {
            authMessage = "저장 실패: \(error.localizedDescription)"
        }
    }

    // MARK: - Helpers

    /// Maps any entered ID to a stable synthetic email (same scheme as the PWA's
    /// idToEmail — FNV-1a 32-bit) so the same account works on web + native.
    static func idToEmail(_ id: String) -> String? {
        let raw = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        let cleaned = raw.lowercased().components(separatedBy: .whitespacesAndNewlines).joined()
        if cleaned.range(of: "^[a-z0-9._+-]+$", options: .regularExpression) != nil,
           cleaned.count >= 1, cleaned.count <= 50 {
            return "\(cleaned)@user.local"
        }
        var hash: UInt32 = 2166136261 // 0x811c9dc5
        for unit in raw.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 16777619 // Math.imul semantics via 32-bit overflow
        }
        let slug = String(("00000000" + String(hash, radix: 36)).suffix(8))
        return "u_\(slug)@user.local"
    }

    static func randomCuteNickname() -> String {
        let adj = nicknameAdjectives.randomElement() ?? "책 읽는"
        let noun = nicknameNouns.randomElement() ?? "토끼"
        return "\(adj) \(noun)"
    }

    static func friendlyAuthError(_ msg: String) -> String {
        let lower = msg.lowercased()
        if lower.contains("invalid login credentials") { return "아이디 또는 비밀번호가 맞지 않습니다." }
        if lower.contains("already registered") { return "이미 가입된 아이디입니다. 로그인해주세요." }
        if lower.contains("password should be") { return "비밀번호가 너무 짧습니다. (보통 6자 이상)" }
        if lower.contains("email not confirmed") { return "이메일 확인이 필요합니다 — Supabase Auth에서 Confirm email을 끄세요." }
        if lower.contains("signups not allowed") || lower.contains("not enabled") {
            return "회원가입이 비활성화됨 — Supabase Auth 설정을 확인하세요."
        }
        if lower.contains("rate limit") { return "요청이 많습니다. 잠시 후 다시 시도해주세요." }
        return msg.isEmpty ? "로그인에 실패했습니다." : msg
    }

    private static let nicknameAdjectives = [
        "서점에 간", "책 좋아하는", "연극에 빠진", "희곡에 매료된", "책 읽는",
        "도서관 가는", "글 쓰는", "시 쓰는", "각본 쓰는", "무대 위의",
        "책장 사이의", "독서하는", "대본 외우는", "극장 가는", "명대사 모으는",
        "소설 좋아하는", "문장 모으는", "활자에 빠진", "책 향기 맡는", "편지 쓰는",
    ]
    private static let nicknameNouns = [
        "안경잡이", "부끄럼쟁이", "매력쟁이", "호랑이", "토끼",
        "여우", "고양이", "기린", "곰", "사슴",
        "두루미", "독수리", "늑대", "판다", "코알라",
        "돌고래", "학자", "낭만가", "몽상가", "여행자",
    ]
}
