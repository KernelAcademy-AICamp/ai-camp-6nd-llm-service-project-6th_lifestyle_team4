import Foundation
import Combine
import Supabase
import AuthenticationServices
import CryptoKit
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
    /// 실타래 충전 잔액(users.yarn_balance) — 부트스트랩 시 로드. UI 단일 출처는
    /// `YarnStore`; 이 값은 그쪽으로 시드된다(RootView). 차감/충전은 RPC 반환값으로 갱신.
    @Published var yarnBalance = 0
    /// 서버에 저장된 선호도(users.pref_*, migration 033) — 부트스트랩 시 로드해
    /// RootView 가 PrefsStore 로 동기화한다(기기 간 지속). `hasServerPrefs` 가 false 면
    /// 서버에 값이 없다는 뜻이라 로컬 온보딩 값을 덮어쓰지 않는다.
    @Published var prefGenres: [String] = []
    @Published var prefThemes: [String] = []
    @Published var prefAny = false
    @Published var hasServerPrefs = false
    @Published var errorMessage: String?

    @Published var authInProgress = false
    /// MY 화면 본문에 뜨는 **범용** 상태 문구 — 프로필 저장 · 닉네임 변경 · 로그아웃/탈퇴
    /// 결과 · 로그인 성공 등. 여러 화면이 읽는 공용 채널이다.
    @Published var authMessage: String?

    /// 로그인/가입 **폼 자체의 실패** 문구 — `SignInSheet` 전용.
    ///
    /// `authMessage` 와 나눈 이유: 하나로 쓰다가 같은 배치에서 **네 번** 터졌다.
    /// ① 팝업 뒤에 가려 안 보임 → ② 이전 동작의 메시지가 stale 하게 표시 → ③ 팝업과 MY
    /// 본문에 중복 표시 → ④ 팝업을 수동으로 닫으면 실패 문구가 MY 본문에 되살아남.
    /// 전부 "쓰는 곳 17개 · 읽는 곳 여럿 · 소유자 없음" 이라는 같은 뿌리였다. 표시 주체가
    /// 분명한 별도 채널을 두면 이 부류가 구조적으로 불가능해진다.
    ///
    /// ⚠️ 로그인 **성공** 문구("로그인 됐어요")는 `authMessage` 로 남긴다 — 성공 시 팝업이
    /// 스스로 닫히므로 그 문구의 표시 주체는 MY 본문이다.
    @Published var authFormError: String?

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
        /// 일시적 네트워크 실패로 서버 확인은 못 했지만, 마지막으로 성공한 **회원 신원은
        /// 그대로 유지**하고 있는 상태. `.failed` 와 반드시 구분해야 한다 — `.failed` 는
        /// '신원을 확정하지 못했다', `.offline` 은 '신원은 아는데 지금 서버와 대화할 수
        /// 없다'는 뜻이라 화면이 취할 행동(재시도 안내 vs 로그인 유도)이 정반대다.
        case offline
        case failed(String)
    }

    @Published private(set) var bootstrapInProgress = false
    @Published var bootstrapStatus: BootstrapStatus = .idle

    private var auth: AuthClient { Supa.shared.client.auth }

    // MARK: - 재설치 감지

    private static let installMarkerKey = "ds.installMarker"

    /// **앱을 지워도 Keychain 의 Supabase 세션은 남는다.** iOS 는 Keychain 을 앱 컨테이너
    /// 밖에 보관하고, supabase-swift 의 기본 저장소가 `KeychainLocalStorage` 다. 그래서
    /// 삭제 후 재설치해도 이전 계정으로 되살아나고, 서버 취향이 `syncFromServer` 로 들어오며
    /// `prefSelected` 까지 true 가 돼 **온보딩·코치 투어가 아예 안 뜬다**. 외부 QA 가
    /// "새 사용자 테스트인데 첫 실행이 깨끗하지 않다"고 본 원인이고(H-34), P0-1 수락 5번
    /// ("삭제/재설치 시 진짜 깨끗한 상태에서 시작")이 지금까지 충족 불가였던 이유다.
    /// 기기를 팔거나 빌려줄 때 '앱 삭제 = 로그아웃'이 아니라는 문제이기도 하다.
    ///
    /// 컨테이너가 **완전히 비어 있는데** Keychain 세션만 남아 있으면 그건 재설치다 → 로컬
    /// 세션을 버린다.
    ///
    /// ⚠️ 마커 유무만으로 판단하면 안 된다. 이 코드가 없던 버전에서 올라오는 **기존
    /// 사용자**도 마커가 없어서, 업데이트 한 번에 전원 로그아웃되는 대형 회귀가 된다.
    /// 그래서 '앱 데이터가 하나도 없을 때'만 재설치로 친다 — 기존 설치는 마커만 심고 지나간다.
    ///
    /// 서버는 건드리지 않는다(`scope: .local`) — 다른 기기 세션은 살아 있어야 하고, 네트워크
    /// 없이도 동작해야 한다. supabase-swift 는 로컬 저장소를 먼저 비우고 서버 호출을 하므로
    /// 오프라인이라 호출이 실패해도 Keychain 은 이미 정리된다.
    private func discardSessionIfFreshInstall() async {
        let d = UserDefaults.standard
        guard !d.bool(forKey: Self.installMarkerKey) else { return }

        // 기존 앱 데이터 흔적 — 하나라도 있으면 '재설치'가 아니라 '업데이트'다.
        // (`ds.*` 는 이 앱의 UserDefaults 네임스페이스, `coachTourSeen` 은 @AppStorage 라
        //  접두사가 없어 따로 확인한다.)
        let hasAppData = d.dictionaryRepresentation().keys.contains {
            $0.hasPrefix("ds.") || $0 == "coachTourSeen"
        }
        d.set(true, forKey: Self.installMarkerKey)
        guard !hasAppData else { return }

        guard auth.currentSession != nil else { return }
        AppLog.debug("fresh install detected — discarding surviving keychain session")
        try? await auth.signOut(scope: .local)
    }

    // MARK: - 마지막 성공 신원 캐시 (오프라인 복구용)

    /// 마지막으로 **성공한** 회원 부트스트랩 결과. 오프라인 콜드 스타트에서 회원 신원을
    /// 잃지 않기 위한 기기 로컬 캐시다 — 서버로 나가지 않고, 원래 서버에서 받아온 값의
    /// 사본일 뿐이라 새로 수집하는 정보는 없다.
    private struct CachedIdentity: Codable {
        /// **어느 Supabase 인증 유저의 신원인지.** 이게 없으면 캐시는 '기기의 마지막 회원'
        /// 이라는 뜻밖에 안 돼서, A 가 남긴 캐시가 B 의 실패한 부트스트랩에 복원될 수 있다
        /// (계정 간 상태 누출 — #194 에서 잡은 것과 같은 부류). 복원 전에 현재
        /// `auth.currentUser` 와 대조한다.
        var authUserId: String
        var userId: Int
        var isAnonymous: Bool
        var nickname: String
        var loginId: String
        var gender: String
        var ageGroup: String
        var yarnBalance: Int
        // ⚠️ 서버 선호도(pref_*)는 **일부러 캐시하지 않는다.** `hasServerPrefs` 가 true 면
        // RootView 가 `prefs.syncFromServer(...)` 로 로컬을 덮어쓰는데, 오래된 스냅샷으로
        // 그렇게 하면 그 뒤에 사용자가 고른 최신 로컬 취향이 되돌아간다(오즈 픽 재계산까지
        // 딸려온다). 선호도는 **서버에서 갓 읽었을 때만** 신뢰할 수 있는 값이다.
    }

    private static let cachedIdentityKey = "ds.lastIdentity"

    private func saveCachedIdentity() {
        guard let userId, let authUserId = auth.currentUser?.id.uuidString else { return }
        let snapshot = CachedIdentity(
            authUserId: authUserId,
            userId: userId, isAnonymous: isAnonymous, nickname: nickname, loginId: loginId,
            gender: gender, ageGroup: ageGroup, yarnBalance: yarnBalance
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: Self.cachedIdentityKey)
    }

    /// 서버가 확인해 준 최신 실타래 잔액을 신원에 반영하고 **캐시까지 다시 굽는다.**
    ///
    /// 왜 필요한가: `yarnBalance` 는 부트스트랩에서 한 번 읽히고, 그 값이 그대로
    /// `saveCachedIdentity()` 에 실린다. 그런데 실행 중 잔액을 바꾸는 경로(출석 보상 ·
    /// 첫 조회 보상 · 차감 · 지급)는 전부 `YarnStore.balance` 만 갱신하고 이 값은 건드리지
    /// 않았다. `YarnStore.balance` 는 메모리 전용이라 다음 실행에 0 으로 시작하므로,
    /// `로그인 → 보상 수령 → (성공적 부트스트랩 없이) 오프라인 → 재실행` 이면 캐시에
    /// 남아 있던 **보상 이전 잔액**이 복원돼 사용자에겐 실타래가 사라진 것으로 보인다.
    /// 서버 데이터는 멀쩡하고 온라인 복귀 시 정정되지만, 오프라인 동안은 정확히 이런
    /// 종류의 값이 맞아야 한다(QA-9).
    ///
    /// 잔액이 실제로 달라졌을 때만 다시 쓴다 — 신원 전환 직후의 재시드(`yarn.sync`)처럼
    /// 같은 값이 되돌아오는 경로에서 UserDefaults 쓰기를 반복하지 않기 위해서다.
    func noteYarnBalance(_ balance: Int) {
        guard yarnBalance != balance else { return }
        yarnBalance = balance
        saveCachedIdentity()
    }

    /// 현재 인증 유저의 것일 때만 돌려준다 — 다른 유저(또는 유저 없음)의 캐시는 없는 셈 친다.
    private func loadCachedIdentity() -> CachedIdentity? {
        guard let data = UserDefaults.standard.data(forKey: Self.cachedIdentityKey),
              let cached = try? JSONDecoder().decode(CachedIdentity.self, from: data),
              let current = auth.currentUser?.id.uuidString,
              cached.authUserId == current
        else { return nil }
        return cached
    }

    private func clearCachedIdentity() {
        UserDefaults.standard.removeObject(forKey: Self.cachedIdentityKey)
    }

    private func apply(_ cached: CachedIdentity) {
        userId = cached.userId
        isAnonymous = cached.isAnonymous
        nickname = cached.nickname
        loginId = cached.loginId
        gender = cached.gender
        ageGroup = cached.ageGroup
        yarnBalance = cached.yarnBalance
        // 서버 선호도는 확인하지 못했다 — false 로 둬야 RootView 가 오래된 값으로
        // `syncFromServer` 를 돌려 최신 로컬 선택을 덮어쓰는 일이 없다. 로컬 PrefsStore 가
        // 오프라인 동안의 권위 있는 사본이다.
        prefGenres = []
        prefThemes = []
        prefAny = false
        hasServerPrefs = false
    }

    /// 끊긴 네트워크처럼 **일시적**인 실패인가(= 재시도하면 될 일인가), 아니면 세션이 실제로
    /// 무효라서 신원을 버려야 하는 실패인가. 이 구분이 H-24 의 핵심이다 — 예전엔 모든 실패가
    /// 똑같이 '게스트'로 귀결돼 오프라인 시작이 조용한 로그아웃이 됐다.
    /// SDK 가 URLError 를 감싸 던지는 경우가 있어 underlying 도 따라 내려간다(깊이 제한).
    static func isTransientNetworkError(_ error: Error, depth: Int = 0) -> Bool {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut,
                 .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
                 .dataNotAllowed, .internationalRoamingOff, .secureConnectionFailed,
                 .resourceUnavailable:
                return true
            default:
                return false
            }
        }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain { return true }
        guard depth < 3, let underlying = ns.userInfo[NSUnderlyingErrorKey] as? Error else { return false }
        return isTransientNetworkError(underlying, depth: depth + 1)
    }

    func start() async {
        await bootstrap()
    }

    /// `socialDisplayName`: Apple은 최초 인증에서만 이름을 돌려준다. 신규 소셜 가입이면
    /// 랜덤 닉네임 대신 이 이름을 시작 닉네임으로 쓴다(이후 로그인엔 nil이라도 기존 행 유지).
    func bootstrap(migrateFromUserId: Int? = nil, recordLoginId: String? = nil, socialDisplayName: String? = nil) async {
        guard !bootstrapInProgress else { return }
        bootstrapInProgress = true
        bootstrapStatus = .bootstrapping
        defer { bootstrapInProgress = false }

        await discardSessionIfFreshInstall()

        do {
            // With emitLocalSessionAsInitialSession the SDK surfaces the stored
            // session even when its access token is expired, so don't treat an
            // expired session as signed-in: refresh it first (preserves a member
            // whose refresh token is still valid), then anon-bootstrap only if
            // there's genuinely no session left.
            if let session = auth.currentSession, session.isExpired {
                do {
                    _ = try await auth.refreshSession()
                } catch {
                    // ⚠️ 리프레시 실패 = 로그아웃이 아니다(체크리스트 H-24 요건).
                    // 네트워크 문제면 저장된 세션은 그대로 남아 아래 흐름이 이어지고, 서버
                    // 확인에 실패하면 catch 에서 캐시 신원으로 복구한다. 토큰이 **실제로**
                    // 무효/폐기된 경우에만 SDK 가 세션을 지우고, 그때는 currentUser 가 nil 이
                    // 되어 아래 게스트 경로로 간다 — 그 구분을 SDK 에 맡기고 여기선 삼키지만
                    // 로그는 원인을 나눠 남긴다.
                    AppLog.error(Self.isTransientNetworkError(error)
                                 ? "session refresh (transient — 신원 유지)"
                                 : "session refresh (invalid — 세션 폐기 가능)", error)
                }
            }
            // 익명 자동 로그인 폐지: 세션이 없으면 비로그인 게스트로 둔다(읽기 전용 둘러보기).
            // 예전엔 여기서 signInAnonymously() 로 매일 유령 익명 유저를 양산했다(분석/users 오염).
            // 로그인(Google/Kakao/Apple/ID·PW) 시에만 세션과 users 행이 생긴다. 게스트는
            // userId=nil, isAnonymous=true 로 기존 가드(로그인 유도)를 그대로 재사용한다.
            // 기존 세션(예전에 만들어진 익명 세션 포함)은 아래 경로로 그대로 동작한다.
            guard let user = auth.currentUser else {
                userId = nil
                isAnonymous = true
                nickname = ""
                loginId = ""
                gender = ""
                ageGroup = ""
                yarnBalance = 0
                prefGenres = []
                prefThemes = []
                prefAny = false
                hasServerPrefs = false
                errorMessage = nil
                // 세션 자체가 없다 = SDK 가 '진짜로' 로그아웃 상태라고 판정한 것(폐기된 토큰
                // 포함). 오프라인이어도 저장된 세션이 있으면 여기 오지 않으므로, 이 지점은
                // 캐시된 회원 신원을 버려도 되는 유일한 지점이다.
                clearCachedIdentity()
                bootstrapStatus = .ready
                ready = true
                return
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
                yarnBalance = existing.yarnBalance ?? 0
                // 서버 선호도 로드 — 컬럼이 모두 NULL 이면 hasServerPrefs=false(로컬 보존).
                prefGenres = existing.prefGenres ?? []
                prefThemes = existing.prefThemes ?? []
                prefAny = existing.prefAny ?? false
                hasServerPrefs = existing.prefGenres != nil || existing.prefThemes != nil || existing.prefAny != nil
            } else {
                // 익명은 닉네임 없이, 가입(비익명) 시점에만 닉네임을 부여한다. 애플 등
                // 소셜 최초 인증이 이름을 주면 랜덤 대신 그 이름을 쓴다(24자 컷).
                let starting: String
                if anon {
                    starting = ""
                } else if let name = socialDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
                    starting = String(name.prefix(24))
                } else {
                    starting = Self.randomCuteNickname()
                }
                let row = try await Supa.shared.insertUser(anonymousId: anonId, nickname: starting)
                userId = row.userId
                isAnonymous = anon
                nickname = row.nickname ?? starting
                loginId = ""
                gender = ""
                ageGroup = ""
                yarnBalance = 0   // 신규 행: DB 기본값 0
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
                            // ⚠️ 원문 금지 — 이 값은 사용자에게 보여줄 용도라 영문 시스템
                            // 문구가 들어가면 안 된다(A-85 와 같은 결함).
                            //
                            // ⚠️ 다만 **현재 이 프로퍼티를 그리는 화면이 하나도 없다.** 위
                            // 주석의 "must not be invisible" 의도가 아직 미완이라는 뜻이다
                            // (bootstrapStatus 가 #200 전까지 그랬던 것과 같은 상태).
                            // 노출 위치는 별도 판단이 필요해 이 PR 에서는 문구만 안전하게 둔다.
                            AppLog.error("bookmark migration", error)
                            migrationWarning = "이전 북마크를 옮기지 못했어요. 잠시 후 다시 로그인해보세요."
                        }
                    }
                }
            }
            errorMessage = nil
            saveCachedIdentity()   // 이 시점의 신원이 '마지막으로 성공한' 신원이다
            bootstrapStatus = .ready
        } catch {
            AppLog.error("bootstrap", error)
            if Self.isTransientNetworkError(error), let cached = loadCachedIdentity() {
                // 오프라인/일시적 실패 — 회원 신원을 **버리지 않는다.** 예전엔 여기서
                // userId=nil, isAnonymous=true 인 초기값이 그대로 남아 화면이 게스트로
                // 그려졌고(= 조용한 로그아웃), 심지어 `.failed` 를 그리는 화면이 하나도
                // 없어 사용자에겐 그냥 '로그아웃됨'으로 보였다(외부 QA H-24).
                apply(cached)
                errorMessage = nil
                bootstrapStatus = .offline
            } else {
                // 신원을 확정하지 못했다(캐시도 없음). 원시 오류는 로그로만.
                errorMessage = "연결에 실패했어요. 잠시 후 다시 시도해주세요."
                bootstrapStatus = .failed("연결에 실패했어요. 잠시 후 다시 시도해주세요.")
            }
        }
        // Maintain existing semantics where `ready` means the bootstrap attempt has finished.
        ready = true
    }

    func signIn(id: String, password: String, signUp: Bool) async {
        guard !authInProgress else { return }
        guard let email = Self.idToEmail(id) else { authFormError = "아이디를 입력해주세요."; return }
        guard !password.isEmpty else { authFormError = "비밀번호를 입력해주세요."; return }

        authInProgress = true
        authMessage = nil
        authFormError = nil
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
            // 실제 오류는 기록 + 친화 메시지(원시 시스템 문자열 그대로 노출 X).
            AppLog.error("password sign-in", error)
            authFormError = Self.friendlyAuthError(error.localizedDescription)
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
        authFormError = nil
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
            // 사용자가 웹 인증 시트를 취소/닫음(ASWebAuthenticationSessionError.canceledLogin)
            // → 정상 흐름이므로 무음 no-op(배너 X). 실제 오류만 기록 + 친화 메시지.
            if AppLog.isAuthCancellation(error) {
                AppLog.debug("OAuth sign-in canceled by user")
            } else {
                AppLog.error("OAuth sign-in", error)
                authFormError = Self.friendlyAuthError(error.localizedDescription)
            }
        }
        authInProgress = false
    }

    /// Sign in with Apple (가이드라인 4.8 — 구글과 동등한 로그인 옵션). 네이티브 Apple
    /// 인증(ASAuthorizationController, 뷰에서 SignInWithAppleButton로 트리거)으로 받은
    /// idToken + rawNonce를 Supabase Apple 프로바이더로 교환한다. 성공하면 구글과 **동일**
    /// 하게 bootstrap(migrateFromUserId:)로 익명 북마크를 이전 — 별도 인증 스택 없음.
    /// `fullName`은 Apple이 최초 인증에서만 주므로 신규 가입 시 닉네임으로 저장한다.
    /// (이메일은 idToken에 담겨 Supabase auth 유저에 자동 기록 — 프라이빗 릴레이 주소일
    ///  수 있어 앱은 이메일을 실주소로 가정하지 않고 닉네임/아이디만 쓴다.)
    /// ⚠️ Supabase 대시보드에 Apple 프로바이더(Services ID·Team ID·Key ID·private key)가
    ///    설정돼야 동작한다. 미설정 시 토큰 교환에서 실패한다(현재 대시보드 미설정).
    func signInWithApple(idToken: String, rawNonce: String, fullName: String?) async {
        guard !authInProgress else { return }
        authInProgress = true
        authMessage = nil
        authFormError = nil
        let prevUserId = userId
        do {
            _ = try await auth.signInWithIdToken(
                credentials: .init(provider: .apple, idToken: idToken, nonce: rawNonce)
            )
            await bootstrap(migrateFromUserId: prevUserId, socialDisplayName: fullName)
            authMessage = "로그인 됐어요"
        } catch {
            // 사용자가 Apple 시트를 취소(ASAuthorizationError.canceled) → 무음 no-op.
            // 실제 오류만 기록 + 친화 메시지.
            if AppLog.isAuthCancellation(error) {
                AppLog.debug("Apple sign-in canceled by user")
            } else {
                AppLog.error("Apple sign-in", error)
                authFormError = Self.friendlyAuthError(error.localizedDescription)
            }
        }
        authInProgress = false
    }

    /// 로그아웃 — **게스트로 실제 전환됐을 때만 `true`**. 호출부는 이 값이 true 일 때만
    /// 로컬 사용자 상태를 지운다. 예전엔 `try?` 로 실패를 삼키고 호출부가 무조건 정리해서,
    /// 오프라인 로그아웃 실패 시 **회원은 로그인된 채 취향·이력만 날아갔다**(Codex 리뷰 P2).
    @discardableResult
    func signOut() async -> Bool {
        do {
            try await auth.signOut()
        } catch {
            // 세션이 그대로 남아 있다 = 여전히 회원. 로컬 데이터를 건드리면 안 된다.
            authMessage = "로그아웃에 실패했어요. 잠시 후 다시 시도해주세요."
            return false
        }
        // 의도적 로그아웃 — 캐시된 회원 신원은 여기서 버린다. 남겨두면 다음 부트스트랩이
        // 네트워크 실패 시 방금 로그아웃한 회원을 되살린다.
        clearCachedIdentity()
        await bootstrap()
        // 부트스트랩이 실패하면(오프라인 등) 게스트 세션이 성립하지 않은 것 — 이때도 정리하지
        // 않는다(비파괴 우선). 서버 소유 데이터는 그대로라 재시도로 회복된다.
        guard case .ready = bootstrapStatus, isAnonymous else {
            authMessage = "로그아웃에 실패했어요. 잠시 후 다시 시도해주세요."
            return false
        }
        authMessage = nil
        return true
    }

    /// Permanently deletes the signed-in member's account via the existing
    /// `delete_account()` Postgres RPC (SECURITY DEFINER, shared with Android).
    /// On success we drop the session and re-bootstrap a fresh anonymous one —
    /// which works whether the RPC also removes the auth user or only the data
    /// rows. Members only (anonymous users have no account to delete).
    @discardableResult
    func deleteAccount() async -> Bool {
        guard !authInProgress, !isAnonymous else { return false }
        authInProgress = true
        authMessage = nil
        authFormError = nil
        defer { authInProgress = false }

        // 1단계 — 서버 삭제. 여기서 실패하면 계정은 **그대로 살아 있다**. 회원 상태도
        // 로컬 데이터도 하나도 건드리지 않고 재시도 가능한 상태로 남긴다(외부 QA A-84:
        // 실패가 파괴적이면 안 된다). 원시 오류는 로그로만 — 화면엔 고정 한국어 문구.
        do {
            try await Supa.shared.deleteAccount()
        } catch {
            AppLog.error("delete account", error)
            authMessage = "탈퇴에 실패했어요. 잠시 후 다시 시도해주세요."
            return false
        }

        // 2단계 — 여기서부터는 **되돌릴 수 없다.** 계정은 이미 서버에서 사라졌다.
        // ⚠️ 이후 단계(로컬 세션 정리·게스트 부트스트랩)가 실패해도 false 를 돌려주면 안 된다.
        // 호출부에게 false 는 '로컬 정리하지 마라'는 뜻이라, 존재하지도 않는 계정의 취향·
        // 최근 본 카드·오즈 픽이 기기에 그대로 남는 A-84 를 그대로 재현한다.
        //
        // 캐시된 회원 신원도 **반드시 여기서** 버린다. 안 버리면 오프라인 탈퇴에서
        // `bootstrap()` 이 네트워크 실패 → 캐시 복구 경로를 타면서 방금 삭제한 계정을
        // 화면에 되살린다.
        clearCachedIdentity()
        try? await auth.signOut()
        await bootstrap()
        if case .ready = bootstrapStatus, isAnonymous {
            authMessage = "계정이 삭제됐어요"
        } else {
            // 삭제는 끝났는데 게스트 세션이 아직 못 섰다(오프라인 등). 그 계정으로는 다시
            // 로그인할 수 없으니 '실패'로 알리면 오히려 오해를 준다 — 사실만 전한다.
            authMessage = "계정이 삭제됐어요. 연결이 불안정하니 앱을 다시 실행해주세요."
        }
        return true
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
            AppLog.error("update nickname", error)
            authMessage = "저장에 실패했어요. 잠시 후 다시 시도해주세요."
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
            AppLog.error("update profile", error)
            authMessage = "저장에 실패했어요. 잠시 후 다시 시도해주세요."
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

    /// Apple Sign In용 일회성 nonce — 뷰가 요청 시 raw를 만들어 보관하고, 요청엔
    /// sha256(raw)를 실어 보낸다. 응답 검증 시 raw를 Supabase에 넘겨 재현 공격을 막는다.
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var bytes = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            guard status == errSecSuccess else { continue }
            for byte in bytes where remaining > 0 {
                if byte < charset.count {
                    result.append(charset[Int(byte)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    /// SHA256 hex — Apple 요청의 `nonce`에 싣는 해시.
    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
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
/// nonisolated + @unchecked Sendable — 상태가 없는 싱글턴인데 파일 기본 MainActor
/// 격리를 상속하면 `signInWithOAuth` 의 @Sendable 설정 클로저에서 `.shared` 를
/// 참조할 때 격리 경고가 난다. 앵커 조회만 UIKit(메인 스레드 보장 콜백)이라
/// `MainActor.assumeIsolated` 로 감싼다. #188 리뷰 참조.
nonisolated final class WebAuthPresentationContextProvider: NSObject,
    ASWebAuthenticationPresentationContextProviding, @unchecked Sendable {
    static let shared = WebAuthPresentationContextProvider()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            return scene?.keyWindow ?? ASPresentationAnchor()
        }
    }
}
