import Foundation
import Combine

/// 실타래(yarn) economy — faithful port of the PWA yarn module
/// (`web_pwa/public/m/assets/m-app.js`) and Android `YarnGate`/`YarnViewModel`.
///
/// 사용자 명세(2026-06): **카드 열람 게이트/팝업은 제거됐다 — 모든 카드 자유 열람.**
/// 실타래는 차감되지 않고, 카드 1개당 1회 첫 열람 시에만 **+1** 지급된다.
///
/// - **Balance** = server `users.yarn_balance` only (no daily-free allotment — the
///   old 5/day was removed). Updated from the grant RPC return; seeded once from
///   `AuthSession` at bootstrap via `sync(serverBalance:)`.
/// - **First-open reward**: +1 once per card, deduped locally via `ds.yarnRewarded`.
/// - **Spend/charge**: yarn is only **earned** (first-open) and **purchased**
///   (mock grant). There is no spend path — opening a card never consumes yarn.
@MainActor
final class YarnStore: ObservableObject {

    /// 충전/보상 후 잔액(서버 권위값). 칩 표시의 단일 출처.
    @Published private(set) var balance = 0

    /// 구매 티어 [실타래 개수, 원]. PWA `YARN_TIERS` 와 동일.
    static let tiers: [(count: Int, won: Int)] =
        [(1, 100), (10, 1000), (21, 2000), (32, 3000), (113, 10000)]

    private let rewardedKey = "ds.yarnRewarded"   // [cardId: epochSeconds]
    private let defaults = UserDefaults.standard

    // MARK: - Balance

    /// 부트스트랩에서 로드한 서버 잔액으로 시드 (RootView 에서 호출).
    func sync(serverBalance: Int) { balance = serverBalance }

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

    // MARK: - Reward

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
