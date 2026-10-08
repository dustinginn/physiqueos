import Foundation

/// The one Native answer to "what may an action outside Priority Detail do
/// to this occurrence?", derived only from the Server-owned notification
/// contract (`PriorityNotificationAction`, `ReminderOccurrenceCompletion.js`).
/// Notification categories are chosen from this, never from Priority names.
///
/// Completion and Skip are independent capabilities:
/// - Completion comes from `classification` + `completionCommand`:
///   - `direct_completion_allowed` (an ordinary `priority_detail` reminder,
///     no dose/protocol) is a plain binary completion;
///   - `specialized_workflow_required` with a completion command is Protocol
///     Support (peptide, supplement, recovery): completion carries the
///     Server-planned context (dose/protocol), exactly what Home's check and
///     Priority Detail's default Mark Complete send. Never plain;
///   - anything else (Morning Check-In / weight, Photos, DEXA, open-only)
///     has no direct completion and opens its proper flow.
/// - Skip comes only from the Server's explicit `skipCommand`
///   (`priority.skip.v1`, identity + version, never a dose). The Server
///   offers it for every current open actionable occurrence, including
///   supplements and evidence-backed priorities. Native never infers Skip
///   from a Priority type; a payload without `skipCommand` offers no Skip.
struct PriorityOccurrenceCapabilities: Equatable, Sendable {
    enum Completion: Equatable, Sendable {
        /// No completion outside the app's own flow.
        case none
        /// Plain binary completion: no dose, input or confirmation.
        case plain
        /// Completion with the Server-planned context (e.g. a peptide's
        /// scheduled dose). Not a plain completion.
        case plannedContext
    }

    var completion: Completion
    var skipAllowed: Bool

    var plainCompleteAllowed: Bool { completion == .plain }
    var specializedCompleteAllowed: Bool { completion == .plannedContext }
    /// Kept for Build 78 call sites.
    var specializedCompletion: Bool { specializedCompleteAllowed }
    /// Snooze is offered wherever a direct action is (it never touches the
    /// Server).
    var snoozeAllowed: Bool { completion != .none || skipAllowed }
    /// No direct action at all: the notification only opens the app.
    var requiresDetail: Bool { completion == .none && !skipAllowed }

    static let openOnly = Self(completion: .none, skipAllowed: false)

    static func resolve(_ action: PriorityNotificationAction?) -> Self {
        guard let action else { return .openOnly }
        // DEXA appointment stages are informational/navigation reminders.
        // Keep the notification itself, but never expose Complete or Skip
        // even when an older Server payload carries a generic skip command.
        if action.workflow == "dexa_appointment" || action.workflow == "dexa_evidence" {
            return .openOnly
        }
        return Self(completion: completion(action), skipAllowed: skipAllowed(action))
    }

    private static func completion(_ action: PriorityNotificationAction) -> Completion {
        let command = action.completionCommand.flatMap { command in
            command.commandType == ProductionCommandType.completePriority ? command : nil
        }
        switch action.classification {
        case .openOnly:
            return .none
        case .specializedWorkflowRequired:
            return command == nil ? .none : .plannedContext
        case .directCompletionAllowed:
            guard let command, action.workflow == nil || action.workflow == "priority_detail" else {
                return .none
            }
            // A dose/protocol context means specialized semantics even if a
            // future payload were mislabeled; never treat it as plain.
            guard command.payload.dose == nil, command.payload.protocolId == nil else {
                return .plannedContext
            }
            return .plain
        }
    }

    /// A Server skip command for this exact occurrence (same identity as the
    /// completion command, when there is one).
    private static func skipAllowed(_ action: PriorityNotificationAction) -> Bool {
        guard let skip = action.skipCommand,
              skip.commandType == ProductionCommandType.skipPriority,
              !skip.payload.priorityId.isEmpty, !skip.payload.occurrenceDate.isEmpty
        else { return false }
        if let completion = action.completionCommand {
            return completion.payload.priorityId == skip.payload.priorityId
                && completion.payload.occurrenceDate == skip.payload.occurrenceDate
        }
        return true
    }
}
