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
        // 그 픽을 고를 때의 취향 지문 — 취향이 바뀌면 같은 날이라도 캐시를 버린다.
        static let ozDailySig = "ds.ozDailySig"
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

    /// 신원 초기화 신호 — `clearUserScopedState()` 의 **맨 마지막**에 증가한다.
    /// UserDefaults 를 지워도 이미 그려진 화면의 @State 는 그대로 남는다: 로그아웃 뒤에도
    /// TODAY 의 오늘 카드·최근 목록, DAILY 의 오즈 추천이 계속 보였다(Codex 리뷰 P1).
    /// 화면들이 이 토큰을 관찰해 메모리 상태를 즉시 버리고 게스트 기준으로 다시 계산한다.
    @Published private(set) var identityResetToken = 0

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

    /// 현재 취향의 **안정적 지문**. 선택 순서나 중복에 흔들리지 않도록 정렬 후 결합한다.
    /// 저장된 오즈 픽이 지금 취향과 호환되는지 판정하는 기준이자, 리비전을 올릴지 말지
    /// 가르는 기준이다.
    var prefsSignature: String {
        let p = userPrefs
        return "\(p.any ? 1 : 0)|\(p.genres.sorted().joined(separator: ","))|\(p.themes.sorted().joined(separator: ","))"
    }

    /// 취향 값이 **실제로 바뀔 때만** 증가하는 리비전.
    ///
    /// 왜 필요한가: `savePrefs` 는 마지막에 `prefSelected = true` 를 대입한다. 프로필 편집은
    /// 이미 true 인 값에 true 를 다시 넣는 것이라 `didSet` → `objectWillChange` 는 발행되어
    /// **화면은 다시 그려지지만**(장르·주제 라벨은 `userPrefs` 를 그때그때 읽어 갱신된다),
    /// 값이 변하지 않았으니 `onChange(of: prefSelected)` 는 **울리지 않는다**. 그래서 라벨만
    /// 바뀌고 오즈 카드는 그대로였다(외부 QA D-17). `userPrefs` 는 @Published 도 아니라
    /// 관찰 대상이 될 수 없어, 별도의 리비전 신호를 둔다.
    ///
    /// 신원 초기화(`clearUserScopedState`)는 여기를 올리지 않는다 — 그쪽은
    /// `identityResetToken` 이라는 더 강한 신호가 이미 있고, 둘 다 올리면 관찰자가 같은
    /// 재계산을 두 번 한다.
    @Published private(set) var prefsRevision = 0

    /// Persist the onboarding picks locally and mark onboarding done. No
    /// 온보딩/프로필 편집의 로컬 저장. DB(users.pref_*) 쓰기는 호출부가 별도로
    /// `Supa.savePreferences` 로 수행한다(migration 033 배포 완료).
    func savePrefs(genres: [String], themes: [String], any: Bool) {
        writePrefs(genres: genres, themes: themes, any: any)
    }

    /// 취향 3종 쓰기 + '실제로 달라졌을 때만' 리비전 증가. `savePrefs` 와 `syncFromServer`
    /// 가 같은 규칙을 쓰도록 한 곳에 모았다 — 특히 `syncFromServer` 는 부팅마다 불리므로,
    /// 값이 같은데도 리비전을 올리면 하루 1장 오즈 캐시가 매 실행 무효화된다.
    private func writePrefs(genres: [String], themes: [String], any: Bool) {
        let before = prefsSignature
        d.set(genres, forKey: Key.prefGenres)
        d.set(themes, forKey: Key.prefThemes)
        d.set(any, forKey: Key.prefAny)
        prefSelected = true
        if prefsSignature != before { prefsRevision &+= 1 }
    }

    /// 서버(users.pref_*)에 저장된 선호도를 로컬로 동기화 — 기기 간 지속·온보딩 재노출
    /// 방지(PWA `syncPrefsFromDb` 미러). 호출부(RootView)는 서버에 값이 있을 때만
    /// 부른다. prefSelected 를 true 로 해 온보딩이 다시 뜨지 않게 한다.
    func syncFromServer(genres: [String], themes: [String], any: Bool) {
        writePrefs(genres: genres, themes: themes, any: any)
    }

    /// **신원(계정)이 바뀔 때** 지워야 하는 '사용자 소유' 로컬 상태 전부 — 로그아웃과 탈퇴
    /// 성공 시 호출한다.
    ///
    /// 예전 `clearOnLogout()` 은 취향 3개만 지워서, 이전 사용자의 **최근 본 카드 · 오늘의 오즈
    /// 픽 · 공지 읽음 표시**가 게스트/다음 계정에 그대로 남았다(외부 QA A-8 / A-69 / H-29:
    /// "새 사용자 테스트인데 이전 사용자 데이터가 보인다"). 탈퇴 경로는 아예 아무것도 지우지
    /// 않아 더 심했다(A-84).
    ///
    /// 남기는 것과 그 이유:
    /// · `push` / `taste` / `dark` — **기기 설정**이지 사용자 소유가 아니다(계정이 바뀌어도 유지).
    /// · `prefSelected` — 온보딩을 매 로그아웃마다 다시 띄우지 않기 위한 기존 결정. 취향 값은
    ///   비우므로 게스트는 Daily 에서 '취향 설정' CTA 경로로 떨어진다.
    ///
    /// 서버 소유 데이터(users.pref_*, 북마크)는 건드리지 않는다 — 원래 계정으로 다시 로그인하면
    /// `syncFromServer` / `BookmarkStore.load` 로 정상 복원된다.
    func clearUserScopedState() {
        // 취향 — 서버에 남아 있어 재로그인 시 복원된다.
        d.removeObject(forKey: Key.prefGenres)
        d.removeObject(forKey: Key.prefThemes)
        d.removeObject(forKey: Key.prefAny)
        // 최근 본 카드 큐 — 이전 사용자의 열람 이력이 그대로 노출되던 원인.
        d.removeObject(forKey: Key.recent)
        // 오늘의 오즈 픽 캐시 — 이전 사용자의 취향으로 고른 카드가 남아 있었다.
        d.removeObject(forKey: Key.ozDailyDate)
        d.removeObject(forKey: Key.ozDailyCardId)
        d.removeObject(forKey: Key.ozDailySig)
        // 공지 읽음 표시 — 계정별 상태. @Published 라 대입해야 MY 탭 unread 닷도 즉시 갱신된다.
        noticeLastSeenId = 0
        // ⚠️ 반드시 **마지막**에 — 관찰자(HomeView/DailyView)가 이 신호를 받아 재계산할 때
        // 이미 비워진 취향·오즈 캐시를 읽어야 게스트 기준으로 다시 뽑힌다.
        identityResetToken &+= 1
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
        // '하루 1장' 캐시는 **지금 취향과 호환될 때만** 유지한다(외부 QA D-17 요건).
        // 저장 당시의 지문과 다르면 그날 안이라도 무효 — 예전엔 `chooseOzPick` 쪽 휴리스틱만
        // 있어서 주제가 바뀐 경우는 걸렀지만 **장르만** 바꾼 경우는 그대로 통과했다.
        guard d.string(forKey: Key.ozDailySig) == prefsSignature else { return nil }
        let id = d.integer(forKey: Key.ozDailyCardId)
        return id == 0 ? nil : id
    }

    func setOzDailyCard(today: String, cardId: Int) {
        d.set(today, forKey: Key.ozDailyDate)
        d.set(cardId, forKey: Key.ozDailyCardId)
        d.set(prefsSignature, forKey: Key.ozDailySig)   // 어떤 취향으로 고른 픽인지 함께 남긴다
    }
}
