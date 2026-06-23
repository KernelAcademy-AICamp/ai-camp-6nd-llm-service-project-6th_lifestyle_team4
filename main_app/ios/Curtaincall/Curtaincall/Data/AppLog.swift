import Foundation
import os
import AuthenticationServices

/// 단일 로깅 경로 — 실제 오류를 사용자에게 빨간 배너로 던지는 대신 os_log 로 기록한다.
/// (분석/크래시 SDK 도입 금지 — AGENTS.md. 원격 로그 싱크가 생기면 여기만 바꾸면 됨.)
/// 취소성 오류(무해)는 배너로 띄우지 않도록 판별 헬퍼도 제공한다.
enum AppLog {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.curtaincall.Curtaincall",
        category: "app"
    )

    /// 실제(취소 아님) 오류 — 기록만 하고 UI 로 노출하지 않거나, 일반 안내만 띄운다.
    static func error(_ context: String, _ error: Error) {
        logger.error("\(context, privacy: .public): \(String(describing: error), privacy: .public)")
    }

    /// 무해한 취소 등 — 디버그 레벨로만.
    static func debug(_ message: String) {
        logger.debug("\(message, privacy: .public)")
    }

    /// Task/네트워크 취소 — 새 요청이 in-flight 요청을 대체할 때 발생(예: 피드 새로고침
    /// 중복). 무해하므로 배너로 띄우지 않는다. (Swift.CancellationError / URLError.cancelled)
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }

    /// 웹 인증 시트 / Apple 시트를 사용자가 취소·닫음 — 정상 흐름이므로 무음 no-op.
    /// (ASWebAuthenticationSessionError.canceledLogin / ASAuthorizationError.canceled;
    ///  Supabase 등이 래핑한 경우 문자열 폴백.)
    static func isAuthCancellation(_ error: Error) -> Bool {
        if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { return true }
        if let e = error as? ASAuthorizationError, e.code == .canceled { return true }
        return error.localizedDescription.lowercased().contains("cancel")
    }
}
