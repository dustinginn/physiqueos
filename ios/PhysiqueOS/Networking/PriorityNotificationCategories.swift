import UserNotifications

/// The notification categories/actions for Actionable Priority
/// Notifications, chosen from `PriorityOccurrenceCapabilities` (derived from
/// the Server-owned classification), never from Priority names:
/// - `simpleCompletion`: a simple binary Priority — Complete (check-circle),
///   Skip, Snooze.
/// - `specializedActionable`: completion with the Server-planned context
///   (peptide dose) — Complete, Snooze; never Skip, never plain completion.
/// - `specializedWorkflow` / `openOnly`: no custom actions; tapping the
///   notification opens the proper flow (Morning Check-In, Photos, ...).
/// - `directCompletion`: the pre-Build 78 simple category (Complete,
///   Snooze). Still registered so already-delivered notifications keep
///   working; new requests use `simpleCompletion`.
///
/// iOS shows custom actions only when a notification is expanded (long
/// press / pull down on a banner, swipe left > View on the Lock Screen).
/// Third-party apps cannot put a control on the collapsed banner, so the
/// closest supported Reminders-style affordance is a first-position
/// Complete action with a check-circle symbol.
enum PriorityNotificationCategory {
    static let simpleCompletion = "priority.simpleCompletion"
    static let directCompletion = "priority.directCompletion"
    static let specializedWorkflow = "priority.specializedWorkflow"
    static let specializedActionable = "priority.specializedActionable"
    static let openOnly = "priority.openOnly"
    /// The Evidence Review-ready fallback (Finding 7) — a distinct event,
    /// not a scheduled priority, but registered alongside these since it
    /// shares the same notification infrastructure rather than a second
    /// framework.
    static let evidenceReviewReady = "evidence.reviewReady"
    /// Published Coaching briefings are a separate canonical event from
    /// evidence review readiness. They carry no mutation actions; tapping
    /// opens the exact published artifact.
    static let briefingReady = "briefing.ready"

    static func category(for action: PriorityNotificationAction) -> String {
        let capabilities = PriorityOccurrenceCapabilities.resolve(action)
        switch capabilities.completion {
        case .plain: return capabilities.skipAllowed ? simpleCompletion : directCompletion
        case .plannedContext: return specializedActionable
        case .none:
            return action.classification == .openOnly ? openOnly : specializedWorkflow
        }
    }

    /// The categories whose Skip action may reach canonical Skip. A Skip
    /// response from any other category is refused before any write.
    static func allowsSkip(_ categoryIdentifier: String) -> Bool {
        categoryIdentifier == simpleCompletion
    }
}

enum PriorityNotificationActionIdentifier {
    static let complete = "priority.complete"
    static let skip = "priority.skip"
    static let snooze = "priority.snooze"
}

enum PriorityNotificationCategoryRegistrar {
    /// Registers every category this feature uses. Idempotent — safe to
    /// call on every launch; `UNUserNotificationCenter.setNotificationCategories`
    /// replaces the full set each time rather than accumulating duplicates.
    static func registerCategories(center: UNUserNotificationCenter = .current()) {
        center.setNotificationCategories(categories())
    }

    /// The registered set, separate from the notification center so tests
    /// can check every category's exact actions and options.
    static func categories() -> Set<UNNotificationCategory> {
        // Background actions (no `.foreground`): they run without opening
        // the app. `.authenticationRequired` because the canonical write
        // needs the device unlocked (the refresh credential is a
        // when-unlocked Keychain item); on a locked phone iOS asks for
        // Face ID / passcode first.
        let simpleComplete = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.complete,
            title: "Complete",
            options: [.authenticationRequired],
            icon: UNNotificationActionIcon(systemImageName: "checkmark.circle")
        )
        let skip = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.skip,
            title: "Skip",
            options: [.authenticationRequired],
            icon: UNNotificationActionIcon(systemImageName: "forward.end")
        )
        let complete = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.complete,
            title: "Complete",
            options: [.authenticationRequired]
        )
        let snooze = UNNotificationAction(
            identifier: PriorityNotificationActionIdentifier.snooze,
            title: "Snooze 1 hour",
            options: [],
            icon: UNNotificationActionIcon(systemImageName: "clock")
        )
        let simpleCompletion = UNNotificationCategory(
            identifier: PriorityNotificationCategory.simpleCompletion,
            actions: [simpleComplete, skip, snooze],
            intentIdentifiers: [],
            options: []
        )
        let directCompletion = UNNotificationCategory(
            identifier: PriorityNotificationCategory.directCompletion,
            actions: [simpleComplete, snooze],
            intentIdentifiers: [],
            options: []
        )
        let specializedWorkflow = UNNotificationCategory(
            identifier: PriorityNotificationCategory.specializedWorkflow,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        let specializedActionable = UNNotificationCategory(
            identifier: PriorityNotificationCategory.specializedActionable,
            actions: [complete, snooze],
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
        let briefingReady = UNNotificationCategory(
            identifier: PriorityNotificationCategory.briefingReady,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        return [
            simpleCompletion, directCompletion, specializedWorkflow, specializedActionable,
            openOnly, evidenceReviewReady, briefingReady,
        ]
    }
}
