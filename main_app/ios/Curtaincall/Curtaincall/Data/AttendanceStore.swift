import Foundation
import Combine

/// 출석체크 — 출석 날짜·보상이 서버 권위(045_attendance.sql / `attendance` 테이블 +
/// `check_in_attendance` RPC). 기존엔 출석 날짜를 UserDefaults(`ds.attendance.history`)에만
/// 두고 보상만 `grant_yarn` 으로 서버 반영해, 재설치/기기변경 시 달력이 비고 로컬 dedup 이라
/// 같은 날 +100 재수령이 가능한 갭이 있었다 → 서버 (user_id, attended_date) UNIQUE 로 닫음.
///
/// 사용자 명세: 회원이 00시(KST) 기준 그날 처음 앱을 열면 한 달 달력 모달을 1회 띄우고,
/// 그날 첫 출석이면 실타래 **+100** 을 지급한다(서버 RPC 가 기록+지급을 원자적으로).
///
/// - 출석 날짜: 서버 `attendance` (loadHistory 로 로드 → `attendedDates`).
/// - `ds.attendance.lastShown`: 모달을 띄운 마지막 날짜(하루 1회 게이트) — 로컬 유지.
@MainActor
final class AttendanceStore: ObservableObject {

    /// 출석 첫 기록 시 지급할 실타래 수 (PWA `ATTENDANCE_REWARD = 100`).
    static let reward = 100

    /// 출석한 날짜 집합 — 달력 렌더링의 단일 출처. 서버에서 로드.
    @Published private(set) var attendedDates: Set<String> = []

    private let lastShownKey = "ds.attendance.lastShown"
    private let defaults = UserDefaults.standard

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

    // MARK: - Daily modal gate (once per day, local)

    /// 오늘 모달을 아직 안 띄웠으면 true.
    func shouldAutoShowToday() -> Bool { defaults.string(forKey: lastShownKey) != todayKey() }
    func markAutoShown() { defaults.set(todayKey(), forKey: lastShownKey) }

    // MARK: - Server-backed attendance

    /// 서버에서 출석한 날짜를 로드(달력용). 실패하면 기존 값 유지.
    func loadHistory() async {
        if let dates = try? await Supa.shared.attendanceHistory() {
            attendedDates = Set(dates)
        }
    }

    /// 오늘(KST) 첫 출석이면 서버가 기록 + 보상(+reward)을 원자적으로 처리.
    /// 반환 [AttendanceCheckIn] — rewarded=true 면 오늘 첫 출석(보상 지급됨), false 면 이미 출석.
    /// 서버가 (user_id, attended_date) UNIQUE 로 dedup → 로컬 삭제/재설치로도 중복 수령 불가.
    func checkIn() async -> AttendanceCheckIn? {
        try? await Supa.shared.checkInAttendance(reward: Self.reward)
    }
}
