import Foundation

/// Mirrors `TrainingAPI`'s seam pattern: the fetch boundary
/// `ActivityHistoryView`/`ActivityDayView` depend on instead of a concrete
/// transport. A live implementation replaces `FixtureActivityAPI` with no
/// change to either screen.
protocol ActivityAPI: Sendable {
    func fetchActivityLanding() async throws -> ActivityLandingReadModel
    /// `nil` for a date with no matching Activity day — mirrors
    /// `TrainingAPI.fetchTrainingDay(date:)`'s own not-found contract.
    func fetchActivityDay(date: String) async throws -> ActivityDayRecord?
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

    func fetchActivityLanding() async throws -> ActivityLandingReadModel {
        try loadFixture().landing
    }

    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? {
        try loadFixture().landing.activityHistory.first { $0.date == date }
    }
}
