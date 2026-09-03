import Foundation

/// Backs `NutritionReportingView` — one view model for all 3 real report
/// ids (Calories/Macros/Meals), following `TrainingReportingViewModel`'s
/// established one-view-model-per-`reportId` convention. Owns every axis
/// of client-side filtering the web's own report screens expose (range,
/// selected macro, meal slot filters, meal trend metric) so selecting any
/// of them re-derives the report from the same already-fetched fixture
/// without a network round trip — matching the web's own purely
/// client-side re-filtering of an already-fetched page model.
@Observable
@MainActor
final class NutritionReportingViewModel {
    enum LoadState {
        case loading
        case loaded(NutritionReportingReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private(set) var scope: EvidenceScopeSelection = NutritionScopeDefault.selection
    private(set) var range: NutritionReportRange = .all
    private(set) var selectedMacro: NutritionMacroKey = .protein
    private(set) var mealMacroMixSlot: NutritionMealSlotFilter = .dinner
    private(set) var mealTrendSlot: NutritionMealSlotFilter = .all
    private(set) var mealTrendMetric: NutritionMealTrendMetric = .calories

    private let api: NutritionAPI
    let reportId: String

    init(api: NutritionAPI, reportId: String) {
        self.api = api
        self.reportId = reportId
    }

    func load() async {
        do {
            let report = try await api.fetchNutritionReporting(
                reportId: reportId, scope: scope, range: range, macro: selectedMacro,
                mealMacroMixSlot: mealMacroMixSlot, mealTrendSlot: mealTrendSlot, mealTrendMetric: mealTrendMetric
            )
            state = .loaded(report)
        } catch {
            state = .failed("This report could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }

    func selectRange(_ newRange: NutritionReportRange) async {
        guard newRange != range else { return }
        range = newRange
        await load()
    }

    func selectMacro(_ macro: NutritionMacroKey) async {
        guard macro != selectedMacro else { return }
        selectedMacro = macro
        await load()
    }

    func selectMealMacroMixSlot(_ slot: NutritionMealSlotFilter) async {
        guard slot != mealMacroMixSlot else { return }
        mealMacroMixSlot = slot
        await load()
    }

    func selectMealTrendSlot(_ slot: NutritionMealSlotFilter) async {
        guard slot != mealTrendSlot else { return }
        mealTrendSlot = slot
        await load()
    }

    func selectMealTrendMetric(_ metric: NutritionMealTrendMetric) async {
        guard metric != mealTrendMetric else { return }
        mealTrendMetric = metric
        await load()
    }
}
