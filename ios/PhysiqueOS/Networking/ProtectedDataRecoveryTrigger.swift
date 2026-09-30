import Foundation
import UIKit

/// Runs a recovery action when protected data becomes available (first unlock
/// after a locked HealthKit wake). Installed once per process; a repeated
/// install replaces nothing and adds no second observer. The action itself is
/// expected to be coalescing (the HealthKit bootstrap is), so a burst of
/// unlock notifications cannot start overlapping work.
final class ProtectedDataRecoveryTrigger: @unchecked Sendable {
    private static let lock = NSLock()
    // Guarded by `lock`.
    nonisolated(unsafe) private static var installed: [ObjectIdentifier: ProtectedDataRecoveryTrigger] = [:]

    private let center: NotificationCenter
    private var token: NSObjectProtocol?

    private init(center: NotificationCenter, action: @escaping @Sendable () -> Void) {
        self.center = center
        self.token = center.addObserver(
            forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil,
            queue: nil
        ) { _ in action() }
    }

    deinit {
        if let token { center.removeObserver(token) }
    }

    /// Returns `true` when this call installed the observer, `false` when the
    /// center already had one (idempotent).
    @discardableResult
    static func install(
        center: NotificationCenter = .default,
        action: @escaping @Sendable () -> Void
    ) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let key = ObjectIdentifier(center)
        guard installed[key] == nil else { return false }
        installed[key] = ProtectedDataRecoveryTrigger(center: center, action: action)
        return true
    }

    /// Test seam only.
    static func uninstall(center: NotificationCenter) {
        lock.lock(); defer { lock.unlock() }
        installed.removeValue(forKey: ObjectIdentifier(center))
    }
}
