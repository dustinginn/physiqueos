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
    func fetchNutritionLanding(scope: EvidenceScopeSelection) async throws -> NutritionLandingReadModel
    /// `nil` for an id with no matching Nutrition day — mirrors
    /// `TrainingAPI.fetchTrainingDay(date:)`'s own not-found contract.
    func fetchNutritionDay(dayId: String) async throws -> NutritionDayRecord?
    /// Mirrors `getReportingContent`-style dispatch: `nil` for an id
    /// outside the 3 real report ids (`calories`/`macros`/`meals`) — the
    /// other 2 `nutritionReportingLinks` entries (`adherence`/
    /// `consistency`) are real links but resolve to the web's own generic
    /// placeholder screen, not a real report, and are intentionally not
    /// modeled here (see `NutritionReportingReadModel`'s doc comment).
    /// `scope` mirrors the landing page's own Goal/Phase scope; `range`
    /// narrows further, purely client-side, matching the web's own 5-way
    /// chart range selector layered on top of the scope window.
    func fetchNutritionReporting(
        reportId: String,
        scope: EvidenceScopeSelection,
        range: NutritionReportRange,
        macro: NutritionMacroKey,
        mealMacroMixSlot: NutritionMealSlotFilter,
        mealTrendSlot: NutritionMealSlotFilter,
        mealTrendMetric: NutritionMealTrendMetric
    ) async throws -> NutritionReportingReadModel?
}

extension NutritionAPI {
    func fetchNutritionLanding() async throws -> NutritionLandingReadModel {
        try await fetchNutritionLanding(scope: NutritionScopeDefault.selection)
    }
}

/// Nutrition's own real default context is Build Lean Mass (matching Weight/
/// Activity, unlike Training's "all").
enum NutritionScopeDefault {
    static let selection: EvidenceScopeSelection = .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass)
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
    func fetchNutritionLanding(scope: EvidenceScopeSelection) async throws -> NutritionLandingReadModel {
        let fixture = try loadFixture()
        let attributedDays = fixture.days.map { day -> NutritionDayRecord in
            var day = day
            day.attributedScope = EvidenceChronology.attribution(forOccurrenceDate: day.date)
            return day
        }
        // The 3 real report ids each get a real destination
        // (`.progressStream(streamId: "nutrition/reporting/<id>")`); any
        // other reportingLinks entry stays informational-only (`nil`).
        let reportingLinks = fixture.reportingLinks.map { link -> NutritionInfoLink in
            var link = link
            if Self.realReportIDs.contains(link.id) {
                link.destination = .progressStream(streamId: "nutrition/reporting/\(link.id)")
            }
            return link
        }
        return NutritionLandingReadModel(
            title: fixture.title,
            subtitle: nil,
            tone: fixture.tone,
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: "All Nutrition"),
            latestNutritionDay: attributedDays.first,
            reportingLinks: reportingLinks,
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

    /// The 3 real report ids, in `nutritionReportingLinks` order — used
    /// only to validate `reportId` here; `NutritionHistoryView`'s own
    /// "Reporting" card renders `fixture.reportingLinks` directly (which
    /// also includes the non-report `adherence`/`consistency` placeholder
    /// links).
    private static let realReportIDs: Set<String> = ["calories", "macros", "meals"]

    func fetchNutritionReporting(
        reportId: String,
        scope: EvidenceScopeSelection,
        range: NutritionReportRange,
        macro: NutritionMacroKey,
        mealMacroMixSlot: NutritionMealSlotFilter,
        mealTrendSlot: NutritionMealSlotFilter,
        mealTrendMetric: NutritionMealTrendMetric
    ) async throws -> NutritionReportingReadModel? {
        guard Self.realReportIDs.contains(reportId) else { return nil }
        let fixture = try loadFixture()
        let scopedDays = EvidenceChronology.filter(fixture.days, scope: scope, date: \.date)
        let days = NutritionReportingCalculator.rangeFiltered(days: scopedDays, range: range)
        let scopeContext = EvidenceChronology.scopeContext(selected: scope, allLabel: "All Nutrition")

        switch reportId {
        case "calories":
            return NutritionReportingReadModel(
                id: reportId, eyebrow: "Nutrition Reporting", title: "Calories",
                subtitle: "Daily intake, weekly averages, and calorie history over time.",
                scope: scopeContext, dataSources: fixture.dataSources, calories: NutritionReportingCalculator.caloriesReport(days: days), macros: nil, meals: nil
            )
        case "macros":
            return NutritionReportingReadModel(
                id: reportId, eyebrow: "Nutrition Reporting", title: "Macros",
                subtitle: "Macro distribution, daily averages, and weekly trends over time.",
                scope: scopeContext, dataSources: fixture.dataSources, calories: nil, macros: NutritionReportingCalculator.macrosReport(days: days, selectedMacro: macro), meals: nil
            )
        case "meals":
            return NutritionReportingReadModel(
                id: reportId, eyebrow: "Nutrition Reporting", title: "Meals",
                subtitle: "Meal structure across the selected period.",
                scope: scopeContext, dataSources: fixture.dataSources, calories: nil, macros: nil,
                meals: NutritionReportingCalculator.mealsReport(days: days, macroMixSlot: mealMacroMixSlot, trendSlot: mealTrendSlot, trendMetric: mealTrendMetric)
            )
        default:
            return nil
        }
    }
}
