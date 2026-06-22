import Foundation
import Combine

/// 실타래(yarn) economy — faithful port of the PWA yarn module
/// (`web_pwa/public/m/assets/m-app.js`, yarn section) and the PWA `spendYarn`
/// mechanics (`YARN_UNLOCK_WINDOW_MS`, `ds.yarnUnlocked`).
///
/// - **Balance** = server `users.yarn_balance` only (no daily-free allotment — the
///   old 5/day was removed). Updated from the RPC returns; seeded once from
///   `AuthSession` at bootstrap via `sync(serverBalance:)`.
/// - **Earn**: +1 once per card on first open (server-deduped via
///   `reward_yarn_first_view`; local `ds.yarnRewarded` is a per-account RPC cache).
/// - **Spend (gate)**: opening a card costs 1 (`consume_yarn`) unless it's already
///   unlocked (opened within the last 3 days) or the coach tour is active. A
///   per-card unlock (`ds.yarnUnlocked`, 3-day window) makes re-opens free.
/// - **Purchase**: mock `grant_yarn` (no StoreKit) + the attendance +100 reward.
@MainActor
final class YarnStore: ObservableObject {

    /// 차감/충전/보상 후 잔액(서버 권위값). 칩 표시의 단일 출처.
    @Published private(set) var balance = 0

    /// 카드 열람 게이트 판정.
    enum GateDecision {
        case allowed   // 무료(언락/투어) 또는 차감 성공 → 열람
        case blocked   // 잔액 부족 → 충전 유도, 열람 차단
    }

    /// 구매 티어 [실타래 개수, 원]. PWA `YARN_TIERS` 와 동일.
    static let tiers: [(count: Int, won: Int)] =
        [(1, 100), (10, 1000), (21, 2000), (32, 3000), (113, 10000)]

    /// 카드당 무료 재열람 창 — 3일 (PWA `YARN_UNLOCK_WINDOW_MS`).
    private let unlockWindow: TimeInterval = 3 * 24 * 60 * 60

    private let rewardedKey = "ds.yarnRewarded"   // [userId:cardId: epochSeconds]
    private let unlockedKey = "ds.yarnUnlocked"   // [userId:cardId: epochSeconds]
    private let defaults = UserDefaults.standard

    // MARK: - Balance

    /// 부트스트랩에서 로드한 서버 잔액으로 시드 (RootView 에서 호출).
    func sync(serverBalance: Int) { balance = serverBalance }

    // MARK: - Local caches (keyed per-account)

    /// 로컬 캐시 키 — **반드시 userId 별로 구분**한다. card id 만으로 키를 잡으면
    /// 같은 기기에서 A가 받은/연 카드를 B(다른 계정)가 열 때 보상 RPC 가 스킵되거나
    /// (보상 누락) B가 A의 언락을 공짜로 물려받는다. reward·unlock 둘 다 이 키를 쓴다.
    private func cacheKey(userId: Int, cardId: Int) -> String { "\(userId):\(cardId)" }

    func isCardRewarded(cardId: Int, userId: Int) -> Bool {
        rewardedMap()[cacheKey(userId: userId, cardId: cardId)] != nil
    }

    private func markCardRewarded(cardId: Int, userId: Int) {
        var map = rewardedMap()
        map[cacheKey(userId: userId, cardId: cardId)] = Date().timeIntervalSince1970
        defaults.set(map, forKey: rewardedKey)
    }

    // MARK: - Per-card 3-day unlock (mirror PWA ds.yarnUnlocked)

    func isCardUnlocked(cardId: Int, userId: Int) -> Bool {
        guard let ts = unlockedMap()[cacheKey(userId: userId, cardId: cardId)] else { return false }
        return Date().timeIntervalSince1970 - ts < unlockWindow
    }

    private func markCardUnlocked(cardId: Int, userId: Int) {
        var map = unlockedMap()
        let now = Date().timeIntervalSince1970
        map = map.filter { now - $0.value < unlockWindow }   // 만료 항목 정리 (PWA 동일)
        map[cacheKey(userId: userId, cardId: cardId)] = now
        defaults.set(map, forKey: unlockedKey)
    }

    // MARK: - Reward

    /// 카드 첫 열람 보상 — 카드당 1회 +1. **서버가 영구 dedup** 한다
    /// (`reward_yarn_first_view`, `(user_id, card_id)` UNIQUE) — 재설치/기기 변경에도
    /// 재지급되지 않는다. 로컬 `ds.yarnRewarded` 는 같은 세션의 불필요한 RPC 재호출을
    /// 막는 빠른 캐시일 뿐(userId:cardId 로 키), 진실은 서버다. 익명도 `userId` 가
    /// 있으면 보상받는다(PWA 동일).
    func rewardFirstOpen(cardId: Int, userId: Int?) async {
        guard let userId else { return }
        guard !isCardRewarded(cardId: cardId, userId: userId) else { return }   // 로컬 빠른 차단(계정별)
        do {
            balance = try await Supa.shared.rewardFirstView(userId: userId, cardId: cardId)
            markCardRewarded(cardId: cardId, userId: userId)   // 성공 후 기록(서버가 진짜 dedup). 실패 시 다음 열람에 재시도.
        } catch {
            // 네트워크 오류 — 기록하지 않음 → 다음 열람에 재시도(서버 dedup 이 중복 적립 방지).
        }
    }

    // MARK: - Open gate (spend)

    /// 카드 열람 게이트 (PWA `spendYarn` 미러).
    ///   · 3일 내 언락 카드 / 코치 투어 중 → 무료 (차감 없음)
    ///   · 그 외 → `consume_yarn` 1 차감. −1(잔액 부족)이면 `.blocked`(미차감).
    /// 네트워크 오류 시엔 하드 잠금을 피하려 열되, 차감/언락 마킹은 하지 않는다(다음 열람에 재평가).
    func gateOpen(cardId: Int, userId: Int?, tourActive: Bool) async -> GateDecision {
        if let userId, isCardUnlocked(cardId: cardId, userId: userId) { return .allowed }
        if tourActive { return .allowed }
        do {
            let newBalance = try await Supa.shared.consumeYarn()
            if newBalance < 0 { return .blocked }   // 잔액 부족 — 미차감
            balance = newBalance
            if let userId { markCardUnlocked(cardId: cardId, userId: userId) }
            return .allowed
        } catch {
            return .allowed   // fail-open: 일시 오류로 독자를 잠그지 않음 (미차감/미언락)
        }
    }

    /// 실타래 충전 — 구매 mock("준비 중") + 출석체크 보상(+100) 공용 진입점.
    /// `grant_yarn` 노출(attendance UI 는 이후 PR 에서 호출). 성공 시 true.
    @discardableResult
    func grant(_ n: Int) async -> Bool {
        guard n > 0 else { return false }
        do {
            balance = try await Supa.shared.grantYarn(n)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Storage helpers

    private func rewardedMap() -> [String: Double] { map(forKey: rewardedKey) }
    private func unlockedMap() -> [String: Double] { map(forKey: unlockedKey) }

    private func map(forKey key: String) -> [String: Double] {
        guard let raw = defaults.dictionary(forKey: key) else { return [:] }
        var out: [String: Double] = [:]
        for (k, v) in raw {
            if let d = v as? Double { out[k] = d }
            else if let n = v as? NSNumber { out[k] = n.doubleValue }
        }
        return out
    }
}
