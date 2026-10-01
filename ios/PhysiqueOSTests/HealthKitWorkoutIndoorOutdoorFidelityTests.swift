import Foundation
import XCTest
@testable import PhysiqueOS

/// Apple's `HKWorkoutActivityType` uses the SAME raw numeric value for
/// Indoor Walk and Outdoor Walk (and similarly indoor/outdoor running and
/// cycling) -- the distinction lives in a separate boolean metadata key,
/// `HKMetadataKeyIndoorWorkout`, which `HealthKitQueryClient.swift`'s
/// `map(_:stream:calendar:)` previously never read at all, and which the
/// old `allowlistedMetadata` allowlist would have silently dropped even if
/// it had. `HealthKitQueryWorkout.isIndoorWorkout` is the fix: a plain,
/// honest `Bool?` (`nil` = unknown/not provided, `true` = indoor, `false` =
/// outdoor) read through unchanged from that one metadata key.
///
/// `SystemHealthKitQueryClient.map` itself is `private` and requires a real
/// `HKWorkout`/`HKHealthStore` context, so -- following the identical
/// pattern every other test of this same mapping function already uses
/// (`HealthKitFounderCanaryTests.workout()`, `HealthKitSynchronizationTests
/// .workoutAddition()`) -- these tests construct `HealthKitQueryWorkout`/
/// `HealthKitQueryAddition` fixtures directly and prove the field survives
/// every downstream transport step: `HealthKitObservationNormalizer`,
/// `HealthKitBatchBuilder`, and finally `HealthKitS1WireMapper` -- the exact
/// struct `HealthKitServerUploader` JSON-encodes and sends to the Server.
/// The wire mapper has its own separate `Workout` struct that must
/// explicitly re-list a field or it never reaches the Server at all (this
/// is exactly how `telemetryTypeIdentifiers` is deliberately dropped), so
/// asserting only on `HealthKitQueryWorkout` in memory would miss that
/// transport gap entirely.
final class HealthKitWorkoutIndoorOutdoorFidelityTests: XCTestCase {
    private static let now = Date(timeIntervalSince1970: 1_789_128_000) // 2026-09-10T12:00:00Z

    private static func calendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    /// `activityType: "52"` is HKWorkoutActivityType.walking's real raw
    /// value, shared by Indoor Walk and Outdoor Walk.
    private static func workoutAddition(
        activityType: String = "52",
        isIndoorWorkout: Bool?
    ) -> HealthKitQueryAddition {
        let start = Self.now
        let end = start.addingTimeInterval(1800)
        let calendar = Self.calendar()
        return HealthKitQueryAddition(
            healthKitUUID: UUID(uuidString: "60000000-0000-0000-0000-000000000001")!,
            objectTypeIdentifier: HealthKitSynchronizationStream.workouts.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Watch", sourceRevision: "11",
                productType: "Watch7,5", privacySafeDeviceProvenance: nil
            ),
            occurrence: HealthKitQueryOccurrence(
                startedAt: start, endedAt: end, localDate: "2026-09-10", calendarIdentifier: "gregorian",
                timeZoneIdentifier: calendar.timeZone.identifier,
                utcOffsetSeconds: calendar.timeZone.secondsFromGMT(for: start),
                localDayStartedAt: calendar.startOfDay(for: start),
                localDayEndedAt: calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: start))!
            ),
            payload: .workout(HealthKitQueryWorkout(
                activityType: activityType,
                durationSeconds: 1800,
                activeCalories: 150,
                totalCalories: nil,
                distance: 2000,
                distanceUnit: "m",
                averageHeartRate: 110,
                telemetryTypeIdentifiers: [],
                isIndoorWorkout: isIndoorWorkout
            )),
            allowlistedMetadata: [:]
        )
    }

    private static func scope() -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner", enrolledDeviceIdentity: "device",
            stream: .workouts, predicateVersion: "healthkit-workout-fidelity-tests-v1"
        )
    }

    private static func wireWorkout(for addition: HealthKitQueryAddition) throws -> [String: Any] {
        let batch = try HealthKitBatchBuilder().build(
            scope: Self.scope(), previousCursor: nil,
            queryResult: .init(additions: [addition], deletions: [], proposedAnchorData: Data("a".utf8), completedAt: Self.now),
            createdAt: Self.now
        )
        let partition = try XCTUnwrap(batch.partitions.first)
        let encoded = try JSONEncoder().encode(HealthKitS1WireMapper.payload(for: partition))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let observation = try XCTUnwrap((root["observations"] as? [[String: Any]])?.first)
        return try XCTUnwrap(observation["workout"] as? [String: Any])
    }

    // MARK: - In-memory field mapping

    func testIndoorMetadataTrueMapsToIsIndoorWorkoutTrue() {
        let addition = Self.workoutAddition(isIndoorWorkout: true)
        guard case let .workout(workout) = addition.payload else { return XCTFail("Expected workout payload") }
        XCTAssertEqual(workout.isIndoorWorkout, true)
    }

    func testIndoorMetadataFalseMapsToIsIndoorWorkoutFalse() {
        let addition = Self.workoutAddition(isIndoorWorkout: false)
        guard case let .workout(workout) = addition.payload else { return XCTFail("Expected workout payload") }
        XCTAssertEqual(workout.isIndoorWorkout, false)
    }

    /// No `HKMetadataKeyIndoorWorkout` key at all must decode/carry as
    /// `nil` -- never a guessed default (e.g. never defaulted to `false`
    /// meaning "outdoor").
    func testAbsentIndoorMetadataMapsToNilNeverAGuessedDefault() {
        let addition = Self.workoutAddition(isIndoorWorkout: nil)
        guard case let .workout(workout) = addition.payload else { return XCTFail("Expected workout payload") }
        XCTAssertNil(workout.isIndoorWorkout)
    }

    /// Strength has no indoor/outdoor concept in Apple's model -- Apple
    /// never sets the metadata key for it, so this must also be `nil`,
    /// proving the new field doesn't force a value onto workout types that
    /// never carry it.
    func testStrengthActivityTypeWithNoIndoorMetadataAlsoMapsToNil() {
        // HKWorkoutActivityType.traditionalStrengthTraining.rawValue == 50.
        let addition = Self.workoutAddition(activityType: "50", isIndoorWorkout: nil)
        guard case let .workout(workout) = addition.payload else { return XCTFail("Expected workout payload") }
        XCTAssertNil(workout.isIndoorWorkout)
    }

    // MARK: - Normalizer passthrough (`NormalizedHealthKitObservation`)

    func testNormalizerPreservesIsIndoorWorkoutUnchanged() {
        let normalized = HealthKitObservationNormalizer().normalize(Self.workoutAddition(isIndoorWorkout: true))
        guard case let .workout(workout) = normalized.payload else { return XCTFail("Expected workout payload") }
        XCTAssertEqual(workout.isIndoorWorkout, true)
    }

    // MARK: - Real transport encoding: `HealthKitS1WireMapper` -> `JSONEncoder`
    //
    // This is the exact struct `HealthKitServerUploader` sends to the
    // Server. The defect class here is a transport/encoding gap (a field
    // silently dropped between the in-memory model and the wire payload,
    // exactly as `allowlistedMetadata` used to drop this same information),
    // not an in-memory one -- so these assert on the raw encoded JSON.

    func testIsIndoorWorkoutTrueIsPresentAndTrueInTheEncodedWireJSON() throws {
        let workout = try Self.wireWorkout(for: Self.workoutAddition(isIndoorWorkout: true))
        XCTAssertEqual(workout["isIndoorWorkout"] as? Bool, true)
    }

    func testIsIndoorWorkoutFalseIsPresentAndFalseInTheEncodedWireJSON() throws {
        let workout = try Self.wireWorkout(for: Self.workoutAddition(isIndoorWorkout: false))
        XCTAssertEqual(workout["isIndoorWorkout"] as? Bool, false)
    }

    /// `nil` must be omitted from the wire JSON entirely (the transport's
    /// existing convention for every other optional workout field, e.g.
    /// `totalCalories`/`distance` when absent) -- never encoded as an
    /// explicit `null` that a naive Server-side reader could confuse with
    /// "confirmed outdoor".
    func testNilIsIndoorWorkoutIsOmittedEntirelyFromTheEncodedWireJSON() throws {
        let workout = try Self.wireWorkout(for: Self.workoutAddition(isIndoorWorkout: nil))
        XCTAssertNil(workout["isIndoorWorkout"])
        XCTAssertFalse(Set(workout.keys).contains("isIndoorWorkout"))
    }
}
