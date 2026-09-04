import Foundation

/// Morning Check-In's two additional real sections beyond Priority
/// reconciliation and weight entry — verified against source for this
/// task (`MorningCheckInScreen.jsx`, `MorningEvidenceRecoveryService.js`,
/// `EvidenceRecoveryContext.js`, `RecoveryCheckInIngestionService.js`,
/// `BriefingReconciliationPresentationService.js`,
/// `BriefingReconciliationWorkItemService.js`,
/// `MorningBriefingFinalizationService.js`). All three of Priority
/// reconciliation, evidence recovery, and briefing reconciliation are
/// independent — none of the three gates the others, matching the real
/// product's three separate server actions exactly.

// MARK: - Core Evidence Recovery

/// `EVIDENCE_RECOVERY_TYPES` (`EvidenceRecoveryContext.js`) — exactly these
/// four. DEXA and Weight are deliberately NOT part of this set (verified:
/// `MorningEvidenceRecoveryService.js`'s `RECOVERY_ORDER` never includes a
/// DEXA branch; Weight is handled by the Morning Check-In weigh-in field
/// itself, not by this mechanism).
enum MorningEvidenceRecoveryType: String, CaseIterable, Identifiable, Codable {
    case photoSession = "photo_session"
    case training
    case activityDay = "activity_day"
    case nutrition

    var id: String { rawValue }

    /// The `EvidenceCategory` this recovery type is evaluated against —
    /// Native's `LoggingSandboxStore.reviews` already carries this exact
    /// category on every review/item, so recovery status can be read
    /// straight from the same canonical review state every other Evidence
    /// screen already shares, with no duplicate storage.
    var evidenceCategory: EvidenceCategory {
        switch self {
        case .photoSession: .progressPhotos
        case .training: .training
        case .activityDay: .activity
        case .nutrition: .nutrition
        }
    }

    /// The scenario `EvidenceIntakeView` should preselect when recovering
    /// this type from `.missing`/`.presentPartial`.
    var evidenceScenario: EvidenceFixtureScenario {
        switch self {
        case .photoSession: .progressPhotos
        case .training: .workout
        case .activityDay: .activity
        case .nutrition: .nutrition
        }
    }

    /// `labels` map in `actionFor` (`MorningEvidenceRecoveryService.js`).
    var missingActionLabel: String {
        switch self {
        case .activityDay: "Add Activity"
        case .nutrition: "Add Nutrition"
        case .photoSession: "Upload Photos"
        case .training: "Add Workout"
        }
    }

    var displayName: String {
        switch self {
        case .photoSession: "Progress Photos"
        case .training: "Training"
        case .activityDay: "Activity"
        case .nutrition: "Nutrition"
        }
    }
}

/// `MORNING_EVIDENCE_RECOVERY_STATUSES` (`MorningEvidenceRecoveryService.js`)
/// — a genuine 5-state model, not a present/missing boolean.
/// `presentPartial` only ever applies to `.training` (a strength shell
/// with zero exercises); `presentIncomplete` only ever applies to
/// `.nutrition` (a day whose macro completeness isn't `"complete"`).
enum MorningEvidenceRecoveryStatus: String, Equatable, Codable {
    case missing
    case pendingConfirmation = "pending_confirmation"
    case presentPartial = "present_partial"
    case presentIncomplete = "present_incomplete"
    case presentComplete = "present_complete"

    /// `shouldSurface` — only these three ever render a card; `.presentComplete`/
    /// `.presentIncomplete` (the latter deliberately, per source: incomplete
    /// nutrition is noted but doesn't itself block/nudge in the audited
    /// screen markup) never do.
    var surfacesCard: Bool {
        switch self {
        case .missing, .pendingConfirmation, .presentPartial: true
        case .presentIncomplete, .presentComplete: false
        }
    }
}

struct MorningEvidenceRecoveryItem: Identifiable, Equatable {
    var id: String { type.rawValue }
    var type: MorningEvidenceRecoveryType
    var status: MorningEvidenceRecoveryStatus
    var title: String
    var actionLabel: String
    var destination: AppDestination
}

/// Carried from Evidence Intake through Evidence Review so confirm/discard
/// bounces back to Morning Check-In instead of the default Log
/// destination — the exact role `EvidenceRecoveryContext`'s
/// `{date, expectedEvidenceType, returnTo}` query payload plays on web.
/// Attached to the `LocalEvidenceReview` itself (not a separate
/// side-table) so it travels with the review through reprocess/discard
/// exactly like every other field on that record.
struct MorningEvidenceRecoveryContext: Codable, Equatable {
    var evidenceType: MorningEvidenceRecoveryType
    var occurrenceDateKey: String
}

// MARK: - Recovery Evidence (sleep / subjective recovery / soreness)

/// `subjectiveRecovery` select options (`MorningCheckInScreen.jsx`).
enum SubjectiveRecoveryRating: String, CaseIterable, Identifiable, Codable, EvidenceLabeledChoice {
    case poor, belowAverage = "below_average", average, good, excellent
    var id: String { rawValue }
    var label: String {
        switch self {
        case .poor: "Poor"
        case .belowAverage: "Below average"
        case .average: "Average"
        case .good: "Good"
        case .excellent: "Excellent"
        }
    }
}

/// `soreness` select options.
enum SorenessLevel: String, CaseIterable, Identifiable, Codable, EvidenceLabeledChoice {
    case none, mild, moderate, high, severe
    var id: String { rawValue }
    var label: String { self == .none ? "None" : rawValue.capitalized }
}

/// A fully optional, independent form — `RecoveryCheckInIngestionService.js`
/// confirms every field is optional and a submission with all three unset
/// is a real, defined no-op (`status: "omitted"`), not an error.
struct RecoveryCheckInDraft: Equatable {
    var sleepDurationHours: Double?
    var subjectiveRecovery: SubjectiveRecoveryRating?
    var soreness: SorenessLevel?

    var isEmpty: Bool { sleepDurationHours == nil && subjectiveRecovery == nil && soreness == nil }
}

enum RecoveryCheckInSaveOutcome: Equatable {
    case omitted
    case saved(RecoveryCheckInDraft)
}

enum RecoveryCheckInValidation {
    static func error(sleepDurationHours: Double?) -> String? {
        guard let sleepDurationHours else { return nil }
        guard sleepDurationHours.isFinite, (0...24).contains(sleepDurationHours) else {
            return "Sleep duration must be between 0 and 24 hours."
        }
        return nil
    }
}

// MARK: - Briefing Reconciliation
//
// A `BriefingReconciliationWorkItem` is a queue/task record — never a
// field on the Briefing artifact itself — created whenever newly
// confirmed canonical evidence makes an already-published Weekly/
// Midweek/Monthly Briefing stale (verified: `CADENCE_REVISIONS` in
// `BriefingReconciliationEnqueueService.js` explicitly excludes Daily and
// event (DEXA/Photo) Briefings from this mechanism). Resolving it for
// real calls the exact same narrative builders used for original
// generation and republishes a new Briefing artifact — genuine
// generation, not a passive acknowledgement. Per this task's explicit
// instruction, Native never fabricates that success: `finalize()` below
// only ever resolves the case that requires no regeneration (the real
// system's own `noOp: true` branch, where the manifest already reflects
// the change) and otherwise reports `.requiresBriefingEngine` rather than
// pretending to have republished a Briefing.

enum BriefingReconciliationCadence: String, CaseIterable, Identifiable, Codable {
    case weekly, midweek, monthly
    var id: String { rawValue }
    var label: String {
        switch self {
        case .weekly: "Weekly Briefing"
        case .midweek: "Midweek Briefing"
        case .monthly: "Monthly Briefing"
        }
    }
}

/// `BriefingReconciliationWorkItemService.js`'s exact state names.
enum BriefingReconciliationWorkItemStatus: String, Equatable, Codable {
    case current
    case revisionPending = "revision_pending"
    case revising
    case currentAfterRevision = "current_after_revision"
    case failed
}

struct BriefingReconciliationWorkItem: Identifiable, Equatable, Codable {
    var id: String
    var cadence: BriefingReconciliationCadence
    var evidenceDateKey: String
    var status: BriefingReconciliationWorkItemStatus
    /// The specific Briefing artifact this work item is reconciling —
    /// verified real: `publicationRootId === artifact.id` on the real
    /// product, the exact same identity `BriefingReadModel.id` uses.
    /// `nil` only for fixture rows that don't reference a concrete
    /// artifact; a real work item always has one.
    var briefingId: String? = nil
    var attempts: Int = 0
    var retryable: Bool = true
    /// Fixture-only disclosure: whether resolving this item locally would
    /// be the real system's genuine no-op branch (`eligibility.current
    /// === true` — no regeneration needed) versus one that would require
    /// the real Briefings engine to actually rebuild and republish an
    /// artifact. Native only ever resolves the former; see the type-level
    /// doc comment above.
    var resolvesAsNoOp: Bool
}

/// Mirrors `BriefingReconciliationPresentationService.js`'s output shape
/// exactly (`visible`, message text, `canFinalize`).
struct BriefingReconciliationPresentation: Equatable {
    var visible: Bool
    var cadenceLabel: String
    var title: String
    var message: String
    var canFinalize: Bool
    var actionLabel: String
    var isFailure: Bool
}

enum BriefingReconciliationOutcome: Equatable {
    /// Mirrors the real `status: "waiting"` — evidence recovery still has
    /// a pending confirmation for yesterday, so finalization is blocked.
    case waitingOnEvidence
    /// The real system's own no-op branch: the work item's manifest
    /// already reflects the change, so no Briefing regeneration is
    /// needed. Safe to resolve locally — this is not a fabricated
    /// success, it is the exact outcome the real `noOp: true` path
    /// produces.
    case resolvedNoOp
    /// Disclosed dependency: resolving this item for real would require
    /// calling the (not yet connected) Weekly/Midweek/Monthly Briefing
    /// regeneration + republish pipeline. Native deliberately does not
    /// simulate that success.
    case requiresBriefingEngine
    case noPendingWorkItem
}
