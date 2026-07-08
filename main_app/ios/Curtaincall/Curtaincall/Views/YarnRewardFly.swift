import SwiftUI

/// 카드 완독(읽기 완료) 보상 애니메이션 — Android `YarnRewardFly`
/// (`ui/yarn/YarnRewardAnimation.kt`)의 동작/감(感)을 iOS 관용구(SwiftUI)로 옮긴 것.
/// 이번 작업 한정 오너 승인 Android-match(AGENTS.md iOS-노스스타 규칙 의도적 예외).
///
/// 비주얼: 실타래 아이콘(상단바 칩과 같은 `daily-script-bar` 브랜드 마크) + 큼직한 `+N`.
/// 모션: 통통 튀는 bounce(상하 + 스케일, 무한 반복) — Android keyframes(1.4s 주기,
/// −18→0→−10 / 1.12→0.92→1.06)와 동일한 결. 페이드 인 0.35s → 유지 2.0s → 페이드 아웃
/// 0.4s 후 `onFinished`. 화면 중앙 오버레이로 띄운다.
struct YarnRewardFly: View {
    /// 표시할 적립량(실제 지급된 델타, 보통 +300). 0 이하면 호출부에서 띄우지 않는다.
    let amount: Int
    /// 페이드 아웃까지 끝난 뒤 호출 — 호출부에서 오버레이를 내린다.
    var onFinished: () -> Void

    @State private var visible = false
    @State private var bobbing = false

    var body: some View {
        HStack(spacing: 10) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 46, height: 46)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.18), radius: 10, y: 2)
                .offset(y: bobbing ? -14 : 0)
                .scaleEffect(bobbing ? 1.08 : 0.96, anchor: .center)
            Text("+\(amount)")
                // 번들된 Pretendard 는 Medium/Regular 뿐이라 무게감 있는 보상 숫자는
                // 시스템 heavy 로 렌더(누락 폰트 대체 회피). Android ExtraBold 의도와 일치.
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(.espresso)
        }
        .opacity(visible ? 1 : 0)
        .accessibilityElement()
        .accessibilityLabel("실타래 \(amount)개 적립")
        .onAppear {
            withAnimation(.easeOut(duration: 0.35)) { visible = true }
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { bobbing = true }
            Task { @MainActor in
                // 0.35s 페이드 인 + 2.0s 유지
                try? await Task.sleep(nanoseconds: 2_350_000_000)
                withAnimation(.easeIn(duration: 0.4)) { visible = false }
                try? await Task.sleep(nanoseconds: 400_000_000)
                onFinished()
            }
        }
    }
}
