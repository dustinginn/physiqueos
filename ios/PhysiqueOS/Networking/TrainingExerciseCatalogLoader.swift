import Foundation

/// Loads the workout picker from the same canonical exercise rows used by
/// Training Library. `TrainingLoggerFixture` remains the owner of logger-
/// specific metadata (measurement type, equipment, prior performance and
/// recommendations), while `TrainingFixture` owns identity, name and area.
enum TrainingExerciseCatalogLoader {
    static func loadConfiguration(bundle: Bundle = .main) throws -> TrainingLoggerConfiguration {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        guard let loggerURL = bundle.url(forResource: "TrainingLoggerFixture", withExtension: "json"),
              let libraryURL = bundle.url(forResource: "TrainingFixture", withExtension: "json")
        else { throw TrainingLoggerAPIError.fixtureMissing }

        let logger = try decoder.decode(TrainingLoggerConfiguration.self, from: Data(contentsOf: loggerURL))
        let library = try decoder.decode(CanonicalTrainingLibrary.self, from: Data(contentsOf: libraryURL))
        let migratedLegacyIDs = legacyIdentityMap(library: library)
        let loggerByCanonicalID = Dictionary(uniqueKeysWithValues: logger.exercises.map {
            (migratedLegacyIDs[$0.canonicalExerciseId] ?? $0.canonicalExerciseId, $0)
        })

        let exercises = library.areas.flatMap { area in
            area.exercises.compactMap { row -> TrainingLoggerCatalogExercise? in
                guard let canonicalID = row.canonicalExerciseId else { return nil }
                if var existing = loggerByCanonicalID[canonicalID] {
                    existing.canonicalExerciseId = canonicalID
                    existing.name = row.label
                    existing.areaId = area.id
                    existing.history = existing.history.map { record in
                        var migrated = record
                        if var relationship = record.relationship {
                            relationship.partnerCanonicalExerciseIds = relationship.partnerCanonicalExerciseIds.map {
                                migratedLegacyIDs[$0] ?? $0
                            }
                            migrated.relationship = relationship
                        }
                        return migrated
                    }
                    return existing
                }
                return TrainingLoggerCatalogExercise(
                    canonicalExerciseId: canonicalID,
                    name: row.label,
                    areaId: area.id,
                    equipment: nil,
                    measurement: .repsLoad,
                    previouslyPerformed: false,
                    history: [],
                    progressionRecommendation: nil
                )
            }
        }

        return TrainingLoggerConfiguration(
            areas: library.areas.map { TrainingLoggerArea(id: $0.id, label: $0.title) },
            variants: logger.variants,
            exercises: exercises
        )
    }

    static func loadExercises(bundle: Bundle = .main) -> [TrainingLoggerCatalogExercise] {
        (try? loadConfiguration(bundle: bundle).exercises) ?? []
    }

    /// One-time migration from the logger fixture's route-style legacy ids.
    /// Destinations are resolved from the bundled Library, never invented.
    private static func legacyIdentityMap(library: CanonicalTrainingLibrary) -> [String: String] {
        let rows = library.areas.flatMap(\.exercises)
        let byRoute = Dictionary(uniqueKeysWithValues: rows.compactMap { row in
            row.canonicalExerciseId.map { (row.id, $0) }
        })
        let aliases = [
            "seated-cable-row": "seated-cable-rows",
            "dumbbell-lateral-raise": "lateral-raise",
            "cable-triceps-pushdown": "cable-rope-pushdowns",
            "plank": "planks",
            "leg-extension": "leg-extensions",
            "romanian-deadlift": "romanian-deadlifts",
            "hip-thrust": "hip-thrusts",
        ]
        var result = byRoute
        for (legacy, route) in aliases {
            if let canonical = byRoute[route] { result[legacy] = canonical }
        }
        return result
    }
}

private struct CanonicalTrainingLibrary: Decodable {
    var areas: [CanonicalTrainingArea]
}

private struct CanonicalTrainingArea: Decodable {
    var id: String
    var title: String
    var exercises: [CanonicalTrainingExercise]
}

private struct CanonicalTrainingExercise: Decodable {
    var id: String
    var label: String
    var canonicalExerciseId: String?
}
