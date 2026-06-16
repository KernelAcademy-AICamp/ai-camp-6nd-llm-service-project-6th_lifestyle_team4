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

    // MARK: - Reward

    /// 카드 첫 열람 보상 — 카드당 1회 +1. **서버가 영구 dedup** 한다
    /// (`reward_yarn_first_view`, `(user_id, card_id)` UNIQUE) — 재설치/기기 변경에도
    /// 재지급되지 않는다. 로컬 `ds.yarnRewarded` 는 같은 세션의 불필요한 RPC 재호출을
    /// 막는 빠른 캐시일 뿐, 진실은 서버다. 익명도 `userId` 가 있으면 보상받는다(PWA 동일).
    func rewardFirstOpen(cardId: Int, userId: Int?) async {
        guard let userId else { return }
        guard !isCardRewarded(cardId) else { return }   // 로컬 빠른 차단
        do {
            balance = try await Supa.shared.rewardFirstView(userId: userId, cardId: cardId)
            markCardRewarded(cardId)   // 성공 후 기록(서버가 진짜 dedup). 실패 시 다음 열람에 재시도.
        } catch {
            // 네트워크 오류 — 기록하지 않음 → 다음 열람에 재시도(서버 dedup 이 중복 적립 방지).
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
