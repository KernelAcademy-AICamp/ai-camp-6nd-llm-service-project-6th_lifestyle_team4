import SwiftUI

/// 실타래 설명 팝업 — 상단바 실타래 칩(또는 MY 잔액 펠릿)을 탭하면 뜬다. Android `YarnInfoDialog`
/// 미러: 삭제된 충전 페이지의 ABOUT 내용을 가벼운 중앙 팝업으로 옮긴 것. 잔액/충전(구매) 진입은
/// 없다 — 적립 전용(App Store 2.1/3.1.1). `RootView` 가 `.popup` 으로 띄운다.
struct YarnInfoView: View {
    @Environment(\.dismissPopup) private var dismissPopup

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button { dismissPopup() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.walnut)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

            Image("daily-script-bar")
                .resizable().scaledToFill()
                .frame(width: 40, height: 40)
                .clipShape(Circle())
            Spacer().frame(height: 12)
            Text("실타래")
                .font(.displaySerif(28))
                .foregroundStyle(.espresso)
            Spacer().frame(height: 6)
            Text("DAILY SCRIPT의 화폐").labelCaps(color: .cta)
            Spacer().frame(height: 20)
            Text("실타래는 명대사가 포함된 명장면을 읽을 때\n지급되는 한 올입니다.")
                .font(.bodySans(15))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
                .bookLeading(size: 15)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 20)
            Text("text(텍스트)의 어원은 라틴어 textere ‘짜다’. 문장은 한 올, 한 올을 엮은 것입니다.")
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
                .multilineTextAlignment(.center)
                .bookLeading(size: 14)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 18)
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.sand.opacity(0.3)))
            Spacer().frame(height: 18)
            Text("실타래로 멋진 테마의 텍스트를 공유해보세요")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 22)
        .padding(.top, 8)
        .padding(.bottom, 22)
    }
}
