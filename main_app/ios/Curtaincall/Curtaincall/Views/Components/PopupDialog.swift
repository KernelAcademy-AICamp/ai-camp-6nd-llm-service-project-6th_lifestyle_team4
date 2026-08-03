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
        // 폼 모드(키보드 쓰는 팝업)일 때 신호 — RootView 가 받아 탭바/고양이가 키보드를 따라
        // 위로 떠오르지 않게 잠근다(팝업만 키보드 회피, 그 뒤 탭 UI 는 고정).
        .preference(key: FormPopupActiveKey.self, value: !fitContent)
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
            // 폼/키보드 모드 — 카드 하단이 키보드 위에 머물러 텍스트필드·저장 버튼이 가려지지
            // 않게 한다. ZStack 이 키보드 safe area 를 존중한다.
            //
            // ⚠️ 예전엔 `padding(.vertical, 36)` 만 있어 카드가 **가용 높이를 항상 꽉 채웠다**.
            // 그래서 키보드가 내려간 상태 + 짧은 콘텐츠(비회원 프로필엔 취향 섹션이 없다)면
            // 화면만 한 빈 카드가 됐다(기기 QA). 키보드를 올리면 멀쩡해 보이던 이유가 이것.
            // 짧은 콘텐츠에서 카드가 커 보이는 문제는 **여기서 고치지 않는다**: `fixedSize` 로
            // 자연 높이를 강제해봤더니 SE 처럼 좁은 화면에서 로그인 팝업(콘텐츠가 길다)이
            // 위아래로 흘러넘쳐 제목이 잘렸다(시뮬레이터 실측). 높이를 콘텐츠에 맞추려면
            // ProfileEditor 안쪽 ScrollView 가 늘어나지 않게 콘텐츠 레벨에서 손봐야 하고,
            // 그건 로그인 팝업까지 영향이 가므로 별도 항목으로 분리했다(백로그 QA-7-A).
            //
            // ⚠️ 하단 여백이 36 인 것도 문제였다. 팝업은 TabView 페이지 안의 오버레이인데
            // 탭바 필은 RootView 레벨 오버레이라 **z순서상 항상 팝업 위** — 카드 하단의
            // 취소/저장이 필과 고양이에 가렸다. 필 윗면 기준으로 여백을 잡아 비켜난다.
            base
                .padding(.top, 36)
                .padding(.bottom, EditorialTabBar.pillTopInset + 12)
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

// MARK: - Form-popup-active preference (RootView pins the tab bar/cat while a keyboard popup is up)

/// true 면 키보드를 쓰는 폼 팝업(로그인)이 표시 중 — RootView 가 탭 UI 의 키보드 회피를 끈다.
struct FormPopupActiveKey: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
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
