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
            let expired = consumedOrder.removeFirst(consumedOrder.count - 128)
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
final class PriorityNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    var environment: AppEnvironment?

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
            await handleComplete(userInfo: userInfo)
        case PriorityNotificationActionIdentifier.snooze:
            await PriorityNotificationScheduler.scheduleSnooze(for: response.notification.request)
        case UNNotificationDefaultActionIdentifier:
            await openDestination(
                userInfo: userInfo,
                requestIdentifier: response.notification.request.identifier,
                categoryIdentifier: response.notification.request.content.categoryIdentifier
            )
        default:
            break
        }
    }

    private func handleComplete(userInfo: [AnyHashable: Any]) async {
        guard let environment else {
            await NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.unavailable",
                operation: "completion not dispatched",
                reason: "The notification response arrived before the application environment was available.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
            return
        }
        guard let commandType = userInfo["commandType"] as? String,
              commandType == ProductionCommandType.completePriority,
              let expectedVersion = userInfo["expectedVersion"] as? Int,
              let priorityId = userInfo["payloadPriorityId"] as? String,
              let occurrenceDate = userInfo["payloadOccurrenceDate"] as? String
        else {
            await NotificationDiagnostics.record(.init(
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
                    dose: userInfo["payloadDose"] as? String,
                    protocolId: userInfo["payloadProtocolId"] as? String
                ),
                expectedVersion: expectedVersion
            )
            await NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion accepted",
                reason: "The canonical specialized completion command succeeded.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
        } catch {
            await NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion rejected",
                reason: "The canonical completion command did not succeed; the occurrence remains unchanged.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
        }
    }

    private func openDestination(
        userInfo: [AnyHashable: Any],
        requestIdentifier: String,
        categoryIdentifier: String
    ) async {
        guard let environment else {
            await recordOpenResult(identifier: requestIdentifier, operation: "deep link rejected", reason: "The application environment was unavailable.")
            return
        }
        do {
            let destination = try Self.validatedDestination(
                userInfo: userInfo,
                categoryIdentifier: categoryIdentifier
            )
            let accepted = await environment.notificationDeepLinkCoordinator.enqueue(
                identifier: requestIdentifier,
                destination: destination
            )
            await recordOpenResult(
                identifier: requestIdentifier,
                operation: accepted ? "deep link queued" : "deep link ignored",
                reason: accepted
                    ? "The exact notification destination is queued for the ready navigation scene."
                    : "This notification response was already queued or consumed."
            )
        } catch {
            await recordOpenResult(
                identifier: requestIdentifier,
                operation: "deep link rejected",
                reason: "The notification did not carry a valid exact destination."
            )
        }
    }

    static func decodeDestination(userInfo: [AnyHashable: Any]) throws -> AppDestination {
        let data: Data
        if let encoded = userInfo["destinationJSON"] as? String,
           let value = encoded.data(using: .utf8) {
            data = value
        } else if let value = userInfo["destination"] as? Data {
            // Backward-compatible with Build 36 priority/review requests.
            data = value
        } else {
            throw NotificationDestinationError.missingDestination
        }
        return try JSONDecoder().decode(AppDestination.self, from: data)
    }

    static func validatedDestination(
        userInfo: [AnyHashable: Any],
        categoryIdentifier: String
    ) throws -> AppDestination {
        let destination = try decodeDestination(userInfo: userInfo)
        guard categoryIdentifier == PriorityNotificationCategory.briefingReady else {
            return destination
        }
        guard case .briefingDetail(let briefingId) = destination,
              !briefingId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let sealedId = userInfo["briefingArtifactId"] as? String,
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
