import UserNotifications

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
            openDestination(userInfo: userInfo)
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

    private func openDestination(userInfo: [AnyHashable: Any]) {
        guard let environment,
              let data = userInfo["destination"] as? Data,
              let destination = try? JSONDecoder().decode(AppDestination.self, from: data)
        else { return }
        environment.pendingNotificationDestination = destination
    }
}
