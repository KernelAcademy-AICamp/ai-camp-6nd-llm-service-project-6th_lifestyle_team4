import Foundation

/// 비회원 TODAY 카드 새로고침 일일 제한 — PWA `REFRESH_LIMIT` / `ds.refreshCount` 미러.
/// 하루 3번까지 무료, 날짜(로컬)가 바뀌면 리셋. 회원은 무제한(이 게이트 미적용).
enum AnonRefreshLimit {
    static let limit = 3
    private static let key = "ds.refreshCount"   // {"date":"yyyy-MM-dd","count":N}

    private static func todayStr() -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: .now)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// 오늘 새로고침 횟수(날짜가 바뀌었으면 0).
    static func count() -> Int {
        guard let data = UserDefaults.standard.data(forKey: key),
              let state = try? JSONDecoder().decode(State.self, from: data),
              state.date == todayStr() else { return 0 }
        return state.count
    }

    /// 한도 도달 여부(>= 3).
    static var atLimit: Bool { count() >= limit }

    /// 오늘 횟수 +1 저장.
    static func bump() {
        let next = State(date: todayStr(), count: count() + 1)
        if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// 오늘 횟수 -1 (0 미만으로 내려가지 않음). 게이트는 새로고침을 **시도하기 전에**
    /// 소모하므로, 시도가 실패해 카드가 그대로면 되돌려줘야 한다 — 안 그러면 비행기
    /// 모드에서 당기기만 해도 하루 3회 한도가 닳는다(리뷰 지적).
    static func refund() {
        let current = count()
        guard current > 0 else { return }
        let next = State(date: todayStr(), count: current - 1)
        if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private struct State: Codable {
        let date: String
        let count: Int
    }
}
