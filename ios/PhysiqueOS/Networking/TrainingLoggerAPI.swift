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
        guard let url = bundle.url(forResource: "TrainingLoggerFixture", withExtension: "json") else {
            throw TrainingLoggerAPIError.fixtureMissing
        }
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(TrainingLoggerConfiguration.self, from: data)
    }
}

enum TrainingLoggerAPIError: LocalizedError {
    case fixtureMissing

    var errorDescription: String? {
        "The local Training Logger fixture could not be loaded."
    }
}
