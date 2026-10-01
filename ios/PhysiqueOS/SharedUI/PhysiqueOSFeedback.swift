import UIKit

/// The few moments PhysiqueOS answers with a haptic. Deliberately small:
/// confirmed outcomes only, never navigation, charts, read-only screens or
/// passive refreshes.
enum PhysiqueOSFeedbackEvent: String, Equatable, Sendable {
    /// A genuine new Performance Record celebration became visible.
    case performanceRecordCelebration
    /// A Priority completion was canonically acknowledged in the app.
    case priorityCompleted
    /// A Priority skip was canonically acknowledged in the app.
    case prioritySkipped
}

/// The single seam for haptics, so screens never construct UIKit
/// generators themselves and tests can assert exact events.
@MainActor
protocol PhysiqueOSFeedbackClient: AnyObject {
    func play(_ event: PhysiqueOSFeedbackEvent)
}

/// System haptics. UIKit already honours the device's haptic capability and
/// the Settings > Sounds & Haptics / Accessibility switches, so nothing here
/// second-guesses them. Reduce Motion governs animation, not haptics.
@MainActor
final class SystemFeedbackClient: PhysiqueOSFeedbackClient {
    static let shared = SystemFeedbackClient()

    func play(_ event: PhysiqueOSFeedbackEvent) {
        // A haptic is only perceptible while the app is on screen.
        guard UIApplication.shared.applicationState == .active else { return }
        switch event {
        case .performanceRecordCelebration:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .priorityCompleted:
            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.8)
        case .prioritySkipped:
            UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.5)
        }
    }
}

/// Test/preview client that records events and plays nothing.
@MainActor
final class RecordingFeedbackClient: PhysiqueOSFeedbackClient {
    private(set) var events: [PhysiqueOSFeedbackEvent] = []
    func play(_ event: PhysiqueOSFeedbackEvent) { events.append(event) }
}
