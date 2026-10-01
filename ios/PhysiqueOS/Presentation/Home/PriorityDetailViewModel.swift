import Foundation

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

    init(api: PriorityAPI, writeAPI: PriorityCompletionWriteAPI = NotAvailablePriorityCompletionWriteAPI(), morningCheckInAPI: MorningCheckInAPI, store: LoggingSandboxStore, authority: NativeAPIEnvironment, priorityId: String, occurrenceDate: String? = nil, notificationCleanup: @escaping @MainActor (String, String) async -> Void = { _, _ in }) {
        self.api = api
        self.writeAPI = writeAPI
        self.morningCheckInAPI = morningCheckInAPI
        self.store = store
        self.authority = authority
        self.priorityId = priorityId
        self.occurrenceDate = occurrenceDate
        self.notificationCleanup = notificationCleanup
    }

    func load() async {
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
