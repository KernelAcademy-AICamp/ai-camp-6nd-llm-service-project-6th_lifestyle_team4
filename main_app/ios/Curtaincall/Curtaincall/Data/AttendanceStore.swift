import Foundation
import Combine

/// 출석체크 — faithful port of the PWA attendance module
/// (`web_pwa/public/m/assets/m-app.js`: `maybeShowAttendance` / `markAttendanceToday`).
///
/// 사용자 명세: 00시(로컬 자정) 기준 그날 처음 앱을 열면 한 달 달력 모달을 1회 띄우고,
/// 그날 첫 출석이면 실타래 **+5** 를 지급한다. 보상 지급은 `YarnStore.grant(_:)` 가 담당.
///
/// - `ds.attendance.history`  — 출석한 날짜(`yyyy-MM-dd`, 로컬) 집합. PWA 키와 동일.
/// - `ds.attendance.lastShown` — 모달을 띄운 마지막 날짜(하루 1회 제한).
@MainActor
final class AttendanceStore: ObservableObject {

    /// 출석 첫 기록 시 지급할 실타래 수 (PWA `ATTENDANCE_REWARD = 100`).
    static let reward = 100

    /// 출석한 날짜 집합 — 달력 렌더링의 단일 출처.
    @Published private(set) var attendedDates: Set<String> = []

    private let historyKey = "ds.attendance.history"
    private let lastShownKey = "ds.attendance.lastShown"
    private let defaults = UserDefaults.standard

    init() {
        attendedDates = Set(defaults.stringArray(forKey: historyKey) ?? [])
    }

    // MARK: - Date keys (local, mirrors PWA todayStr)

    private static let keyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    func todayKey() -> String { Self.keyFormatter.string(from: Date()) }
    static func dateKey(_ date: Date) -> String { keyFormatter.string(from: date) }

    func isAttended(_ key: String) -> Bool { attendedDates.contains(key) }

    // MARK: - Daily modal gate (once per day)

    /// 오늘 모달을 아직 안 띄웠으면 true.
    func shouldAutoShowToday() -> Bool { defaults.string(forKey: lastShownKey) != todayKey() }
    func markAutoShown() { defaults.set(todayKey(), forKey: lastShownKey) }

    // MARK: - Attendance record

    /// 오늘을 출석 기록에 추가. 처음이면 true(=보상 대상), 이미 있으면 false.
    @discardableResult
    func registerToday() -> Bool {
        let key = todayKey()
        guard !attendedDates.contains(key) else { return false }
        attendedDates.insert(key)
        defaults.set(Array(attendedDates), forKey: historyKey)
        return true
    }
}
