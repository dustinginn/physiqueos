import Foundation

enum TrainingLoggerMode: String, Codable, Equatable {
    case live
    case past

    var title: String { self == .live ? "Live workout" : "Past workout" }
}

enum TrainingLoggerStep: String, Codable, Equatable {
    case entry
    case areas
    case exercises
    case workout
    case summary
    case evidence
    case review
    case complete
}

enum TrainingLoggerMeasurement: String, Codable, Equatable {
    case repsLoad = "reps_load"
    case bodyweightReps = "bodyweight_reps"
    case duration
}

struct TrainingLoggerArea: Codable, Equatable, Identifiable {
    var id: String
    var label: String
}

struct TrainingLoggerConfiguration: Codable, Equatable {
    var areas: [TrainingLoggerArea]
    /// Legacy global list. Build 92 never offers it as choices: choices are
    /// per exercise (`TrainingLoggerCatalogExercise.executionVariants`).
    var variants: [TrainingExecutionVariant]
    var exercises: [TrainingLoggerCatalogExercise]
    /// Server-owned learned category suggestion derived from confirmed
    /// canonical Training history. Optional keeps older fixtures and
    /// production payloads forward-decodable.
    var categorySuggestion: TrainingLoggerCategorySuggestion? = nil
    /// True only when the Server projected `executionVariantsByExercise`
    /// (the Build 92 variant contract). An older Server omits it, which means
    /// Ordinary only and no Create Variant. Optional so older fixtures and
    /// saved configurations decode unchanged.
    var supportsExecutionVariantCreation: Bool? = nil
}

struct TrainingLoggerCategorySuggestion: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var label: String
    var categoryIds: [String]
    var reason: String
    var source: String
    var historyReferences: [String]
}

/// One Server recommendation keyed to a relationship context. The Server's
/// own `relationshipKey` is kept for diagnostics; matching uses the typed
/// relationship type plus the exact partner canonical-id set.
struct TrainingLoggerContextualProgressionRecommendation: Codable, Equatable {
    var relationshipType: String
    var relationshipKey: String?
    var partnerCanonicalExerciseIds: [String]
    var recommendation: TrainingLoggerProgressionRecommendation
}

struct TrainingLoggerCatalogExercise: Codable, Equatable, Identifiable {
    var id: String { canonicalExerciseId }
    var canonicalExerciseId: String
    var name: String
    var areaId: String
    var equipment: String?
    var measurement: TrainingLoggerMeasurement
    var defaultLoadType: String? = nil
    var previouslyPerformed: Bool
    /// My Library membership — server-computed as performed history UNION
    /// explicit Founder additions (`CoreNavigationReadService
    /// .getTrainingLogger`'s `initialMyLibraryExerciseIds`). Optional (not
    /// `= false`, matching `defaultLoadType`'s own precedent above) because
    /// a Codable-synthesized decoder only treats a missing key as absent
    /// for genuinely `Optional` properties — a non-optional default value
    /// is a memberwise-init convenience only and still fails decoding a
    /// fixture JSON that predates this field. Treat `nil` as `false`
    /// everywhere this is read.
    var inMyLibrary: Bool? = nil
    var history: [TrainingLoggerHistoryRecord]
    var progressionRecommendation: TrainingLoggerProgressionRecommendation?
    /// Server-owned Suggested/Maintain for superset relationship contexts
    /// (`contextualProgressionRecommendations`). Optional so older payloads,
    /// fixtures and saved configurations decode unchanged.
    var contextualProgressionRecommendations: [TrainingLoggerContextualProgressionRecommendation]? = nil
    /// Server-owned canonical execution-variant choices for exactly this
    /// exercise (Build 92). `nil`/empty means Ordinary only; never inferred
    /// from history.
    var executionVariants: [TrainingExecutionVariantChoice]? = nil

    var executionVariantChoices: [TrainingExecutionVariantChoice] {
        (executionVariants ?? []).filter(\.isSelectable)
    }

    /// The Server recommendation for exactly this execution/relationship
    /// context, or `nil`. Native never derives progression: standalone uses
    /// the standalone recommendation; a superset uses only a contextual
    /// recommendation whose relationship names exactly the current partners.
    func progressionRecommendation(
        variant: TrainingExecutionVariant?,
        relationship: TrainingExerciseRelationshipContext?
    ) -> TrainingLoggerProgressionRecommendation? {
        guard variant == nil else { return nil }
        guard let relationship else { return progressionRecommendation }
        let partners = relationship.partnerCanonicalExerciseIds.sorted()
        guard !partners.isEmpty else { return nil }
        return contextualProgressionRecommendations?.first { candidate in
            candidate.relationshipType == relationship.relationshipType
                && candidate.partnerCanonicalExerciseIds.sorted() == partners
        }?.recommendation
    }

    var historyOccurrences: [TrainingExerciseHistoryOccurrence] {
        history.map { record in
            TrainingExerciseHistoryOccurrence(
                sessionId: record.sessionId,
                sessionDate: record.workoutDate,
                exercise: TrainingExerciseOccurrence(
                    id: "\(record.sessionId)-\(canonicalExerciseId)",
                    name: name,
                    canonicalExerciseId: canonicalExerciseId,
                    executionVariant: record.executionVariant,
                    sets: record.sets
                ),
                relationship: record.relationship.map {
                    TrainingExerciseRelationshipContext(
                        relationshipType: $0.relationshipType,
                        partnerNames: $0.partnerNames,
                        partnerCanonicalExerciseIds: $0.partnerCanonicalExerciseIds
                    )
                }
            )
        }
    }
}

struct TrainingLoggerHistoryRecord: Codable, Equatable {
    var sessionId: String
    var workoutDate: String
    var executionVariant: TrainingExecutionVariant?
    var relationship: TrainingLoggerHistoryRelationship?
    var sets: [TrainingSet]
}

struct TrainingLoggerHistoryRelationship: Codable, Equatable {
    var relationshipType: String
    var partnerNames: [String]
    var partnerCanonicalExerciseIds: [String]
}

struct TrainingLoggerDraft: Codable, Equatable, Identifiable {
    var id: String
    var mode: TrainingLoggerMode
    var workoutDate: String
    var selectedAreaIds: [String]
    var exercises: [TrainingLoggerDraftExercise]
    var relationships: [TrainingLoggerDraftRelationship]
    var step: TrainingLoggerStep
    /// Present only while the accepted picker is being reused from set entry.
    /// Optional keeps build-5 drafts forward-decodable.
    var exercisePickerReturnStep: TrainingLoggerStep?
    var exercisePickerExistingExerciseIds: [String]?
    /// Manual Apple Health screenshots are supporting workout evidence today.
    /// A future HealthKit adapter can populate this same boundary.
    var supportingEvidence: [TrainingLoggerSupportingEvidence]?
    /// Qualifying non-strength workouts remain separate observations even
    /// when this review reconciles the same gym visit.
    var supportingWorkouts: [TrainingLoggerSupportingWorkout]?
    /// Supporting-evidence asset ids whose local interpretation could not
    /// extract workout details — kept separate from `supportingWorkouts`
    /// so a failed screenshot never silently falls back to a fixture
    /// result and is never confused with a genuinely successful read.
    var supportingWorkoutFailureAssetIds: [String]?
    /// Exact live-workout start instant when Native observed one. Legacy
    /// drafts and date-only past workouts intentionally remain nil.
    var startedAt: String? = nil
    /// Exact instant the Founder first pressed Finish for a live workout.
    /// It is persisted before the network commit so retries preserve one
    /// stable session window instead of moving the end boundary.
    var finishedAt: String? = nil
    /// Persisted exact-draft command lifecycle. Missing on legacy drafts.
    /// This is presentation/recovery state only; the draft id and the
    /// persisted idempotency key remain the mutation identity.
    var submissionState: TrainingLoggerSubmissionState? = nil
    /// When the Founder chose Save & Leave. A left workout stays resumable
    /// from Log's saved workouts, but the Log tab no longer routes into it.
    /// Cleared when the workout is resumed.
    var leftAt: String? = nil
    /// Monotonic local revision, advanced by `TrainingSessionAuthority` on
    /// every accepted mutation. Local-only concurrency state (never sent to
    /// the Server); `nil` on drafts written before the authority existed and
    /// read as 0.
    var revision: Int? = nil
    /// Bounded ledger of the most recent caller-supplied mutation ids the
    /// authority accepted for this draft, so a replayed command (for example
    /// a future Live Activity intent delivered twice) is recognized even
    /// after relaunch. Local-only.
    var appliedMutationIds: [String]? = nil
    /// The active rest interval, owned by `TrainingSessionAuthority`. Absolute
    /// timestamps only; nothing ticks. Local-only.
    var rest: TrainingSessionRestState? = nil
    /// Structured workout pause, distinct from Save & Leave. While present,
    /// no set/rest mutation is accepted and elapsed workout/rest clocks are
    /// frozen. Optional keeps every older persisted draft decodable.
    var pausedAt: String? = nil
    var accumulatedPausedSeconds: Double? = nil
    /// Explicit phone-created eligibility for the paired Watch. This is a
    /// planning marker, not an independently executable Watch plan.
    var readyForWatchAt: String? = nil
    /// When the paired Watch started this plan. A Watch-started session owns
    /// a Watch HealthKit workout, so its Finish expects a Health leg.
    var watchStartedAt: String? = nil
    /// When the paired Watch began a HealthKit workout for a session that
    /// was already running (started on the phone). Kept separate from
    /// `watchStartedAt` so the structured start, and therefore every trusted
    /// correlation envelope, is unchanged. Local-only.
    var watchHealthStartedAt: String? = nil
    /// The Founder chose "Use without Watch" in the guided Watch handoff for
    /// this workout. Local-only; the handoff is never offered again for this
    /// session, including after relaunch or a later Watch reconnect.
    var watchHandoffDeclinedAt: String? = nil

    /// The Watch owns a HealthKit workout for this session, so its Finish
    /// expects a Health leg.
    var expectsWatchHealthWorkout: Bool { watchStartedAt != nil || watchHealthStartedAt != nil }
    /// Persisted two-step finish gate shared by phone/Watch commands. Finish
    /// is never inferred from progress, including after the final set.
    var finishConfirmationRequestedAt: String? = nil
    /// One stable finish operation per session (Build 83: minted by the
    /// first confirmed Finish from either the phone or the Watch, then
    /// reused by every later Finish). It joins the structured Server commit
    /// and, for a Watch-started session, the Watch HealthKit save. Optional
    /// fields keep every pre-Watch draft backward-decodable. The structured
    /// commit alone ends the session; the Health leg continues independently
    /// and is recorded on the completion afterwards.
    var watchFinishOperationId: String? = nil
    var watchHealthSaveState: WatchWorkoutFinishComponentState? = nil
    var watchServerCommitState: WatchWorkoutFinishComponentState? = nil
    var watchAuthoritativePRCount: Int? = nil
    /// The Server-authoritative performance records a Watch-finished commit
    /// returned (or read back). Retained on the pending Workout Complete
    /// presentation so the phone recap matches a phone-finished one without
    /// depending on a second network read. Never computed locally.
    var watchAuthoritativePerformanceRecords: [TrainingPerformanceRecord]? = nil
    /// Session-level rest override. `nil` defers to the rest preference
    /// provider (exercise, then global), and finally to Off.
    var restConfiguration: TrainingRestConfiguration? = nil

    var currentRevision: Int { revision ?? 0 }
    /// Set only after this exact draft is proven durable and before the
    /// Founder explicitly leaves Workout Complete. Keeping that narrow
    /// acknowledgement boundary durable lets a late PR read survive a tab
    /// switch or process restart without replaying historical workouts.
    /// Such a draft is a read-only presentation record held by
    /// `TrainingSessionAuthority`, never an editable session.
    var completionPresentationPending: Bool? = nil
    /// When the durable completion was recorded on this device; bounds how
    /// long an unacknowledged presentation may still route the Log tab.
    var completionRecordedAt: String? = nil

    static func fresh(mode: TrainingLoggerMode, workoutDate: String, startedAt: String? = nil) -> Self {
        .init(
            id: UUID().uuidString,
            mode: mode,
            workoutDate: workoutDate,
            selectedAreaIds: [],
            exercises: [],
            relationships: [],
            step: .areas,
            exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil,
            supportingEvidence: nil,
            supportingWorkouts: nil,
            supportingWorkoutFailureAssetIds: nil,
            startedAt: startedAt
        )
    }

    var completedSetCount: Int {
        exercises.flatMap(\.sets).filter(\.isCompleted).count
    }

    var totalSetCount: Int {
        exercises.reduce(0) { $0 + $1.sets.count }
    }

    var variantCount: Int { exercises.filter { $0.executionVariant != nil }.count }
    var supersetCount: Int { relationships.count }
    var isAddingExercises: Bool { exercisePickerReturnStep == .workout }
    var supportingEvidenceAssets: [TrainingLoggerSupportingEvidence] { supportingEvidence ?? [] }
    var supportingWorkoutObservations: [TrainingLoggerSupportingWorkout] { supportingWorkouts ?? [] }
    var supportingWorkoutFailureIds: [String] { supportingWorkoutFailureAssetIds ?? [] }
    var addedExerciseCount: Int {
        guard isAddingExercises else { return exercises.count }
        let existing = Set(exercisePickerExistingExerciseIds ?? [])
        return exercises.filter { !existing.contains($0.id) }.count
    }
}

extension TrainingLoggerDraft {
    /// How long a live workout counts as "in progress" for Log-tab routing.
    /// An older live draft is treated as abandoned: it stays resumable from
    /// Log's saved-workouts card, but tapping Log no longer jumps into it.
    static let activeLiveSessionWindow: TimeInterval = 12 * 60 * 60

    /// The Workout Logger session the Founder is in the middle of, if any:
    /// the newest live (not past) draft that is not complete, not already
    /// submitted, and started within `activeLiveSessionWindow`.
    static func activeLiveSession(in drafts: [TrainingLoggerDraft], now: Date = Date()) -> TrainingLoggerDraft? {
        // Accepts both plain and fractional-second timestamps (Build 90): the
        // authority stamps Watch starts with fractional seconds, which a plain
        // ISO8601DateFormatter cannot parse, so a Watch-started session was
        // invisible to Log-tab routing and to the one-live-session guard.
        func started(_ draft: TrainingLoggerDraft) -> Date? {
            draft.startedAt.flatMap(TrainingSessionClock.date(from:))
        }
        return drafts
            .filter { draft in
                guard draft.mode == .live, draft.step != .complete, draft.submissionState == nil,
                      draft.leftAt == nil, let start = started(draft) else { return false }
                let age = now.timeIntervalSince(start)
                return age >= -5 * 60 && age <= activeLiveSessionWindow
            }
            .max { (started($0) ?? .distantPast) < (started($1) ?? .distantPast) }
    }

    /// A completion written by the current Native lifecycle that has not yet
    /// been acknowledged from Workout Complete. Legacy completed drafts do
    /// not carry the marker and therefore never become surprise celebrations.
    static func pendingCompletion(in drafts: [TrainingLoggerDraft]) -> TrainingLoggerDraft? {
        drafts
            .filter(\.isPendingCompletionPresentation)
            .max {
                let left = $0.completionSortKey, right = $1.completionSortKey
                return left == right ? $0.id < $1.id : left < right
            }
    }

    var isPendingCompletionPresentation: Bool {
        step == .complete && completionPresentationPending == true
    }

    /// ISO-8601 strings compare chronologically, so the newest completion
    /// sorts last.
    var completionSortKey: String { completionRecordedAt ?? finishedAt ?? startedAt ?? workoutDate }
}

enum TrainingLoggerSubmissionState: String, Codable, Equatable {
    case acceptedProcessing
    case resultUnknown
}

enum WatchWorkoutFinishComponentState: String, Codable, Equatable, Sendable {
    case pending
    case succeeded
    case failed
}

struct TrainingLoggerSupportingEvidence: Codable, Equatable, Identifiable {
    enum Source: String, Codable, Equatable {
        case photos = "Photos"
        case files = "Files"
    }

    var id: String
    var displayName: String
    var source: Source
    /// Local Application Support reference only. The bytes are uploaded
    /// through the authenticated evidence-intake transport and this value
    /// is never sent to the server.
    var storageReference: String? = nil
    var contentType: String? = nil
}

enum TrainingLoggerWorkoutRecordOwner: String, Codable, Equatable {
    case trainingSession
    case activity
}

struct TrainingLoggerSupportingWorkout: Codable, Equatable, Identifiable {
    var id: String
    var activityName: String
    var category: String
    var durationMinutes: Double
    var activeCalories: Double?
    var totalCalories: Double?
    var averageHeartRate: Double?
    var distance: Double?
    var distanceUnit: String?
    var sourceEvidenceIds: [String]
    var recordOwner: TrainingLoggerWorkoutRecordOwner

    /// Fixture/test-only demonstration workout. Never produced by the real
    /// attach flow — `TrainingLoggerDraft.addSupportingEvidence` no longer
    /// auto-populates this; a real screenshot's metrics come only from
    /// `EvidenceLocalInterpretation.supportingWorkout(id:sourceEvidenceIds:from:)`
    /// via `setSupportingWorkoutInterpretation`.
    static func stairStepper(sourceEvidenceIds: [String]) -> Self {
        .init(
            id: "supporting-cardio-stair-stepper",
            activityName: "Stair Stepper",
            category: "Cardio",
            durationMinutes: 42,
            activeCalories: 386,
            totalCalories: nil,
            averageHeartRate: 128,
            distance: nil,
            distanceUnit: nil,
            sourceEvidenceIds: sourceEvidenceIds,
            recordOwner: .activity
        )
    }
}

struct TrainingLoggerDraftExercise: Codable, Equatable, Identifiable {
    var id: String
    var canonicalExerciseId: String?
    var name: String
    var areaId: String
    var measurement: TrainingLoggerMeasurement
    var defaultLoadType: String? = nil
    var executionVariant: TrainingExecutionVariant?
    var sets: [TrainingLoggerDraftSet]
    var previousPerformance: TrainingLoggerPreviousPerformance?
    var progressionRecommendation: TrainingLoggerProgressionRecommendation?
    var progressionChoice: TrainingLoggerProgressionChoice?
    var isProvisional: Bool
    var provenance: String?
}

struct TrainingLoggerDraftSet: Codable, Equatable, Identifiable {
    var id: String
    var setNumber: Int
    var reps: Double?
    var load: Double?
    /// Canonical loading semantics. `nil` is retained for older saved
    /// drafts and resolved from the exercise default plus entered load at
    /// the submission boundary.
    var loadType: String?
    var durationSeconds: Double?
    var isCompleted: Bool
    /// Instant this set last transitioned incomplete -> complete in a live
    /// session (ISO8601, fractional seconds). Stamped and cleared only by
    /// `TrainingSessionAuthority`; never backfilled for older drafts and
    /// never sent in the training commit. See `TrainingSessionInvariants`.
    var completedAt: String? = nil
    /// The Founder typed a value into this row. Contextual refills (superset
    /// pair / unpair / re-pair) only touch rows that are neither completed
    /// nor hand-edited. Local-only; never part of the training commit.
    var isManuallyEdited: Bool? = nil

    init(
        id: String,
        setNumber: Int,
        reps: Double?,
        load: Double?,
        loadType: String? = nil,
        durationSeconds: Double?,
        isCompleted: Bool,
        completedAt: String? = nil
    ) {
        self.id = id
        self.setNumber = setNumber
        self.reps = reps
        self.load = load
        self.loadType = loadType
        self.durationSeconds = durationSeconds
        self.isCompleted = isCompleted
        self.completedAt = completedAt
    }

    static func empty(number: Int) -> Self {
        .init(id: UUID().uuidString, setNumber: number, reps: nil, load: nil, loadType: nil, durationSeconds: nil, isCompleted: false)
    }

    init(source: TrainingSet, number: Int) {
        id = UUID().uuidString
        setNumber = number
        reps = source.reps
        (load, loadType) = Self.prepopulatedLoad(from: source)
        durationSeconds = source.durationSeconds
        isCompleted = false
    }

    /// A historical bodyweight set is bodyweight whether it was stored as a
    /// null load or a numeric `0 lb`; prepopulation carries the bodyweight
    /// meaning (no load), never the stored zero. Stored history is untouched.
    static func prepopulatedLoad(from source: TrainingSet) -> (load: Double?, loadType: String?) {
        source.semantics == .bodyweight ? (nil, "bodyweight") : (source.weight, source.loadType)
    }

    /// This set's semantic classification, with the exercise default as the
    /// bodyweight base.
    func loadSemantics(defaultLoadType: String?) -> TrainingSetLoadSemantics {
        // A bodyweight marker prepopulated from history is stale once the user enters
        // added load, so a positive entered load classifies the set as weighted.
        let marker = loadType == "bodyweight" && (load ?? 0) > 0 ? nil : loadType
        return TrainingSetLoadSemantics.classify(weight: load, loadType: marker, defaultLoadType: defaultLoadType)
    }

    /// The canonical write shape. A bodyweight set (any encoding: no load or a
    /// zero load) is `bodyweight` with no external load; a weighted bodyweight
    /// or external-load set is `external_load` at its load.
    func writeRepresentation(defaultLoadType: String?) -> (load: Double?, loadType: String, unit: String) {
        loadSemantics(defaultLoadType: defaultLoadType) == .bodyweight
            ? (nil, "bodyweight", "bodyweight")
            : (load, "external_load", "lb")
    }

    func validationMessage(for measurement: TrainingLoggerMeasurement) -> String? {
        switch measurement {
        case .repsLoad:
            guard let reps, reps > 0 else { return "Enter reps greater than zero." }
            guard let load, load >= 0 else { return "Enter a load of zero or more." }
        case .bodyweightReps:
            guard let reps, reps > 0 else { return "Enter reps greater than zero." }
        case .duration:
            guard let durationSeconds, durationSeconds > 0 else { return "Enter a duration greater than zero." }
        }
        return nil
    }
}

struct TrainingLoggerPreviousPerformance: Codable, Equatable {
    var workoutDate: String
    var sets: [TrainingSet]
    var contextLabel: String

    var compactSummary: String {
        sets.map(\.glance).joined(separator: " · ")
    }

    var compactLine: String {
        "Previous \(sets.first?.glance ?? compactSummary) · \(workoutDate) · \(contextLabel)"
    }
}

enum TrainingLoggerProgressionState: String, Codable, Equatable {
    case opportunity
    case maintain
    case recover
}

enum TrainingLoggerProgressionChoice: String, Codable, Equatable {
    case suggestion
    case previous
}

struct TrainingLoggerProgressionRecommendation: Codable, Equatable {
    var state: TrainingLoggerProgressionState
    var eyebrow: String
    var message: String
    var prescription: String
    var suggestedLoad: Double?
    var suggestedLoadType: String? = nil
    var suggestedReps: Double?
    var suggestedUnit: String? = nil

    var hasExplicitTarget: Bool {
        suggestedReps != nil && (suggestedLoad != nil || suggestedLoadType == "bodyweight")
    }
}

/// The exact values a Logger suggestion can put into its pound-based editable
/// rows. Resolution is deliberately fail-closed: malformed numbers, unknown
/// units and unsupported timed recommendations never become mutation actions.
struct TrainingLoggerProgressionTarget: Equatable {
    private static let poundsPerKilogram = 2.204_622_621_8
    private static let comparisonScale = 10.0

    let reps: Double
    let load: Double?
    let loadType: String

    static func resolve(
        _ recommendation: TrainingLoggerProgressionRecommendation,
        measurement: TrainingLoggerMeasurement,
        defaultLoadType: String?
    ) -> Self? {
        guard measurement != .duration,
              let suggestedReps = recommendation.suggestedReps,
              suggestedReps.isFinite, suggestedReps > 0
        else { return nil }

        let semantics = TrainingSetLoadSemantics.classify(
            weight: recommendation.suggestedLoad,
            weightUnit: recommendation.suggestedUnit,
            loadType: recommendation.suggestedLoadType,
            defaultLoadType: defaultLoadType
        )
        switch semantics {
        case .bodyweight:
            return .init(reps: normalized(suggestedReps), load: nil, loadType: "bodyweight")
        case .weightedBodyweight, .externalLoad:
            guard let suggestedLoad = recommendation.suggestedLoad,
                  let pounds = pounds(suggestedLoad, unit: recommendation.suggestedUnit)
            else { return nil }
            return .init(reps: normalized(suggestedReps), load: pounds, loadType: "external_load")
        case .unknown:
            return nil
        }
    }

    func changes(_ set: TrainingLoggerDraftSet, defaultLoadType: String?) -> Bool {
        guard !set.isCompleted else { return false }
        if !Self.equal(set.reps, reps) { return true }
        let currentSemantics = set.loadSemantics(defaultLoadType: defaultLoadType)
        let targetSemantics = TrainingSetLoadSemantics.classify(
            weight: load, loadType: loadType, defaultLoadType: defaultLoadType
        )
        guard currentSemantics == targetSemantics else { return true }
        switch targetSemantics {
        case .bodyweight:
            return false
        case .weightedBodyweight, .externalLoad:
            return !Self.equal(set.load, load)
        case .unknown:
            return false
        }
    }

    private static func pounds(_ value: Double, unit: String?) -> Double? {
        guard value.isFinite, value >= 0 else { return nil }
        let unit = unit?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pounds: Double
        switch unit {
        case nil, "", "lb", "lbs", "pound", "pounds":
            pounds = value
        case "kg", "kgs", "kilogram", "kilograms":
            pounds = value * poundsPerKilogram
        default:
            return nil
        }
        return normalized(pounds)
    }

    private static func normalized(_ value: Double) -> Double {
        (value * comparisonScale).rounded() / comparisonScale
    }

    private static func equal(_ left: Double?, _ right: Double?) -> Bool {
        guard let left, let right, left.isFinite, right.isFinite else { return left == nil && right == nil }
        return normalized(left) == normalized(right)
    }
}

extension TrainingLoggerDraftExercise {
    var progressionSuggestionTarget: TrainingLoggerProgressionTarget? {
        progressionRecommendation.flatMap {
            TrainingLoggerProgressionTarget.resolve(
                $0, measurement: measurement, defaultLoadType: defaultLoadType
            )
        }
    }

    var canApplyProgressionSuggestion: Bool {
        guard let target = progressionSuggestionTarget else { return false }
        return sets.contains { target.changes($0, defaultLoadType: defaultLoadType) }
    }
}

struct TrainingLoggerDraftRelationship: Codable, Equatable, Identifiable {
    var id: String
    var relationshipType: String
    var memberExerciseIds: [String]
}

struct TrainingLoggerSummary: Equatable {
    var exerciseCount: Int
    var completedSetCount: Int
    var variantCount: Int
    var supersetCount: Int
}

extension TrainingLoggerDraft {
    mutating func toggleArea(_ areaId: String) {
        if let index = selectedAreaIds.firstIndex(of: areaId) {
            selectedAreaIds.remove(at: index)
        } else {
            selectedAreaIds.append(areaId)
        }
    }

    /// `browseAll == false` (the default, fast daily path) scopes the
    /// picker to My Library — performed history UNION explicit Founder
    /// additions, both server-computed (`inMyLibrary`). `browseAll == true`
    /// is the deliberate "All Exercises" search: the full canonical
    /// catalog, unfiltered by membership, for finding something not yet in
    /// My Library or reaching Create New Exercise.
    func pickerExercises(
        in catalog: [TrainingLoggerCatalogExercise],
        browseAll: Bool,
        query: String,
        includeAllAreas: Bool = false
    ) -> [TrainingLoggerCatalogExercise] {
        let selected = Set(selectedAreaIds)
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return catalog
            .filter { includeAllAreas || selected.contains($0.areaId) }
            .filter { browseAll || ($0.inMyLibrary ?? false) }
            .filter { normalizedQuery.isEmpty || $0.name.lowercased().contains(normalizedQuery) }
            .sorted {
                if $0.previouslyPerformed != $1.previouslyPerformed { return $0.previouslyPerformed && !$1.previouslyPerformed }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    mutating func addExercise(_ catalogExercise: TrainingLoggerCatalogExercise) {
        guard !exercises.contains(where: { $0.canonicalExerciseId == catalogExercise.canonicalExerciseId }) else { return }
        let previous = comparablePerformance(for: catalogExercise, variant: nil, relationship: nil)
        let sets = previous?.sets.enumerated().map { TrainingLoggerDraftSet(source: $0.element, number: $0.offset + 1) }
            ?? (1...3).map(TrainingLoggerDraftSet.empty)
        exercises.append(.init(
            id: UUID().uuidString,
            canonicalExerciseId: catalogExercise.canonicalExerciseId,
            name: catalogExercise.name,
            areaId: catalogExercise.areaId,
            measurement: catalogExercise.measurement,
            defaultLoadType: catalogExercise.defaultLoadType,
            executionVariant: nil,
            sets: sets,
            previousPerformance: previous,
            progressionRecommendation: previous == nil ? nil : catalogExercise.progressionRecommendation,
            progressionChoice: previous == nil || catalogExercise.progressionRecommendation == nil ? nil : .previous,
            isProvisional: false,
            provenance: nil
        ))
    }

    mutating func beginAddingExercises() {
        exercisePickerReturnStep = .workout
        exercisePickerExistingExerciseIds = exercises.map(\.id)
        step = .exercises
    }

    mutating func finishExerciseSelection() {
        step = exercisePickerReturnStep ?? .workout
        exercisePickerReturnStep = nil
        exercisePickerExistingExerciseIds = nil
    }

    func exerciseWasPresentBeforePicker(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        guard isAddingExercises,
              let draftExercise = exercises.first(where: {
                  $0.canonicalExerciseId == exercise.canonicalExerciseId
              }) else { return false }
        return Set(exercisePickerExistingExerciseIds ?? []).contains(draftExercise.id)
    }

    /// Records asset metadata only — it does not itself decide what the
    /// workout was. Real interpretation is async (local OCR), so the
    /// caller attaches metadata here immediately for a responsive picker,
    /// then reports each asset's actual interpreted result separately via
    /// `setSupportingWorkoutInterpretation` once local extraction finishes.
    mutating func addSupportingEvidence(_ assets: [TrainingLoggerSupportingEvidence]) {
        var current = supportingEvidenceAssets
        var identities = Set(current.map { "\($0.source.rawValue)|\($0.displayName)" })
        for asset in assets where identities.insert("\(asset.source.rawValue)|\(asset.displayName)").inserted {
            current.append(asset)
        }
        supportingEvidence = current
    }

    mutating func removeSupportingEvidence(id: String) {
        supportingEvidence = supportingEvidenceAssets.filter { $0.id != id }
        supportingWorkouts = supportingWorkoutObservations.filter { !$0.sourceEvidenceIds.contains(id) }
        let remainingFailures = supportingWorkoutFailureIds.filter { $0 != id }
        supportingWorkoutFailureAssetIds = remainingFailures.isEmpty ? nil : remainingFailures
    }

    mutating func retainSupportingEvidenceFile(assetId: String, reference: String, contentType: String) {
        guard let index = supportingEvidenceAssets.firstIndex(where: { $0.id == assetId }) else { return }
        var assets = supportingEvidenceAssets
        assets[index].storageReference = reference
        assets[index].contentType = contentType
        supportingEvidence = assets
    }

    /// Attaches one supporting-evidence asset's real, locally interpreted
    /// workout — one entry per asset (`sourceEvidenceIds: [assetId]`), so
    /// multiple attached screenshots that represent multiple distinct
    /// workouts stay distinct rather than being merged into one combined
    /// record. `workout == nil` records that this specific asset's local
    /// interpretation could not extract workout details — a genuinely
    /// different, explicit outcome from a successful read, never
    /// papered over with fixture/demo values.
    mutating func setSupportingWorkoutInterpretation(assetId: String, workout: TrainingLoggerSupportingWorkout?) {
        guard supportingEvidenceAssets.contains(where: { $0.id == assetId }) else { return }
        var workouts = supportingWorkoutObservations.filter { $0.sourceEvidenceIds != [assetId] }
        var failures = Set(supportingWorkoutFailureIds)
        if let workout {
            var stamped = workout
            stamped.sourceEvidenceIds = [assetId]
            workouts.append(stamped)
            failures.remove(assetId)
        } else {
            failures.insert(assetId)
        }
        supportingWorkouts = workouts
        supportingWorkoutFailureAssetIds = failures.isEmpty ? nil : failures.sorted()
    }

    mutating func addProvisionalExercise(name: String, areaId: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty,
              !exercises.contains(where: { $0.name.caseInsensitiveCompare(cleanName) == .orderedSame }) else { return }
        exercises.append(.init(
            id: UUID().uuidString,
            canonicalExerciseId: nil,
            name: cleanName,
            areaId: areaId,
            measurement: .repsLoad,
            defaultLoadType: nil,
            executionVariant: nil,
            sets: (1...3).map(TrainingLoggerDraftSet.empty),
            previousPerformance: nil,
            progressionRecommendation: nil,
            progressionChoice: nil,
            isProvisional: true,
            provenance: "User-entered during local Native workout capture; requires canonical review."
        ))
    }

    mutating func removeExercise(id: String) {
        removeExercise(id: id, catalog: nil)
    }

    /// Removing a superset member returns its surviving partner to its
    /// standalone context, refreshed like an explicit unpair.
    mutating func removeExercise(id: String, catalog: [TrainingLoggerCatalogExercise]?) {
        let partners = relationships.first(where: { $0.memberExerciseIds.contains(id) })?.memberExerciseIds.filter { $0 != id } ?? []
        exercises.removeAll { $0.id == id }
        relationships.removeAll { $0.memberExerciseIds.contains(id) }
        guard let catalog else { return }
        refreshMembershipContext(of: partners, catalog: catalog)
    }

    mutating func moveExercise(id: String, offset: Int) {
        guard let index = exercises.firstIndex(where: { $0.id == id }) else { return }
        let destination = max(0, min(exercises.count - 1, index + offset))
        guard destination != index else { return }
        let exercise = exercises.remove(at: index)
        exercises.insert(exercise, at: destination)
    }

    mutating func addSet(to exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        var set = exercises[index].sets.last ?? .empty(number: 1)
        set.id = UUID().uuidString
        set.setNumber = exercises[index].sets.count + 1
        set.isCompleted = false
        set.completedAt = nil
        exercises[index].sets.append(set)
    }

    mutating func removeSet(exerciseId: String, setId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }), exercises[index].sets.count > 1 else { return }
        exercises[index].sets.removeAll { $0.id == setId }
        for setIndex in exercises[index].sets.indices { exercises[index].sets[setIndex].setNumber = setIndex + 1 }
    }

    mutating func applyVariant(_ variant: TrainingExecutionVariant?, to exerciseId: String, catalog: [TrainingLoggerCatalogExercise]) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises[index].executionVariant = variant
        refreshPreviousPerformance(at: index, catalog: catalog)
    }

    mutating func applyProgressionSuggestion(to exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }),
              exercises[index].canApplyProgressionSuggestion,
              let target = exercises[index].progressionSuggestionTarget
        else { return }
        exercises[index].progressionChoice = .suggestion
        // Completed sets are performed history: guidance only fills the rest.
        for setIndex in exercises[index].sets.indices
        where target.changes(exercises[index].sets[setIndex], defaultLoadType: exercises[index].defaultLoadType) {
            exercises[index].sets[setIndex].reps = target.reps
            exercises[index].sets[setIndex].load = target.load
            exercises[index].sets[setIndex].loadType = target.loadType
            exercises[index].sets[setIndex].isCompleted = false
        }
    }

    mutating func keepPreviousPerformance(for exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }),
              let previous = exercises[index].previousPerformance,
              !previous.sets.isEmpty else { return }
        exercises[index].progressionChoice = .previous
        for setIndex in exercises[index].sets.indices where !exercises[index].sets[setIndex].isCompleted {
            let source = previous.sets[min(setIndex, previous.sets.count - 1)]
            exercises[index].sets[setIndex].reps = source.reps
            (exercises[index].sets[setIndex].load, exercises[index].sets[setIndex].loadType) = TrainingLoggerDraftSet.prepopulatedLoad(from: source)
            exercises[index].sets[setIndex].durationSeconds = source.durationSeconds
            exercises[index].sets[setIndex].isCompleted = false
        }
    }

    mutating func setSuperset(firstId: String, secondId: String, catalog: [TrainingLoggerCatalogExercise]) {
        guard firstId != secondId,
              exercises.contains(where: { $0.id == firstId }),
              exercises.contains(where: { $0.id == secondId }) else { return }
        // Re-pairing a member also changes the context of its former partner.
        let formerMembers = relationships
            .filter { $0.memberExerciseIds.contains(firstId) || $0.memberExerciseIds.contains(secondId) }
            .flatMap(\.memberExerciseIds)
        relationships.removeAll { $0.memberExerciseIds.contains(firstId) || $0.memberExerciseIds.contains(secondId) }
        relationships.append(.init(id: UUID().uuidString, relationshipType: "superset", memberExerciseIds: [firstId, secondId]))
        var affected = [firstId, secondId]
        for id in formerMembers where !affected.contains(id) { affected.append(id) }
        refreshMembershipContext(of: affected, catalog: catalog)
    }

    mutating func removeSuperset(containing exerciseId: String, catalog: [TrainingLoggerCatalogExercise]) {
        let affected = relationships.first(where: { $0.memberExerciseIds.contains(exerciseId) })?.memberExerciseIds ?? []
        relationships.removeAll { $0.memberExerciseIds.contains(exerciseId) }
        refreshMembershipContext(of: affected, catalog: catalog)
    }

    mutating func swapExercise(id: String, with replacement: TrainingLoggerCatalogExercise) {
        guard let index = exercises.firstIndex(where: { $0.id == id }),
              !exercises.contains(where: { $0.id != id && $0.canonicalExerciseId == replacement.canonicalExerciseId }) else { return }
        let previous = comparablePerformance(for: replacement, variant: nil, relationship: relationshipContext(for: id))
        exercises[index].canonicalExerciseId = replacement.canonicalExerciseId
        exercises[index].name = replacement.name
        exercises[index].areaId = replacement.areaId
        exercises[index].measurement = replacement.measurement
        exercises[index].defaultLoadType = replacement.defaultLoadType
        exercises[index].executionVariant = nil
        exercises[index].previousPerformance = previous
        let recommendation = previous == nil ? nil
            : replacement.progressionRecommendation(variant: nil, relationship: relationshipContext(for: id))
        exercises[index].progressionRecommendation = recommendation
        exercises[index].progressionChoice = recommendation == nil ? nil : .previous
        exercises[index].sets = previous?.sets.enumerated().map { TrainingLoggerDraftSet(source: $0.element, number: $0.offset + 1) }
            ?? (1...3).map(TrainingLoggerDraftSet.empty)
        exercises[index].isProvisional = false
        exercises[index].provenance = nil
    }

    func relationshipContext(for exerciseId: String) -> TrainingExerciseRelationshipContext? {
        guard let group = relationships.first(where: { $0.memberExerciseIds.contains(exerciseId) }) else { return nil }
        let partners = group.memberExerciseIds.compactMap { id in id == exerciseId ? nil : exercises.first(where: { $0.id == id }) }
        return .init(
            relationshipType: group.relationshipType,
            partnerNames: partners.map(\.name),
            partnerCanonicalExerciseIds: partners.compactMap(\.canonicalExerciseId)
        )
    }

    func summary() -> TrainingLoggerSummary {
        .init(exerciseCount: exercises.count, completedSetCount: completedSetCount, variantCount: variantCount, supersetCount: supersetCount)
    }

    func validationMessages() -> [String] {
        exercises.flatMap { exercise in
            exercise.sets.filter(\.isCompleted).compactMap { $0.validationMessage(for: exercise.measurement) }
        }
    }

    private func comparablePerformance(
        for item: TrainingLoggerCatalogExercise,
        variant: TrainingExecutionVariant?,
        relationship: TrainingExerciseRelationshipContext?
    ) -> TrainingLoggerPreviousPerformance? {
        guard let occurrence = TrainingExerciseHistoryCalculator.previousComparableOccurrence(
            in: item.historyOccurrences,
            before: workoutDate,
            executionVariant: variant,
            relationship: relationship,
            variantChoices: item.executionVariantChoices
        ) else { return nil }
        let context = [occurrence.exercise.executionVariant?.label, occurrence.relationship?.label].compactMap { $0 }.joined(separator: " · ")
        return .init(
            workoutDate: occurrence.sessionDate,
            sets: occurrence.exercise.sets.map { $0.classified(defaultLoadType: item.defaultLoadType) },
            contextLabel: context.isEmpty ? "Ordinary · Standalone" : context
        )
    }

    /// Superset membership changed for these exercises: recompute each one's
    /// contextual Previous and Server recommendation, and refill only rows
    /// that are neither completed nor hand-edited from the new context's
    /// previous performance. With no history in the new context the rows keep
    /// their current values (never cleared, never filled from another
    /// context), and Previous truthfully says there is none.
    private mutating func refreshMembershipContext(of exerciseIds: [String], catalog: [TrainingLoggerCatalogExercise]) {
        for id in exerciseIds {
            guard let index = exercises.firstIndex(where: { $0.id == id }) else { continue }
            refreshPreviousPerformance(at: index, catalog: catalog)
            guard let previous = exercises[index].previousPerformance, !previous.sets.isEmpty else { continue }
            for setIndex in exercises[index].sets.indices
            where !exercises[index].sets[setIndex].isCompleted && exercises[index].sets[setIndex].isManuallyEdited != true {
                let source = previous.sets[min(setIndex, previous.sets.count - 1)]
                exercises[index].sets[setIndex].reps = source.reps
                (exercises[index].sets[setIndex].load, exercises[index].sets[setIndex].loadType) = TrainingLoggerDraftSet.prepopulatedLoad(from: source)
                exercises[index].sets[setIndex].durationSeconds = source.durationSeconds
            }
        }
    }

    private mutating func refreshPreviousPerformance(at index: Int, catalog: [TrainingLoggerCatalogExercise]) {
        guard let canonicalId = exercises[index].canonicalExerciseId,
              let item = catalog.first(where: { $0.canonicalExerciseId == canonicalId }) else {
            exercises[index].previousPerformance = nil
            exercises[index].progressionRecommendation = nil
            exercises[index].progressionChoice = nil
            return
        }
        exercises[index].previousPerformance = comparablePerformance(
            for: item,
            variant: exercises[index].executionVariant,
            relationship: relationshipContext(for: exercises[index].id)
        )
        let relationship = relationshipContext(for: exercises[index].id)
        exercises[index].progressionRecommendation = exercises[index].previousPerformance == nil ? nil
            : item.progressionRecommendation(variant: exercises[index].executionVariant, relationship: relationship)
        exercises[index].progressionChoice = exercises[index].progressionRecommendation == nil ? nil : .previous
    }
}

enum TrainingLoggerNumericFieldKind: String, Equatable {
    case reps
    case load
    case duration
}

struct TrainingLoggerNumericFieldTarget: Equatable, Identifiable {
    var exerciseId: String
    var setId: String
    var kind: TrainingLoggerNumericFieldKind
    var id: String { "\(exerciseId)|\(setId)|\(kind.rawValue)" }
}

enum TrainingLoggerNumericFocusOrder {
    static func targets(for draft: TrainingLoggerDraft) -> [TrainingLoggerNumericFieldTarget] {
        draft.exercises.flatMap { exercise in
            exercise.sets.flatMap { set -> [TrainingLoggerNumericFieldTarget] in
                switch exercise.measurement {
                case .repsLoad, .bodyweightReps, .duration:
                    let primary: TrainingLoggerNumericFieldTarget = .init(
                        exerciseId: exercise.id,
                        setId: set.id,
                        kind: exercise.measurement == .duration ? .duration : .reps
                    )
                    return [
                        primary,
                        .init(exerciseId: exercise.id, setId: set.id, kind: .load),
                    ]
                }
            }
        }
    }

    static func next(after id: String, in draft: TrainingLoggerDraft) -> String? {
        let ids = targets(for: draft).map(\.id)
        guard let index = ids.firstIndex(of: id), ids.indices.contains(index + 1) else { return nil }
        return ids[index + 1]
    }

    static func previous(before id: String, in draft: TrainingLoggerDraft) -> String? {
        let ids = targets(for: draft).map(\.id)
        guard let index = ids.firstIndex(of: id), index > ids.startIndex else { return nil }
        return ids[index - 1]
    }
}
