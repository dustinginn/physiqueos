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
