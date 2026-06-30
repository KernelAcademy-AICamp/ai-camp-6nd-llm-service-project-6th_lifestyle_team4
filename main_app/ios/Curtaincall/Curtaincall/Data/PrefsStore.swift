import Foundation
import Combine

/// User preferences mirrored from the PWA's localStorage flags.
/// Observable so toggling dark mode flips the app theme live.
@MainActor
final class PrefsStore: ObservableObject {

    private let d = UserDefaults.standard
    private enum Key {
        static let push = "ds.push"
        static let taste = "ds.taste"
        static let dark = "ds.dark"
        static let recent = "ds.recent"
        // Onboarding preferences (PWA ds.prefSelected / ds.pref.*).
        static let prefSelected = "ds.prefSelected"
        static let prefGenres = "ds.prefGenres"
        static let prefThemes = "ds.prefThemes"
        static let prefAny = "ds.prefAny"
        // Daily Oz pick cache (PWA/Android AppPreferences.ozDailyCardId).
        static let ozDailyDate = "ds.ozDailyDate"
        static let ozDailyCardId = "ds.ozDailyCardId"
        // Highest notice id the user has seen (Android noticeLastSeenId).
        static let noticeLastSeen = "ds.noticeLastSeen"
    }

    @Published var pushEnabled: Bool { didSet { d.set(pushEnabled, forKey: Key.push) } }
    @Published var tasteEnabled: Bool { didSet { d.set(tasteEnabled, forKey: Key.taste) } }
    @Published var darkTheme: Bool { didSet { d.set(darkTheme, forKey: Key.dark) } }

    /// First-run onboarding completed (or skipped). False → show the picker once.
    /// @Published so finishing onboarding dismisses the overlay live.
    @Published var prefSelected: Bool { didSet { d.set(prefSelected, forKey: Key.prefSelected) } }

    /// Highest notice id seen — drives the MY-tab unread dot. @Published so the
    /// dot clears live when the user opens the Notice screen.
    @Published var noticeLastSeenId: Int { didSet { d.set(noticeLastSeenId, forKey: Key.noticeLastSeen) } }

    init() {
        pushEnabled = d.object(forKey: Key.push) as? Bool ?? true
        tasteEnabled = d.bool(forKey: Key.taste)
        darkTheme = d.bool(forKey: Key.dark)
        prefSelected = d.bool(forKey: Key.prefSelected)
        noticeLastSeenId = d.integer(forKey: Key.noticeLastSeen)
    }

    /// Mark notices up to `latestId` as seen (clears the unread dot).
    func markNoticesSeen(_ latestId: Int) {
        if latestId > noticeLastSeenId { noticeLastSeenId = latestId }
    }

    /// The saved onboarding picks (empty when not yet chosen).
    var userPrefs: UserPrefs {
        UserPrefs(
            genres: d.stringArray(forKey: Key.prefGenres) ?? [],
            themes: d.stringArray(forKey: Key.prefThemes) ?? [],
            any: d.bool(forKey: Key.prefAny)
        )
    }

    /// Persist the onboarding picks locally and mark onboarding done. No
    /// 온보딩/프로필 편집의 로컬 저장. DB(users.pref_*) 쓰기는 호출부가 별도로
    /// `Supa.savePreferences` 로 수행한다(migration 033 배포 완료).
    func savePrefs(genres: [String], themes: [String], any: Bool) {
        d.set(genres, forKey: Key.prefGenres)
        d.set(themes, forKey: Key.prefThemes)
        d.set(any, forKey: Key.prefAny)
        prefSelected = true
    }

    /// 서버(users.pref_*)에 저장된 선호도를 로컬로 동기화 — 기기 간 지속·온보딩 재노출
    /// 방지(PWA `syncPrefsFromDb` 미러). 호출부(RootView)는 서버에 값이 있을 때만
    /// 부른다. prefSelected 를 true 로 해 온보딩이 다시 뜨지 않게 한다.
    func syncFromServer(genres: [String], themes: [String], any: Bool) {
        d.set(genres, forKey: Key.prefGenres)
        d.set(themes, forKey: Key.prefThemes)
        d.set(any, forKey: Key.prefAny)
        prefSelected = true
    }

    /// 로그아웃 시 호출 — 이전 사용자의 취향(장르/주제)이 다음(익명) 세션에 남지 않도록 로컬에서
    /// 지운다. 온보딩은 다시 띄우지 않고(prefSelected 유지) Daily 의 Oz 픽이 게스트 '취향 설정'
    /// CTA 로 떨어진다(취향만 비움). 서버(users.pref_*)는 각 계정에 남아 재로그인 시
    /// syncFromServer 로 복원된다. (로그아웃 시 session 변경으로 화면이 재평가되며 빈 취향을 읽음.)
    func clearOnLogout() {
        d.removeObject(forKey: Key.prefGenres)
        d.removeObject(forKey: Key.prefThemes)
        d.removeObject(forKey: Key.prefAny)
        // prefSelected 는 유지 — 온보딩 재노출 대신 게스트 CTA 경로로.
    }

    // Recently-shown queue (not @Published — used transiently by Home).
    var recentlyShown: [Int] {
        get { d.array(forKey: Key.recent) as? [Int] ?? [] }
        set { d.set(newValue, forKey: Key.recent) }
    }

    func rememberShown(_ cardId: Int) {
        var cur = recentlyShown
        cur.removeAll { $0 == cardId }   // dedupe → move to most recent
        cur.append(cardId)
        if cur.count > 10 { cur.removeFirst(cur.count - 10) }
        recentlyShown = cur
    }

    // Daily Oz pick — one card cached per calendar day (keyed by a yyyy-MM-dd
    // string), mirroring Android `AppPreferences.ozDailyCardId/setOzDailyCard`.
    func ozDailyCardId(today: String) -> Int? {
        guard d.string(forKey: Key.ozDailyDate) == today else { return nil }
        let id = d.integer(forKey: Key.ozDailyCardId)
        return id == 0 ? nil : id
    }

    func setOzDailyCard(today: String, cardId: Int) {
        d.set(today, forKey: Key.ozDailyDate)
        d.set(cardId, forKey: Key.ozDailyCardId)
    }
}
