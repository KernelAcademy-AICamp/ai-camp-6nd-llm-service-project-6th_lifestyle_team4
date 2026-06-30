import SwiftUI

extension View {
    /// 바텀시트(`.sheet`) 대신 화면 '중앙 팝업(다이얼로그)'으로 콘텐츠를 띄운다 —
    /// Android AlertDialog/Dialog 미러(마이페이지 모달 공용).
    ///
    /// 투명 배경의 `fullScreenCover` 위에 직접 그린 스크림 + 가운데 카드로 구성한다.
    /// 단순 `.overlay` 중앙 팝업과 달리 '진짜 모달' 컨텍스트라 두 가지가 공짜로 풀린다:
    /// ① 콘텐츠가 기존처럼 `@Environment(\.dismiss)` 로 닫힌다(시트 → 커버 무수정 호환),
    /// ② 폼(아이디·닉네임 입력)의 소프트 키보드 회피가 일반 모달처럼 동작한다 —
    ///    키보드가 뜨면 가용 높이가 줄어 카드가 그 위로 다시 가운데 정렬된다.
    func centerPopup<PopupContent: View>(
        isPresented: Binding<Bool>,
        @ViewBuilder content: @escaping () -> PopupContent
    ) -> some View {
        fullScreenCover(isPresented: isPresented) {
            CenterPopupChrome(content: content)
                .presentationBackground(.clear)
        }
    }
}

/// 중앙 팝업 크롬 — 반투명 스크림(바깥 탭 시 닫힘) + 가운데 페이퍼 카드(라떼 테두리·
/// 그림자). 등장 시 페이드 + 살짝 스케일(시트의 바텀 슬라이드 대신 팝업 느낌).
private struct CenterPopupChrome<Content: View>: View {
    let content: () -> Content
    @Environment(\.dismiss) private var dismiss
    @State private var appeared = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                // 스크림 — Android onDismissRequest: 바깥 탭 → 닫기. 키보드 영역까지 덮는다.
                Color.espresso.opacity(appeared ? 0.18 : 0)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { dismiss() }
                // 카드 — 콘텐츠 폭 360 상한, 높이는 가용 높이의 82%로 상한(시트처럼 화면을
                // 다 채우지 않게). 키보드가 뜨면 proxy 높이가 줄어 카드도 줄며 그 위로 정렬.
                content()
                    .frame(maxWidth: 360)
                    .frame(maxHeight: proxy.size.height * 0.82)
                    .background(Color.paper)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.latte, lineWidth: 0.5))
                    .shadow(color: Color.black.opacity(0.18), radius: 24, x: 0, y: 8)
                    .scaleEffect(appeared ? 1 : 0.96)
                    .opacity(appeared ? 1 : 0)
                    .padding(.horizontal, 20)
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.2)) { appeared = true } }
    }
}
