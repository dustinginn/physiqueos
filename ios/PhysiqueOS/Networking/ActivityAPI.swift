import Foundation

/// Mirrors `TrainingAPI`'s seam pattern: the fetch boundary
/// `ActivityHistoryView`/`ActivityDayView` depend on instead of a concrete
/// transport. A live implementation replaces `FixtureActivityAPI` with no
/// change to either screen.
protocol ActivityAPI: Sendable {
    /// `scope` mirrors `TrainingAPI.fetchTrainingLanding(scope:)`:
    /// `activityHistory` narrows to the selected window, and
    /// `latestActivityDay` is re-derived as the most recent day *within*
    /// that narrowed window — verified directly against source
    /// (`getActivityTimelineReport` → `ProgressReportingService
    /// .getActivityReport` filters `context.activityDays` by the scope's
    /// date window *before* calling `buildActivityReport`, which then reads
    /// `activityDays.at(-1)` — `latestActivityDay` genuinely changes with
    /// the selected Goal/Phase on the live product; it does not stay fixed
    /// while only the history list narrows). `activityAreas`,
    /// `linkedTrainingContext`, and `dataSources` stay unscoped, matching
    /// source. The no-`scope` overload below defaults to `.buildLeanMass`,
    /// Activity's own real default context (matching Weight/Nutrition,
    /// unlike Training's `.all`), so every existing call site keeps
    /// working.
    func fetchActivityLanding(scope: EvidenceScopeSelection) async throws -> ActivityLandingReadModel
    /// `nil` for a date with no matching Activity day — mirrors
    /// `TrainingAPI.fetchTrainingDay(date:)`'s own not-found contract.
    func fetchActivityDay(date: String) async throws -> ActivityDayRecord?
}

extension ActivityAPI {
    func fetchActivityLanding() async throws -> ActivityLandingReadModel {
        try await fetchActivityLanding(scope: ActivityScopeDefault.selection)
    }
}

/// Activity's own real default context is Build Lean Mass (matching Weight/
/// Nutrition, unlike Training's "all").
enum ActivityScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// Fixture-backed conformance: decodes one bundled JSON file containing the
/// full `ActivityLandingReadModel`, through the same decode path a live
/// implementation would eventually use. Unlike Training (three separate
/// projections), Activity's landing and day-detail share one record shape,
/// so `fetchActivityDay` simply looks the date up inside the already-loaded
/// `activityHistory` list rather than requiring a second fixture section.
struct FixtureActivityAPI: ActivityAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct ActivityFixtureFile: Codable {
        var landing: ActivityLandingReadModel
    }

    private func loadFixture() throws -> ActivityFixtureFile {
        guard let url = Bundle.main.url(forResource: "ActivityFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(ActivityFixtureFile.self, from: data)
    }

    /// Same shared chronology adoption as `FixtureTrainingAPI`: backfills
    /// `attributedScope` on every history row, narrows `activityHistory` to
    /// `scope`'s window, then re-derives `latestActivityDay` as the newest
    /// entry of the *narrowed* history — mirroring `buildActivityReport`'s
    /// own `activityDays.at(-1)` read from its already-scoped context (see
    /// `ActivityAPI.fetchActivityLanding(scope:)`'s doc comment). A prior
    /// pass here kept the fixture's raw `latestActivityDay` fixed regardless
    /// of scope, which meant selecting a Goal with no recent days would
    /// still show the global-latest day's card — corrected to match source.
    func fetchActivityLanding(scope: EvidenceScopeSelection) async throws -> ActivityLandingReadModel {
        var landing = try loadFixture().landing
        let attributedHistory = landing.activityHistory.map { day -> ActivityDayRecord in
            var day = day
            day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
            return day
        }
        let scopedHistory = EvidenceChronology.filter(attributedHistory, scope: scope, date: \.date)
        landing.activityHistory = scopedHistory
        landing.latestActivityDay = scopedHistory.first
        landing.scope = EvidenceChronology.scopeContext(selected: scope, allLabel: "All Activity")
        return landing
    }

    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? {
        guard var day = try loadFixture().landing.activityHistory.first(where: { $0.date == date }) else { return nil }
        day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
        return day
    }
}
