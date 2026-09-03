import Foundation

/// PhysiqueOS Native's shared Goal/Phase chronology model — the ONE place
/// every Evidence vertical (Training, Activity, Nutrition, Weight) resolves
/// its "Build Lean Mass" / "Visible Abs" / "All ___" scope selector
/// against, rather than three or four independently reimplemented
/// date-range filters.
///
/// This mirrors the REAL, current web mechanism exactly, including its
/// real limitations — verified directly from source, not idealized:
///
/// - `src/domain/services/TrainingEvidenceContextService.js:7-79`
///   (`getTrainingEvidenceContext`) is the one function every Evidence
///   vertical's own `get*EvidenceContext`/`get*TimelineReport` wrapper
///   calls (`WeightEvidenceContextService.js:21`,
///   `NutritionEvidenceContextService.js:16`,
///   `ActivityEvidenceContextService.js:16`) — despite its Training-sounding
///   name, it is already the one shared resolver every vertical uses.
/// - The date boundaries it uses come from a small, hand-maintained
///   constant file, `src/domain/services/EvidenceContextWindows.js`, not
///   from the canonical `Goal.startDate`/`GoalPhase.startedAt/completedAt`
///   fields the domain models actually define
///   (`src/domain/models/goal.js`, `goalPhase.js`, `canonicalGoalPhase.js`).
///   That gap — a real, current product fact — is preserved here rather
///   than "fixed" independently in Swift; see this port's final report for
///   the documented missing-server-capability recommendation.
/// - Attribution today is Goal-level only. There is no Phase-level
///   Evidence scoping anywhere in the live product — verified directly
///   against every Evidence page's source (Training/Weight/Nutrition/
///   Activity). This type does not invent one.
///
/// A record's scope membership is determined the same way the server's
/// `isInsideDateWindow` does (`ProgressReportingService.js:203-207`): an
/// inclusive `[startDate, endDate]` calendar-day string comparison against
/// the record's own occurrence date — never the currently-selected Goal,
/// and never recomputed independently per screen. No evidence record can
/// shift ownership because of timezone conversion, since this never
/// touches `Date`/`Calendar` local-timezone math at all.
enum EvidenceScopeID: String, Codable, Equatable, CaseIterable, Sendable {
    case buildLeanMass = "build-lean-mass"
    case visibleAbs = "visible-abs"
    case all
}

/// One resolved scope window — mirrors `EVIDENCE_CONTEXT_WINDOWS`
/// (`src/domain/services/EvidenceContextWindows.js`) exactly: `endDate ==
/// nil` means open-ended/"through today", matching `build-lean-mass`'s real
/// `endDate: null`.
struct EvidenceChronologyWindow: Equatable, Sendable {
    var scopeID: EvidenceScopeID
    var startDate: String?
    var endDate: String?

    /// Inclusive membership test over a `yyyy-MM-dd`-prefixed occurrence
    /// date. Plain string comparison, matching the server's own
    /// `isInsideDateWindow` — ISO calendar-day keys compare correctly
    /// lexicographically, so this never parses to `Date`/`Calendar` and
    /// never risks a local-timezone shift moving a record across a
    /// boundary.
    func contains(_ occurrenceDate: String) -> Bool {
        let day = String(occurrenceDate.prefix(10))
        if let startDate, day < startDate { return false }
        if let endDate, day > endDate { return false }
        return true
    }
}

/// Attribution metadata carried on a historical Evidence record — mirrors
/// what a live API would eventually stamp on each record once the server
/// gains real per-record attribution. Native computes this once, centrally
/// (each Fixture API's fetch methods), from the record's own occurrence
/// date against `EvidenceChronology.windows` — every screen only ever
/// displays it; no screen recomputes membership itself. This is the
/// concrete fix for Training's reported bug: Training's day/session detail
/// screens carried zero Goal/Phase attribution on their records (verified
/// directly against `TrainingReadService.getDay`/session lookup — no
/// `goalId`/`phaseId`/date-window field existed anywhere on those
/// projections); those screens now display this field.
struct EvidenceScopeAttribution: Codable, Equatable, Sendable {
    var scopeID: EvidenceScopeID
    /// Display label ("Build Lean Mass" / "Visible Abs") — `nil` when a
    /// record's date falls outside both named goal windows (e.g. before
    /// Visible Abs began). `"All ___"` is a bucket a user can select, not a
    /// goal a record can be positively attributed to, so no record is ever
    /// attributed `.all`.
    var label: String?
}

/// The shared resolver. `windows`/labels are the Swift mirror of
/// `EVIDENCE_CONTEXT_WINDOWS` + `TrainingEvidenceContextService.js:23-27`'s
/// `labels` map — literal, hand-entered values, not derived from any other
/// Native Goal model, because the web itself does not derive them from one
/// either (see the type-level doc comment above).
enum EvidenceChronology {
    static let windows: [EvidenceScopeID: EvidenceChronologyWindow] = [
        .buildLeanMass: EvidenceChronologyWindow(scopeID: .buildLeanMass, startDate: "2026-07-19", endDate: nil),
        .visibleAbs: EvidenceChronologyWindow(scopeID: .visibleAbs, startDate: "2026-05-24", endDate: "2026-07-18"),
        .all: EvidenceChronologyWindow(scopeID: .all, startDate: nil, endDate: nil),
    ]

    private static let goalLabels: [EvidenceScopeID: String] = [
        .buildLeanMass: "Build Lean Mass",
        .visibleAbs: "Visible Abs",
    ]

    /// The two *named goal* windows only, oldest-independent lookup order
    /// — excludes `.all`, which is a bucket, not a goal a record can be
    /// positively attributed to.
    private static let namedGoalOrder: [EvidenceScopeID] = [.buildLeanMass, .visibleAbs]

    static func isDate(_ occurrenceDate: String, in scopeID: EvidenceScopeID) -> Bool {
        windows[scopeID]?.contains(occurrenceDate) ?? (scopeID == .all)
    }

    /// Resolves which single named goal a record's occurrence date falls
    /// inside, for display (e.g. a small "Build Lean Mass" chip on a
    /// Training Day/Session detail screen, or a Nutrition day). `label ==
    /// nil` when the date is outside every named window — there is
    /// currently no third historical goal in product data to fall back to,
    /// so an out-of-window record is honestly unattributed rather than
    /// mis-attributed to whichever goal happens to be current.
    static func attribution(forOccurrenceDate occurrenceDate: String) -> EvidenceScopeAttribution {
        for scopeID in namedGoalOrder where isDate(occurrenceDate, in: scopeID) {
            return EvidenceScopeAttribution(scopeID: scopeID, label: goalLabels[scopeID])
        }
        return EvidenceScopeAttribution(scopeID: .all, label: nil)
    }

    /// Builds the pill-selector contract (`TrainingScopeContext`) for a
    /// given vertical and current selection. Every vertical shares the
    /// same 3 option ids/order and "Build Lean Mass"/"Visible Abs" labels;
    /// only the "All ___" label differs per vertical (`"All Training"` /
    /// `"All Nutrition"` / `"All Weight"` / `"All Activity"`, each verified
    /// directly against that vertical's own `get*EvidenceContext` source).
    static func scopeContext(selected: EvidenceScopeID, allLabel: String) -> TrainingScopeContext {
        var labels = goalLabels
        labels[.all] = allLabel
        let options = [EvidenceScopeID.buildLeanMass, .visibleAbs, .all].map { scopeID in
            TrainingScopeOption(id: scopeID.rawValue, label: labels[scopeID] ?? scopeID.rawValue, selected: scopeID == selected)
        }
        return TrainingScopeContext(options: options, dateRangeLabel: dateRangeLabel(for: selected))
    }

    /// `"Complete history"` for `all` (matching the web fixture's own
    /// current value for that state), otherwise a formatted
    /// `startDate → endDate`/`startDate → Present` range. The web's exact
    /// per-goal-window rendered string was not independently verifiable
    /// from source during this port's audit (only the underlying
    /// `startDate`/`endDate` values were); this is a reasonable, clearly
    /// dated native rendering of those same real boundary values, not a
    /// literal transcription of unverified web copy.
    static func dateRangeLabel(for scopeID: EvidenceScopeID) -> String {
        guard scopeID != .all, let window = windows[scopeID] else { return "Complete history" }
        let start = window.startDate.map(TrainingDateFormatting.short) ?? "—"
        let end = window.endDate.map(TrainingDateFormatting.short) ?? "Present"
        return "\(start) → \(end)"
    }

    /// The one shared filtering entry point every vertical's fixture-backed
    /// API calls instead of writing its own `.filter` against an
    /// `isInsideDateWindow`-equivalent — mirrors the real web behavior that
    /// only a stream's *day/entry list* narrows by scope, never its
    /// unscoped fields (current protocol, library/reporting links, related
    /// goals, "Latest ___" card) — verified directly for Nutrition
    /// (`NutritionEvidenceContextService.js`: `currentNutritionProtocol`,
    /// `nutritionLibrary`, `nutritionReportingLinks` stay unscoped even
    /// when the day list is date-scoped) and Weight ("Latest" always reads
    /// the unscoped `overallLatest`, never the scoped window).
    static func filter<T>(_ records: [T], scope scopeID: EvidenceScopeID, date: (T) -> String) -> [T] {
        guard scopeID != .all else { return records }
        return records.filter { isDate(date($0), in: scopeID) }
    }
}
