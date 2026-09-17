import UserNotifications

/// Owns Apple's response completion closure without allowing the
/// `UNNotificationResponse` itself to escape the delegate callback. The
/// lock is deliberately tiny: it enforces exactly-once completion for every
/// exit (success, invalid payload, missing environment, duplicate callback,
/// or thrown task cancellation) while the actual action runs on MainActor.
final class NotificationResponseCompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var completion: (() -> Void)?

    init(_ completion: @escaping () -> Void) {
        self.completion = completion
    }

    func complete() {
        lock.lock()
        let callback = completion
        completion = nil
        lock.unlock()
        callback?()
    }
}

/// Owns notification action continuations after Apple's callback lifetime
/// ends. `Task` itself retains its operation, but keeping the handles here
/// makes that ownership explicit, bounded, and independently cancellable at
/// app teardown. No Apple notification framework object or completion block
/// is captured by these tasks.
final class NotificationActionContinuationCoordinator: @unchecked Sendable {
    private let lock = NSLock()
    private var active = Set<UUID>()
    private var tasks: [UUID: Task<Void, Never>] = [:]

    func submit(_ operation: @escaping @Sendable () async -> Void) {
        let id = UUID()
        lock.lock()
        active.insert(id)
        lock.unlock()
        let task = Task { [weak self] in
            await operation()
            self?.finish(id)
        }
        lock.lock()
        if active.contains(id) { tasks[id] = task }
        lock.unlock()
    }

    private func finish(_ id: UUID) {
        lock.lock()
        active.remove(id)
        tasks.removeValue(forKey: id)
        lock.unlock()
    }

    deinit {
        lock.lock()
        let owned = Array(tasks.values)
        tasks.removeAll()
        active.removeAll()
        lock.unlock()
        owned.forEach { $0.cancel() }
    }
}

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
    struct CompleteActionPayload: Sendable {
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

        init(
            commandType: String?, expectedVersion: Int?, priorityId: String?,
            occurrenceDate: String?, dose: String?, protocolId: String?
        ) {
            self.commandType = commandType
            self.expectedVersion = expectedVersion
            self.priorityId = priorityId
            self.occurrenceDate = occurrenceDate
            self.dose = dose
            self.protocolId = protocolId
        }
    }

    struct OpenActionPayload: Sendable {
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

    /// The sole representation allowed to outlive the Apple notification
    /// callback. No `UNNotificationResponse`, `UNNotificationRequest`, or
    /// `UNNotificationContent` crosses the first suspension point.
    struct ResponseSnapshot: Sendable {
        let actionIdentifier: String
        let requestIdentifier: String
        let complete: CompleteActionPayload
        let open: OpenActionPayload
        let snooze: PriorityNotificationScheduler.SnoozePayload?

        init(response: UNNotificationResponse) {
            let request = response.notification.request
            let userInfo = request.content.userInfo
            actionIdentifier = response.actionIdentifier
            requestIdentifier = request.identifier
            complete = CompleteActionPayload(userInfo: userInfo)
            open = OpenActionPayload(
                userInfo: userInfo,
                requestIdentifier: request.identifier,
                categoryIdentifier: request.content.categoryIdentifier
            )
            snooze = PriorityNotificationScheduler.SnoozePayload(request: request)
        }

        init(
            actionIdentifier: String,
            requestIdentifier: String,
            userInfo: [AnyHashable: Any],
            categoryIdentifier: String,
            snooze: PriorityNotificationScheduler.SnoozePayload? = nil
        ) {
            self.actionIdentifier = actionIdentifier
            self.requestIdentifier = requestIdentifier
            complete = CompleteActionPayload(userInfo: userInfo)
            open = OpenActionPayload(
                userInfo: userInfo,
                requestIdentifier: requestIdentifier,
                categoryIdentifier: categoryIdentifier
            )
            self.snooze = snooze
        }
    }

    /// Immutable and installed before the notification center receives this
    /// delegate. Apple may invoke delegate methods off-main; response payloads
    /// are reduced to Sendable values before this environment is touched on
    /// the main actor.
    private let environment: AppEnvironment?
    private let completeActionHandler: (@MainActor @Sendable (CompleteActionPayload) async throws -> Void)?
    private let completionCleanup: @MainActor @Sendable (String, String) async -> Void
    private let snoozeHandler: @MainActor @Sendable (PriorityNotificationScheduler.SnoozePayload) async -> PriorityNotificationScheduler.SnoozeResult
    private let postActionReconciliation: (@MainActor @Sendable () async -> Void)?
    private let openActionHandler: (@MainActor @Sendable (String, AppDestination) async -> Bool)?
    private let staleCompletionResolver: (@MainActor @Sendable (CompleteActionPayload) async -> CompleteActionPayload?)?
    private let continuationCoordinator: NotificationActionContinuationCoordinator
    @MainActor private var consumedActionIdentities = Set<String>()
    @MainActor private var consumedActionOrder: [String] = []

    init(
        environment: AppEnvironment?,
        snoozeHandler: @escaping @MainActor @Sendable (PriorityNotificationScheduler.SnoozePayload) async -> PriorityNotificationScheduler.SnoozeResult = {
            await PriorityNotificationScheduler.scheduleSnooze(payload: $0)
        },
        completeActionHandler: (@MainActor @Sendable (CompleteActionPayload) async throws -> Void)? = nil,
        openActionHandler: (@MainActor @Sendable (String, AppDestination) async -> Bool)? = nil,
        staleCompletionResolver: (@MainActor @Sendable (CompleteActionPayload) async -> CompleteActionPayload?)? = nil,
        postActionReconciliation: (@MainActor @Sendable () async -> Void)? = nil,
        continuationCoordinator: NotificationActionContinuationCoordinator = .init(),
        completionCleanup: @escaping @MainActor @Sendable (String, String) async -> Void = { priorityId, occurrenceDate in
            await PriorityNotificationScheduler.cleanupCompletedOccurrence(
                priorityId: priorityId, occurrenceDate: occurrenceDate
            )
        }
    ) {
        self.environment = environment
        self.completeActionHandler = completeActionHandler
        self.openActionHandler = openActionHandler
        self.completionCleanup = completionCleanup
        self.snoozeHandler = snoozeHandler
        self.continuationCoordinator = continuationCoordinator
        self.postActionReconciliation = postActionReconciliation
        self.staleCompletionResolver = staleCompletionResolver
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
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Snapshot every needed primitive while Apple's callback owns the
        // response. Neither response, request, nor mutable content survives
        // this synchronous boundary.
        let snapshot = ResponseSnapshot(response: response)
        dispatch(snapshot: snapshot, completion: completionHandler)
    }

    /// Testable delegate boundary. Ownership of the primitive snapshot is
    /// established in the app continuation coordinator first; Apple's
    /// completion is then invoked promptly and exactly once. Network writes,
    /// navigation readiness, cleanup, Home fetches, and horizon reconciliation
    /// continue independently and can never extend the system callback.
    func dispatch(snapshot: ResponseSnapshot, completion: @escaping () -> Void) {
        let gate = NotificationResponseCompletionGate(completion)
        continuationCoordinator.submit { @MainActor [weak self] in
            guard let self else { return }
            await self.handle(snapshot: snapshot)
        }
        gate.complete()
    }

    @MainActor
    func handle(snapshot: ResponseSnapshot) async {
        recordActionStage(snapshot: snapshot, operation: "action callback received",
                          reason: "The notification delegate received an action response.")
        switch snapshot.actionIdentifier {
        case PriorityNotificationActionIdentifier.complete:
            guard claimAction(identifier: snapshot.requestIdentifier, action: snapshot.actionIdentifier) else {
                recordActionStage(snapshot: snapshot, operation: "duplicate action ignored",
                                  reason: "This exact Complete callback was already consumed safely.")
                return
            }
            recordActionStage(snapshot: snapshot, operation: "action decoded",
                              reason: "Complete was decoded and dispatched on the main actor.")
            await handleComplete(payload: snapshot.complete)
        case PriorityNotificationActionIdentifier.snooze:
            guard claimAction(identifier: snapshot.requestIdentifier, action: snapshot.actionIdentifier) else {
                recordActionStage(snapshot: snapshot, operation: "duplicate action ignored",
                                  reason: "This exact Snooze callback was already consumed safely.")
                return
            }
            guard let payload = snapshot.snooze else {
                recordActionStage(snapshot: snapshot, operation: "snooze rejected",
                                  reason: "The request lacked the canonical priority identity required for a safe snooze.")
                return
            }
            recordActionStage(snapshot: snapshot, operation: "action decoded",
                              reason: "Snooze was decoded from immutable values and dispatched on the main actor.")
            let result = await snoozeHandler(payload)
            if case .accepted = result {
                // Re-read the bounded canonical occurrence horizon after the
                // local replacement is accepted. This never turns Snooze into
                // a server mutation; it only keeps every other exact future
                // occurrence covered while leaving this snooze request intact.
                await reconcileAfterAction()
            }
            recordActionStage(snapshot: snapshot, operation: "action completed safely",
                              reason: "Snooze handling returned without canonical mutation.")
        case UNNotificationDefaultActionIdentifier:
            recordActionStage(snapshot: snapshot, operation: "action decoded",
                              reason: "The notification open action was decoded and dispatched on the main actor.")
            await openDestination(payload: snapshot.open)
        default:
            recordActionStage(snapshot: snapshot, operation: "action ignored",
                              reason: "The notification action identifier is not registered by PhysiqueOS.")
        }
    }

    @MainActor
    private func claimAction(identifier: String, action: String) -> Bool {
        let identity = "\(identifier)|\(action)"
        guard !consumedActionIdentities.contains(identity) else { return false }
        consumedActionIdentities.insert(identity)
        consumedActionOrder.append(identity)
        if consumedActionOrder.count > 128 {
            let expired = consumedActionOrder.removeFirst()
            consumedActionIdentities.remove(expired)
        }
        return true
    }

    @MainActor
    private func recordActionStage(snapshot: ResponseSnapshot, operation: String, reason: String) {
        NotificationDiagnostics.record(.init(
            capturedAt: Date(), identifier: snapshot.requestIdentifier,
            operation: operation, reason: reason,
            fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
        ))
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
        guard completeActionHandler != nil || environment != nil else {
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.environment-unavailable",
                operation: "completion not dispatched",
                reason: "The application environment was not available; canonical state remains unchanged.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
            return
        }
        do {
            try await performComplete(
                payload: payload, priorityId: priorityId,
                occurrenceDate: occurrenceDate, expectedVersion: expectedVersion
            )
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion accepted",
                reason: "The canonical specialized completion command succeeded.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
            await completionCleanup(priorityId, occurrenceDate)
            await reconcileAfterAction()
        } catch {
            if Self.isStaleVersion(error),
               let refreshed = await resolveStaleCompletion(payload),
               let refreshedPriorityId = refreshed.priorityId,
               let refreshedOccurrenceDate = refreshed.occurrenceDate,
               let refreshedVersion = refreshed.expectedVersion {
                do {
                    try await performComplete(
                        payload: refreshed, priorityId: refreshedPriorityId,
                        occurrenceDate: refreshedOccurrenceDate, expectedVersion: refreshedVersion
                    )
                    NotificationDiagnostics.record(.init(
                        capturedAt: Date(), identifier: "action.complete.\(refreshedPriorityId).\(refreshedOccurrenceDate)",
                        operation: "completion accepted after exact occurrence refresh",
                        reason: "The future request carried a stale version; the unchanged exact occurrence was re-read and completed once.",
                        fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
                    ))
                    await completionCleanup(refreshedPriorityId, refreshedOccurrenceDate)
                    await reconcileAfterAction()
                    return
                } catch { /* bounded retry exhausted; record the safe rejection below */ }
            }
            NotificationDiagnostics.record(.init(
                capturedAt: Date(), identifier: "action.complete.\(priorityId).\(occurrenceDate)",
                operation: "completion rejected",
                reason: "The canonical completion command did not succeed; the occurrence remains unchanged.",
                fireDate: nil, timeZoneIdentifier: TimeZone.current.identifier
            ))
        }
    }

    @MainActor
    private func performComplete(
        payload: CompleteActionPayload,
        priorityId: String,
        occurrenceDate: String,
        expectedVersion: Int
    ) async throws {
        if let completeActionHandler {
            try await completeActionHandler(payload)
        } else if let environment {
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
        }
    }

    private static func isStaleVersion(_ error: Error) -> Bool {
        guard case .failedPrecondition(let problem) = error as? ProductionNativeError else { return false }
        return problem.code == "STALE_VERSION"
    }

    @MainActor
    private func reconcileAfterAction() async {
        if let postActionReconciliation {
            await postActionReconciliation()
        } else {
            await environment?.reconcileCanonicalPriorityNotifications()
        }
    }

    /// A future-horizon notification may outlive a harmless resource-version
    /// advance. Retry is permitted only after an exact Home re-read proves
    /// that the same occurrence and specialized completion context are still
    /// current. Any identity/context drift fails closed.
    @MainActor
    private func resolveStaleCompletion(_ stale: CompleteActionPayload) async -> CompleteActionPayload? {
        if let staleCompletionResolver {
            return await staleCompletionResolver(stale)
        }
        guard let environment,
              let priorityId = stale.priorityId,
              let occurrenceDate = stale.occurrenceDate
        else { return nil }
        await environment.productionNativeAPI.invalidateReadResources(["home"])
        guard let home = try? await ProductionHomeAPI(api: environment.productionNativeAPI).fetchHome(),
              let occurrence = home.notificationScheduleItems.first(where: {
                  ($0.routePriorityId ?? $0.id) == priorityId && $0.date == occurrenceDate
              }),
              occurrence.completed == false,
              let command = occurrence.notificationAction?.completionCommand,
              command.commandType == ProductionCommandType.completePriority,
              command.payload.priorityId == priorityId,
              command.payload.occurrenceDate == occurrenceDate,
              command.payload.dose == stale.dose,
              command.payload.protocolId == stale.protocolId
        else { return nil }
        return CompleteActionPayload(
            commandType: command.commandType,
            expectedVersion: command.expectedVersion,
            priorityId: command.payload.priorityId,
            occurrenceDate: command.payload.occurrenceDate,
            dose: command.payload.dose,
            protocolId: command.payload.protocolId
        )
    }

    @MainActor
    private func openDestination(payload: OpenActionPayload) async {
        guard environment != nil || openActionHandler != nil else {
            recordOpenResult(
                identifier: payload.requestIdentifier,
                operation: "deep link deferred safely",
                reason: "The application environment was unavailable; no destination was executed."
            )
            return
        }
        do {
            let destination = try Self.validatedDestination(
                destinationJSON: payload.destinationJSON,
                briefingArtifactId: payload.briefingArtifactId,
                categoryIdentifier: payload.categoryIdentifier
            )
            let accepted: Bool
            if let openActionHandler {
                accepted = await openActionHandler(payload.requestIdentifier, destination)
            } else if let environment {
                accepted = environment.notificationDeepLinkCoordinator.enqueue(
                    identifier: payload.requestIdentifier,
                    destination: destination
                )
            } else {
                accepted = false
            }
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
