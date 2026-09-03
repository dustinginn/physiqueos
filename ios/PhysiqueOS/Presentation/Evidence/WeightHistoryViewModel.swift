import Foundation

/// Backs `WeightHistoryView` — named `...HistoryViewModel` for consistency
/// with the other Evidence view models even though Weight has no separate
/// landing/history split on the web (one single page covers both, see
/// `WeightReportReadModel`'s doc comment).
@Observable
@MainActor
final class WeightHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(WeightReportReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Weight's own confirmed real default context (Build Lean Mass —
    /// `WeightEvidenceContextService.js:22`, matching Nutrition/Activity).
    private(set) var scope: EvidenceScopeSelection = WeightScopeDefault.selection
    private let api: WeightEvidenceAPI
    /// The point currently selected/scrubbed on the Weight Trend chart —
    /// owned here (not local `@State` in the view) so it resets cleanly
    /// whenever a scope change reloads the chart's underlying points.
    private(set) var selectedChartPointID: String?

    init(api: WeightEvidenceAPI) {
        self.api = api
    }

    func load() async {
        do {
            let report = try await api.fetchWeightReport(scope: scope)
            state = .loaded(report)
            selectedChartPointID = report.chart.points.last?.id
        } catch {
            state = .failed("Weight could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }

    /// Scrub/tap selection on the Weight Trend chart — mirrors the web's
    /// own pointer-scrub nearest-point snap (`ProgressLineChart.jsx`), never
    /// recomputed by the view itself.
    func selectChartPoint(id: String) {
        selectedChartPointID = id
    }
}
