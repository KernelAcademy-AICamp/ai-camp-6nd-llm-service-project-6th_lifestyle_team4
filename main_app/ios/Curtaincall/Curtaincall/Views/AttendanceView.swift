import SwiftUI

/// 출석체크 달력 — 이번 달 그리드, 출석한 날에 실타래 표시, 오늘 강조.
/// PWA `buildAttendanceCalendarHTML` / 출석 모달 미러. 두 곳에서 재사용:
///   · 하루 첫 진입 자동 모달 (rewarded=true 면 +100 배너 표시)
///   · MY 의 '출석체크 — 내 출석현황 보기' (rewarded=false, 보기 전용)
struct AttendanceView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var attendance: AttendanceStore

    /// 오늘 첫 출석으로 +100 을 막 받았는지 — true 면 보상 배너를 보여준다.
    var rewarded: Bool = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
    private let weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"]

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 0) {
                    if rewarded {
                        rewardBanner
                        Spacer().frame(height: 18)
                    } else {
                        Spacer().frame(height: 20)   // 연월 위 여백 — 제목과의 간격 (보상 배너 없을 때)
                    }
                    Text(monthTitle)
                        .font(.titleSerif(18))
                        .foregroundStyle(.espresso)
                    Spacer().frame(height: 20)        // 연월 아래 여백 — 요일 행과의 간격 (16→20)
                    weekdayHeader
                    Spacer().frame(height: 8)
                    grid
                    Spacer().frame(height: 24)
                    Text("매일 출석으로 실타래를 모아보세요.")
                        .font(.bodySans(13))
                        .foregroundStyle(.walnut)
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
            }
        }
        .padding(.top, SheetMetrics.grabberTop)   // 그래버 ↔ 헤더 여백(공통 표준)
        .background(Color.paper)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { await attendance.loadHistory() }   // 열 때마다 서버 출석 기록으로 달력 갱신
    }

    private var header: some View {
        HStack {
            Text("출석체크")
                .font(.headlineSerif(20))
                .foregroundStyle(.espresso)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.walnut)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, SheetMetrics.cardPadding)
        .padding(.trailing, 8)
        .frame(height: SheetMetrics.headerHeight)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private var rewardBanner: some View {
        HStack(spacing: 10) {
            Image("daily-script-bar")
                .resizable()
                .scaledToFill()
                .frame(width: 26, height: 26)
                .clipShape(Circle())
            Text("출석체크 완료! 실타래 +\(AttendanceStore.reward)")
                .font(.bodySans(14))
                .foregroundStyle(.espresso)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.sand.opacity(0.30)))
        .padding(.top, 18)
    }

    private var weekdayHeader: some View {
        HStack(spacing: 4) {
            ForEach(Array(weekdayLabels.enumerated()), id: \.offset) { idx, label in
                Text(label)
                    .font(.custom("Pretendard-Medium", size: 11))
                    .foregroundStyle(idx == 0 ? Color.cta : .walnut)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(0..<leadingBlanks, id: \.self) { _ in
                Color.clear.frame(height: 44)
            }
            ForEach(monthDays, id: \.self) { day in
                dayCell(day)
            }
        }
    }

    private func dayCell(_ day: Int) -> some View {
        let key = dayKey(day)
        let attended = attendance.isAttended(key)
        let isToday = key == attendance.todayKey()
        return VStack(spacing: 2) {
            Text("\(day)")
                .font(.custom("Pretendard-Medium", size: 11))
                .foregroundStyle(attended ? .espresso : .walnut)
            ZStack {
                if attended {
                    Image("daily-script-bar")
                        .resizable()
                        .scaledToFill()
                        .frame(width: 20, height: 20)
                        .clipShape(Circle())
                }
            }
            .frame(height: 20)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(attended ? Color.sand.opacity(0.35) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isToday ? Color.cta : Color.clear, lineWidth: 1.5)
        )
    }

    // MARK: - Month math (current month, local calendar)

    private var calendar: Calendar { Calendar.current }
    private var monthStart: Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: Date())) ?? Date()
    }
    /// Empty leading cells before day 1 (weekday 1 = Sunday → 0 blanks).
    private var leadingBlanks: Int { calendar.component(.weekday, from: monthStart) - 1 }
    private var monthDays: [Int] {
        Array(1...(calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30))
    }

    private var monthTitle: String {
        let c = calendar.dateComponents([.year, .month], from: Date())
        return "\(c.year ?? 0)년 \(c.month ?? 0)월"
    }

    private func dayKey(_ day: Int) -> String {
        guard let date = calendar.date(byAdding: .day, value: day - 1, to: monthStart) else { return "" }
        return AttendanceStore.dateKey(date)
    }
}
