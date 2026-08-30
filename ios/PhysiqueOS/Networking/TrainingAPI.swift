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
    /// Mirrors `getReportingContent`: `nil` for an id outside the fixed
    /// `reportingLinks` set (matching the web's `notFound()` guard),
    /// otherwise the report's content — real data for `resistance` and
    /// `history`, the identical static placeholder for the other four.
    func fetchTrainingReporting(reportId: String) async throws -> TrainingReportingReadModel?
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
        var trainingPerformanceEvents: [TrainingPerformanceEvent]
        var reporting: ReportingFixtureSection
    }

    /// Synthetic, already-classified fixture facts shaped like the fields
    /// `getResistanceReportingContent` actually consumes. The expensive
    /// Training Performance Intelligence detection remains server-owned;
    /// Native only performs the same presentation projection.
    private struct ReportingFixtureSection: Codable {
        var resistance: ResistanceReportingFixture
    }

    private struct ResistanceReportingFixture: Codable {
        var exerciseObservations: [ExerciseObservationFixture]
        var categoryObservations: [CategoryObservationFixture]
    }

    private struct ExerciseObservationFixture: Codable {
        var exerciseId: String
        var status: String
        var latestDate: String?
        var volumeTrendDirection: String?
        var prEventId: String?
    }

    private struct CategoryObservationFixture: Codable {
        var areaId: String
        var latestTrainedAt: String?
        var exerciseCount: Int
        var latestKnownSets: Int?
        var latestKnownVolume: Double?
        var statusCounts: StatusCountsFixture
    }

    private struct StatusCountsFixture: Codable {
        var improving: Int
        var stable: Int
        var plateauing: Int
        var regressing: Int
        var insufficientData: Int
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
            performanceRecords: TrainingPerformanceRecordsCalculator.recordsReadModel(
                canonicalExerciseId: canonicalExerciseId,
                events: fixture.trainingPerformanceEvents.filter(TrainingPerformanceEventValidator.isValid)
            ),
            lastSession: occurrences.first,
            history: Array(occurrences.prefix(10))
        )
    }

    /// Mirrors `getReportingContent` exactly: `report.reportingLinks`
    /// gates which ids are valid (the web's `notFound()` guard), then
    /// `resistance`/`history` get real content and every other id falls
    /// through to the identical static "Foundation" placeholder body.
    func fetchTrainingReporting(reportId: String) async throws -> TrainingReportingReadModel? {
        let fixture = try loadFixture()
        guard let link = fixture.landing.reportingLinks.first(where: { $0.id == reportId }) else {
            return nil
        }

        switch reportId {
        case "resistance":
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: link.label,
                summary: "Strength progression, PRs, and category momentum from training history.",
                scope: fixture.landing.scope,
                placeholderBody: nil,
                resistance: Self.buildResistanceReport(fixture: fixture),
                historyDays: nil
            )
        case "history":
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: "Training History",
                summary: "Browse recent training days and open the sessions you want to review.",
                scope: fixture.landing.scope,
                placeholderBody: nil,
                resistance: nil,
                historyDays: fixture.days
            )
        default:
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: link.label,
                summary: link.detail,
                scope: fixture.landing.scope,
                placeholderBody: "This page is now a permanent destination. It will grow into graphs, trends, comparisons, goal impact, and historical analysis as more canonical training evidence accumulates.",
                resistance: nil,
                historyDays: nil
            )
        }
    }

    /// `getResistanceReportingContent`'s presentation projection over
    /// synthetic, already-classified observations. Status groups,
    /// highlights, needs-attention, recent PRs, and category rollups reuse
    /// the same exercise/area destinations and durable PR events as the
    /// rest of Training; no client-side performance detection is invented.
    private static func buildResistanceReport(fixture: TrainingFixtureFile) -> TrainingResistanceReportReadModel {
        let allExerciseRows = fixture.areas.flatMap(\.exercises)
        func row(exerciseId: String, detail: String?) -> TrainingReportingLinkRow? {
            guard let exercise = allExerciseRows.first(where: { $0.id == exerciseId }) else { return nil }
            return TrainingReportingLinkRow(id: exerciseId, label: exercise.label, detail: detail, destination: .trainingExercise(exerciseId: exerciseId))
        }

        let statusDefinitions: [(key: String, label: String, tone: TrainingResistanceStatusTone)] = [
            ("improving", "Improving", .success),
            ("stable", "Stable", .stable),
            ("plateauing", "Plateauing", .warning),
            ("regressing", "Regressing", .danger),
        ]
        let observations = fixture.reporting.resistance.exerciseObservations
        let statusGroups = statusDefinitions.map { definition in
            TrainingResistanceStatusGroup(
                label: definition.label,
                tone: definition.tone,
                items: observations
                    .filter { $0.status == definition.key }
                    .compactMap { observation in
                        let latest = observation.latestDate.map { "Latest \(TrainingDateFormatting.short($0))" }
                        let detail = [definition.label, latest].compactMap { $0 }.joined(separator: " · ")
                        return row(exerciseId: observation.exerciseId, detail: detail)
                    }
            )
        }

        let eventById = Dictionary(uniqueKeysWithValues: fixture.trainingPerformanceEvents.map { ($0.id, $0) })
        let recentPrs = observations.compactMap { observation -> TrainingReportingLinkRow? in
            guard
                let eventId = observation.prEventId,
                let event = eventById[eventId],
                let detail = formatRecentPr(event)
            else {
                return nil
            }
            return row(exerciseId: observation.exerciseId, detail: detail)
        }

        let highlights = observations
            .filter { $0.status == "improving" }
            .prefix(3)
            .compactMap { observation -> TrainingReportingLinkRow? in
                let detail: String
                if let eventId = observation.prEventId, let event = eventById[eventId], let prDetail = formatRecentPr(event) {
                    detail = prDetail
                } else if observation.volumeTrendDirection == "up" {
                    detail = "Volume moved up from the previous session."
                } else {
                    detail = "Recent same-exercise performance is improving."
                }
                return row(exerciseId: observation.exerciseId, detail: detail)
            }

        let needsAttention = observations
            .filter { $0.status == "regressing" || $0.status == "plateauing" }
            .compactMap { observation -> TrainingReportingLinkRow? in
                let statusDetail = observation.status == "regressing"
                    ? "Recent performance moved down."
                    : "Multiple comparable sessions without clear overload."
                let latest = observation.latestDate.map { "Latest \(TrainingDateFormatting.short($0))" }
                return row(
                    exerciseId: observation.exerciseId,
                    detail: [statusDetail, latest].compactMap { $0 }.joined(separator: " · ")
                )
            }

        let categoryById = Dictionary(
            uniqueKeysWithValues: fixture.reporting.resistance.categoryObservations.map { ($0.areaId, $0) }
        )
        let categoryRollups = fixture.landing.trainingAreas.compactMap { area -> TrainingReportingLinkRow? in
            guard let observation = categoryById[area.id] else { return nil }
            var parts: [String] = []
            if let latest = observation.latestTrainedAt {
                parts.append("Latest \(TrainingDateFormatting.short(latest))")
            }
            parts.append("\(observation.exerciseCount) exercise\(observation.exerciseCount == 1 ? "" : "s")")
            if let sets = observation.latestKnownSets, sets > 0 {
                parts.append("\(sets) set\(sets == 1 ? "" : "s")")
            }
            if let volume = observation.latestKnownVolume, volume > 0 {
                parts.append("\(formatNumber(volume)) lb")
            }
            parts.append(formatStatusCounts(observation.statusCounts))
            return TrainingReportingLinkRow(
                id: area.id,
                label: area.label,
                detail: parts.joined(separator: " · "),
                destination: area.destination
            )
        }

        return TrainingResistanceReportReadModel(
            statusGroups: statusGroups,
            recentPrs: recentPrs,
            highlights: highlights,
            needsAttention: needsAttention,
            categoryRollups: categoryRollups
        )
    }

    private static func formatRecentPr(_ event: TrainingPerformanceEvent) -> String? {
        switch TrainingPerformanceEventType(rawValue: event.eventType) {
        case .sessionVolumePR:
            guard let value = event.sessionVolume, value.isFinite, value > 0 else { return nil }
            return "Volume PR: \(formatNumber(value)) \(event.unit ?? "lb")."
        case .repsAtLoadPR:
            guard let reps = event.reps, reps.isFinite, reps > 0 else { return nil }
            let load: String
            if event.loadUnit == "bodyweight" || event.load == nil || event.load == 0 {
                load = "BW"
            } else {
                load = "\(formatNumber(event.load!)) \(event.loadUnit ?? "lb")"
            }
            return "New reps-at-load PR: \(formatNumber(reps)) reps at \(load)."
        case .none:
            return nil
        }
    }

    private static func formatStatusCounts(_ counts: StatusCountsFixture) -> String {
        var parts: [String] = []
        if counts.improving > 0 { parts.append("\(counts.improving) improving") }
        if counts.stable > 0 { parts.append("\(counts.stable) stable") }
        if counts.plateauing > 0 { parts.append("\(counts.plateauing) plateauing") }
        if counts.regressing > 0 { parts.append("\(counts.regressing) regressing") }
        if counts.insufficientData > 0 { parts.append("\(counts.insufficientData) needs data") }
        return parts.isEmpty ? "More history needed" : parts.joined(separator: " · ")
    }

    private static func formatNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 3
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
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
