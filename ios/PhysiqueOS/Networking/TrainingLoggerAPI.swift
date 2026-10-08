import Foundation

protocol TrainingLoggerAPI: Sendable {
    func fetchConfiguration() async throws -> TrainingLoggerConfiguration
}

struct FixtureTrainingLoggerAPI: TrainingLoggerAPI {
    private let bundle: Bundle

    init(bundle: Bundle = .main) {
        self.bundle = bundle
    }

    func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
        try TrainingExerciseCatalogLoader.loadConfiguration(bundle: bundle)
    }
}

enum TrainingLoggerAPIError: LocalizedError {
    case fixtureMissing

    var errorDescription: String? {
        "The local Training Logger fixture could not be loaded."
    }
}

#if DEBUG
/// Build 92 VISUAL-REVIEW harness only (non-shipping review branch, never
/// merged). Enabled solely by `-physiqueos.training-variants-review
/// existing|none|create-fails` under Sandbox; compiled out of Release like
/// `EvidenceRedesignReview`. It feeds the real Logger the same per-exercise
/// variant projection a Build 92 Server sends, so the shipping SwiftUI menu,
/// Create Variant sheet and selected state can be captured. No Server, no
/// Founder data, no Production authority.
enum TrainingVariantsReview {
    enum State: String {
        /// Spider Curls already has the canonical Static Hold definition.
        case existing
        /// Spider Curls has no definitions yet; Create Variant creates one.
        case none
        /// Create Variant fails (offline) so the inline retry state shows.
        case createFails = "create-fails"
    }

    static var state: State? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.training-variants-review"),
              arguments.indices.contains(flag + 1) else { return nil }
        return State(rawValue: arguments[flag + 1])
    }

    static var isEnabled: Bool { state != nil }

    static let staticHold = TrainingExecutionVariantChoice(
        variantId: "tev_review_spider_static_hold", key: "static_hold", label: "Static Hold",
        legacyKeys: ["static_hold"], status: "active", provenance: "legacy_seed",
        selection: TrainingExecutionVariant(
            key: "static_hold", label: "Static Hold", rawLabel: "Static Hold", variantId: "tev_review_spider_static_hold"
        )
    )

    static func loggerAPI(wrapping base: TrainingLoggerAPI) -> TrainingLoggerAPI {
        guard let state else { return base }
        return ReviewTrainingVariantsLoggerAPI(base: base, state: state)
    }

    static var catalogWriteAPI: TrainingExerciseCatalogWriteAPI? {
        state.map(ReviewTrainingVariantsCatalogWriteAPI.init(state:))
    }
}

private struct ReviewTrainingVariantsLoggerAPI: TrainingLoggerAPI {
    let base: TrainingLoggerAPI
    let state: TrainingVariantsReview.State

    func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
        var configuration = try await base.fetchConfiguration()
        configuration.supportsExecutionVariantCreation = true
        if let index = configuration.exercises.firstIndex(where: { $0.name == "Spider Curls" }) {
            let canonicalId = configuration.exercises[index].canonicalExerciseId
            func set(_ number: Int, reps: Double, load: Double) -> TrainingSet {
                TrainingSet(setNumber: number, reps: reps, weight: load, weightUnit: "lb", durationSeconds: nil, loadType: "external_load", setType: nil)
            }
            configuration.exercises[index].previouslyPerformed = true
            configuration.exercises[index].inMyLibrary = true
            configuration.exercises[index].history = [
                TrainingLoggerHistoryRecord(
                    sessionId: "review-ordinary-\(canonicalId)", workoutDate: "2026-10-01", executionVariant: nil, relationship: nil,
                    sets: [set(1, reps: 12, load: 35), set(2, reps: 12, load: 35), set(3, reps: 11, load: 35)]
                ),
                TrainingLoggerHistoryRecord(
                    sessionId: "review-static-hold-\(canonicalId)", workoutDate: "2026-09-26",
                    executionVariant: TrainingExecutionVariant(key: "static_hold", label: "Static Hold", rawLabel: "static hold"),
                    relationship: nil,
                    sets: [set(1, reps: 10, load: 30), set(2, reps: 10, load: 30), set(3, reps: 9, load: 30)]
                ),
            ]
            configuration.exercises[index].executionVariants = state == .existing ? [TrainingVariantsReview.staticHold] : []
        }
        return configuration
    }
}

private struct ReviewTrainingVariantsCatalogWriteAPI: TrainingExerciseCatalogWriteAPI {
    let state: TrainingVariantsReview.State

    func addToMyLibrary(canonicalExerciseId: String) async throws {}

    func createExercise(
        canonicalName: String, primaryMuscleGroupId: String, equipment: String?, aliases: [String]
    ) async throws -> CreateCanonicalExerciseOutcome {
        throw NotAvailableTrainingExerciseCatalogWriteAPI.NotAvailable()
    }

    func createExecutionVariant(canonicalExerciseId: String, displayName: String) async throws -> TrainingExecutionVariantCreation {
        try await Task.sleep(for: .milliseconds(700))
        if state == .createFails { throw URLError(.notConnectedToInternet) }
        let key = displayName.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "_")
        if key == "static_hold" {
            return TrainingExecutionVariantCreation(status: "created", choice: TrainingVariantsReview.staticHold)
        }
        let id = "tev_review_\(key)"
        return TrainingExecutionVariantCreation(status: "created", choice: TrainingExecutionVariantChoice(
            variantId: id, key: key, label: displayName, legacyKeys: [], status: "active", provenance: "user_created",
            selection: TrainingExecutionVariant(key: key, label: displayName, rawLabel: displayName, variantId: id)
        ))
    }
}
#endif
