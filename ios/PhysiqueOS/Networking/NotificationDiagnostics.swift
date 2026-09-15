import UserNotifications

/// On-device, read-only diagnostic for troubleshooting Actionable Priority
/// Notification delivery — "does a pending request actually exist for this
/// occurrence, and if not, exactly why not." Built from the SAME
/// `PriorityNotificationScheduler.reconciliationPlan` the live scheduler
/// uses (never a second, divergent copy of that decision logic), plus the
/// live center's actual pending state. Never mutates the notification
/// center — a diagnostic that changed what it's inspecting would be
/// worthless for exactly the question it exists to answer.
///
/// Available in the explicit engineering diagnostic surface, including
/// TestFlight. Never exposed in normal priority presentation.
enum NotificationDiagnostics {
    struct PendingRequestSnapshot {
        let identifier: String
        let title: String
        let body: String
        let category: String
        let triggerDescription: String
        let nextTriggerDate: Date?
        let priorityId: String?
        let occurrenceDate: String?
        /// The raw `notificationAction.scheduledTime` that produced this
        /// request, read back from the request's own `userInfo` — proves
        /// what canonical value Native actually scheduled against, not
        /// just what the current read says now.
        let canonicalScheduledTime: String?
    }

    enum ReconciliationOutcome: String {
        case create, replace, remove, skip, noop
    }

    struct ItemOutcome {
        let priorityId: String
        let occurrenceDate: String
        let title: String
        let canonicalScheduledTime: String?
        let outcome: ReconciliationOutcome
        /// Human-readable explanation — for `.skip`, names exactly which
        /// eligibility condition failed (no notificationAction, no
        /// scheduledTime, unparseable time, or not in the future), so a
        /// "why didn't this fire" question is answerable by reading this
        /// string rather than re-deriving the scheduler's logic by hand.
        let reason: String
    }

    /// The finer-grained settings `UNUserNotificationCenter` exposes
    /// alongside `authorizationStatus` — distinct from it, and from
    /// whether a request exists at all. `authorizationStatus == .authorized`
    /// only means the Founder said yes once; a Focus Mode, the iOS 15+
    /// Scheduled Summary, or a per-alert-type toggle can each independently
    /// silence delivery without ever showing up as "denied" or as a
    /// missing pending request. Surfacing these separately is what makes
    /// "the request exists but iOS chose not to show it" distinguishable
    /// from "no request was ever created."
    struct DeliverySettings {
        let alertSetting: UNNotificationSetting
        let soundSetting: UNNotificationSetting
        let badgeSetting: UNNotificationSetting
        let lockScreenSetting: UNNotificationSetting
        let notificationCenterSetting: UNNotificationSetting
        /// iOS 15+ "Scheduled Summary" — when `.enabled`, an otherwise
        /// eligible notification can be held and delivered later as part
        /// of a digest instead of immediately, which reads exactly like
        /// "it never fired" from the Founder's side.
        let scheduledDeliverySetting: UNNotificationSetting
        let timeSensitiveSetting: UNNotificationSetting
    }

    struct Report {
        let authorizationStatus: UNAuthorizationStatus
        let deliverySettings: DeliverySettings
        let pendingRequests: [PendingRequestSnapshot]
        let deliveredRequests: [PendingRequestSnapshot]
        let registeredCategories: [String]
        let capturedAt: Date
        let timeZoneIdentifier: String
        let itemOutcomes: [ItemOutcome]
        let lastSyncFailures: [(identifier: String, error: Error)]
    }

    @MainActor
    static func makeReport(
        items: [PriorityOccurrence],
        now: Date = Date(),
        calendar: Calendar = .current,
        center: UNUserNotificationCenter = .current()
    ) async -> Report {
        let settings = await center.notificationSettings()
        let pending = await center.pendingNotificationRequests()
        let delivered = await center.deliveredNotifications()
        let categories = await center.notificationCategories()
        let physiqueOSPending = pending.filter {
            $0.identifier.hasPrefix(PriorityNotificationScheduler.scheduledPrefix)
                || $0.identifier.hasPrefix(PriorityNotificationScheduler.snoozedPrefix)
        }
        let snapshots = physiqueOSPending.map { snapshot(for: $0, calendar: calendar) }

        let existingScheduledIds = Set(
            pending.map(\.identifier).filter { $0.hasPrefix(PriorityNotificationScheduler.scheduledPrefix) }
        )
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: items, existingScheduledIdentifiers: existingScheduledIds, now: now, calendar: calendar
        )
        let planAddedIds = Set(plan.toAdd.map(\.identifier))

        let outcomes = items.map { item in
            itemOutcome(
                item: item, existingScheduledIds: existingScheduledIds, planAddedIds: planAddedIds,
                now: now, calendar: calendar
            )
        }

        return Report(
            authorizationStatus: settings.authorizationStatus,
            deliverySettings: DeliverySettings(
                alertSetting: settings.alertSetting,
                soundSetting: settings.soundSetting,
                badgeSetting: settings.badgeSetting,
                lockScreenSetting: settings.lockScreenSetting,
                notificationCenterSetting: settings.notificationCenterSetting,
                scheduledDeliverySetting: settings.scheduledDeliverySetting,
                timeSensitiveSetting: settings.timeSensitiveSetting
            ),
            pendingRequests: snapshots,
            deliveredRequests: delivered.map(\.request).filter {
                $0.identifier.hasPrefix(PriorityNotificationScheduler.scheduledPrefix)
                    || $0.identifier.hasPrefix(PriorityNotificationScheduler.snoozedPrefix)
            }.map { snapshot(for: $0, calendar: calendar) },
            registeredCategories: categories.map(\.identifier).sorted(),
            capturedAt: now,
            timeZoneIdentifier: calendar.timeZone.identifier,
            itemOutcomes: outcomes,
            lastSyncFailures: PriorityNotificationScheduler.lastSyncFailures
        )
    }

    // Internal (not private) so these pure classification/description
    // functions are directly unit-testable without a live
    // `UNUserNotificationCenter`.

    static func snapshot(for request: UNNotificationRequest, calendar: Calendar) -> PendingRequestSnapshot {
        let (triggerDescription, nextTriggerDate) = describe(request.trigger, calendar: calendar)
        return PendingRequestSnapshot(
            identifier: request.identifier,
            title: request.content.title,
            body: request.content.body,
            category: request.content.categoryIdentifier,
            triggerDescription: triggerDescription,
            nextTriggerDate: nextTriggerDate,
            priorityId: request.content.userInfo["priorityId"] as? String,
            occurrenceDate: request.content.userInfo["occurrenceDate"] as? String,
            canonicalScheduledTime: request.content.userInfo["canonicalScheduledTime"] as? String
        )
    }

    static func describe(_ trigger: UNNotificationTrigger?, calendar: Calendar) -> (String, Date?) {
        switch trigger {
        case let calendarTrigger as UNCalendarNotificationTrigger:
            let components = calendarTrigger.dateComponents
            let description = "calendar(year:\(components.year.map(String.init) ?? "-")"
                + " month:\(components.month.map(String.init) ?? "-")"
                + " day:\(components.day.map(String.init) ?? "-")"
                + " hour:\(components.hour.map(String.init) ?? "-")"
                + " minute:\(components.minute.map(String.init) ?? "-")"
                + " second:\(components.second.map(String.init) ?? "-")"
                + " timeZone:\(components.timeZone?.identifier ?? "device default")"
                + " repeats:\(calendarTrigger.repeats))"
            return (description, calendarTrigger.nextTriggerDate())
        case let intervalTrigger as UNTimeIntervalNotificationTrigger:
            return ("interval(\(intervalTrigger.timeInterval)s repeats:\(intervalTrigger.repeats))", intervalTrigger.nextTriggerDate())
        case nil:
            return ("immediate (no trigger)", nil)
        default:
            return (String(describing: trigger), nil)
        }
    }

    static func itemOutcome(
        item: PriorityOccurrence,
        existingScheduledIds: Set<String>,
        planAddedIds: Set<String>,
        now: Date,
        calendar: Calendar
    ) -> ItemOutcome {
        let priorityId = item.routePriorityId ?? item.id
        let scheduledId = PriorityNotificationScheduler.identifier(priorityId: priorityId, occurrenceDate: item.date)
        let canonicalScheduledTime = item.notificationAction?.scheduledTime

        func outcome(_ outcome: ReconciliationOutcome, _ reason: String) -> ItemOutcome {
            ItemOutcome(
                priorityId: priorityId, occurrenceDate: item.date, title: item.title,
                canonicalScheduledTime: canonicalScheduledTime, outcome: outcome, reason: reason
            )
        }

        if item.completed {
            return outcome(existingScheduledIds.contains(scheduledId) ? .remove : .noop, "occurrence is completed")
        }
        guard let action = item.notificationAction else {
            return outcome(.skip, "no notificationAction on this occurrence")
        }
        guard let scheduledTime = action.scheduledTime else {
            return outcome(.skip, "server did not resolve a scheduledTime (notificationAction.scheduledTime is nil)")
        }
        guard let fireDate = PriorityNotificationScheduler.fireDate(scheduledTime, occurrenceDate: item.date, calendar: calendar) else {
            return outcome(.skip, "scheduledTime '\(scheduledTime)' or occurrenceDate '\(item.date)' failed to parse into a Date")
        }
        guard fireDate > now else {
            return outcome(.skip, "resolved fire date \(fireDate) is not in the future (now: \(now))")
        }
        guard planAddedIds.contains(scheduledId) else {
            return outcome(.skip, "eligible but excluded from the reconciliation plan — unexpected, investigate reconciliationPlan directly")
        }
        return outcome(existingScheduledIds.contains(scheduledId) ? .replace : .create, "eligible; fires at \(fireDate)")
    }
}
