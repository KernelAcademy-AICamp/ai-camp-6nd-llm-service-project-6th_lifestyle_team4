import SwiftUI

/// 비어 있음 / 실패 상태 공용 표시 — 아이콘 + 헤드라인 + 서브라인 (+ 선택 재시도).
///
/// 원래 `LibraryCatalogView` 안에 있었지만 북마크 서가 · 공지 · 오류 상태가 함께 쓰는
/// 공용 컴포넌트라 파일을 분리했다.
///
/// **왜 이걸 재사용하나**: 공지 로드 실패가 한 줄 텍스트뿐이라 무슨 일이 났는지 눈에 안
/// 들어왔다(기기 QA). 새 디자인을 만들 필요가 없다 — 이 컴포넌트가 이미 Apple 의
/// `ContentUnavailableView`(큰 심볼 + 제목 + 보조 설명 + 액션)와 같은 구조이고, 앱의
/// 편집 디자인 언어(headlineSerif/bodySans/sand)를 그대로 쓴다.
struct EmptyStateView: View {
    let icon: String
    var iconSize: CGFloat = 48
    let headline: String
    let subline: String
    /// 있으면 헤드라인 아래에 재시도 버튼을 붙인다. 공지 실패엔 재시도 수단이 아예 없어
    /// 시트를 닫았다 다시 열어야 했다(기기 QA — 시각 문제가 아니라 기능 갭이었다).
    var retryTitle: String = "다시 시도"
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: icon)
                .font(.system(size: iconSize, weight: .regular))
                .foregroundStyle(.sand)
            Spacer().frame(height: 16)
            Text(headline)
                .font(.headlineSerif(18))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 8)
            Text(subline)
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
            if let onRetry {
                Spacer().frame(height: 20)
                Button(action: onRetry) {
                    // 테두리 박스는 시각 크기 40, **히트 영역만 44**(HIG 최소 — 리뷰 P2).
                    // 페이지 바 칩이 쓰는 것과 같은 방식(시각 28 / 히트 44)으로, 보조 버튼이
                    // 시각적으로 커지지 않으면서 접근성 최소 타깃을 만족한다.
                    Text(retryTitle).labelCaps(color: .espresso)
                        .padding(.horizontal, 18)
                        .frame(height: 40)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.walnut, lineWidth: 1))
                        .frame(height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .padding(.horizontal, 24)
    }

    /// 실패 원인에 맞는 심볼 — 연결 문제와 그 외를 구분한다. 끊긴 와이파이에 경고
    /// 삼각형을 띄우면 실제보다 위중해 보인다. 판정은 #198 의 분류기를 그대로 재사용.
    static func icon(for error: Error) -> String {
        AuthSession.isTransientNetworkError(error) ? "wifi.slash" : "exclamationmark.triangle"
    }
}
