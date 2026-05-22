import SwiftUI

struct ScheduleCard: View {
    let publishAt: Date
    let title: String

    private var daysAway: Int {
        let cal = Calendar.current
        let start = cal.startOfDay(for: .now)
        let target = cal.startOfDay(for: publishAt)
        return cal.dateComponents([.day], from: start, to: target).day ?? 0
    }

    private var dDayText: String {
        let d = daysAway
        if d <= 0 { return "D-DAY" }
        return "D-\(d)"
    }

    private var dDayColor: Color {
        daysAway <= 1 ? .cta : .walnut
    }

    private var formattedDate: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "M월 d일 공개"
        return f.string(from: publishAt)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dDayText)
                .font(.uiSans(11, weight: .medium))
                .tracking(0.2)
                .foregroundStyle(dDayColor)
            Text(formattedDate)
                .font(.metaSans(11))
                .foregroundStyle(.walnut)
            Spacer(minLength: 8)
            Text(title)
                .font(.titleSerif(14))
                .foregroundStyle(.espresso)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
        .background(Color.latte)
    }
}

#Preview {
    HStack(spacing: 8) {
        ScheduleCard(publishAt: .now.addingTimeInterval(86_400), title: "내일 공개될 한 편의 각본")
        ScheduleCard(publishAt: .now.addingTimeInterval(86_400 * 2), title: "잔잔한 어느 오후")
        ScheduleCard(publishAt: .now.addingTimeInterval(86_400 * 4), title: "다음 주의 다른 호흡")
    }
    .padding()
    .background(Color.paper)
}
