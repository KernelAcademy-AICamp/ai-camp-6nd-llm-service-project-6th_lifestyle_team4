import CoreGraphics

/// 시트·모달 공통 간격 표준 — 모든 바텀시트/모달 팝업이 같은 값을 참조해 크롬이
/// 일관되도록 한다(화면별 하드코딩 금지). 출석체크 시트(#110)·인증 모달을 기준으로
/// 정한 값으로, '시트 크롬'(그래버↔제목, 제목↔본문, 본문↔버튼) 리듬용이다.
/// 콘텐츠 내부 고유 간격(달력 그리드·폼 필드 등)은 각 화면이 따로 가진다.
enum SheetMetrics {
    /// 그래버 ↔ 첫 콘텐츠(커스텀 헤더/제목) 상단 여백 — 제목이 그래버에 붙지 않게.
    static let grabberTop: CGFloat = 12
    /// 시트 커스텀 헤더 바 높이(제목 + 닫기 버튼 줄).
    static let headerHeight: CGFloat = 56
    /// 제목 ↔ 본문.
    static let titleToBody: CGFloat = 12
    /// 본문 ↔ 주요 버튼(액션).
    static let bodyToButton: CGFloat = 24
    /// 스택된 버튼 사이.
    static let buttonGap: CGFloat = 10
    /// 모달 카드(중앙 팝업) 내부 패딩 + 헤더 가로 패딩.
    static let cardPadding: CGFloat = 20
}
