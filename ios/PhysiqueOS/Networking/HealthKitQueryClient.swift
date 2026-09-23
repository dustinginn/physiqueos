import Foundation
import HealthKit

protocol HealthKitAnchoredQueryClient: Sendable {
    func execute(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult
}

struct HealthKitObserverRegistration: Hashable, Sendable { let id: UUID }

protocol HealthKitObserverClient: Sendable {
    func register(
        stream: HealthKitSynchronizationStream,
        onWake: @escaping @Sendable (_ errorCode: String?, _ completion: @escaping @Sendable () -> Void) -> Void
    ) throws -> HealthKitObserverRegistration
    func unregister(_ registration: HealthKitObserverRegistration)
    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws
}

/// Real HealthKit implementation behind injectable protocols. N1's default
/// feature gate never constructs queries or enables background delivery.
final class SystemHealthKitQueryClient: HealthKitAnchoredQueryClient, @unchecked Sendable {
    private struct ActivityCursor: Codable {
        struct Entry: Codable {
            let fingerprint: String
            let revision: UInt64
        }
        var entries: [String: Entry]
    }

    private let store: HKHealthStore
    private let calendar: Calendar
    private let now: @Sendable () -> Date
    private let activityLookbackDays: Int
    /// `HealthKitWorkoutActivationFloor.startOfDay` in production; `nil`
    /// (no floor, the pre-Build-54 behavior) for tests and any caller that
    /// does not opt in. Consulted only by the per-sample branch of `execute`,
    /// only for `.workouts`, and only when the caller passed no bounds.
    private let workoutFloor: Date?

    init(
        store: HKHealthStore = HKHealthStore(),
        calendar: Calendar = .autoupdatingCurrent,
        activityLookbackDays: Int = 30,
        workoutFloor: Date? = nil,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.store = store
        self.calendar = calendar
        self.activityLookbackDays = activityLookbackDays
        self.workoutFloor = workoutFloor
        self.now = now
    }

    func execute(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds? = nil
    ) async throws -> HealthKitAnchoredQueryResult {
        if stream == .activitySummary {
            return try await executeActivitySummary(after: anchorData, bounds: bounds)
        }
        if stream == .nutritionDailyTotal {
            return try await executeNutritionDailyTotal(after: anchorData, bounds: bounds)
        }
        guard let sampleType = Self.sampleType(for: stream) else {
            throw HealthKitSyncError.operational(code: "healthkit_stream_type_unavailable")
        }
        let anchor: HKQueryAnchor?
        do {
            anchor = try anchorData.map {
                guard let decoded = try NSKeyedUnarchiver.unarchivedObject(
                    ofClass: HKQueryAnchor.self,
                    from: $0
                ) else { throw HealthKitSyncError.corruptCursor }
                return decoded
            }
        } catch {
            throw HealthKitSyncError.corruptCursor
        }

        let predicate = Self.samplePredicate(
            for: Self.samplePredicateDecision(stream: stream, requested: bounds, workoutFloor: workoutFloor)
        )
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: sampleType,
                predicate: predicate,
                anchor: anchor,
                limit: HKObjectQueryNoLimit
            ) { _, samples, deletedObjects, proposedAnchor, error in
                if error != nil {
                    continuation.resume(throwing: HealthKitSyncError.operational(code: "healthkit_anchored_query_failed"))
                    return
                }
                guard let proposedAnchor else {
                    continuation.resume(throwing: HealthKitSyncError.operational(code: "healthkit_anchor_missing"))
                    return
                }
                do {
                    let additions = try (samples ?? []).map { try Self.map($0, stream: stream, calendar: self.calendar) }
                    let deletions = (deletedObjects ?? []).map {
                        HealthKitQueryDeletion(
                            healthKitUUID: $0.uuid,
                            immutableExternalID: nil,
                            objectTypeIdentifier: stream.objectTypeIdentifier
                        )
                    }
                    let encodedAnchor = try NSKeyedArchiver.archivedData(
                        withRootObject: proposedAnchor,
                        requiringSecureCoding: true
                    )
                    continuation.resume(returning: HealthKitAnchoredQueryResult(
                        additions: additions,
                        deletions: deletions,
                        proposedAnchorData: encodedAnchor,
                        completedAt: self.now()
                    ))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            store.execute(query)
        }
    }

    /// How the per-sample (`HKAnchoredObjectQuery`) branch of `execute`
    /// bounds a query. Pure and HealthKit-independent so it is directly
    /// unit-testable without an `HKHealthStore`.
    enum SamplePredicateDecision: Equatable, Sendable {
        /// No predicate: anchor-only, the pre-Build-54 behavior for every
        /// per-sample stream and still the behavior for every non-Workout
        /// stream and for a client constructed without a floor.
        case unbounded
        /// Caller-supplied bounds (the Founder canary paths) always win,
        /// exactly as before: `[startDateInclusive, endDateExclusive)` with
        /// `.strictStartDate`.
        case explicit(HealthKitQueryBounds)
        /// `.workouts` with no caller bounds and a configured floor: the
        /// automatic path's anchor-less first run. `[floor, +inf)` by END
        /// date (`.strictEndDate`) so a session that started before the
        /// floor and ended after it is still delivered; the Server decides
        /// its local day.
        case workoutFloor(Date)
    }

    static func samplePredicateDecision(
        stream: HealthKitSynchronizationStream,
        requested: HealthKitQueryBounds?,
        workoutFloor: Date?
    ) -> SamplePredicateDecision {
        if let requested { return .explicit(requested) }
        if stream == .workouts, let workoutFloor { return .workoutFloor(workoutFloor) }
        return .unbounded
    }

    static func samplePredicate(for decision: SamplePredicateDecision) -> NSPredicate? {
        switch decision {
        case .unbounded:
            nil
        case let .explicit(bounds):
            HKQuery.predicateForSamples(
                withStart: bounds.startDateInclusive,
                end: bounds.endDateExclusive,
                options: [.strictStartDate]
            )
        case let .workoutFloor(floor):
            HKQuery.predicateForSamples(withStart: floor, end: nil, options: [.strictEndDate])
        }
    }

    /// Fallback bounds for the two daily-aggregate streams (Activity Summary,
    /// Nutrition daily total) when no explicit bounds are supplied, reached
    /// through `resolvedBounds` below. Neither type has a native per-sample
    /// HealthKit anchor, so the general incremental sync path (which never
    /// computes its own bounds) can only ever see a fresh, current snapshot
    /// by re-querying a bounded window ending today; `activityLookbackDays`
    /// back is a deliberately generous catch-up window for a device that has
    /// not foregrounded in a while.
    ///
    /// Pure, HealthKit-independent so it is directly unit-testable: no
    /// `HKHealthStore` involved. `lookbackDays` back through the end of
    /// `current`'s local day, inclusive of today.
    static func defaultLookbackBounds(from current: Date, lookbackDays: Int, calendar: Calendar) -> HealthKitQueryBounds {
        let currentStart = calendar.startOfDay(for: current)
        let startDate = calendar.date(byAdding: .day, value: -lookbackDays, to: currentStart) ?? currentStart
        let endExclusive = calendar.date(byAdding: .day, value: 1, to: currentStart) ?? currentStart
        return HealthKitQueryBounds(
            startDateInclusive: startDate,
            endDateExclusive: endExclusive,
            startLocalDate: Self.localDate(startDate, calendar: calendar),
            endLocalDate: Self.localDate(currentStart, calendar: calendar),
            timeZoneIdentifier: calendar.timeZone.identifier
        )
    }

    /// The exact seam both daily-aggregate streams resolve their bounds
    /// through. Deliberately non-optional and non-throwing so the specific
    /// Build 51 production regression -- `executeNutritionDailyTotal`
    /// unconditionally throwing `healthkit_nutrition_bounds_required`
    /// whenever the general incremental sync path called it with
    /// `bounds: nil` (which it always does) -- cannot be silently
    /// reintroduced through this call site: reintroducing a "bounds
    /// required" throw would require actively adding a new guard/throw
    /// here, not merely deleting a fallback. Pure, so directly
    /// unit-testable without a real `HKHealthStore`.
    private func resolvedBounds(requested: HealthKitQueryBounds?, from current: Date) -> HealthKitQueryBounds {
        Self.resolvedBounds(requested: requested, from: current, lookbackDays: activityLookbackDays, calendar: calendar)
    }

    static func resolvedBounds(
        requested: HealthKitQueryBounds?,
        from current: Date,
        lookbackDays: Int,
        calendar: Calendar
    ) -> HealthKitQueryBounds {
        requested ?? defaultLookbackBounds(from: current, lookbackDays: lookbackDays, calendar: calendar)
    }

    private func executeActivitySummary(
        after cursorData: Data?,
        bounds requestedBounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        let prior: ActivityCursor
        do {
            prior = try cursorData.map { try JSONDecoder().decode(ActivityCursor.self, from: $0) }
                ?? ActivityCursor(entries: [:])
        } catch {
            throw HealthKitSyncError.corruptCursor
        }
        let current = now()
        let bounds = resolvedBounds(requested: requestedBounds, from: current)
        let components = Self.activitySummaryPredicateComponents(bounds: bounds, calendar: calendar)
        let predicate = HKQuery.predicate(
            forActivitySummariesBetweenStart: components.start,
            end: components.end
        )
        let supplementalMetrics = try await activitySupplementalMetrics(bounds: bounds)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKActivitySummaryQuery(predicate: predicate) { _, summaries, error in
                if error != nil {
                    continuation.resume(throwing: HealthKitSyncError.operational(code: "healthkit_activity_summary_query_failed"))
                    return
                }
                do {
                    // Keep entries outside the configured query window. Aging
                    // out of a bounded lookback is not a HealthKit deletion.
                    var nextEntries = prior.entries
                    var returnedDates = Set<String>()
                    var additions: [HealthKitQueryAddition] = []
                    for summary in summaries ?? [] {
                        let components = summary.dateComponents(for: self.calendar)
                        guard let date = self.calendar.date(from: components) else { continue }
                        let localDate = Self.localDate(date, calendar: self.calendar)
                        guard bounds.contains(localDate: localDate) else { continue }
                        returnedDates.insert(localDate)
                        var metrics: [String: Double] = [
                            "move_calories": summary.activeEnergyBurned.doubleValue(for: .kilocalorie()),
                            "exercise_minutes": summary.appleExerciseTime.doubleValue(for: .minute()),
                            "stand_hours": summary.appleStandHours.doubleValue(for: .count()),
                        ]
                        supplementalMetrics[localDate]?.forEach { metrics[$0.key] = $0.value }
                        // Coverage is part of the fingerprint: a partial day becoming
                        // complete with identical numbers is a material revision.
                        let dayCoverage: HealthKitQueryActivitySummary.Coverage =
                            self.calendar.isDate(date, inSameDayAs: current) ? .partialDay : .completeDay
                        let fingerprint = HealthKitStableDigest.hex(
                            try Self.stableEncoder.encode(
                                HealthKitDailySnapshotFingerprint(coverage: dayCoverage.rawValue, metrics: metrics)
                            )
                        )
                        let previous = prior.entries[localDate]
                        let revision = previous?.fingerprint == fingerprint
                            ? previous!.revision
                            : (previous?.revision ?? 0) + 1
                        nextEntries[localDate] = ActivityCursor.Entry(fingerprint: fingerprint, revision: revision)
                        guard previous?.fingerprint != fingerprint else { continue }
                        let dayStart = self.calendar.startOfDay(for: date)
                        let dayEnd = self.calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
                        let zone = self.calendar.timeZone
                        additions.append(HealthKitQueryAddition(
                            healthKitUUID: nil,
                            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
                            source: HealthKitQuerySource(
                                bundleIdentifier: "com.apple.Health",
                                sourceName: "Apple Health",
                                sourceRevision: nil,
                                productType: nil,
                                privacySafeDeviceProvenance: nil
                            ),
                            occurrence: HealthKitQueryOccurrence(
                                startedAt: nil,
                                endedAt: nil,
                                localDate: localDate,
                                calendarIdentifier: String(describing: self.calendar.identifier),
                                timeZoneIdentifier: zone.identifier,
                                utcOffsetSeconds: zone.secondsFromGMT(for: dayStart),
                                localDayStartedAt: dayStart,
                                localDayEndedAt: dayEnd
                            ),
                            payload: .activitySummary(HealthKitQueryActivitySummary(
                                dailyActivity: metrics,
                                aggregationScope: "daily_total_including_workouts",
                                coverage: dayCoverage,
                                sourceRevision: revision
                            )),
                            allowlistedMetadata: [:]
                        ))
                    }
                    let queriedPriorDates = Set(prior.entries.keys.filter {
                        bounds.contains(localDate: $0)
                    })
                    let deletedDates = queriedPriorDates.subtracting(returnedDates)
                    deletedDates.forEach { nextEntries.removeValue(forKey: $0) }
                    let deletions = deletedDates.compactMap { localDate -> HealthKitQueryDeletion? in
                        guard let uuid = Self.deterministicUUID("activity-summary:\(localDate)") else { return nil }
                        return HealthKitQueryDeletion(
                            healthKitUUID: uuid,
                            immutableExternalID: "activity-summary:\(localDate)",
                            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier
                        )
                    }
                    let proposed = try Self.stableEncoder.encode(ActivityCursor(entries: nextEntries))
                    continuation.resume(returning: HealthKitAnchoredQueryResult(
                        additions: additions,
                        deletions: deletions,
                        proposedAnchorData: proposed,
                        completedAt: current
                    ))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            self.store.execute(query)
        }
    }

    /// Daily dietary totals across all sources (HealthKit statistics, so an
    /// edited or deleted entry is reflected in the next total rather than
    /// left stale). The snapshot rules live in
    /// `HealthKitNutritionDailySnapshotBuilder` so they are unit-testable.
    ///
    /// Falls back to `defaultLookbackBounds` when no explicit bounds are
    /// given, exactly like `executeActivitySummary` -- both are daily
    /// aggregate types with no native per-sample anchor concept, so the
    /// general incremental sync path (`HealthKitSynchronizationEngine.
    /// synchronize`, which always calls `execute(..., bounds: nil)`) can
    /// only ever produce a fresh snapshot by re-querying a bounded window,
    /// never by an anchor alone. This method used to require an explicit
    /// caller-supplied `bounds` and throw otherwise -- that made automatic
    /// Nutrition catch-up unconditionally fail on every single foreground
    /// (a real Build 51 production regression: the general sync path never
    /// supplies bounds), even though `HealthKitNutritionDailySnapshotBuilder.
    /// build` already iterates an arbitrary multi-day window correctly, the
    /// same way Activity Summary's own default-bounds fallback already did.
    private func executeNutritionDailyTotal(
        after cursorData: Data?,
        bounds requestedBounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        let bounds = resolvedBounds(requested: requestedBounds, from: now())
        let prior: HealthKitNutritionDailySnapshotBuilder.Cursor
        do {
            prior = try cursorData.map { try JSONDecoder().decode(HealthKitNutritionDailySnapshotBuilder.Cursor.self, from: $0) }
                ?? .init(entries: [:])
        } catch {
            throw HealthKitSyncError.corruptCursor
        }
        let current = now()
        async let energy = dailyCumulativeValues(identifier: .dietaryEnergyConsumed, unit: .kilocalorie(), bounds: bounds)
        async let protein = dailyCumulativeValues(identifier: .dietaryProtein, unit: .gram(), bounds: bounds)
        async let carbohydrates = dailyCumulativeValues(identifier: .dietaryCarbohydrates, unit: .gram(), bounds: bounds)
        async let fat = dailyCumulativeValues(identifier: .dietaryFatTotal, unit: .gram(), bounds: bounds)
        let (energyValues, proteinValues, carbValues, fatValues) = try await (energy, protein, carbohydrates, fat)
        let output = try HealthKitNutritionDailySnapshotBuilder.build(
            energy: energyValues,
            protein: proteinValues,
            carbohydrates: carbValues,
            fat: fatValues,
            prior: prior,
            bounds: bounds,
            calendar: calendar,
            now: current
        )
        return HealthKitAnchoredQueryResult(
            additions: output.additions,
            deletions: [],
            proposedAnchorData: try output.encodedCursor(),
            completedAt: current
        )
    }

    /// HealthKit's activity-summary predicate requires both operands to carry
    /// a calendar in addition to era/year/month/day: without one it raises an
    /// uncaught `NSInvalidArgumentException` ("startDateComponents: Date
    /// components require a calendar"), which aborted Build 42 on device the
    /// moment a foreground validation run built its predicate.
    /// `Calendar.dateComponents(_:from:)` populates `DateComponents.calendar`
    /// only when `.calendar` is part of the requested set, so requesting it is
    /// load-bearing — do not trim it back to the date fields. The window's
    /// day boundaries are unchanged; only the components' calendar is added.
    static func activitySummaryPredicateComponents(
        bounds: HealthKitQueryBounds,
        calendar: Calendar
    ) -> (start: DateComponents, end: DateComponents) {
        let required: Set<Calendar.Component> = [.calendar, .era, .year, .month, .day]
        return (
            calendar.dateComponents(required, from: bounds.startDateInclusive),
            calendar.dateComponents(required, from: bounds.endDateExclusive)
        )
    }

    private func activitySupplementalMetrics(
        bounds: HealthKitQueryBounds
    ) async throws -> [String: [String: Double]] {
        async let steps = dailyCumulativeValues(
            identifier: .stepCount, unit: .count(), bounds: bounds
        )
        async let distance = dailyCumulativeValues(
            identifier: .distanceWalkingRunning, unit: .meter(), bounds: bounds
        )
        async let flights = dailyCumulativeValues(
            identifier: .flightsClimbed, unit: .count(), bounds: bounds
        )
        let (stepValues, distanceValues, flightValues) = try await (steps, distance, flights)
        var result: [String: [String: Double]] = [:]
        for (key, daily) in [
            ("steps", stepValues),
            ("walking_running_distance", distanceValues),
            ("flights_climbed", flightValues),
        ] {
            for (date, value) in daily where bounds.contains(localDate: date) {
                result[date, default: [:]][key] = value
            }
        }
        return result
    }

    private func dailyCumulativeValues(
        identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        bounds: HealthKitQueryBounds
    ) async throws -> [String: Double] {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            throw HealthKitSyncError.operational(code: "healthkit_activity_quantity_type_unavailable")
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: bounds.startDateInclusive,
            end: bounds.endDateExclusive,
            options: [.strictStartDate]
        )
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum,
                anchorDate: bounds.startDateInclusive,
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, collection, error in
                guard error == nil, let collection else {
                    continuation.resume(throwing: HealthKitSyncError.operational(
                        code: "healthkit_activity_quantity_query_failed"
                    ))
                    return
                }
                var result: [String: Double] = [:]
                collection.enumerateStatistics(
                    from: bounds.startDateInclusive,
                    to: bounds.endDateExclusive
                ) { statistics, _ in
                    guard let sum = statistics.sumQuantity() else { return }
                    let localDate = Self.localDate(statistics.startDate, calendar: self.calendar)
                    if bounds.contains(localDate: localDate) {
                        result[localDate] = sum.doubleValue(for: unit)
                    }
                }
                continuation.resume(returning: result)
            }
            store.execute(query)
        }
    }

    private static func map(
        _ sample: HKSample,
        stream: HealthKitSynchronizationStream,
        calendar: Calendar
    ) throws -> HealthKitQueryAddition {
        let zone = timeZone(for: sample) ?? calendar.timeZone
        var localCalendar = calendar
        localCalendar.timeZone = zone
        let dayStart = localCalendar.startOfDay(for: sample.startDate)
        let dayEnd = localCalendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let occurrence = HealthKitQueryOccurrence(
            startedAt: sample.startDate,
            endedAt: sample.endDate,
            localDate: localDate(dayStart, calendar: localCalendar),
            calendarIdentifier: String(describing: localCalendar.identifier),
            timeZoneIdentifier: zone.identifier,
            utcOffsetSeconds: zone.secondsFromGMT(for: sample.startDate),
            localDayStartedAt: dayStart,
            localDayEndedAt: dayEnd
        )
        let source = HealthKitQuerySource(
            bundleIdentifier: sample.sourceRevision.source.bundleIdentifier,
            sourceName: sample.sourceRevision.source.name,
            sourceRevision: sample.sourceRevision.version,
            productType: sample.device?.model,
            privacySafeDeviceProvenance: [sample.device?.manufacturer, sample.device?.hardwareVersion, sample.device?.softwareVersion]
                .compactMap { $0 }.joined(separator: "/").nilIfEmpty
        )
        let payload: HealthKitQueryPayload
        if let quantity = sample as? HKQuantitySample {
            let unit = canonicalUnit(for: stream)
            let value = quantity.quantity.doubleValue(for: unit)
            payload = .quantity(HealthKitQueryQuantity(
                originalValue: value,
                originalUnit: unit.unitString,
                normalizedValue: value,
                normalizedUnit: unit.unitString,
                workoutExternalID: nil
            ))
        } else if let workout = sample as? HKWorkout {
            let activeEnergy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
                .flatMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .kilocalorie()) }
            let walkingDistance = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
                .flatMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }
            let cyclingDistance = HKObjectType.quantityType(forIdentifier: .distanceCycling)
                .flatMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }
            let averageHeartRate = HKObjectType.quantityType(forIdentifier: .heartRate)
                .flatMap { workout.statistics(for: $0)?.averageQuantity()?.doubleValue(for: .count().unitDivided(by: .minute())) }
            payload = .workout(HealthKitQueryWorkout(
                activityType: String(workout.workoutActivityType.rawValue),
                durationSeconds: workout.duration,
                activeCalories: activeEnergy,
                totalCalories: nil,
                distance: walkingDistance ?? cyclingDistance,
                distanceUnit: (walkingDistance ?? cyclingDistance) == nil ? nil : "m",
                averageHeartRate: averageHeartRate,
                telemetryTypeIdentifiers: [
                    HealthKitSynchronizationStream.activeEnergy.objectTypeIdentifier,
                    HealthKitSynchronizationStream.heartRate.objectTypeIdentifier,
                    HealthKitSynchronizationStream.walkingRunningDistance.objectTypeIdentifier,
                    HealthKitSynchronizationStream.cyclingDistance.objectTypeIdentifier,
                ]
            ))
        } else if let category = sample as? HKCategorySample, stream == .sleepAnalysis {
            payload = .sleep(HealthKitQuerySleep(stageValue: category.value))
        } else {
            throw HealthKitSyncError.operational(code: "healthkit_sample_shape_unsupported")
        }
        return HealthKitQueryAddition(
            healthKitUUID: sample.uuid,
            objectTypeIdentifier: sample.sampleType.identifier,
            source: source,
            occurrence: occurrence,
            payload: payload,
            allowlistedMetadata: allowlistedMetadata(sample.metadata)
        )
    }

    private static func sampleType(for stream: HealthKitSynchronizationStream) -> HKSampleType? {
        switch stream {
        case .activitySummary, .nutritionDailyTotal: nil
        case .activeEnergy: HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
        case .exerciseTime: HKObjectType.quantityType(forIdentifier: .appleExerciseTime)
        case .standTime: HKObjectType.quantityType(forIdentifier: .appleStandTime)
        case .stepCount: HKObjectType.quantityType(forIdentifier: .stepCount)
        case .walkingRunningDistance: HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
        case .flightsClimbed: HKObjectType.quantityType(forIdentifier: .flightsClimbed)
        case .nutritionEnergy: HKObjectType.quantityType(forIdentifier: .dietaryEnergyConsumed)
        case .nutritionProtein: HKObjectType.quantityType(forIdentifier: .dietaryProtein)
        case .nutritionCarbohydrates: HKObjectType.quantityType(forIdentifier: .dietaryCarbohydrates)
        case .nutritionTotalFat: HKObjectType.quantityType(forIdentifier: .dietaryFatTotal)
        case .nutritionFiber: HKObjectType.quantityType(forIdentifier: .dietaryFiber)
        case .workouts: HKObjectType.workoutType()
        case .heartRate: HKObjectType.quantityType(forIdentifier: .heartRate)
        case .cyclingDistance: HKObjectType.quantityType(forIdentifier: .distanceCycling)
        case .sleepAnalysis: HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        }
    }

    private static func canonicalUnit(for stream: HealthKitSynchronizationStream) -> HKUnit {
        switch stream {
        case .activeEnergy, .nutritionEnergy: .kilocalorie()
        case .exerciseTime, .standTime: .minute()
        case .stepCount, .flightsClimbed: .count()
        case .walkingRunningDistance, .cyclingDistance: .meter()
        case .nutritionProtein, .nutritionCarbohydrates, .nutritionTotalFat, .nutritionFiber: .gram()
        case .heartRate: .count().unitDivided(by: .minute())
        default: .count()
        }
    }

    private static func timeZone(for sample: HKSample) -> TimeZone? {
        guard let identifier = sample.metadata?["HKTimeZone"] as? String else { return nil }
        return TimeZone(identifier: identifier)
    }

    private static func allowlistedMetadata(_ metadata: [String: Any]?) -> [String: String] {
        let allowed = ["HKWasUserEntered", "HKExternalUUID", "HKFoodType"]
        return allowed.reduce(into: [:]) { result, key in
            guard let value = metadata?[key] else { return }
            if let value = value as? String { result[key] = value }
            else if let value = value as? NSNumber { result[key] = value.stringValue }
        }
    }

    private static func localDate(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    private static let stableEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static func deterministicUUID(_ value: String) -> UUID? {
        let digest = HealthKitStableDigest.hex(value)
        let raw = String(digest.prefix(32))
        let formatted = "\(raw.prefix(8))-\(raw.dropFirst(8).prefix(4))-\(raw.dropFirst(12).prefix(4))-\(raw.dropFirst(16).prefix(4))-\(raw.dropFirst(20).prefix(12))"
        return UUID(uuidString: formatted)
    }
}

final class SystemHealthKitObserverClient: HealthKitObserverClient, @unchecked Sendable {
    private let store: HKHealthStore
    private let lock = NSLock()
    private var queries: [UUID: [HKObserverQuery]] = [:]

    init(store: HKHealthStore = HKHealthStore()) { self.store = store }

    func register(
        stream: HealthKitSynchronizationStream,
        onWake: @escaping @Sendable (String?, @escaping @Sendable () -> Void) -> Void
    ) throws -> HealthKitObserverRegistration {
        let types = observerTypes(for: stream)
        guard !types.isEmpty else { throw HealthKitSyncError.operational(code: "healthkit_observer_type_unavailable") }
        let registration = HealthKitObserverRegistration(id: UUID())
        let observers = types.map { type in
            HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                let completionBox = HealthKitObserverCompletion(completion)
                onWake(error == nil ? nil : "healthkit_observer_wakeup_error") {
                    completionBox.call()
                }
            }
        }
        lock.lock()
        queries[registration.id] = observers
        lock.unlock()
        observers.forEach(store.execute)
        return registration
    }

    func unregister(_ registration: HealthKitObserverRegistration) {
        lock.lock()
        let current = queries.removeValue(forKey: registration.id) ?? []
        lock.unlock()
        current.forEach(store.stop)
    }

    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws {
        for type in observerTypes(for: stream) {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                store.enableBackgroundDelivery(for: type, frequency: .hourly) { completed, error in
                    if error != nil || !completed {
                        continuation.resume(throwing: HealthKitSyncError.operational(code: "healthkit_background_delivery_registration_failed"))
                    } else {
                        continuation.resume(returning: ())
                    }
                }
            }
        }
    }

    private func observerTypes(for stream: HealthKitSynchronizationStream) -> [HKSampleType] {
        if stream == .activitySummary {
            return [
                HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
                HKObjectType.quantityType(forIdentifier: .appleExerciseTime),
                HKObjectType.quantityType(forIdentifier: .appleStandTime),
            ].compactMap { $0 }
        }
        return SystemHealthKitQueryClient.sampleTypeForObserver(stream).map { [$0] } ?? []
    }
}

private final class HealthKitObserverCompletion: @unchecked Sendable {
    private let action: () -> Void
    init(_ action: @escaping () -> Void) { self.action = action }
    func call() { action() }
}

private extension SystemHealthKitQueryClient {
    static func sampleTypeForObserver(_ stream: HealthKitSynchronizationStream) -> HKSampleType? {
        sampleType(for: stream)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Pure snapshot rules for HealthKit daily dietary totals.
///
/// One observation per Founder-local day. The per-day fingerprint and device
/// revision are carried in the device-owned cursor exactly like the Activity
/// summary: an unchanged day emits nothing, a changed day emits the next
/// revision. A day that was uploaded before and now has no dietary energy
/// emits a zero revision rather than silently leaving a stale total on the
/// Server. Only calories, protein, carbohydrates, and fat are ever emitted.
struct HealthKitNutritionDailySnapshotBuilder {
    struct Cursor: Codable, Equatable {
        struct Entry: Codable, Equatable {
            let fingerprint: String
            let revision: UInt64
        }
        var entries: [String: Entry]
    }

    struct Output {
        let additions: [HealthKitQueryAddition]
        let cursor: Cursor

        func encodedCursor() throws -> Data {
            try HealthKitNutritionDailySnapshotBuilder.encoder.encode(cursor)
        }
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    static func build(
        energy: [String: Double],
        protein: [String: Double],
        carbohydrates: [String: Double],
        fat: [String: Double],
        prior: Cursor,
        bounds: HealthKitQueryBounds,
        calendar: Calendar,
        now: Date
    ) throws -> Output {
        var nextEntries = prior.entries
        var additions: [HealthKitQueryAddition] = []
        var day = calendar.startOfDay(for: bounds.startDateInclusive)
        while day < bounds.endDateExclusive {
            let localDate = Self.localDate(day, calendar: calendar)
            let nextDay = calendar.date(byAdding: .day, value: 1, to: day) ?? bounds.endDateExclusive
            defer { day = nextDay }
            guard bounds.contains(localDate: localDate) else { continue }

            // Only nutrients HealthKit actually reported are sent. An absent
            // macronutrient is unknown, never an asserted 0 g.
            var metrics: [String: Double]
            if let calories = energy[localDate] {
                metrics = ["calories": calories]
                if let value = protein[localDate] { metrics["protein_g"] = value }
                if let value = carbohydrates[localDate] { metrics["carbs_g"] = value }
                if let value = fat[localDate] { metrics["fat_g"] = value }
            } else if prior.entries[localDate] != nil {
                // A day uploaded before that now has no dietary energy is an
                // explicit zero-calorie revision, never a silent stale total.
                metrics = ["calories": 0]
            } else {
                continue
            }
            let coverage: HealthKitQueryActivitySummary.Coverage =
                calendar.isDate(day, inSameDayAs: now) ? .partialDay : .completeDay
            let fingerprint = HealthKitStableDigest.hex(
                try encoder.encode(HealthKitDailySnapshotFingerprint(coverage: coverage.rawValue, metrics: metrics))
            )
            let previous = prior.entries[localDate]
            let revision = previous?.fingerprint == fingerprint
                ? previous!.revision
                : (previous?.revision ?? 0) + 1
            nextEntries[localDate] = Cursor.Entry(fingerprint: fingerprint, revision: revision)
            guard previous?.fingerprint != fingerprint else { continue }
            let zone = calendar.timeZone
            additions.append(HealthKitQueryAddition(
                healthKitUUID: nil,
                objectTypeIdentifier: HealthKitSynchronizationStream.nutritionDailyTotal.objectTypeIdentifier,
                source: HealthKitQuerySource(
                    bundleIdentifier: "com.apple.Health",
                    sourceName: "Apple Health",
                    sourceRevision: nil,
                    productType: nil,
                    privacySafeDeviceProvenance: nil
                ),
                occurrence: HealthKitQueryOccurrence(
                    startedAt: nil,
                    endedAt: nil,
                    localDate: localDate,
                    calendarIdentifier: String(describing: calendar.identifier),
                    timeZoneIdentifier: zone.identifier,
                    utcOffsetSeconds: zone.secondsFromGMT(for: day),
                    localDayStartedAt: day,
                    localDayEndedAt: nextDay
                ),
                payload: .nutritionDailyTotal(HealthKitQueryNutritionDailyTotal(
                    dailyNutrition: metrics,
                    aggregationScope: HealthKitQueryNutritionDailyTotal.aggregationScope,
                    coverage: coverage,
                    sourceRevision: revision
                )),
                allowlistedMetadata: [:]
            ))
        }
        return Output(additions: additions, cursor: Cursor(entries: nextEntries))
    }

    private static func localDate(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}

/// What makes one daily snapshot differ from the last: its numbers and its
/// coverage.
struct HealthKitDailySnapshotFingerprint: Encodable {
    let coverage: String
    let metrics: [String: Double]
}
