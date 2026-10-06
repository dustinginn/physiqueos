import Foundation

#if DEBUG
/// A DEBUG-only launch seam for deterministic simulator parity captures.
/// It routes the real SwiftUI screen and real interaction structure through
/// one source-shaped occurrence; Release builds contain neither the fixture
/// nor an appearance override. Shipping Founder Production continues to read
/// the canonical Server resource.
enum FoamRollingPriorityPilotLaunchConfiguration {
    static let enabledKey = "physiqueos.priority-pilot.enabled"
    static let appearanceKey = "physiqueos.priority-pilot.appearance"
    /// Overnight Lane A: the whole locked family through the same seam.
    /// foam (default) | generic | peptide | paused | supplement | morning |
    /// morning-completed | photos | dexa | completed | skipped | setup |
    /// failed | not-found.
    static let variantKey = "physiqueos.priority-pilot.variant"

    static var variant: String {
        UserDefaults.standard.string(forKey: variantKey)?.lowercased() ?? "foam"
    }

    /// The load outcome a capture variant asks for (nil = a loaded occurrence).
    static var forcedState: PriorityDetailViewModel.LoadState? {
        guard isEnabled else { return nil }
        switch variant {
        case "failed": return .failed("This priority could not be loaded. Pull to refresh and try again.")
        case "not-found": return .loaded(nil)
        default: return nil
        }
    }
    static let priorityId = "reminder_foam_roll_daily"
    static let occurrenceDate = "2026-10-04"

    static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: enabledKey)
    }

    static var appearance: String? {
        UserDefaults.standard.string(forKey: appearanceKey)?.lowercased()
    }

    static func occurrence(for requestedPriorityId: String) -> PriorityOccurrence? {
        guard isEnabled, requestedPriorityId == priorityId else { return nil }
        let foam = foamOccurrence()
        return PriorityFamilyReviewFixtures.occurrence(variant, foam: foam) ?? foam
    }

    private static func foamOccurrence() -> PriorityOccurrence {
        var occurrence = PriorityOccurrence(
            id: priorityId,
            routePriorityId: priorityId,
            executionItemId: "execution_foam_roll",
            date: occurrenceDate,
            title: "Foam Rolling",
            subtitle: "Today · 7:15 PM",
            metadata: "Complete the scheduled recovery support.",
            changeLabel: nil,
            icon: .activity,
            color: .evidence,
            urgency: .available,
            completed: false,
            completable: true,
            expectedVersion: 53,
            actionLabel: "View Support",
            completionContext: .init(
                occurrenceDate: occurrenceDate,
                dose: nil,
                protocolId: "recovery"
            ),
            continueActionDestination: .operatingPlanRecoverySupport(executionId: "execution_foam_roll"),
            detailSections: [
                .init(title: "What", items: [
                    .init(label: "Foam Rolling", detail: "Complete the scheduled recovery support.")
                ]),
                .init(title: "When", items: [
                    .init(label: "Daily · 7:15 PM", detail: "Timing comes from the saved Support schedule.")
                ]),
                .init(title: "Execution Notes", items: [
                    .init(label: "Saved Support note", detail: "Focus on lower body after leg sessions.")
                ]),
                .init(title: "Why it matters", items: [
                    .init(
                        label: "Supports the current recovery strategy",
                        detail: "This recovery method supports training readiness and consistency."
                    )
                ])
            ]
        )
        occurrence.skippable = true
        occurrence.skipExpectedVersion = 53
        return occurrence
    }
}

/// Source-shaped occurrences for every locked Priority Detail variant: the
/// exact content of the locked review board (Server section copy, planned
/// doses, pause dates). DEBUG captures only.
enum PriorityFamilyReviewFixtures {
    static func occurrence(_ variant: String, foam: PriorityOccurrence) -> PriorityOccurrence? {
        let date = FoamRollingPriorityPilotLaunchConfiguration.occurrenceDate
        func base(_ id: String, _ title: String, _ subtitle: String, sections: [(String, String, String)]) -> PriorityOccurrence {
            PriorityOccurrence(
                id: id, routePriorityId: id, executionItemId: id, date: date, title: title, subtitle: subtitle,
                metadata: sections.first?.2, changeLabel: nil, icon: .target, color: .primary, urgency: .available,
                completed: false, completable: true, expectedVersion: 12,
                completionContext: .init(occurrenceDate: date),
                detailSections: sections.map { .init(title: $0.0, items: [.init(label: $0.1, detail: $0.2)]) }
            )
        }
        switch variant {
        case "generic":
            var o = base("reminder_server_priority", "Server Priority", "Server-owned occurrence", sections: [
                ("What", "Server Priority", "Production"),
                ("When", "Sep 10", "Scheduled by the operating plan."),
            ])
            o.skippable = true
            return o
        case "peptide":
            var o = base("execution_tesamorelin", "Tesamorelin", "Tonight · 10:29 PM", sections: [
                ("What", "Tesamorelin", "Complete the scheduled Execution action."),
                ("When", "Sun–Thu · 10:29 PM", "fasted before bed"),
                ("Dose", "0.5 mg", "May 24 – Until changed"),
                ("Preparation", "Finish eating approximately 2–3 hours before injection", "Take fasted before bed. Preserve the normal fasted-before-bed timing window. Use the saved Execution conditions."),
                ("Execution Notes", "Saved Support note", "Taken five times per week, Sunday through Thursday, at night, fasted before bed."),
                ("Why it matters", "Supports the current operating plan", "This Execution action supports the current operating plan."),
                ("Next Execution Change", "None scheduled", "No upcoming Execution phase is scheduled."),
            ])
            o.completionContext = .init(occurrenceDate: date, dose: "0.5 mg", protocolId: "tesamorelin")
            o.doseAdjustableState = true
            o.skippable = true
            return o
        case "paused":
            var o = base("execution_retatrutide", "Retatrutide", "Thursday · 9:45 PM", sections: [
                ("What", "Retatrutide is paused", "Resume it from the Operating Plan to record doses again."),
                ("When", "Thursday · 9:45 PM", "fasted before bed"),
                ("Dose", "1.5 mg", "Aug 6 – Until changed"),
                ("Next Execution Change", "2.5 mg", "Begins Oct 8."),
            ])
            o.completable = false
            o.completionContext = nil
            o.paused = true
            o.pauseContext = .init(pausedFrom: "2026-09-12")
            o.continueActionDestination = .operatingPlanPeptideExecution(protocolId: "retatrutide")
            return o
        case "supplement":
            return base("execution_fadogia", "Fadogia Agrestis", "Every other day", sections: [
                ("What", "Fadogia Agrestis", "Complete the scheduled supplement support."),
                ("When", "Every other day", "Timing comes from the saved Support schedule."),
                ("Dose / Quantity", "Not specified", "No quantity is currently configured."),
                ("Execution Notes", "Saved Support note", "Every-other-day supplement. Available for reminders if desired, but not currently surfaced by default."),
                ("Why it matters", "Supports the current supplement strategy", "This supplement supports the current strategy."),
            ])
        case "morning", "morning-completed":
            var o = base("morning-check-in", "Morning Weigh-In", "Daily · Morning", sections: [
                ("What", "Record your weight", "A valid Weight recorded for Oct 4 satisfies this routine automatically."),
                ("When", "Daily · Morning", "Timing comes from the saved Support schedule."),
                ("Execution Notes", "Saved Support note", "Before food or fluids."),
                ("Why it matters", "Track the body-weight trend", "This evidence helps PI evaluate progress and energy strategy against the current goal."),
            ])
            o.completable = false
            o.completionContext = nil
            o.actionLabel = "Log Weight"
            o.continueActionDestination = .checkIn(checkInType: "morning")
            if variant == "morning-completed" {
                o.completed = true
                o.relatedWeight = .init(canonicalId: "weight-oct-4", date: date, value: 182.4, unit: "lb", version: 1)
            }
            return o
        case "photos":
            var o = base("progress-photos", "Progress Photos", "Scheduled for this afternoon.", sections: [
                ("What", "Progress Photos", "Upload Front Relaxed, Back Relaxed, and Back Flexed to complete today's check-in."),
                ("When", "Saturday · Afternoon", "This occurrence follows your saved Progress Photos schedule."),
                ("Execution Notes", "Saved Support note", "Capture the grouped progress photo set under comparable conditions."),
                ("Why it matters", "Visual calibration", "Progress photos support qualitative goals without replacing DEXA or weight evidence."),
            ])
            o.completable = false
            o.completionContext = nil
            o.actionLabel = "Upload Photos"
            o.continueActionDestination = .photoUpload
            return o
        case "dexa":
            var o = base("dexa-appointment", "DEXA tomorrow", "Tomorrow at 7:30 AM", sections: [
                ("What", "DEXA tomorrow", "Your DEXA appointment remains scheduled. This priority does not complete the scan itself."),
                ("When", "Saturday, August 15, 2026 · 7:30 AM", "Timing uses America/Los_Angeles."),
                ("Preparation", "Saved preparation note", "Use the saved clinic instructions."),
                ("Why it matters", "Body-composition calibration", "Confirmed DEXA evidence updates the body-composition record supporting your current strategy."),
            ])
            o.completable = false
            o.completionContext = nil
            o.urgency = .upcoming
            o.actionLabel = "View DEXA Appointment"
            o.continueActionDestination = .operatingPlanDexaAppointment
            return o
        case "completed":
            var o = foam
            o.completed = true
            o.completable = false
            o.skippable = false
            o.detailSections = foam.detailSections.map { $0.filter { $0.title != "Execution Notes" } }
            return o
        case "skipped":
            var o = foam
            o.skipped = true
            o.completable = false
            o.skippable = false
            return o
        case "setup":
            var o = foam
            o.completable = false
            o.skippable = false
            o.actionLabel = "Review Support"
            return o
        default:
            return nil
        }
    }
}
#endif

/// Reads/writes through the same shared `LoggingSandboxStore` Home and
/// Morning Check-In use — never a second, independently-fetched Priority
/// projection. See `PriorityReadModel.swift`'s type-level doc comment.
@Observable
@MainActor
final class PriorityDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PriorityOccurrence?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Sandbox-only compatibility. Founder Production receives its exact
    /// occurrence-bound Weight relationship inside the Priority detail.
    private(set) var morningCheckIn: MorningCheckInReadModel?
    private let api: PriorityAPI
    private let writeAPI: PriorityCompletionWriteAPI
    private let morningCheckInAPI: MorningCheckInAPI
    private let store: LoggingSandboxStore
    private let authority: NativeAPIEnvironment
    private let priorityId: String
    private let occurrenceDate: String?
    private let notificationCleanup: @MainActor (String, String) async -> Void
    private let feedback: PhysiqueOSFeedbackClient?

    init(api: PriorityAPI, writeAPI: PriorityCompletionWriteAPI = NotAvailablePriorityCompletionWriteAPI(), morningCheckInAPI: MorningCheckInAPI, store: LoggingSandboxStore, authority: NativeAPIEnvironment, priorityId: String, occurrenceDate: String? = nil, feedback: PhysiqueOSFeedbackClient? = nil, notificationCleanup: @escaping @MainActor (String, String) async -> Void = { _, _ in }) {
        self.api = api
        self.writeAPI = writeAPI
        self.morningCheckInAPI = morningCheckInAPI
        self.store = store
        self.authority = authority
        self.priorityId = priorityId
        self.occurrenceDate = occurrenceDate
        self.notificationCleanup = notificationCleanup
        self.feedback = feedback
    }

    func load() async {
#if DEBUG
        if let forced = FoamRollingPriorityPilotLaunchConfiguration.forcedState {
            state = forced
            return
        }
        if let pilotOccurrence = FoamRollingPriorityPilotLaunchConfiguration.occurrence(for: priorityId) {
            state = .loaded(pilotOccurrence)
            return
        }
#endif
        if authority == .sandbox {
            state = .loaded(store.priorityOccurrence(id: priorityId))
            return
        }
        do {
            state = .loaded(try await api.fetchPriority(priorityId: priorityId, occurrenceDate: occurrenceDate))
        } catch {
            state = .failed("This priority could not be loaded. Pull to refresh and try again.")
        }
    }

    /// `completePriority` (`src/app/priorities/[priorityId]/actions.js`) —
    /// evidence-aware when the occurrence carries a completion context
    /// (dose/protocol), a plain completion otherwise, matching the real
    /// server's own branch exactly.
    ///
    /// `dose` is the "Took a different amount" override for a peptide
    /// occurrence: it replaces `completionContext.dose` (the Server records
    /// it verbatim as `effectiveDose` in `completionHistory`) and never
    /// touches the dose plan. `nil` (the default, and every non-dosed
    /// occurrence) keeps the Build 69 path byte-for-byte.
    func complete(dose: String? = nil) async {
        guard (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: authority)) != nil else { return }
        guard case .loaded(.some(let occurrence)) = state else { return }
        guard !occurrence.paused else { return }
        let context = Self.completionContext(for: occurrence, dose: dose)
        if authority == .sandbox {
            store.completePriority(occurrenceId: occurrence.id, context: context)
            state = .loaded(store.priorityOccurrence(id: priorityId))
            feedback?.play(.priorityCompleted)
            return
        }
        guard let version = occurrence.expectedVersion else {
            state = .failed("Refresh this priority before completing it.")
            return
        }
        do {
            try await writeAPI.complete(
                priorityId: occurrence.routePriorityId ?? occurrence.id,
                occurrenceDate: occurrence.date,
                context: context,
                expectedVersion: version
            )
            // The durable command is the canonical fact: acknowledge it now.
            // Notification cleanup reconciles the canonical occurrence
            // horizon (a full Home read, 1.4-2.4 s in production) and must
            // not hold the visible acknowledgement hostage.
            var acknowledged = occurrence
            acknowledged.completed = true
            acknowledged.completable = false
            state = .loaded(acknowledged)
            feedback?.play(.priorityCompleted)
            await notificationCleanup(
                occurrence.routePriorityId ?? occurrence.id,
                occurrence.date
            )
            do {
                state = .loaded(try await api.fetchPriority(priorityId: priorityId, occurrenceDate: occurrenceDate))
            } catch {
                // The durable command already succeeded. Keep the canonical
                // acknowledged state instead of presenting a false failure.
            }
        } catch {
            state = .failed("This priority was not marked complete. Refresh before retrying.")
        }
    }

    /// The context the completion command carries. An override only ever
    /// applies to an occurrence the Server projected a planned dose for;
    /// a plain reminder never gains a dose from Native.
    static func completionContext(for occurrence: PriorityOccurrence, dose: String?) -> PriorityCompletionContext? {
        guard let dose, var context = occurrence.completionContext, context.dose != nil else {
            return occurrence.completionContext
        }
        context.dose = dose
        return context
    }

    /// Marks today's occurrence Skipped through the canonical skip command.
    /// Offered only when the Server says the occurrence is skippable.
    func skip() async {
        guard authority == .founderProduction,
              (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: authority)) != nil,
              case .loaded(.some(let occurrence)) = state,
              occurrence.skippable, !occurrence.completed, !occurrence.skipped, !occurrence.paused,
              let version = occurrence.skipExpectedVersion
        else { return }
        do {
            try await writeAPI.skip(
                priorityId: occurrence.routePriorityId ?? occurrence.id,
                occurrenceDate: occurrence.date,
                expectedVersion: version
            )
            var acknowledged = occurrence
            acknowledged.skipped = true
            acknowledged.skippable = false
            acknowledged.completable = false
            state = .loaded(acknowledged)
            feedback?.play(.prioritySkipped)
            // Same cleanup as completion: withdraw this occurrence's local
            // reminder and re-sync Home and the notification horizon.
            await notificationCleanup(occurrence.routePriorityId ?? occurrence.id, occurrence.date)
            do {
                state = .loaded(try await api.fetchPriority(priorityId: priorityId, occurrenceDate: occurrenceDate))
            } catch {
                // The durable skip already succeeded; keep the acknowledged state.
            }
        } catch PrioritySkipError.alreadyCompleted {
            state = .loaded(try? await api.fetchPriority(priorityId: priorityId, occurrenceDate: occurrenceDate))
        } catch {
            state = .failed("This priority was not marked skipped. Refresh before retrying.")
        }
    }
}

/// "Took a different amount" on a peptide occurrence. The Server formats
/// the planned dose as `"<amount> <unit>"` (`"0.5 mg"`) and records the
/// completion's `dose` string verbatim as `effectiveDose`, so the edited
/// amount is re-joined with the planned unit in exactly that shape. Native
/// never invents a unit: a planned dose without one keeps the field hidden.
enum PriorityDoseEntry {
    enum Outcome: Equatable {
        /// The field still shows the planned amount: send the untouched context.
        case unchanged
        /// A different, valid amount: send `"<amount> <unit>"` as the dose.
        case changed(String)
        /// Empty, non-numeric or non-positive: Mark Complete is disabled.
        case invalid
    }

    /// `("0.5", "mg")` from `"0.5 mg"`; `nil` when the planned dose has no
    /// numeric amount followed by a unit.
    static func components(of plannedDose: String) -> (amount: String, unit: String)? {
        let parts = plannedDose.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        guard parts.count == 2, Double(parts[0]) != nil else { return nil }
        return (String(parts[0]), String(parts[1]))
    }

    static func outcome(text: String, plannedDose: String) -> Outcome {
        guard let planned = components(of: plannedDose) else { return .unchanged }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // A comma-decimal keyboard ("0,5") is the same amount as "0.5".
        guard let value = Double(trimmed.replacingOccurrences(of: ",", with: ".")), value > 0, value.isFinite else { return .invalid }
        guard let plannedValue = Double(planned.amount), value != plannedValue else { return .unchanged }
        return .changed("\(format(value)) \(planned.unit)")
    }

    /// `2.5` → "2.5", `2` → "2", `0.75` → "0.75" (no trailing zeros, at
    /// most three decimals — the resolution the Server's dose strings use).
    static func format(_ value: Double) -> String {
        let rounded = (value * 1000).rounded() / 1000
        if rounded == rounded.rounded(.towardZero) { return String(Int(rounded)) }
        var text = String(format: "%.3f", rounded)
        while text.hasSuffix("0") { text.removeLast() }
        return text
    }
}
