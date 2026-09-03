import Foundation

/// Mirrors `TrainingAPI`'s seam pattern: the fetch boundary
/// `ActivityHistoryView`/`ActivityDayView` depend on instead of a concrete
/// transport. A live implementation replaces `FixtureActivityAPI` with no
/// change to either screen.
protocol ActivityAPI: Sendable {
    /// `scope` mirrors `TrainingAPI.fetchTrainingLanding(scope:)` — only
    /// `activityHistory` narrows; `latestActivityDay`, `activityAreas`,
    /// `linkedTrainingContext`, and `dataSources` stay unscoped. The
    /// no-`scope` overload below defaults to `.buildLeanMass`, Activity's
    /// own real default context (matching Weight/Nutrition, unlike
    /// Training's `.all`), so every existing call site keeps working.
    func fetchActivityLanding(scope: EvidenceScopeID) async throws -> ActivityLandingReadModel
    /// `nil` for a date with no matching Activity day — mirrors
    /// `TrainingAPI.fetchTrainingDay(date:)`'s own not-found contract.
    func fetchActivityDay(date: String) async throws -> ActivityDayRecord?
}

extension ActivityAPI {
    func fetchActivityLanding() async throws -> ActivityLandingReadModel {
        try await fetchActivityLanding(scope: .buildLeanMass)
    }
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
    /// `attributedScope` on every history row (and `latestActivityDay`),
    /// then narrows `activityHistory` to `scope`'s window when scoped.
    func fetchActivityLanding(scope: EvidenceScopeID) async throws -> ActivityLandingReadModel {
        var landing = try loadFixture().landing
        if var latest = landing.latestActivityDay {
            latest.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: latest.date)
            landing.latestActivityDay = latest
        }
        let attributedHistory = landing.activityHistory.map { day -> ActivityDayRecord in
            var day = day
            day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
            return day
        }
        landing.activityHistory = EvidenceChronology.filter(attributedHistory, scope: scope, date: \.date)
        landing.scope = EvidenceChronology.scopeContext(selected: scope, allLabel: "All Activity")
        return landing
    }

    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? {
        guard var day = try loadFixture().landing.activityHistory.first(where: { $0.date == date }) else { return nil }
        day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
        return day
    }
}
