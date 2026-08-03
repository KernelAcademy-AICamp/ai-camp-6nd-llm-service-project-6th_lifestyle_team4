import Foundation
import Combine
import Network

/// 연결 상태 감시 — 앱에 네트워크 감시 코드가 전혀 없어서, 오프라인으로 시작한 세션이
/// 연결이 돌아와도 **스스로 회복하지 못했다**(외부 QA H-24: "다시 연결하면 회복돼야
/// 한다"). `AuthSession` 이 신원을 지켜내는 건 1/2 PR 에서 끝났고, 여기서는 '언제
/// 다시 시도할지'를 알려준다.
///
/// 설계 노트:
/// · `NWPathMonitor` 는 자체 큐에서 콜백하므로 @Published 갱신은 메인 액터로 넘긴다.
/// · `isOnline` 의 초기값은 `true` — 감시가 첫 경로를 보고하기 전에 false 로 깜빡이면
///   정상 실행에서도 오프라인 배너가 한 프레임 스쳐 지나간다.
/// · 재시도 판단은 이 타입이 하지 않는다. '연결이 끊겼다 돌아온 순간'만 알리고, 무엇을
///   다시 할지는 소비자(RootView)가 정한다 — 감시자가 세션을 알 이유가 없다.
@MainActor
final class NetworkMonitor: ObservableObject {

    /// 지금 연결돼 있는가. 초기값 true 는 위 주석의 '첫 프레임 깜빡임' 방지용.
    @Published private(set) var isOnline = true

    /// 끊겼다가 **다시 연결된** 순간마다 증가. 값 자체엔 의미가 없고 `onChange` 로 재시도를
    /// 걸기 위한 신호다. `isOnline` 만 관찰하면 앱 시작 시의 true 와 회복 시의 true 를
    /// 구분할 수 없어, 회복이 아닌데도 재시도가 돌 수 있다.
    @Published private(set) var reconnectToken = 0

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.curtaincall.network-monitor")
    /// 한 번이라도 오프라인을 봤는가 — 이게 있어야 '회복'과 '처음부터 온라인'을 가른다.
    private var wasOffline = false

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.apply(online: online)
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    private func apply(online: Bool) {
        if online {
            // 끊긴 적이 있을 때만 '회복'으로 친다 — 첫 경로 보고는 회복이 아니다.
            if wasOffline {
                wasOffline = false
                reconnectToken &+= 1
            }
        } else {
            wasOffline = true
        }
        if isOnline != online { isOnline = online }   // 같은 값 재발행 방지
    }
}
