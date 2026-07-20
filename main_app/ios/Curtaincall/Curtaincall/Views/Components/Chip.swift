import SwiftUI

struct Chip: View {
    let text: String
    var filled: Bool = false
    /// 채움 색 오버라이드 — 장르별 가죽 톤(WorkFormat.chipColor). nil 이면 기본 espresso.
    var fillColor: Color? = nil

    /// 실제 채움 색 — filled 일 때만 유효. fillColor 우선, 없으면 espresso.
    private var effectiveFill: Color { fillColor ?? .espresso }

    var body: some View {
        Text(text.uppercased())
            .font(.custom("Pretendard-Medium", size: 11))
            .tracking(11 * 0.2)
            .foregroundStyle(filled ? Color.paper : .walnut)
            .frame(minWidth: 44, minHeight: 22)
            .padding(.horizontal, 10)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(filled ? effectiveFill : Color.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(filled ? effectiveFill : Color.latte, lineWidth: 1)
            )
    }
}

#Preview {
    HStack(spacing: 8) {
        Chip(text: "movie", filled: true)
        Chip(text: "first love", filled: false)
    }
    .padding()
    .background(Color.paper)
}
