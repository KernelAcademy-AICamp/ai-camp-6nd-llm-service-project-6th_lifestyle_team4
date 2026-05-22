import Combine
import SwiftUI

struct TodaysNoteCard: View {
    let card: Card
    @State private var now: Date = .now

    private var expiresAt: Date {
        if let real = card.expiresAt { return real }
        return Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
    }

    private var timeRemaining: String {
        let secs = max(0, Int(expiresAt.timeIntervalSince(now)))
        let h = secs / 3600
        let m = (secs % 3600) / 60
        let s = secs % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }

    private var isClosed: Bool {
        expiresAt.timeIntervalSince(now) <= 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Text("TODAY · 오늘의 노트")
                    .labelCaps(color: .highlight)
                Spacer()
                if !isClosed {
                    Text("LIVE")
                        .font(.uiSans(10, weight: .medium))
                        .tracking(0.2)
                        .foregroundStyle(.espresso)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.highlight))
                }
            }

            Text(isClosed ? "오늘 마감" : timeRemaining)
                .font(.numericSerif(32))
                .foregroundStyle(.paper)
                .monospacedDigit()

            Rectangle()
                .fill(Color.walnut.opacity(0.4))
                .frame(height: 0.5)

            Text(card.work.title)
                .font(.titleSerif(18))
                .foregroundStyle(.paper)
                .fixedSize(horizontal: false, vertical: true)

            Text("오늘 안에 읽으면 라이브러리에 저장돼요")
                .font(.bodySans(13))
                .foregroundStyle(.sand)
                .bookLeading(size: 13)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.espresso)
        )
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { tick in
            now = tick
        }
    }
}

#Preview {
    TodaysNoteCard(card: .sample)
        .padding()
        .background(Color.paper)
}
