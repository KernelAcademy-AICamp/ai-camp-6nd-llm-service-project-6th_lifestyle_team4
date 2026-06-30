import SwiftUI

/// 앱 공용 **중앙 팝업 다이얼로그** — 아래에서 올라오며 콘텐츠를 일부 가리던 바텀시트 대신,
/// 화면 중앙에 떠서 전체 콘텐츠를 즉시 보여준다(`AccountRequiredPrompt` 의 스크림+카드 패턴을
/// 일반화). `.popup(isPresented:)` 로 `.sheet` 처럼 붙인다.
///
/// ## 언제 팝업 vs 시트 (앱 공용 규칙 — 드리프트 방지)
/// - **중앙 팝업(이 컴포넌트):** 작고 자족적인 콘텐츠/액션 모달 — 출석체크, 로그인, 프로필 편집.
///   처음부터 전체가 보여야 하고 스크롤이 없거나 짧은 것.
/// - **`.sheet` 유지:** 컴포저(피드/하이라이트 작성), 리스트·상세(공지, 피드 글 상세),
///   흔들기 미리보기(RandomQuotePeek), 그리고 **시스템 공유(ActivityShareSheet/ShareLink)** —
///   크거나 스크롤·텍스트 입력·시스템 의미를 가진 것은 시트로 둔다.
///
/// 콘텐츠 뷰는 `@Environment(\.dismissPopup)` 으로 닫는다(오버레이라 `\.dismiss` 는 안 통함).
/// 스크림 탭으로도 닫힌다.
struct PopupDialog<Content: View>: View {
    @Binding var isPresented: Bool
    var maxWidth: CGFloat = 360
    /// 스크림 탭으로 닫히게 할지 — 폼/중요 액션은 false 로 실수 닫힘 방지 가능.
    var dismissOnScrimTap: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            Color.espresso.opacity(0.18)
                .ignoresSafeArea()
                .onTapGesture { if dismissOnScrimTap { isPresented = false } }

            content()
                // 콘텐츠 고유 높이로 카드 크기 결정 — 내부 ScrollView 가 화면 전체로
                // 늘어나지 않게(짧은 콘텐츠는 짧은 카드). 아주 긴 콘텐츠(예: 작은 화면 +
                // 프로필 선호도)는 화면을 넘을 수 있어 그 경우만 QA 에서 확인.
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: maxWidth)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.latte, lineWidth: 0.5))
                .padding(.horizontal, 24)
                .environment(\.dismissPopup) { isPresented = false }
        }
        .transition(.opacity)
    }
}

extension View {
    /// 중앙 팝업으로 표시 — `.sheet(isPresented:)` 의 팝업 버전. `isPresented` 가 true 면
    /// 스크림+중앙 카드 오버레이로 콘텐츠를 띄운다.
    func popup<C: View>(
        isPresented: Binding<Bool>,
        maxWidth: CGFloat = 360,
        dismissOnScrimTap: Bool = true,
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        overlay {
            if isPresented.wrappedValue {
                PopupDialog(
                    isPresented: isPresented,
                    maxWidth: maxWidth,
                    dismissOnScrimTap: dismissOnScrimTap,
                    content: content
                )
            }
        }
    }
}

// MARK: - dismissPopup environment (PopupDialog injects this so content can close itself)

private struct DismissPopupKey: EnvironmentKey { static let defaultValue: () -> Void = {} }

extension EnvironmentValues {
    /// 팝업 콘텐츠가 자신을 닫을 때 호출(오버레이라 SwiftUI `\.dismiss` 미적용). 팝업 밖에선 no-op.
    var dismissPopup: () -> Void {
        get { self[DismissPopupKey.self] }
        set { self[DismissPopupKey.self] = newValue }
    }
}
