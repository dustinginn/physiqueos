import Foundation

/// The one Native answer to "what may an action outside Priority Detail do
/// to this occurrence?", derived only from the Server-owned notification
/// contract (`PriorityNotificationAction`, `ReminderOccurrenceCompletion.js`).
/// Notification categories are chosen from this, never from Priority names.
///
/// Server mapping it mirrors (current canonical contract):
/// - `direct_completion_allowed` is produced only for an ordinary
///   `priority_detail` reminder that is completable with a known version
///   (never Morning Check-In / weight, Progress Photos, DEXA, or peptide /
///   supplement / recovery Support, which are specialized). That is the
///   family `isPrioritySkipSupportedReminder` accepts, and
///   `prioritySkipCommand` uses the same identity and version as its
///   completion command. So it is a simple binary Priority: plain
///   completion and canonical Skip. This is a Native mapping, not a Server
///   capability: the Server still decides at write time and refuses a
///   skip it does not support (e.g. a past-day occurrence, or an orphaned
///   Support-type reminder), which changes nothing. Future migration: the
///   Server publishes a skip command in `notificationAction`.
/// - `specialized_workflow_required` with a completion command is Protocol
///   Support (peptide, supplement, recovery). Its completion carries the
///   Server-planned context (dose/protocol) — the same command Home's check
///   and Priority Detail's default "Mark Complete" send. It is never a plain
///   completion and never offers Skip here: the contract does not say which
///   Support family may skip (supplements may not), so that stays in
///   Priority Detail until the Server exposes skip in this contract.
/// - Everything else (Morning Check-In, Photos, DEXA, open-only) has no
///   direct action and opens its proper flow.
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
    /// Completion needs the app (detail/form/input); no direct action.
    var requiresDetail: Bool { completion == .none }
    var specializedCompletion: Bool { completion == .plannedContext }

    static let openOnly = Self(completion: .none, skipAllowed: false)

    static func resolve(_ action: PriorityNotificationAction?) -> Self {
        guard let action else { return .openOnly }
        let command = action.completionCommand.flatMap { command in
            command.commandType == ProductionCommandType.completePriority ? command : nil
        }
        switch action.classification {
        case .openOnly:
            return .openOnly
        case .specializedWorkflowRequired:
            return command == nil ? .openOnly : Self(completion: .plannedContext, skipAllowed: false)
        case .directCompletionAllowed:
            guard let command, action.workflow == nil || action.workflow == "priority_detail" else {
                return .openOnly
            }
            // A dose/protocol context means specialized semantics even if a
            // future payload were mislabeled; never treat it as plain.
            guard command.payload.dose == nil, command.payload.protocolId == nil else {
                return Self(completion: .plannedContext, skipAllowed: false)
            }
            return Self(completion: .plain, skipAllowed: true)
        }
    }
}
