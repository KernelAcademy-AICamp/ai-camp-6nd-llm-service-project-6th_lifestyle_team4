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
