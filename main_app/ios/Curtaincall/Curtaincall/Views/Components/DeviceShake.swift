import SwiftUI
import UIKit

extension Notification.Name {
    /// Posted app-wide whenever the device is physically shaken.
    static let deviceDidShake = Notification.Name("CurtaincallDeviceDidShake")
}

/// The key window sits in the responder chain, so motion events bubble up to it
/// regardless of which view is focused. Re-posting as a notification lets any
/// SwiftUI view observe shakes via `.onShake { }` without owning a custom window.
/// (`motionEnded(_:with:)` is an @objc UIResponder method, so overriding it in an
/// extension is permitted and is the standard SwiftUI shake recipe.)
extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        super.motionEnded(motion, with: event)
        if motion == .motionShake {
            NotificationCenter.default.post(name: .deviceDidShake, object: nil)
        }
    }
}

private struct DeviceShakeViewModifier: ViewModifier {
    let action: () -> Void

    func body(content: Content) -> some View {
        content.onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
            action()
        }
    }
}

extension View {
    /// Fires `action` when the device is physically shaken (app-wide). Callers are
    /// responsible for their own gating/debounce — a single shake can post once.
    func onShake(perform action: @escaping () -> Void) -> some View {
        modifier(DeviceShakeViewModifier(action: action))
    }
}

enum ShakeGate {
    /// True when ANY UIKit modal is currently presented in the foreground scene —
    /// SwiftUI `.sheet` / `.fullScreenCover`, `.alert`, action sheets, etc. Walks
    /// the window's presentation chain, so it catches modals owned by child views
    /// (e.g. Feed composer, My Page profile/attendance sheets) that RootView can't
    /// see via its own @State. Used to suppress shake handling so the random peek is
    /// never presented over an existing modal. (Navigation pushes are NOT modals, so
    /// detail screens are handled separately by the active tab's NavigationPath.)
    @MainActor
    static func isPresentingModal() -> Bool {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let keyWindow = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        return keyWindow?.rootViewController?.presentedViewController != nil
    }
}
