import UserNotifications

/// Schedules and reconciles local notifications for Today's Priorities
/// against the canonical Home read — never against a Native-maintained
/// schedule. Every notification's fire time comes directly from the
/// server-resolved `notificationAction.scheduledTime`; this type never
/// interprets a daypart word or invents a time of its own. Call `sync`
/// every time Home successfully loads/refreshes (cold load, pull-to-
/// refresh, foreground) so the locally-scheduled set always mirrors the
/// current canonical state — completing a priority through ANY path
/// (notification, in-app, or elsewhere) is naturally reflected the next
/// time Home is read, without this type needing to know how completion
/// happened.
enum PriorityNotificationScheduler {
    // Internal (not private) so `NotificationDiagnostics` can classify live
    // pending requests by the same prefixes `sync` itself uses, without a
    // second hardcoded copy of these strings.
    static let scheduledPrefix = "priority.scheduled."
    static let snoozedPrefix = "priority.snoozed."
    static let snoozeInterval: TimeInterval = 3600

    /// A value-only copy of the app-owned fields in a priority notification.
    /// `UNNotificationRequest` and `UNNotificationContent` are Objective-C
    /// framework objects whose callback lifetime and Sendable behavior are not
    /// an application contract. Capture this snapshot synchronously inside the
    /// notification delegate, before its first suspension, and only move these
    /// immutable Swift values across the actor boundary.
    struct SnoozePayload: Sendable, Equatable {
        let originalRequestIdentifier: String
        let priorityId: String
        let occurrenceDate: String
        let title: String
        let subtitle: String
        let body: String
        let categoryIdentifier: String
        let threadIdentifier: String
        let targetContentIdentifier: String?
        let canonicalScheduledTime: String?
        let destinationJSON: String?
        let commandType: String?
        let expectedVersion: Int?
        let payloadPriorityId: String?
        let payloadOccurrenceDate: String?
        let payloadDose: String?
        let payloadProtocolId: String?

        init?(request: UNNotificationRequest) {
            let content = request.content
            guard let priorityId = content.userInfo["priorityId"] as? String,
                  !priorityId.isEmpty,
                  let occurrenceDate = content.userInfo["occurrenceDate"] as? String,
                  !occurrenceDate.isEmpty
            else { return nil }
            originalRequestIdentifier = request.identifier
            self.priorityId = priorityId
            self.occurrenceDate = occurrenceDate
            title = content.title
            subtitle = content.subtitle
            body = content.body
            categoryIdentifier = content.categoryIdentifier
            threadIdentifier = content.threadIdentifier
            targetContentIdentifier = content.targetContentIdentifier
            canonicalScheduledTime = content.userInfo["canonicalScheduledTime"] as? String
            if let value = content.userInfo["destinationJSON"] as? String {
                destinationJSON = value
            } else if let value = content.userInfo["destination"] as? Data {
                destinationJSON = String(data: value, encoding: .utf8)
            } else {
                destinationJSON = nil
            }
            commandType = content.userInfo["commandType"] as? String
            expectedVersion = content.userInfo["expectedVersion"] as? Int
            payloadPriorityId = content.userInfo["payloadPriorityId"] as? String
            payloadOccurrenceDate = content.userInfo["payloadOccurrenceDate"] as? String
            payloadDose = content.userInfo["payloadDose"] as? String
            payloadProtocolId = content.userInfo["payloadProtocolId"] as? String
        }

        init(
            originalRequestIdentifier: String,
            priorityId: String,
            occurrenceDate: String,
            title: String,
            subtitle: String = "",
            body: String,
            categoryIdentifier: String,
            threadIdentifier: String = "",
            targetContentIdentifier: String? = nil,
            canonicalScheduledTime: String? = nil,
            destinationJSON: String? = nil,
            commandType: String? = nil,
            expectedVersion: Int? = nil,
            payloadPriorityId: String? = nil,
            payloadOccurrenceDate: String? = nil,
            payloadDose: String? = nil,
            payloadProtocolId: String? = nil
        ) {
            self.originalRequestIdentifier = originalRequestIdentifier
            self.priorityId = priorityId
            self.occurrenceDate = occurrenceDate
            self.title = title
            self.subtitle = subtitle
            self.body = body
            self.categoryIdentifier = categoryIdentifier
            self.threadIdentifier = threadIdentifier
            self.targetContentIdentifier = targetContentIdentifier
            self.canonicalScheduledTime = canonicalScheduledTime
            self.destinationJSON = destinationJSON
            self.commandType = commandType
            self.expectedVersion = expectedVersion
            self.payloadPriorityId = payloadPriorityId
            self.payloadOccurrenceDate = payloadOccurrenceDate
            self.payloadDose = payloadDose
            self.payloadProtocolId = payloadProtocolId
        }

    }

    enum SnoozeResult: Sendable, Equatable {
        case accepted(identifier: String)
        case rejected(identifier: String)
    }

    struct CompletionCleanupPlan: Sendable, Equatable {
        let pendingIdentifiers: [String]
        let deliveredIdentifiers: [String]
    }

    struct CompletionCleanupResult: Sendable, Equatable {
        let pendingRemoved: Bool
        let deliveredRemoved: Bool
    }

    static func identifier(priorityId: String, occurrenceDate: String) -> String {
        "\(scheduledPrefix)\(priorityId).\(occurrenceDate)"
    }

    static func snoozeIdentifier(priorityId: String, occurrenceDate: String) -> String {
        "\(snoozedPrefix)\(priorityId).\(occurrenceDate)"
    }

    static func occurrenceIdentifiers(priorityId: String, occurrenceDate: String) -> Set<String> {
        [
            identifier(priorityId: priorityId, occurrenceDate: occurrenceDate),
            snoozeIdentifier(priorityId: priorityId, occurrenceDate: occurrenceDate),
        ]
    }

    /// Pure authorization gate, extracted so "authorization denied means no
    /// silent scheduling" is directly testable without a live
    /// `UNUserNotificationCenter` (authorization can't be granted
    /// programmatically in a test).
    static func canSchedule(authorizationStatus: UNAuthorizationStatus) -> Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    /// Any identifiers whose `center.add()` call failed on the most recent
    /// `sync()` — `sync` stays best-effort (one failed add must not block
    /// the others), so this exists purely so `NotificationDiagnostics` (and
    /// a debugger) can see what would otherwise be silently swallowed.
    @MainActor static private(set) var lastSyncFailures: [(identifier: String, error: Error)] = []

    @MainActor
    @discardableResult
    static func sync(
        items: [PriorityOccurrence],
        now: Date = Date(),
        calendar: Calendar = .current,
        center: UNUserNotificationCenter = .current()
    ) async -> UNAuthorizationStatus {
        let settings = await center.notificationSettings()
        let pending = await center.pendingNotificationRequests()
        let delivered = await center.deliveredNotifications()
        await cleanupCompletedNotifications(
            items: items,
            pendingIdentifiers: Set(pending.map(\.identifier)),
            deliveredIdentifiers: Set(delivered.map { $0.request.identifier }),
            center: center,
            now: now
        )
        guard canSchedule(authorizationStatus: settings.authorizationStatus) else {
            for item in items {
                NotificationDiagnostics.record(.init(
                    capturedAt: now, identifier: identifier(priorityId: item.routePriorityId ?? item.id, occurrenceDate: item.date),
                    operation: "not scheduled", reason: "Notification authorization does not permit scheduling.",
                    fireDate: nil, timeZoneIdentifier: calendar.timeZone.identifier
                ))
            }
            return settings.authorizationStatus
        }

        let existingScheduledIds = Set(pending.map(\.identifier).filter { $0.hasPrefix(scheduledPrefix) })
        let plan = reconciliationPlan(items: items, existingScheduledIdentifiers: existingScheduledIds, now: now, calendar: calendar)

        if !plan.toRemove.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: plan.toRemove)
            for removedId in Set(plan.toRemove) {
                let item = items.first {
                    let id = $0.routePriorityId ?? $0.id
                    return removedId == identifier(priorityId: id, occurrenceDate: $0.date)
                        || removedId == snoozeIdentifier(priorityId: id, occurrenceDate: $0.date)
                }
                let reason = item.map {
                    NotificationDiagnostics.itemOutcome(item: $0, existingScheduledIds: existingScheduledIds,
                        planAddedIds: [], now: now, calendar: calendar).reason
                } ?? "Occurrence absent from the latest canonical Home projection."
                NotificationDiagnostics.record(.init(capturedAt: now, identifier: removedId, operation: "removal requested",
                    reason: reason, fireDate: nil, timeZoneIdentifier: calendar.timeZone.identifier))
            }
        }
        // `add` replaces any existing request with the same identifier in
        // place (e.g. the canonical schedule's time changed) — no separate
        // "already scheduled, skip" branch is needed for correctness.
        var failures: [(identifier: String, error: Error)] = []
        for request in plan.toAdd {
            do {
                try await center.add(request)
                NotificationDiagnostics.record(.init(capturedAt: now, identifier: request.identifier,
                    operation: existingScheduledIds.contains(request.identifier) ? "replaced" : "scheduled",
                    reason: "iOS accepted the canonical occurrence request; presentation is not yet proven.",
                    fireDate: (request.trigger as? UNCalendarNotificationTrigger).flatMap { calendar.date(from: $0.dateComponents) },
                    timeZoneIdentifier: calendar.timeZone.identifier,
                    categoryIdentifier: request.content.categoryIdentifier,
                    triggerDescription: NotificationDiagnostics.describe(request.trigger, calendar: calendar).0))
            } catch {
                failures.append((request.identifier, error))
                NotificationDiagnostics.record(.init(capturedAt: now, identifier: request.identifier, operation: "rejected",
                    reason: "iOS rejected the request. See the scheduling error in this diagnostic capture.",
                    fireDate: nil, timeZoneIdentifier: calendar.timeZone.identifier))
            }
        }
        lastSyncFailures = failures
        return settings.authorizationStatus
    }

    /// The actual reconciliation decision, factored out as a pure function
    /// (no `UNUserNotificationCenter` access) so the schedule-change
    /// invariant — a canonical schedule edit replaces the pending
    /// notification rather than ever leaving both an old and a new one
    /// pending — is deterministically testable. Authorization can't be
    /// granted programmatically in a test, so `sync` (which needs a live,
    /// authorized center) can't be exercised end-to-end there; this can.
    ///
    /// Every identifier this returns in `toAdd` is stable per
    /// priority+occurrence (`identifier(priorityId:occurrenceDate:)`) and
    /// carries whatever fire time the CURRENT `items` says — so if the
    /// canonical schedule changed since the last sync, the same identifier
    /// simply gets a new trigger; `UNUserNotificationCenter.add` replacing
    /// same-identifier requests (Apple's documented behavior) is what turns
    /// that into "old cancelled, new scheduled" with no window where both
    /// exist. `toRemove` only ever needs to cover identifiers that are no
    /// longer desired at all (completed, or dropped from `items`) — never a
    /// same-identifier schedule-time change, which needs no explicit
    /// removal.
    static func reconciliationPlan(
        items: [PriorityOccurrence],
        existingScheduledIdentifiers: Set<String>,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> (toAdd: [UNNotificationRequest], toRemove: [String]) {
        var desired: [UNNotificationRequest] = []
        var desiredIdentifiers = Set<String>()
        var completedIdentifiersToCancel: [String] = []

        for item in items {
            let priorityId = item.routePriorityId ?? item.id
            let scheduledId = identifier(priorityId: priorityId, occurrenceDate: item.date)
            let snoozeId = snoozeIdentifier(priorityId: priorityId, occurrenceDate: item.date)

            if item.completed {
                // Suppress both the regular and any snoozed notification the
                // instant a completion is known, regardless of how it
                // happened — this is the only place staleness is resolved,
                // by re-deriving desired state from scratch every sync.
                completedIdentifiersToCancel.append(contentsOf: [scheduledId, snoozeId])
                continue
            }
            guard let action = item.notificationAction,
                  let scheduledTime = action.scheduledTime,
                  let fireDate = fireDate(scheduledTime, occurrenceDate: item.date, calendar: calendar),
                  fireDate > now,
                  desiredIdentifiers.insert(scheduledId).inserted
            else { continue }

            desired.append(request(identifier: scheduledId, item: item, action: action, fireDate: fireDate, calendar: calendar))
        }

        let desiredIds = Set(desired.map(\.identifier))
        let staleIds = existingScheduledIdentifiers.subtracting(desiredIds)
        return (toAdd: desired, toRemove: Array(staleIds) + completedIdentifiersToCancel)
    }

    static func completionCleanupPlan(
        items: [PriorityOccurrence],
        pendingIdentifiers: Set<String>,
        deliveredIdentifiers: Set<String>
    ) -> CompletionCleanupPlan {
        let completed = items.filter(\.completed).reduce(into: Set<String>()) { result, item in
            result.formUnion(occurrenceIdentifiers(
                priorityId: item.routePriorityId ?? item.id,
                occurrenceDate: item.date
            ))
        }
        return CompletionCleanupPlan(
            pendingIdentifiers: Array(pendingIdentifiers.intersection(completed)).sorted(),
            deliveredIdentifiers: Array(deliveredIdentifiers.intersection(completed)).sorted()
        )
    }

    @MainActor
    static func cleanupCompletedOccurrence(
        priorityId: String,
        occurrenceDate: String,
        center: UNUserNotificationCenter = .current(),
        now: Date = Date()
    ) async {
        let pending = await center.pendingNotificationRequests()
        let delivered = await center.deliveredNotifications()
        let targets = occurrenceIdentifiers(priorityId: priorityId, occurrenceDate: occurrenceDate)
        let plan = CompletionCleanupPlan(
            pendingIdentifiers: Array(Set(pending.map(\.identifier)).intersection(targets)).sorted(),
            deliveredIdentifiers: Array(Set(delivered.map { $0.request.identifier }).intersection(targets)).sorted()
        )
        _ = await executeCompletionCleanup(
            plan: plan,
            removePending: { center.removePendingNotificationRequests(withIdentifiers: $0) },
            removeDelivered: { center.removeDeliveredNotifications(withIdentifiers: $0) },
            now: now
        )
    }

    @MainActor
    private static func cleanupCompletedNotifications(
        items: [PriorityOccurrence],
        pendingIdentifiers: Set<String>,
        deliveredIdentifiers: Set<String>,
        center: UNUserNotificationCenter,
        now: Date
    ) async {
        let plan = completionCleanupPlan(
            items: items,
            pendingIdentifiers: pendingIdentifiers,
            deliveredIdentifiers: deliveredIdentifiers
        )
        _ = await executeCompletionCleanup(
            plan: plan,
            removePending: { center.removePendingNotificationRequests(withIdentifiers: $0) },
            removeDelivered: { center.removeDeliveredNotifications(withIdentifiers: $0) },
            now: now
        )
    }

    /// Best-effort by design: canonical completion has already succeeded or
    /// been observed before this runs. An iOS cleanup failure is diagnostic
    /// state to retry on the next reconciliation, never grounds to undo the
    /// canonical mutation or crash the app.
    @MainActor
    static func executeCompletionCleanup(
        plan: CompletionCleanupPlan,
        removePending: @MainActor ([String]) async throws -> Void,
        removeDelivered: @MainActor ([String]) async throws -> Void,
        now: Date = Date()
    ) async -> CompletionCleanupResult {
        var pendingRemoved = plan.pendingIdentifiers.isEmpty
        var deliveredRemoved = plan.deliveredIdentifiers.isEmpty
        if !plan.pendingIdentifiers.isEmpty {
            do {
                try await removePending(plan.pendingIdentifiers)
                pendingRemoved = true
                recordCompletionCleanup(plan.pendingIdentifiers, kind: "pending", succeeded: true, now: now)
            } catch {
                recordCompletionCleanup(plan.pendingIdentifiers, kind: "pending", succeeded: false, now: now)
            }
        }
        if !plan.deliveredIdentifiers.isEmpty {
            do {
                try await removeDelivered(plan.deliveredIdentifiers)
                deliveredRemoved = true
                recordCompletionCleanup(plan.deliveredIdentifiers, kind: "delivered", succeeded: true, now: now)
            } catch {
                recordCompletionCleanup(plan.deliveredIdentifiers, kind: "delivered", succeeded: false, now: now)
            }
        }
        return CompletionCleanupResult(
            pendingRemoved: pendingRemoved,
            deliveredRemoved: deliveredRemoved
        )
    }

    @MainActor
    private static func recordCompletionCleanup(
        _ identifiers: [String], kind: String, succeeded: Bool, now: Date
    ) {
        for identifier in identifiers {
            NotificationDiagnostics.record(.init(
                capturedAt: now,
                identifier: identifier,
                operation: succeeded ? "completed \(kind) notification removal requested" : "completed \(kind) notification removal deferred",
                reason: succeeded
                    ? "Canonical completion requested removal of the exact occurrence-scoped iOS notification; reconciliation verifies and retries."
                    : "Canonical completion remains durable; notification cleanup will retry on reconciliation.",
                fireDate: nil,
                timeZoneIdentifier: TimeZone.current.identifier
            ))
        }
    }

    /// Device-only: reschedules the same notification content one hour
    /// later, under a distinct identifier so it doesn't collide with (or
    /// get silently replaced by) the next regular `sync`. Never touches the
    /// canonical priority — no server call happens here at all.
    @MainActor
    static func scheduleSnooze(
        payload: SnoozePayload,
        now: Date = Date(),
        add: @MainActor (UNNotificationRequest) async throws -> Void = { request in
            try await UNUserNotificationCenter.current().add(request)
        }
    ) async -> SnoozeResult {
        let identifier = snoozeIdentifier(priorityId: payload.priorityId, occurrenceDate: payload.occurrenceDate)
        let content = UNMutableNotificationContent()
        content.title = payload.title
        content.subtitle = payload.subtitle
        content.body = payload.body
        content.sound = .default
        content.categoryIdentifier = payload.categoryIdentifier
        content.threadIdentifier = payload.threadIdentifier
        content.targetContentIdentifier = payload.targetContentIdentifier
        var userInfo: [AnyHashable: Any] = [
            "priorityId": payload.priorityId,
            "occurrenceDate": payload.occurrenceDate,
        ]
        if let value = payload.canonicalScheduledTime { userInfo["canonicalScheduledTime"] = value }
        if let value = payload.destinationJSON { userInfo["destinationJSON"] = value }
        if let value = payload.commandType { userInfo["commandType"] = value }
        if let value = payload.expectedVersion { userInfo["expectedVersion"] = value }
        if let value = payload.payloadPriorityId { userInfo["payloadPriorityId"] = value }
        if let value = payload.payloadOccurrenceDate { userInfo["payloadOccurrenceDate"] = value }
        if let value = payload.payloadDose { userInfo["payloadDose"] = value }
        if let value = payload.payloadProtocolId { userInfo["payloadProtocolId"] = value }
        content.userInfo = userInfo
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: snoozeInterval, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        NotificationDiagnostics.record(.init(capturedAt: now, identifier: identifier, operation: "snooze request constructed",
            reason: "A value snapshot produced one device-only one-hour replacement request; canonical state is unchanged.",
            fireDate: now.addingTimeInterval(snoozeInterval), timeZoneIdentifier: TimeZone.current.identifier,
            categoryIdentifier: content.categoryIdentifier, triggerDescription: "interval(3600s repeats:false)"))
        do {
            try await add(request)
            NotificationDiagnostics.record(.init(capturedAt: now, identifier: identifier, operation: "snooze request accepted",
                reason: "iOS accepted the device-only one-hour snooze; canonical state is unchanged.",
                fireDate: now.addingTimeInterval(snoozeInterval), timeZoneIdentifier: TimeZone.current.identifier,
                categoryIdentifier: content.categoryIdentifier, triggerDescription: "interval(3600s repeats:false)"))
            return .accepted(identifier: identifier)
        } catch {
            NotificationDiagnostics.record(.init(capturedAt: now, identifier: identifier, operation: "snooze request rejected",
                reason: "iOS rejected the device-only snooze request; canonical state remains unchanged.", fireDate: nil,
                timeZoneIdentifier: TimeZone.current.identifier,
                categoryIdentifier: content.categoryIdentifier, triggerDescription: "interval(3600s repeats:false)"))
            return .rejected(identifier: identifier)
        }
    }

    /// Internal (not private) so this pure date computation is directly
    /// unit-testable without needing a live `UNUserNotificationCenter`.
    static func fireDate(_ scheduledTime: String, occurrenceDate: String, calendar: Calendar) -> Date? {
        let time = scheduledTime.split(separator: ":").compactMap { Int($0) }
        let date = occurrenceDate.split(separator: "-").compactMap { Int($0) }
        guard time.count == 2, date.count == 3 else { return nil }
        var components = DateComponents()
        components.year = date[0]
        components.month = date[1]
        components.day = date[2]
        components.hour = time[0]
        components.minute = time[1]
        return calendar.date(from: components)
    }

    private static func request(
        identifier: String, item: PriorityOccurrence, action: PriorityNotificationAction, fireDate: Date, calendar: Calendar
    ) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = item.title
        content.body = notificationBody(item: item, action: action)
        content.sound = .default
        content.categoryIdentifier = PriorityNotificationCategory.category(for: action)
        content.userInfo = userInfo(for: item, action: action)
        var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        // `Calendar.dateComponents(_:from:)` only populates the component
        // fields actually requested — it does NOT carry `timeZone` along
        // unless `.timeZone` is itself requested. Left unset,
        // `UNCalendarNotificationTrigger` falls back to interpreting these
        // bare hour/minute numbers in `Calendar.current` AT THE MOMENT IT
        // EVALUATES the trigger — which only happens to match what this
        // function intended when `calendar` passed in is ALSO `.current`
        // and the device's time zone hasn't changed between scheduling and
        // firing. Setting it explicitly makes the trigger self-contained
        // and correct regardless of either of those, rather than correct
        // only by the coincidence of both.
        components.timeZone = calendar.timeZone
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
    }

    static func notificationBody(
        item: PriorityOccurrence, action: PriorityNotificationAction
    ) -> String {
        if action.workflow == "peptide_protocol",
           let dose = action.completionCommand?.payload.dose,
           !dose.isEmpty {
            let timing = item.subtitle ?? action.scheduledTime.map(Self.localizedTime) ?? "Scheduled"
            return "Scheduled dose \(dose) · \(timing)"
        }
        return item.subtitle ?? "Open PhysiqueOS to view this priority."
    }

    private static func localizedTime(_ value: String) -> String {
        let components = value.split(separator: ":").compactMap { Int($0) }
        guard components.count == 2 else { return value }
        var date = DateComponents()
        date.hour = components[0]
        date.minute = components[1]
        guard let resolved = Calendar.current.date(from: date) else { return value }
        return resolved.formatted(date: .omitted, time: .shortened)
    }

    /// Carries everything `PriorityNotificationDelegate` needs to act on a
    /// response without re-fetching anything: the canonical identity, the
    /// exact destination to open (encoded from `PriorityOccurrence
    /// .destination` — the SAME computed property in-app taps already use,
    /// so a notification's "Open" never re-derives routing separately),
    /// and — only when direct completion is allowed — the ready-to-submit
    /// completion command.
    private static func userInfo(for item: PriorityOccurrence, action: PriorityNotificationAction) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "priorityId": item.routePriorityId ?? item.id,
            "occurrenceDate": item.date,
        ]
        if let scheduledTime = action.scheduledTime {
            info["canonicalScheduledTime"] = scheduledTime
        }
        if let destinationData = try? JSONEncoder().encode(item.destination),
           let destinationJSON = String(data: destinationData, encoding: .utf8) {
            info["destinationJSON"] = destinationJSON
        }
        if let command = action.completionCommand {
            info["commandType"] = command.commandType
            info["expectedVersion"] = command.expectedVersion
            info["payloadPriorityId"] = command.payload.priorityId
            info["payloadOccurrenceDate"] = command.payload.occurrenceDate
            if let dose = command.payload.dose { info["payloadDose"] = dose }
            if let protocolId = command.payload.protocolId { info["payloadProtocolId"] = protocolId }
        }
        return info
    }
}
