import Foundation

/// A synchronous read of the same bundled Training Logger catalog
/// `FixtureTrainingLoggerAPI.fetchConfiguration()` decodes asynchronously —
/// not a second canonical exercise store. Direct-upload evidence
/// interpretation (`EvidenceLocalInterpretation`) runs synchronously and
/// cannot `await` the existing async `TrainingLoggerAPI`, so this loader
/// exists purely to read the identical `TrainingLoggerFixture.json` file
/// through the identical `TrainingLoggerConfiguration` decode path from a
/// synchronous call site. Direct-upload Training resolves exercise names
/// against this exact catalog so a typed exercise the Workout Logger
/// already knows is recognized identically on upload.
enum TrainingExerciseCatalogLoader {
    static func loadExercises(bundle: Bundle = .main) -> [TrainingLoggerCatalogExercise] {
        guard let url = bundle.url(forResource: "TrainingLoggerFixture", withExtension: "json"),
              let data = try? Data(contentsOf: url)
        else { return [] }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return (try? decoder.decode(TrainingLoggerConfiguration.self, from: data))?.exercises ?? []
    }
}
