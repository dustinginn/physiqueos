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

/// Founder Production adapter for the completed Package 7 `weight`
/// resource (Patch 3 continuation) — a purpose-built Native projection
/// (`projectNativeWeightRead`, server-side), not a mirror of
/// `WeightReportScreen.jsx`'s web card layout. The server has already
/// selected the canonical current revision, resolved same-day
/// corrections, computed rolling 3-day/7-day averages, weekly averages,
/// and decided which Goal-relevant extrema to surface; Native only
/// decodes and formats this already-final output — it never re-selects a
/// revision, re-groups by week, or recomputes an average itself.
struct ProductionWeightEvidenceAPI: WeightEvidenceAPI {
    let api: ProductionNativeAPI

    func fetchWeightReport(scope: EvidenceScopeSelection) async throws -> WeightReportReadModel {
        let context = try ProductionContext.value(for: scope)
        let envelope = try await api.readResource("weight", query: ["context": context], as: Payload.self)
        return Self.report(from: envelope.data)
    }

    private static func report(from payload: Payload) -> WeightReportReadModel {
        // History arrives newest-first from the server already — reused
        // verbatim for the History list, and reversed only for the chart
        // (which must render chronologically, oldest → newest).
        let history = payload.history.map(\.readModel)
        let chartPoints = payload.history.reversed().map { entry in
            WeightChartPoint(id: entry.id, date: entry.date, value: entry.value, label: entry.label, detail: entry.detail)
        }
        let markers = payload.dexaContext.markers.map { $0.readModel }

        return WeightReportReadModel(
            title: "Weight",
            subtitle: "Weight evidence over time.",
            scope: payload.context.scope(allLabel: "All Weight"),
            summary: Self.summary(from: payload),
            chart: WeightChartData(points: chartPoints, markers: markers),
            weeklyAverages: payload.weeklyAverages.map(\.readModel),
            history: history,
            dataSources: [WeightDataSource(name: "PhysiqueOS", status: "Founder Production")],
            current: payload.current?.readModel,
            recentWeighIns: payload.recentWeighIns.map(\.readModel),
            rollingAverages: payload.rollingAverages?.readModel,
            extrema: payload.extrema?.readModel,
            dexaContext: WeightDEXAContextSection(latest: payload.dexaContext.latest?.readModel, markers: markers),
            page: payload.page.readModel
        )
    }

    /// Which of Latest/Highest/Lowest to show is entirely a server
    /// decision (`extrema.goalRelevant`) — this only picks which already-
    /// computed cards to lay out, mirroring the summary-grid UI Sandbox's
    /// hardcoded contextId lookup used to drive, now server-driven.
    private static func summary(from payload: Payload) -> [WeightSummaryCard] {
        var cards: [WeightSummaryCard] = []
        if let current = payload.current {
            cards.append(WeightSummaryCard(label: "Latest", value: current.label))
        }
        let goalRelevant = Set(payload.extrema?.goalRelevant ?? [])
        if goalRelevant.contains("highest"), let highest = payload.extrema?.highest {
            cards.append(WeightSummaryCard(label: "Highest", value: highest.formattedValue))
        }
        if goalRelevant.contains("lowest"), let lowest = payload.extrema?.lowest {
            cards.append(WeightSummaryCard(label: "Lowest", value: lowest.formattedValue))
        }
        return cards
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var context: NativeGoalPhaseContext
        var current: HistoryPoint?
        var recentWeighIns: [HistoryPoint]
        var rollingAverages: RollingAverages?
        var weeklyAverages: [WeeklyAverage]
        var extrema: Extrema?
        var dexaContext: DEXAContext
        var history: [HistoryPoint]
        var page: Page
    }

    private struct HistoryPoint: Decodable {
        var id: String
        var date: String
        var value: Double
        var unit: String
        var revision: Int?
        var label: String
        var detail: String

        var readModel: WeightHistoryEntry {
            WeightHistoryEntry(id: id, date: date, detail: detail, value: label, attributedScope: nil)
        }
    }

    private struct RollingAverageWindow: Decodable {
        var requestedDays: Int
        var observationCount: Int
        var startDate: String?
        var endDate: String?
        var value: Double?
        var unit: String?

        var readModel: WeightRollingAverageWindow {
            WeightRollingAverageWindow(
                requestedDays: requestedDays, observationCount: observationCount,
                startDate: startDate, endDate: endDate, value: value, unit: unit
            )
        }
    }

    private struct RollingAverages: Decodable {
        var threeDay: RollingAverageWindow
        var sevenDay: RollingAverageWindow

        var readModel: WeightRollingAverages {
            WeightRollingAverages(threeDay: threeDay.readModel, sevenDay: sevenDay.readModel)
        }
    }

    private struct WeeklyAverage: Decodable {
        var week: String
        var average: Double
        var weekOverWeek: Double?
        var entries: Int

        var readModel: WeightWeeklyAverage {
            WeightWeeklyAverage(week: week, average: average, weekOverWeek: weekOverWeek, isBaseWeek: weekOverWeek == nil, entryCount: entries)
        }
    }

    private struct ExtremePoint: Decodable {
        var id: String
        var date: String
        var value: Double
        var unit: String
        var revision: Int?

        var readModel: WeightExtremePoint {
            WeightExtremePoint(id: id, date: date, value: value, unit: unit, revision: revision)
        }

        var formattedValue: String {
            String(format: "%.1f %@", value, unit)
        }
    }

    private struct Extrema: Decodable {
        var goalRelevant: [String]
        var highest: ExtremePoint?
        var lowest: ExtremePoint?

        var readModel: WeightExtremaContext {
            WeightExtremaContext(goalRelevant: goalRelevant, highest: highest?.readModel, lowest: lowest?.readModel)
        }
    }

    private struct Marker: Decodable {
        var id: String
        var date: String
        var label: String

        var readModel: WeightChartMarker {
            WeightChartMarker(id: id, date: date, label: label)
        }
    }

    private struct DEXAContext: Decodable {
        var latest: Marker?
        var markers: [Marker]
    }

    private struct Page: Decodable {
        var limit: Int
        var count: Int
        var hasMore: Bool

        var readModel: WeightHistoryPage {
            WeightHistoryPage(limit: limit, count: count, hasMore: hasMore)
        }
    }
}
