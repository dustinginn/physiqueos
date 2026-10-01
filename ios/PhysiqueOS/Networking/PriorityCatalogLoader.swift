import Foundation

/// A synchronous read of the same bundled execution-item catalog
/// `FixturePriorityAPI.fetchExecutionItems()` decodes asynchronously — not
/// a second catalog. Mirrors `TrainingExerciseCatalogLoader`'s own
/// established rationale: `LoggingSandboxStore` (Home/Priority Detail/
/// Morning Check-In's shared completion store) is constructed
/// synchronously at `AppEnvironment` init time and cannot `await` the
/// existing async `PriorityAPI` from there.
enum PriorityCatalogLoader {
    static func loadExecutionItems(bundle: Bundle = .main) -> [ExecutionItemFixture] {
        guard let url = bundle.url(forResource: "PriorityFixture", withExtension: "json"),
              let data = try? Data(contentsOf: url)
        else { return [] }
        return (try? JSONDecoder().decode([ExecutionItemFixture].self, from: data)) ?? []
    }
}
