import SwiftUI

/// 당겨서 새로고침 — Android `RefreshableBox` / `YarnRefreshIndicator` 미러.
/// 실타래(하단탭 홈 버튼과 같은 `daily-script-bar`)가 위에서 내려오며 페이드·확대·
/// 살짝 감기고(windup), 새로고침 중엔 750ms linear 로 연속 회전한다.
///
/// iOS 엔 `.refreshable` 의 기본 스피너를 커스텀 뷰로 갈아끼우는 1st-party API 가
/// 없어 스크롤 지오메트리로 직접 구현한다. 과거 구현(#128, build 6 재검토로 제거)이
/// 새로고침 직후 reflow 바운스로 **깜빡·재출현**하던 문제는, 인디케이터를 *사용자가
/// 실제로 드래그 중일 때만*(scroll phase = `interacting`/`tracking`) 노출해 없앤다 —
/// 새로고침 후의 정착 바운스는 비-인터랙션 단계라 실타래가 다시 뜨지 않으므로,
/// 예전의 쿨다운/데드밴드/백스톱 같은 보정 상태가 전부 불필요하다.
///
/// `.refreshable` 자리에 그대로 교체한다:
/// ```
/// ScrollView { … }
///     .yarnRefresh { await reload() }
/// ```
extension View {
    func yarnRefresh(_ onRefresh: @escaping () async -> Void) -> some View {
        modifier(YarnRefreshModifier(onRefresh: onRefresh))
    }
}

private struct YarnRefreshModifier: ViewModifier {
    let onRefresh: () async -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 콘텐츠가 자연 상단보다 아래로 끌린 거리(pt, ≥0).
    @State private var pull: CGFloat = 0
    /// 손가락이 실제로 드래그 중인가 — 새로고침 후 reflow 바운스(비-인터랙션)와 구분해
    /// 재출현을 막는 핵심 게이트.
    @State private var interacting = false
    /// 이번 드래그에서 임계를 넘겼는가 → 손 떼는 순간 1회 새로고침.
    @State private var armed = false
    @State private var refreshing = false
    @State private var angle: Double = 0

    private let threshold: CGFloat = 90    // 새로고침 발동 당김 거리
    private let size: CGFloat = 50         // 실타래 인디케이터 — 네비 센터(54)보다 작게
    private let restY: CGFloat = 16        // 새로고침 중 상단에서 내려와 머무는 위치

    func body(content: Content) -> some View {
        content
            // 짧은 콘텐츠(빈 상태 등)에서도 당길 수 있도록 항상 바운스.
            .scrollBounceBehavior(.always)
            // 콘텐츠 오프셋 추적 — 위로 당겨진 거리만큼 pull. 드래그 중 임계 넘기면 arm.
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in
                pull = max(0, -y)
                if interacting && !refreshing && pull >= threshold { armed = true }
            }
            // 드래그 단계 추적 — 손 떼는(인터랙션 종료) 순간 armed 면 새로고침.
            .onScrollPhaseChange { _, newPhase in
                let nowInteracting = newPhase == .interacting || newPhase == .tracking
                if !interacting && nowInteracting {
                    armed = false                                 // 새 드래그 시작 — 이전 arm 제거
                } else if interacting && !nowInteracting {
                    if armed && !refreshing { startRefresh() }    // 손 뗌 — 임계 넘었으면 발동
                    armed = false
                }
                interacting = nowInteracting
            }
            .overlay(alignment: .top) { indicator }
            // 새로고침 중에만 연속 회전(750ms/회전, Android YarnRefreshIndicator —
            // refreshing 동안 infiniteRepeatable linear). Reduce Motion 이면 정지(실타래만
            // 표시). 센터 탭의 1회 `.yarnSpin` 과는 별개 — reload 가 길어져도 끝까지 돈다.
            .onChange(of: refreshing) { _, isRefreshing in
                guard !reduceMotion else { return }
                if isRefreshing {
                    angle = 0
                    withAnimation(.linear(duration: 0.75).repeatForever(autoreverses: false)) {
                        angle = 360
                    }
                } else {
                    angle = 0
                }
            }
    }

    /// Android `YarnRefreshIndicator` 미러 — 당기는 거리만큼 위에서 내려오며 페이드·확대·
    /// 살짝 감기고(windup), 새로고침 중엔 연속 회전. 비-인터랙션일 땐 노출도 0(재출현 X).
    private var indicator: some View {
        let shown: CGFloat = refreshing ? 1 : (interacting ? min(1, pull / threshold) : 0)
        let translateY = -size + shown * (size + restY)
        let rotation: Double = refreshing ? angle : Double(shown) * 200
        return Image("daily-script-bar")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .opacity(Double(shown))
            .scaleEffect(0.5 + 0.5 * shown)
            .rotationEffect(.degrees(rotation))
            .offset(y: translateY)
            .allowsHitTesting(false)
    }

    private func startRefresh() {
        refreshing = true
        Task {
            await onRefresh()
            refreshing = false
        }
    }
}
