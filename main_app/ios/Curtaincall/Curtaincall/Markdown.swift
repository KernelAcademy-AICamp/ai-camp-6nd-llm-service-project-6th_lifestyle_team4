import Foundation

extension String {
    /// `**…**` 마크다운 마커를 볼드 span 으로 변환한 AttributedString.
    /// LLM 출력이 `**크레온**` 같이 화자 라벨에 마커를 포함해 들어올 때 원시 `**` 가 그대로
    /// 노출되던 문제 보정. inlineOnlyPreservingWhitespace 로 줄바꿈·공백 보존.
    var markdownBold: AttributedString {
        let opts = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: self, options: opts))
            ?? AttributedString(self)
    }
}
