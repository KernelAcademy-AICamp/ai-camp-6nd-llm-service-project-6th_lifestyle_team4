import SwiftUI

/// 긴 하이라이트(선택 구절)를 4줄로 접고 '더 보기/접기' 토글을 단다 —
/// PWA `makeFoldHTML` / Android `FoldableText` 미러.
///
/// 접힘 조건은 두 플랫폼과 동일한 휴리스틱: **100자 초과 또는 줄바꿈 3개 이상**.
/// 조건 미만이면 토글 없이 전체 노출하고, 조건을 넘으면 4줄로 클램프(말줄임) + 토글.
/// 인플레이스 토글이며 애니메이션은 두지 않는다(Android `maxLines`·PWA line-clamp 동일).
/// 피드 하이라이트 카드와 하이라이트 상세가 공용으로 쓴다.
struct FoldableText: View {
    let text: AttributedString
    var font: Font
    var leading: CGFloat
    var alignment: TextAlignment = .center

    @State private var expanded = false

    /// 마크다운(`**화자**`)이 볼드로 변환된 뒤의 순수 텍스트 — Android `text.text` 와 동일
    /// 기준으로 길이/줄바꿈을 센다(`**` 마커 제외).
    private var plain: String { String(text.characters) }
    private var needFold: Bool {
        plain.count > 100 || plain.filter { $0 == "\n" }.count >= 3
    }

    var body: some View {
        let collapsed = needFold && !expanded
        VStack(spacing: 4) {
            Text(text)
                .font(font)
                .foregroundStyle(.espresso)
                .multilineTextAlignment(alignment)
                .bookLeading(size: leading)
                .lineLimit(collapsed ? 4 : nil)
                .fixedSize(horizontal: false, vertical: !collapsed)
                .frame(maxWidth: .infinity)
            if needFold {
                // 카드 전체가 Button 인 곳(피드)에선 이 중첩 Button 이 탭을 가로채
                // 상세 진입(바깥 탭) 대신 펼침/접힘만 토글한다.
                Button { expanded.toggle() } label: {
                    Text(expanded ? "접기" : "더 보기")
                        .font(.bodySans(12))
                        .foregroundStyle(.walnut)
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
