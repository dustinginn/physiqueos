import Foundation

/// Mirrors `TrainingAPI`/`ActivityAPI`'s seam pattern: the fetch boundary
/// `NutritionHistoryView`/`NutritionDayView` depend on instead of a
/// concrete transport.
protocol NutritionAPI: Sendable {
    /// `scope` mirrors `TrainingAPI.fetchTrainingLanding(scope:)` — only
    /// `nutritionHistory` narrows; `latestNutritionDay`, `reportingLinks`,
    /// `nutritionAreas`, and `dataSources` stay unscoped, matching real web
    /// behavior verified directly from `NutritionEvidenceContextService.js`
    /// (`currentNutritionProtocol`/`nutritionLibrary`/`nutritionReportingLinks`
    /// are always taken from the unscoped/global report even when the day
    /// list is date-scoped). The no-`scope` overload below defaults to
    /// `.buildLeanMass`, Nutrition's own real default context (matching
    /// Weight/Activity, unlike Training's `.all`).
    func fetchNutritionLanding(scope: EvidenceScopeID) async throws -> NutritionLandingReadModel
    /// `nil` for an id with no matching Nutrition day — mirrors
    /// `TrainingAPI.fetchTrainingDay(date:)`'s own not-found contract.
    func fetchNutritionDay(dayId: String) async throws -> NutritionDayRecord?
}

extension NutritionAPI {
    func fetchNutritionLanding() async throws -> NutritionLandingReadModel {
        try await fetchNutritionLanding(scope: .buildLeanMass)
    }
}

/// Fixture-backed conformance: decodes one bundled JSON file containing the
/// full unscoped day list plus landing metadata, through the same decode
/// path a live implementation would eventually use. Unlike Training (three
/// separate projections), Nutrition's landing and day-detail share one
/// record shape (`NutritionDayRecord`) — the same "one shared shape" choice
/// `ActivityDayRecord` already established.
struct FixtureNutritionAPI: NutritionAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct NutritionFixtureFile: Codable {
        var title: String
        var tone: HomeColorToken
        var reportingLinks: [NutritionInfoLink]
        var nutritionAreas: [NutritionInfoLink]
        var dataSources: [NutritionDataSource]
        /// Already newest-first, matching `getNutritionDayEntries()`'s own
        /// `.reverse()` ordering — this port does not re-sort it.
        var days: [NutritionDayRecord]
    }

    private func loadFixture() throws -> NutritionFixtureFile {
        guard let url = Bundle.main.url(forResource: "NutritionFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(NutritionFixtureFile.self, from: data)
    }

    /// Backfills Goal/Phase chronology onto every day (same shared
    /// mechanism as Training/Activity) and narrows `nutritionHistory` to
    /// `scope`'s window when scoped; `latestNutritionDay` stays the true
    /// overall latest regardless of scope, matching Weight's confirmed
    /// "Latest" asymmetry.
    func fetchNutritionLanding(scope: EvidenceScopeID) async throws -> NutritionLandingReadModel {
        let fixture = try loadFixture()
        let attributedDays = fixture.days.map { day -> NutritionDayRecord in
            var day = day
            day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
            return day
        }
        return NutritionLandingReadModel(
            title: fixture.title,
            subtitle: nil,
            tone: fixture.tone,
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: "All Nutrition"),
            latestNutritionDay: attributedDays.first,
            reportingLinks: fixture.reportingLinks,
            nutritionAreas: fixture.nutritionAreas,
            nutritionHistory: EvidenceChronology.filter(attributedDays, scope: scope, date: \.date),
            dataSources: fixture.dataSources
        )
    }

    func fetchNutritionDay(dayId: String) async throws -> NutritionDayRecord? {
        guard var day = try loadFixture().days.first(where: { $0.id == dayId }) else { return nil }
        day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
        return day
    }
}
