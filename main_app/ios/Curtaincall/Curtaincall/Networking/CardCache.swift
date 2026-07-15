import Foundation

/// 세션 공유 카드 캐시 — DailyView·HomeView·LibraryCatalogView·RootView(흔들기 풀)이
/// 각자 `Supa.shared.fetchCards()` 를 호출해 콜드 세션에 같은 `cards` 테이블을 4번
/// 당겼다(Supabase 무료 티어 부하). 여기서 세션 1회 fetch 후 모두에게 공유한다.
///
/// **동작 무변 보장(라이브 테스트 불가 전제):**
/// - 반환값이 `fetchCards()` 와 **완전 동일**. `fetchCards(limit:)` 의 limit 파라미터는
///   메서드 본문에서 사용되지 않아(페이지네이션으로 전체를 반환) 4개 호출부가 이미
///   같은 전체 배열을 받고 있었다 → 캐시 공유가 각 호출부 동작을 바꾸지 않는다.
/// - `cards` 는 큐레이션된 정적 콘텐츠라 세션 중 바뀌어도 기존 뷰들도 @State 로 1회
///   고정해 쓰므로, 세션 캐시는 현재 동작과 등가(더 공격적인 캐싱 아님).
/// - **동시 콜드콜 합류**: 4개 탭이 동시에 호출해도 in-flight Task 를 공유해 네트워크
///   요청은 1회. (기존엔 최대 4회 경합.)
/// - **실패는 캐시하지 않음**: rate-limit 로 첫 호출이 실패해도 다음 호출이 재시도
///   가능. (실패를 캐시하면 세션 내내 빈 앱이 됨 — 무료 티어 상황에서 특히 위험.)
///
/// @MainActor: 모든 호출부가 SwiftUI 뷰(MainActor)라 단순 await 로 접근하며, 상태
/// 변경(cached/inFlight)이 메인 액터에 직렬화돼 데이터 레이스가 없다.
@MainActor
final class CardCache {
    static let shared = CardCache()
    private init() {}

    private var cached: [Card]?
    private var inFlight: Task<[Card], Error>?

    /// 전체 카드 — 세션 1회 fetch 후 공유. 각 호출부의 `Supa.shared.fetchCards()` 를
    /// 그대로 대체(반환 동일). 성공 시 캐시, 실패 시 캐시하지 않고 던진다.
    func cards() async throws -> [Card] {
        if let cached { return cached }
        // 이미 진행 중인 fetch 가 있으면 그 결과에 합류(중복 네트워크 방지).
        if let inFlight { return try await inFlight.value }
        let task = Task { try await Supa.shared.fetchCards() }
        inFlight = task
        defer { inFlight = nil }   // 성공/실패 무관 — 다음 호출이 캐시(성공) 또는 재시도(실패)
        let result = try await task.value
        cached = result
        return result
    }
}
