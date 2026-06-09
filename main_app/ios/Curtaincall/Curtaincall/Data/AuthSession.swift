import Foundation
import Combine
import Supabase
import AuthenticationServices
import UIKit

/// App session: anonymous bootstrap + ID/password login + nickname, mirroring
/// the PWA. Comments/likes require a non-anonymous session (RLS), so login maps
/// the entered ID to a synthetic email identical to the web app.
/// Social OAuth providers we support (web-redirect flow via Supabase).
enum SocialProvider { case google, kakao }

@MainActor
final class AuthSession: ObservableObject {

    /// Indicates initial bootstrap attempt has completed (success or failure).
    /// For detailed state, see `bootstrapStatus`.
    @Published var ready = false
    @Published var userId: Int?
    @Published var isAnonymous = true
    @Published var nickname = ""
    @Published var loginId = ""
    @Published var gender = ""        // "" | male | female | other
    @Published var ageGroup = ""      // "" | 10s..90s
    @Published var errorMessage: String?

    @Published var authInProgress = false
    @Published var authMessage: String?

    /// 소셜 첫 가입 직후 1회 성별·나이 입력 프롬프트를 띄울지.
    @Published var needsProfileSetup = false

    /// Non-fatal signal: set when merging an upgraded user's anonymous bookmarks
    /// failed. The account upgrade itself still succeeded — this just keeps the
    /// failure from being invisible (it was previously swallowed by `try?`).
    @Published var migrationWarning: String?

    enum BootstrapStatus: Equatable {
        case idle
        case bootstrapping
        case ready
        case failed(String)
    }

    @Published private(set) var bootstrapInProgress = false
    @Published var bootstrapStatus: BootstrapStatus = .idle

    private var auth: AuthClient { Supa.shared.client.auth }

    func start() async {
        await bootstrap()
    }

    func bootstrap(migrateFromUserId: Int? = nil, recordLoginId: String? = nil) async {
        guard !bootstrapInProgress else { return }
        bootstrapInProgress = true
        bootstrapStatus = .bootstrapping
        defer { bootstrapInProgress = false }

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
            needsProfileSetup = false

            if let existing = try await Supa.shared.findUser(anonymousId: anonId) {
                userId = existing.userId
                isAnonymous = anon
                nickname = existing.nickname ?? ""
                loginId = existing.loginId ?? ""
                gender = existing.gender ?? ""
                ageGroup = existing.ageGroup ?? ""
            } else {
                // 익명은 닉네임 없이, 가입(비익명) 시점에만 닉네임을 부여한다.
                let starting = anon ? "" : Self.randomCuteNickname()
                let row = try await Supa.shared.insertUser(anonymousId: anonId, nickname: starting)
                userId = row.userId
                isAnonymous = anon
                nickname = row.nickname ?? starting
                loginId = ""
                gender = ""
                ageGroup = ""
                // 가입 직후라면 입력한 아이디를 기록하고 익명 북마크를 이전한다.
                if !anon {
                    if let lid = recordLoginId, !lid.isEmpty {
                        try? await Supa.shared.applySignupProfile(userId: row.userId, loginId: lid)
                        loginId = lid
                    } else {
                        // 소셜(OAuth) 첫 가입 — 직후 1회 성별·나이 입력 프롬프트
                        needsProfileSetup = true
                    }
                    if let old = migrateFromUserId, old != row.userId {
                        do {
                            try await Supa.shared.migrateBookmarks(oldUserId: old, newUserId: row.userId)
                        } catch {
                            // Upgrade succeeded; a merge failure is non-fatal but must not
                            // be invisible. Surface it without failing the whole bootstrap.
                            migrationWarning = error.localizedDescription
                            print("[auth] bookmark migration failed: \(error)")
                        }
                    }
                }
            }
            errorMessage = nil
            bootstrapStatus = .ready
        } catch {
            errorMessage = error.localizedDescription
            bootstrapStatus = .failed(error.localizedDescription)
        }
        // Maintain existing semantics where `ready` means the bootstrap attempt has finished.
        ready = true
    }

    func signIn(id: String, password: String, signUp: Bool) async {
        guard !authInProgress else { return }
        guard let email = Self.idToEmail(id) else { authMessage = "아이디를 입력해주세요."; return }
        guard !password.isEmpty else { authMessage = "비밀번호를 입력해주세요."; return }

        authInProgress = true
        authMessage = nil
        let prevUserId = userId
        let enteredId = id.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if signUp {
                _ = try await auth.signUp(email: email, password: password)
            }
            // Ensure a non-anonymous session is active.
            if auth.currentUser?.isAnonymous != false {
                _ = try await auth.signIn(email: email, password: password)
            }
            await bootstrap(migrateFromUserId: prevUserId, recordLoginId: enteredId)
            authMessage = signUp ? "가입 완료" : "로그인 됐어요"
        } catch {
            authMessage = Self.friendlyAuthError(error.localizedDescription)
        }
        authInProgress = false
    }

    /// Social sign-in via Supabase OAuth (web-redirect). Opens an
    /// ASWebAuthenticationSession; on success a new (non-anonymous) session is
    /// established, then we re-bootstrap (migrating the anon user's bookmarks).
    /// 시크릿은 앱이 아니라 Supabase 대시보드에 설정한다.
    func signInWithOAuth(_ provider: SocialProvider) async {
        guard !authInProgress else { return }
        authInProgress = true
        authMessage = nil
        let prevUserId = userId
        let supaProvider: Provider = (provider == .google) ? .google : .kakao
        do {
            try await Supa.shared.client.auth.signInWithOAuth(
                provider: supaProvider,
                redirectTo: URL(string: "curtaincall://login-callback")
            ) { (webSession: ASWebAuthenticationSession) in
                webSession.presentationContextProvider = WebAuthPresentationContextProvider.shared
                webSession.prefersEphemeralWebBrowserSession = false
            }
            await bootstrap(migrateFromUserId: prevUserId)
            authMessage = "로그인 됐어요"
        } catch {
            // 사용자가 취소한 경우(canceledLogin)는 조용히 무시.
            let msg = error.localizedDescription
            if !msg.lowercased().contains("cancel") {
                authMessage = Self.friendlyAuthError(msg)
            }
        }
        authInProgress = false
    }

    func signOut() async {
        try? await auth.signOut()
        await bootstrap()
        authMessage = nil
    }

    /// Permanently deletes the signed-in member's account and all related data
    /// (profile, bookmarks, comments, likes, highlights, feed posts) via the
    /// `delete-account` Edge Function. The function runs with service_role so it
    /// can also remove the Supabase Auth user — the client can't, and without it
    /// the next launch would deterministically re-bootstrap the same account.
    /// On success we drop the dead session and re-bootstrap a fresh anonymous
    /// one. Members only (anonymous users have no account to delete).
    @discardableResult
    func deleteAccount() async -> Bool {
        guard !authInProgress, !isAnonymous else { return false }
        authInProgress = true
        authMessage = nil
        defer { authInProgress = false }
        do {
            try await Supa.shared.deleteAccount()
            try? await auth.signOut()
            await bootstrap()
            authMessage = "계정이 삭제됐어요"
            return true
        } catch {
            authMessage = "계정 삭제에 실패했어요: \(error.localizedDescription)"
            return false
        }
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

    /// 프로필 저장 — 닉네임 + 선택 성별/나이대 (구글 등 소셜 회원도 동일하게 사용).
    func updateProfile(_ newName: String, gender newGender: String?, ageGroup newAge: String?) async {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let uid = userId else { return }
        guard !trimmed.isEmpty else { authMessage = "이름을 입력해주세요"; return }
        guard trimmed.count <= 24 else { authMessage = "24자 이하로 입력해주세요"; return }
        do {
            try await Supa.shared.updateProfile(userId: uid, nickname: trimmed, gender: newGender, ageGroup: newAge)
            nickname = trimmed
            if let newGender { gender = newGender }
            if let newAge { ageGroup = newAge }
            authMessage = "프로필이 저장됐어요"
        } catch {
            authMessage = "저장 실패: \(error.localizedDescription)"
        }
    }

    func consumeProfileSetup() { needsProfileSetup = false }

    // MARK: - Helpers

    /// Maps any entered ID to a stable synthetic email.
    /// ⚠️ 3개 클라이언트 동기화 필수 — 바꾸면 기존 계정 로그인이 전부 깨진다.
    ///   web_pwa: idToEmail                (web_pwa/public/m/assets/m-app.js)
    ///   Android: AuthRepository.idToEmail (data/repo/AuthRepository.kt)
    /// FNV-1a 32-bit over UTF-16 code units, so the same account works on web + native.
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

    // 3개 클라이언트 공통 매핑 — web_pwa(submitSignin) / Android(friendlyAuthError)와 동일 세트.
    // 더 구체적인 패턴을 위에 둔다 (email rate limit → 일반 rate limit 순서).
    static func friendlyAuthError(_ msg: String) -> String {
        let lower = msg.lowercased()
        if lower.contains("invalid login credentials") { return "아이디 또는 비밀번호가 맞지 않습니다." }
        if lower.contains("already registered") { return "이미 가입된 아이디입니다. 로그인해주세요." }
        if lower.contains("password should be") { return "비밀번호가 너무 짧습니다. (보통 6자 이상)" }
        if lower.contains("email not confirmed") { return "이메일 확인이 필요합니다 — Supabase Auth에서 Confirm email을 끄세요." }
        if lower.contains("email_send_rate_limit") || (lower.contains("email") && lower.contains("rate limit")) {
            return "이메일 발송 제한 초과 — Supabase Auth에서 Confirm email을 끄고 다시 시도해주세요."
        }
        if lower.contains("for security purposes") || lower.contains("you can only request") {
            return "잠시 (약 1분) 후 다시 시도해주세요."
        }
        if lower.contains("rate limit") { return "요청이 많습니다. 잠시 후 다시 시도해주세요." }
        if lower.contains("signups not allowed") || lower.contains("not enabled") {
            return "회원가입이 비활성화됨 — Supabase Auth 설정을 확인하세요."
        }
        if lower.contains("unable to validate email") || (lower.contains("email") && lower.contains("not valid")) {
            return "이 아이디는 사용할 수 없습니다 — 다른 아이디를 시도해주세요."
        }
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

/// ASWebAuthenticationSession(OAuth 웹뷰)의 표시 앵커 제공자.
/// 현재 foreground 윈도우를 앵커로 돌려준다.
final class WebAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuthPresentationContextProvider()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        return scene?.keyWindow ?? ASPresentationAnchor()
    }
}
