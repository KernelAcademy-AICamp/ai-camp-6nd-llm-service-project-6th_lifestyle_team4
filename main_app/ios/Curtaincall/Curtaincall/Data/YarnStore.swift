import Foundation
import Combine

/// 실타래(yarn) economy — faithful port of the PWA yarn module
/// (`web_pwa/public/m/assets/m-app.js`, yarn section). Mechanics mirrored exactly:
///
/// - **Balance** = server `users.yarn_balance` only (no daily-free allotment — the
///   old 5/day was removed). Updated optimistically from the consume/grant RPC
///   return values; seeded once from `AuthSession` at bootstrap via `sync(serverBalance:)`.
/// - **Per-card 3-day unlock**: opening a card marks it unlocked for
///   `unlockWindow`; re-opens within the window are free (mirror `ds.yarnUnlocked`).
/// - **First-open reward**: +1 once per card, deduped locally via `ds.yarnRewarded`.
/// - **Gate**: unlocked OR coach-tour-active → free; else spend 1 via `consume_yarn`
///   (−1 = insufficient → blocked).
///
/// Tiers/keys/window match the PWA so behaviour is identical across clients.
@MainActor
final class YarnStore: ObservableObject {

    /// 차감/충전 후 잔액(서버 권위값). 칩 표시의 단일 출처.
    @Published private(set) var balance = 0

    /// 게이트 판정 결과.
    enum GateDecision {
        case allowed   // 무료(언락/투어) 또는 차감 성공 → 열람
        case blocked   // 잔액 부족 → 충전 유도, 열람 차단
    }

    /// 구매 티어 [실타래 개수, 원]. PWA `YARN_TIERS` 와 동일.
    static let tiers: [(count: Int, won: Int)] =
        [(1, 100), (10, 1000), (21, 2000), (32, 3000), (113, 10000)]

    /// 카드당 무료 재열람 창 — 3일 (PWA `YARN_UNLOCK_WINDOW_MS`).
    private let unlockWindow: TimeInterval = 3 * 24 * 60 * 60

    private let unlockedKey = "ds.yarnUnlocked"   // [cardId: epochSeconds] — PWA 키와 동일
    private let rewardedKey = "ds.yarnRewarded"   // [cardId: epochSeconds]
    private let defaults = UserDefaults.standard

    // MARK: - Balance

    /// 부트스트랩에서 로드한 서버 잔액으로 시드 (RootView 에서 호출).
    func sync(serverBalance: Int) { balance = serverBalance }

    // MARK: - Per-card unlock (3-day window)

    func isCardUnlocked(_ cardId: Int) -> Bool {
        guard let ts = unlockedMap()[String(cardId)] else { return false }
        return Date().timeIntervalSince1970 - ts < unlockWindow
    }

    func markCardUnlocked(_ cardId: Int) {
        var map = unlockedMap()
        let now = Date().timeIntervalSince1970
        map = map.filter { now - $0.value < unlockWindow }   // 만료 항목 정리(PWA 동일)
        map[String(cardId)] = now
        defaults.set(map, forKey: unlockedKey)
    }

    // MARK: - First-open reward (+1, once per card)

    func isCardRewarded(_ cardId: Int) -> Bool {
        rewardedMap()[String(cardId)] != nil
    }

    private func markCardRewarded(_ cardId: Int) {
        var map = rewardedMap()
        map[String(cardId)] = Date().timeIntervalSince1970
        defaults.set(map, forKey: rewardedKey)
    }

    private func unmarkCardRewarded(_ cardId: Int) {
        var map = rewardedMap()
        map[String(cardId)] = nil
        defaults.set(map, forKey: rewardedKey)
    }

    // MARK: - Gate & reward

    /// 카드 열람 게이트 (PWA `spendYarn` + 투어 무료 규칙 미러).
    /// 언락/투어면 무료; 아니면 `consume_yarn` 으로 1 차감. −1(잔액부족)이면 차단.
    /// 네트워크 오류 시엔 하드 잠금을 피하려 열되, 차감/언락 마킹은 하지 않는다(재시도 시 재평가).
    func gateOpen(cardId: Int, tourActive: Bool) async -> GateDecision {
        if isCardUnlocked(cardId) { return .allowed }
        if tourActive { return .allowed }
        do {
            let newBalance = try await Supa.shared.consumeYarn()
            if newBalance < 0 { return .blocked }   // 잔액 부족 — 미차감
            balance = newBalance
            markCardUnlocked(cardId)
            return .allowed
        } catch {
            return .allowed   // fail-open (일시 오류로 독자를 잠그지 않음)
        }
    }

    /// 카드 첫 열람 보상 — 카드당 1회 +1. 로컬 `ds.yarnRewarded` 로 중복 차단.
    /// (PWA 는 서버 dedup RPC `reward_yarn_first_view` 사용 — 06_yarn.sql 미포함이라
    ///  여기선 grant_yarn(1) + 로컬 dedup. 재설치 시 재지급 가능 — PR 에 플래그.)
    func rewardFirstOpen(cardId: Int) async {
        guard !isCardRewarded(cardId) else { return }
        markCardRewarded(cardId)   // optimistic — 빠른 중복 차단
        do {
            balance = try await Supa.shared.grantYarn(1)
        } catch {
            unmarkCardRewarded(cardId)   // 실패 시 재시도 가능하도록 롤백
        }
    }

    /// 실타래 충전 — 구매 mock("준비 중") + 출석체크 보상(+5) 공용 진입점.
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

    private func unlockedMap() -> [String: Double] { map(forKey: unlockedKey) }
    private func rewardedMap() -> [String: Double] { map(forKey: rewardedKey) }

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
