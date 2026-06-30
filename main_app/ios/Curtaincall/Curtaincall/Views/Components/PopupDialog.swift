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
    /// 콘텐츠 높이에 맞춤(기본) vs **폼 모드**. 폼 모드(false)는 키보드 위 가용 높이를 채우고
    /// 내부 ScrollView 로 스크롤 — 텍스트필드(로그인)에서 키보드가 콘텐츠를 가리지 않게.
    var fitContent: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            Color.espresso.opacity(0.18)
                .ignoresSafeArea()
                .onTapGesture { if dismissOnScrimTap { isPresented = false } }
            card
        }
        .transition(.opacity)
    }

    @ViewBuilder private var card: some View {
        let base = content()
            .frame(maxWidth: maxWidth)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.paper))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.latte, lineWidth: 0.5))
            .padding(.horizontal, 24)
            .environment(\.dismissPopup) { isPresented = false }
        if fitContent {
            // 콘텐츠 고유 높이로 카드 크기 결정(짧은 콘텐츠=짧은 카드). 출석체크·프로필.
            base.fixedSize(horizontal: false, vertical: true)
        } else {
            // 폼/키보드 모드 — 카드가 가용 높이(키보드 위)를 채우고 내부 ScrollView 가 스크롤.
            // ZStack 이 키보드 safe area 를 존중해 카드 하단이 키보드 위에 머문다. 위아래 여백 36.
            base.padding(.vertical, 36)
        }
    }
}

extension View {
    /// 중앙 팝업으로 표시 — `.sheet(isPresented:)` 의 팝업 버전. `isPresented` 가 true 면
    /// 스크림+중앙 카드 오버레이로 콘텐츠를 띄운다.
    func popup<C: View>(
        isPresented: Binding<Bool>,
        maxWidth: CGFloat = 360,
        dismissOnScrimTap: Bool = true,
        fitContent: Bool = true,
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        overlay {
            if isPresented.wrappedValue {
                PopupDialog(
                    isPresented: isPresented,
                    maxWidth: maxWidth,
                    dismissOnScrimTap: dismissOnScrimTap,
                    fitContent: fitContent,
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
