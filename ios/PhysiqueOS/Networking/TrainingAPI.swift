import Foundation

/// Mirrors `HomeAPI`/`LogAPI`'s pattern: the seam Training's three screens
/// depend on instead of a concrete transport. Kept as one protocol (rather
/// than three) since a live implementation will still be one authenticated
/// client — the three-projection shape lives in the read models themselves
/// (see `TrainingReadModel.swift`), not in the transport boundary.
protocol TrainingAPI: Sendable {
    func fetchTrainingLanding() async throws -> TrainingLandingReadModel
    func fetchTrainingDay(date: String) async throws -> TrainingDayReadModel?
    func fetchTrainingSession(sessionId: String) async throws -> TrainingSessionDetailReadModel?
    /// Fixture-backed for `"chest"` only this slice — establishing the
    /// pattern, not every area (see `TrainingAreaReadModel`).
    func fetchTrainingArea(areaId: String) async throws -> TrainingAreaReadModel?
}

/// Fixture-backed conformance: decodes one bundled JSON file mirroring the
/// union of the web's three Training projections, through the same decode
/// path a live implementation would eventually use. `TrainingFixture.json`
/// deliberately reuses `session-fixture-001` — the same id Log's own
/// fixture already links to (`LogFixture.json`) — so Log's existing
/// "Strength Training" row now opens a real session instead of the generic
/// placeholder, without Log itself changing.
struct FixtureTrainingAPI: TrainingAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct TrainingFixtureFile: Codable {
        var landing: TrainingLandingReadModel
        var days: [TrainingDayReadModel]
        var sessions: [TrainingSessionDetailReadModel]
        var areas: [TrainingAreaReadModel]
    }

    /// Several canonical Training field names are genuinely snake_case in
    /// source (`set_number`, `weight_unit`, `duration_seconds`,
    /// `load_type`, `set_type` — `normalizeTrainingSets`,
    /// `trainingSessionEvidence.js:3153-3212`); this decoder converts them
    /// to their matching Swift property names rather than the fixture
    /// duplicating both spellings. Every other field in this fixture is
    /// already camelCase in source, which `.convertFromSnakeCase` leaves
    /// unchanged.
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private func loadFixture() throws -> TrainingFixtureFile {
        guard let url = Bundle.main.url(forResource: "TrainingFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try Self.decoder.decode(TrainingFixtureFile.self, from: data)
    }

    func fetchTrainingLanding() async throws -> TrainingLandingReadModel {
        try loadFixture().landing
    }

    func fetchTrainingDay(date: String) async throws -> TrainingDayReadModel? {
        try loadFixture().days.first { $0.date == date }
    }

    func fetchTrainingSession(sessionId: String) async throws -> TrainingSessionDetailReadModel? {
        try loadFixture().sessions.first { $0.id == sessionId }
    }

    func fetchTrainingArea(areaId: String) async throws -> TrainingAreaReadModel? {
        try loadFixture().areas.first { $0.id == areaId }
    }
}
