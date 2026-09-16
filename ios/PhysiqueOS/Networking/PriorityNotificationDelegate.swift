import UserNotifications

/// Main-thread handoff between notification response delivery and SwiftUI's
/// navigation shell. A response may arrive before the root scene exists;
/// retaining it here makes cold launch safe. Request-identifier fencing makes
/// repeated callbacks idempotent while still allowing a later notification
/// for the same destination to navigate normally.
@Observable
final class NotificationDeepLinkCoordinator {
    struct Request: Equatable {
        let identifier: String
        let destination: AppDestination
    }

    private(set) var pendingRequest: Request?
    private var consumedIdentifiers = Set<String>()
    private var consumedOrder: [String] = []

    @MainActor
    @discardableResult
    func enqueue(identifier: String, destination: AppDestination) -> Bool {
        let normalized = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty,
              !consumedIdentifiers.contains(normalized),
              pendingRequest?.identifier != normalized
        else { return false }
        pendingRequest = Request(identifier: normalized, destination: destination)
        return true
    }

    @MainActor
    func consume() -> Request? {
        guard let request = pendingRequest else { return nil }
        pendingRequest = nil
        consumedIdentifiers.insert(request.identifier)
        consumedOrder.append(request.identifier)
        if consumedOrder.count > 128 {
            let expiredCount = consumedOrder.count - 128
            let expired = Array(consumedOrder.prefix(expiredCount))
            consumedOrder.removeFirst(expiredCount)
            consumedIdentifiers.subtract(expired)
        }
        return request
    }
}

/// Handles Actionable Priority Notification responses. `environment` is
/// injected once at launch (`PhysiqueOSApp`) rather than captured at
/// scheduling time, since a response can arrive well after the app that
/// scheduled it was last running.
///
/// `Complete` submits the exact same `priority.complete.v1` command (same
/// canonical identity, same `expectedVersion`/If-Match, same idempotency
/// discipline) the in-app completion path already uses — nothing here
/// re-derives completion semantics. `Snooze 1 hour` never touches the
/// server at all — see `PriorityNotificationScheduler.scheduleSnooze`.
/// Tapping the notification body (or a category with no custom actions —
/// specialized/open-only) always opens the exact same `AppDestination`
/// in-app taps already use, decoded from what the scheduler encoded at
/// scheduling time.
@Observable
final class PriorityNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    private struct CompleteActionPayload: Sendable {
        let commandType: String?
        let expectedVersion: Int?
        let priorityId: String?
        let occurrenceDate: String?
        let dose: String?
        let protocolId: String?

        init(userInfo: [AnyHashable: Any]) {
            commandType = userInfo["commandType"] as? String
            expectedVersion = userInfo["expectedVersion"] as? Int
            priorityId = userInfo["payloadPriorityId"] as? String
            occurrenceDate = userInfo["payloadOccurrenceDate"] as? String
            dose = userInfo["payloadDose"] as? String
            protocolId = userInfo["payloadProtocolId"] as? String
        }
    }

    private struct OpenActionPayload: Sendable {
        let requestIdentifier: String
        let categoryIdentifier: String
        let destinationJSON: String?
        let briefingArtifactId: String?

        init(userInfo: [AnyHashable: Any], requestIdentifier: String, categoryIdentifier: String) {
            self.requestIdentifier = requestIdentifier
            self.categoryIdentifier = categoryIdentifier
            if let value = userInfo["destinationJSON"] as? String {
                destinationJSON = value
            } else if let value = userInfo["destination"] as? Data {
                destinationJSON = String(data: value, encoding: .utf8)
            } else {
                destinationJSON = nil
            }
            briefingArtifactId = userInfo["briefingArtifactId"] as? String
        }
    }

    /// Immutable and installed before the notification center receives this
    /// delegate. Apple may invoke delegate methods off-main; response payloads
    /// are reduced to Sendable values before this environment is touched on
    /// the main actor.
    private let environment: AppEnvironment

    init(environment: AppEnvironment) {
        self.environment = environment
        super.init()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        switch response.actionIdentifier {
        case PriorityNotificationActionIdentifier.complete:
            await handleComplete(payload: CompleteActionPayload(userInfo: userInfo))
        case PriorityNotificationActionIdentifier.snooze:
            await PriorityNotificationScheduler.scheduleSnooze(for: response.notification.request)
        case UNNotificationDefaultActionIdentifier:
            await openDestination(payload: OpenActionPayload(
                userInfo: userInfo,
                requestIdentifier: response.notification.request.identifier,
                categoryIdentifier: response.notification.request.content.categoryIdentifier
            ))
        default:
            break
        }
    }

    @MainActor
    private func handleComplete(payload: CompleteActionPayload) async {
        guard let commandType = payload.commandType,
              commandType == ProductionCommandType.completePriority,
              let expectedVersion = payload.expectedVersion,
              let priorityId = payload.priorityId,
              let occurrenceDate = payload.occurrenceDate
        else {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.invalid-payload",
                operation: "completion not dispatched",
                reason: "The notification did not carry the complete canonical command contract.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
            return
        }
        // Best-effort: there is no UI here to surface a failure to. A
        // network failure or stale version simply leaves the occurrence
        // exactly as it was — the Founder can still complete it normally
        // in-app, where a real failure path exists. Never fabricate
        // success by suppressing the notification locally without this
        // command actually succeeding.
        do {
            try await environment.priorityCompletionWriteAPI.complete(
                priorityId: priorityId,
                occurrenceDate: occurrenceDate,
                context: PriorityCompletionContext(
                    occurrenceDate: occurrenceDate,
                    dose: payload.dose,
                    protocolId: payload.protocolId
                ),
                expectedVersion: expectedVersion
            )
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion accepted",
                reason: "The canonical specialized completion command succeeded.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
        } catch {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion rejected",
                reason: "The canonical completion command did not succeed; the occurrence remains unchanged.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
        }
    }

    @MainActor
    private func openDestination(payload: OpenActionPayload) async {
        do {
            let destination = try Self.validatedDestination(
                destinationJSON: payload.destinationJSON,
                briefingArtifactId: payload.briefingArtifactId,
                categoryIdentifier: payload.categoryIdentifier
            )
            let accepted = environment.notificationDeepLinkCoordinator.enqueue(
                identifier: payload.requestIdentifier,
                destination: destination
            )
            recordOpenResult(
                identifier: payload.requestIdentifier,
                operation: accepted ? "deep link queued" : "deep link ignored",
                reason: accepted
                    ? "The exact notification destination is queued for the ready navigation scene."
                    : "This notification response was already queued or consumed."
            )
        } catch {
            recordOpenResult(
                identifier: payload.requestIdentifier,
                operation: "deep link rejected",
                reason: "The notification did not carry a valid exact destination."
            )
        }
    }

    static func decodeDestination(userInfo: [AnyHashable: Any]) throws -> AppDestination {
        let destinationJSON: String?
        if let encoded = userInfo["destinationJSON"] as? String,
           !encoded.isEmpty {
            destinationJSON = encoded
        } else if let value = userInfo["destination"] as? Data {
            // Backward-compatible with Build 36 priority/review requests.
            destinationJSON = String(data: value, encoding: .utf8)
        } else {
            throw NotificationDestinationError.missingDestination
        }
        return try decodeDestination(destinationJSON: destinationJSON)
    }

    private static func decodeDestination(destinationJSON: String?) throws -> AppDestination {
        guard let destinationJSON, let data = destinationJSON.data(using: .utf8) else {
            throw NotificationDestinationError.missingDestination
        }
        return try JSONDecoder().decode(AppDestination.self, from: data)
    }

    static func validatedDestination(
        userInfo: [AnyHashable: Any],
        categoryIdentifier: String
    ) throws -> AppDestination {
        try validatedDestination(
            destinationJSON: (userInfo["destinationJSON"] as? String)
                ?? (userInfo["destination"] as? Data).flatMap { String(data: $0, encoding: .utf8) },
            briefingArtifactId: userInfo["briefingArtifactId"] as? String,
            categoryIdentifier: categoryIdentifier
        )
    }

    private static func validatedDestination(
        destinationJSON: String?,
        briefingArtifactId: String?,
        categoryIdentifier: String
    ) throws -> AppDestination {
        let destination = try decodeDestination(destinationJSON: destinationJSON)
        guard categoryIdentifier == PriorityNotificationCategory.briefingReady else {
            return destination
        }
        guard case .briefingDetail(let briefingId) = destination,
              !briefingId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let sealedId = briefingArtifactId,
              sealedId == briefingId
        else { throw NotificationDestinationError.invalidBriefingIdentity }
        return destination
    }

    @MainActor
    private func recordOpenResult(identifier: String, operation: String, reason: String) {
        NotificationDiagnostics.record(.init(
            capturedAt: Date(), identifier: identifier,
            operation: operation, reason: reason,
            fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
        ))
    }
}

private enum NotificationDestinationError: Error {
    case missingDestination
    case invalidBriefingIdentity
}
