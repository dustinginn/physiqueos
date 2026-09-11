import Foundation

/// Mirrors `TrainingAPI`/`ActivityAPI`/`NutritionAPI`'s seam pattern. Named
/// `WeightEvidenceAPI` (not `WeightAPI`) to stay unambiguous alongside this
/// codebase's existing, deliberately isolated `FounderServerAPI` Sandbox
/// Weight write proof — the two must never be confused: Sandbox Weight is
/// a live, single-value write-path integration test; this is the ordinary,
/// fixture-backed Weight Evidence read product surface. See
/// `AppEnvironment.swift`'s doc comment on why these stay separate.
protocol WeightEvidenceAPI: Sendable {
    /// `scope` mirrors the other verticals' `scope` parameter, but here it
    /// reshapes almost the entire report (summary cards, chart, weekly
    /// averages, history all narrow), not just one history array — matching
    /// the real web page, which has no unscoped fields at all below the
    /// header (verified directly: `getWeightReport` scopes `weights` AND
    /// `dexaScans` together via `scopeWeightReportContext`). The no-`scope`
    /// overload defaults to `.buildLeanMass`, Weight's own confirmed real
    /// default context.
    func fetchWeightReport(scope: EvidenceScopeSelection) async throws -> WeightReportReadModel
}

extension WeightEvidenceAPI {
    func fetchWeightReport() async throws -> WeightReportReadModel {
        try await fetchWeightReport(scope: WeightScopeDefault.selection)
    }
}

/// Weight's own confirmed real default context is Build Lean Mass.
enum WeightScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
}

/// Fixture-backed conformance: decodes one bundled JSON file of raw,
/// chronologically-ascending weight entries and DEXA scan dates, then
/// derives the entire scoped report through `WeightEvidenceCalculator` —
/// mirroring the web's own "raw entries in, scoped report out" shape
/// (`getWeightReport`) rather than pre-baking a report per scope into the
/// fixture (which could silently drift out of sync with the entries
/// themselves).
struct FixtureWeightEvidenceAPI: WeightEvidenceAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct WeightFixtureFile: Codable {
        /// Chronologically ascending (oldest first), matching
        /// `listWeightEntries`'s own sort — `WeightEvidenceCalculator`
        /// depends on this ordering (`.last` = latest, `.first` = earliest).
        var weights: [WeightEntryFixture]
        var dexaScans: [DEXAScanFixture]
        var dataSources: [WeightDataSource]
    }

    private func loadFixture() throws -> WeightFixtureFile {
        guard let url = Bundle.main.url(forResource: "WeightFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(WeightFixtureFile.self, from: data)
    }

    func fetchWeightReport(scope: EvidenceScopeSelection) async throws -> WeightReportReadModel {
        let fixture = try loadFixture()
        let scopedWeights = EvidenceChronology.filter(fixture.weights, scope: scope, date: \.date)
        let scopedScans = EvidenceChronology.filter(fixture.dexaScans, scope: scope, date: \.date)

        let points = scopedWeights.map { entry in
            WeightChartPoint(
                id: entry.id,
                date: entry.date,
                value: entry.value,
                label: Self.formatWeight(entry),
                detail: entry.isDefaultConditions ? "Morning weight" : "Different weigh-in conditions"
            )
        }
        let markers = scopedScans.map { WeightChartMarker(id: $0.id, date: $0.date, label: "DEXA") }
        // `history` — newest first, matching the web's own `[...points].reverse()`.
        let history = scopedWeights.reversed().map { entry in
            WeightHistoryEntry(
                id: entry.id,
                date: entry.date,
                detail: entry.isDefaultConditions ? "Morning weight" : "Different weigh-in conditions",
                value: Self.formatWeight(entry),
                attributedScope: EvidenceChronology.attribution(forOccurrenceDate: entry.date)
            )
        }

        return WeightReportReadModel(
            title: "Weight",
            subtitle: "Weight evidence over time.",
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: "All Weight"),
            summary: WeightEvidenceCalculator.summary(scope: scope, allWeights: fixture.weights, scopedWeights: scopedWeights),
            chart: WeightChartData(points: points, markers: markers),
            weeklyAverages: WeightEvidenceCalculator.weeklyAverages(scopedWeights: scopedWeights),
            history: history,
            dataSources: fixture.dataSources
        )
    }

    private static func formatWeight(_ entry: WeightEntryFixture) -> String {
        String(format: "%.1f %@", entry.value, entry.unit)
    }
}

/// Founder Production adapter for the Package 7 `weight` resource. The
/// server has already selected the canonical Weight revision; Native maps
/// that single DTO directly and never groups, sorts, or resolves same-day
/// candidates itself.
struct ProductionWeightEvidenceAPI: WeightEvidenceAPI {
    let api: ProductionNativeAPI

    func fetchWeightReport(scope: EvidenceScopeSelection) async throws -> WeightReportReadModel {
        let envelope = try await api.readWeight()
        guard envelope.data.schemaVersion == ProductionNativeAPI.contractVersion else {
            throw ProductionNativeError.incompatibleContractVersion(
                expected: ProductionNativeAPI.contractVersion,
                actual: envelope.data.schemaVersion
            )
        }
        return ProductionWeightReportAdapter.report(from: envelope.data.currentWeight, scope: scope)
    }
}

enum ProductionWeightReportAdapter {
    static func report(
        from currentWeight: FounderWeightSummary.CurrentWeight?,
        scope: EvidenceScopeSelection
    ) -> WeightReportReadModel {
        let entries = currentWeight.map {
            [WeightEntryFixture(
                id: $0.id,
                date: $0.measurementDate,
                value: $0.value,
                unit: $0.unit,
                isDefaultConditions: true
            )]
        } ?? []
        let chartPoints = currentWeight.map {
            [WeightChartPoint(
                id: $0.id,
                date: $0.measurementDate,
                value: $0.value,
                label: format($0),
                detail: "Canonical Weight"
            )]
        } ?? []
        let history = currentWeight.map {
            [WeightHistoryEntry(
                id: $0.id,
                date: $0.measurementDate,
                detail: "Canonical Weight",
                value: format($0),
                attributedScope: nil
            )]
        } ?? []

        return WeightReportReadModel(
            title: "Weight",
            subtitle: "Weight evidence over time.",
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: "All Weight"),
            summary: WeightEvidenceCalculator.summary(scope: scope, allWeights: entries, scopedWeights: entries),
            chart: WeightChartData(points: chartPoints, markers: []),
            weeklyAverages: WeightEvidenceCalculator.weeklyAverages(scopedWeights: entries),
            history: history,
            dataSources: [WeightDataSource(name: "PhysiqueOS", status: "Founder Production")]
        )
    }

    private static func format(_ weight: FounderWeightSummary.CurrentWeight) -> String {
        String(format: "%.1f %@", weight.value, weight.unit)
    }
}
