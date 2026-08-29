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
    /// Fixture-backed for all 10 canonical areas (see `TrainingAreaReadModel`).
    func fetchTrainingArea(areaId: String) async throws -> TrainingAreaReadModel?
    /// Mirrors `getExerciseDetailContent`/`getExerciseOccurrences`: `nil`
    /// for an unresolvable exercise id, otherwise every historical
    /// occurrence of that canonical exercise across every session
    /// (area-agnostic, matching the web's own area-agnostic history query)
    /// plus the computed benchmark/last-session/history projection.
    func fetchTrainingExercise(exerciseId: String) async throws -> TrainingExerciseDetailReadModel?
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

    /// Mirrors the real web query chain exactly: resolve the route's
    /// exercise id to a canonical exercise id (here, via the Browse row
    /// that carries it — `getCanonicalTrainingExerciseSlug`'s native
    /// equivalent), then flat-scan every session for occurrences of that
    /// canonical id (`getExerciseOccurrences`), area-agnostic. Sorting by
    /// the raw ISO date string, descending, mirrors
    /// `getTrainingDays`/`getTrainingRecords`'s own `localeCompare`-based
    /// sort rather than parsing to `Date` for comparison.
    func fetchTrainingExercise(exerciseId: String) async throws -> TrainingExerciseDetailReadModel? {
        let fixture = try loadFixture()
        guard
            let area = fixture.areas.first(where: { area in area.exercises.contains { $0.id == exerciseId } }),
            let row = area.exercises.first(where: { $0.id == exerciseId }),
            let canonicalExerciseId = row.canonicalExerciseId
        else {
            return nil
        }

        let occurrences = fixture.sessions
            .flatMap { session in
                session.exercises
                    .filter { $0.canonicalExerciseId == canonicalExerciseId }
                    .map { exercise in
                        TrainingExerciseHistoryOccurrence(
                            sessionId: session.id,
                            sessionDate: session.date,
                            exercise: exercise,
                            relationship: Self.relationshipContext(for: exercise, in: session)
                        )
                    }
            }
            .sorted { $0.sessionDate > $1.sessionDate }

        return TrainingExerciseDetailReadModel(
            id: row.id,
            title: row.label,
            breadcrumbs: [
                TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                TrainingBreadcrumb(label: "Training Library", destination: .progressStream(streamId: "training/library")),
                TrainingBreadcrumb(label: area.title, destination: .trainingExercise(exerciseId: area.id)),
            ],
            scope: area.scope,
            benchmark: TrainingExerciseHistoryCalculator.benchmark(for: occurrences),
            lastSession: occurrences.first,
            history: Array(occurrences.prefix(10))
        )
    }

    /// `deriveTrainingExerciseRelationshipContext` — finds the
    /// relationship group (if any) this occurrence's local exercise id
    /// belongs to within its own session, and resolves the *other*
    /// members' display names in their original group order.
    private static func relationshipContext(
        for exercise: TrainingExerciseOccurrence,
        in session: TrainingSessionDetailReadModel
    ) -> TrainingExerciseRelationshipContext? {
        guard let group = session.exerciseRelationshipGroups.first(where: { $0.memberExerciseIds.contains(exercise.id) }) else {
            return nil
        }
        let exercisesById = Dictionary(uniqueKeysWithValues: session.exercises.map { ($0.id, $0) })
        let partnerNames = group.memberExerciseIds
            .filter { $0 != exercise.id }
            .compactMap { exercisesById[$0]?.name }
        return TrainingExerciseRelationshipContext(relationshipType: group.relationshipType, partnerNames: partnerNames)
    }
}
