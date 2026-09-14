import UserNotifications

/// The notification categories/actions for Actionable Priority
/// Notifications. Only `directCompletion` carries custom actions — per the
/// server-owned classification (`PriorityNotificationAction.Classification`),
/// a specialized or open-only priority must never offer blind direct
/// completion, so both of those categories intentionally have none: tapping
/// the notification body itself (the default action) is their only
/// affordance, which always opens the priority's destination.
enum PriorityNotificationCategory {
    static let directCompletion = "priority.directCompletion"
    static let specializedWorkflow = "priority.specializedWorkflow"
    static let openOnly = "priority.openOnly"
    /// The Evidence Review-ready fallback (Finding 7) — a distinct event,
    /// not a scheduled priority, but registered alongside these since it
    /// shares the same notification infrastructure rather than a second
    /// framework.
    static let evidenceReviewReady = "evidence.reviewReady"

    static func category(for classification: PriorityNotificationAction.Classification) -> String {
        switch classification {
        case .directCompletionAllowed: directCompletion
        case .specializedWorkflowRequired: specializedWorkflow
        case .openOnly: openOnly
        }
    }
}

enum PriorityNotificationActionIdentifier {
    static let complete = "priority.complete"
    static let snooze = "priority.snooze"
}

enum PriorityNotificationCategoryRegistrar {
    /// Registers every category this feature uses. Idempotent — safe to
    /// call on every launch; `UNUserNotificationCenter.setNotificationCategories`
    /// replaces the full set each time rather than accumulating duplicates.
    static func registerCategories(center: UNUserNotificationCenter = .current()) {
        let complete = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.complete,
            title: "Complete",
            options: [.authenticationRequired]
        )
        let snooze = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.snooze,
            title: "Snooze 1 hour",
            options: []
        )
        let directCompletion = UNNotificationCategory(
            identifier: PriorityNotificationCategory.directCompletion,
            actions: [complete, snooze],
            intentIdentifiers: [],
            options: []
        )
        let specializedWorkflow = UNNotificationCategory(
            identifier: PriorityNotificationCategory.specializedWorkflow,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        let openOnly = UNNotificationCategory(
            identifier: PriorityNotificationCategory.openOnly,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        let evidenceReviewReady = UNNotificationCategory(
            identifier: PriorityNotificationCategory.evidenceReviewReady,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([directCompletion, specializedWorkflow, openOnly, evidenceReviewReady])
    }
}
