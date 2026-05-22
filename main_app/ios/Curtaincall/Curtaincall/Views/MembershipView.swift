import SwiftUI

struct MembershipView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Plan = .unlimited

    enum Plan { case daily, unlimited }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    intro
                    VStack(spacing: 16) {
                        planCard(
                            plan: .daily,
                            title: "오늘의 노트",
                            price: "5,900원",
                            cadence: "월",
                            description: "매일 한 편, 24시간 안에 읽기.",
                            recommended: false
                        )
                        planCard(
                            plan: .unlimited,
                            title: "무제한 노트",
                            price: "9,900원",
                            cadence: "월",
                            description: "모든 지난 노트와 라이브러리 저장.",
                            recommended: true
                        )
                    }
                    Spacer(minLength: 16)
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 100)
            }
        }
        .background(Color.paper)
        .overlay(alignment: .bottom) {
            VStack(spacing: 0) {
                Hairline()
                Button(action: {}) {
                    Text("롱블랙 지금 시작하기").editorialButton(style: .filled)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .background(Color.paper)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.espresso)
                    .frame(width: 32, height: 32, alignment: .leading)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("멤버십").labelCaps(color: .espresso)
            Spacer()
            Color.clear.frame(width: 32, height: 32)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("플랜을 골라보세요")
                .font(.displaySerif(32))
                .foregroundStyle(.espresso)
            Text("매일 한 편의 각본, 또는 모든 호흡까지.")
                .font(.bodySans(14))
                .foregroundStyle(.walnut)
                .bookLeading(size: 14)
        }
    }

    private func planCard(
        plan: Plan,
        title: String,
        price: String,
        cadence: String,
        description: String,
        recommended: Bool
    ) -> some View {
        let isSelected = selected == plan
        return Button {
            selected = plan
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title)
                        .font(.headlineSerif(20))
                        .foregroundStyle(.espresso)
                    Spacer()
                    if recommended {
                        Text("추천")
                            .font(.uiSans(10, weight: .medium))
                            .tracking(0.2)
                            .foregroundStyle(.paper)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.cta))
                    }
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(price)
                        .font(.numericSerif(28))
                        .foregroundStyle(.espresso)
                        .monospacedDigit()
                    Text("/ \(cadence)")
                        .font(.metaSans(12))
                        .foregroundStyle(.walnut)
                }
                Text(description)
                    .font(.bodySans(14))
                    .foregroundStyle(.walnut)
                    .bookLeading(size: 14)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.paper)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.cta : Color.latte, lineWidth: isSelected ? 1 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack { MembershipView() }
}
