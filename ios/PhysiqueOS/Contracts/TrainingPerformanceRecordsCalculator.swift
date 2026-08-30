import Foundation

/// Ports `createTrainingLibraryExerciseRecordsReadModel`
/// (`TrainingLibraryExerciseRecordsService.js`) algorithm-for-algorithm:
/// dedupe by event id, validate each event into a record (rejecting
/// malformed/mismatched ones exactly as the web does), sort, cap, and
/// build the truncation label. This is a presentation transform over
/// already-detected events, not a PR-detection algorithm — the detection
/// itself stays a POST-STABILIZATION concern (see `TrainingReadModel.swift`).
enum TrainingPerformanceRecordsCalculator {
    /// `TRAINING_LIBRARY_RECORD_LIMIT`.
    static let recordLimit = 5

    static func recordsReadModel(
        canonicalExerciseId: String,
        events: [TrainingPerformanceEvent]
    ) -> TrainingPerformanceRecordsReadModel? {
        guard !canonicalExerciseId.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }

        var recordsById: [String: TrainingPerformanceRecord] = [:]
        var insertionOrder: [String] = []
        for event in events {
            guard recordsById[event.id] == nil else { continue }
            guard let record = toRecord(event, selectedId: canonicalExerciseId) else { continue }
            recordsById[event.id] = record
            insertionOrder.append(event.id)
        }

        let records = insertionOrder.compactMap { recordsById[$0] }.sorted(by: isOrderedBefore)
        guard !records.isEmpty else { return nil }

        let visible = Array(records.prefix(recordLimit))
        let countLabel = records.count > visible.count
            ? "Showing \(visible.count) of \(records.count) records"
            : nil

        return TrainingPerformanceRecordsReadModel(
            heading: "Performance Records",
            records: visible,
            countLabel: countLabel
        )
    }

    /// `toItem` (`TrainingLibraryExerciseRecordsService.js`): validates and
    /// formats one event into a record, or rejects it (`nil`) exactly as
    /// the web does for a mismatched exercise id or missing required
    /// fields for its event type.
    private static func toRecord(_ event: TrainingPerformanceEvent, selectedId: String) -> TrainingPerformanceRecord? {
        guard event.canonicalExerciseId == selectedId, isDateKey(event.workoutDate) else { return nil }

        switch event.eventType {
        case .sessionVolumePR:
            guard let volume = event.sessionVolume, volume > 0, let unit = event.unit else { return nil }
            let previous = positive(event.previousBaselineValue)
            let improvement = positive(event.improvement)
            let validImprovement = previous != nil && improvement != nil && (volume - previous!) == improvement!

            var detailParts: [String] = []
            if let previous { detailParts.append("Previous: \(formatNumber(previous)) \(unit)") }
            if validImprovement, let improvement { detailParts.append("Improved by \(formatNumber(improvement)) \(unit)") }

            return TrainingPerformanceRecord(
                id: "training_library_record_\(event.id)",
                title: "Session volume record",
                value: "\(formatNumber(volume)) \(unit)",
                detail: detailParts.isEmpty ? nil : detailParts.joined(separator: " · "),
                workoutDate: event.workoutDate,
                executionVariant: event.executionVariant,
                achievedValue: volume,
                achievementType: .sessionVolumePR,
                sourceEventId: event.id
            )

        case .repsAtLoadPR:
            guard let reps = event.reps, reps > 0, let load = event.load, load >= 0, let loadUnit = event.loadUnit else { return nil }
            let previous = positive(event.previousBaselineValue)

            return TrainingPerformanceRecord(
                id: "training_library_record_\(event.id)",
                title: "Reps-at-load record",
                value: "\(formatNumber(reps)) reps at \(formatNumber(load)) \(loadUnit)",
                detail: previous.map { "Previous: \(formatNumber($0)) reps at this load" },
                workoutDate: event.workoutDate,
                executionVariant: event.executionVariant,
                achievedValue: reps,
                achievementType: .repsAtLoadPR,
                sourceEventId: event.id
            )
        }
    }

    /// `compareRecords`: workout date descending, then session-volume
    /// records before reps-at-load on the same date, then achieved value
    /// descending, then source event id ascending for full determinism.
    private static func isOrderedBefore(_ lhs: TrainingPerformanceRecord, _ rhs: TrainingPerformanceRecord) -> Bool {
        if lhs.workoutDate != rhs.workoutDate { return lhs.workoutDate > rhs.workoutDate }
        let lhsOrder = lhs.achievementType == .sessionVolumePR ? 0 : 1
        let rhsOrder = rhs.achievementType == .sessionVolumePR ? 0 : 1
        if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
        if lhs.achievedValue != rhs.achievedValue { return lhs.achievedValue > rhs.achievedValue }
        return lhs.sourceEventId < rhs.sourceEventId
    }

    private static func positive(_ value: Double?) -> Double? {
        guard let value, value > 0 else { return nil }
        return value
    }

    private static func isDateKey(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    /// `formatNumber` (`Intl.NumberFormat("en-US", { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 })`):
    /// integers show no decimals; non-integers show up to 2, both
    /// thousands-grouped.
    private static func formatNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.maximumFractionDigits = value.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}
