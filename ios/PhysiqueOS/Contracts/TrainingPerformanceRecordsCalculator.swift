import CryptoKit
import Foundation

/// Fixture-boundary equivalent of `assertValidTrainingPerformanceEvent`.
/// The web read-model service consumes events that have already passed
/// this durable-event validation when produced. Native fixtures must not
/// bypass that upstream semantic boundary merely because they are local.
enum TrainingPerformanceEventValidator {
    static func isValid(_ event: TrainingPerformanceEvent) -> Bool {
        guard
            event.schemaVersion == TrainingPerformanceRecordsCalculator.schemaVersion,
            event.category == TrainingPerformanceRecordsCalculator.category,
            TrainingPerformanceEventType(rawValue: event.eventType) != nil,
            requiredStrings(event).allSatisfy({ clean($0) != nil }),
            let current = finite(event.currentValue),
            let previous = finite(event.previousBaselineValue),
            let improvement = finite(event.improvement),
            current > previous,
            improvement == current - previous,
            hasValidTypeSpecificValues(event, current: current),
            event.id == expectedId(for: event)
        else {
            return false
        }

        if let variant = event.executionVariant,
           normalizedVariantKey(variant) == "ordinary" {
            return false
        }
        return true
    }

    static func expectedId(for event: TrainingPerformanceEvent) -> String? {
        guard
            let sourceCanonicalTrainingId = clean(event.sourceCanonicalTrainingId),
            let sourceSessionId = clean(event.sourceSessionId),
            let canonicalExerciseId = clean(event.canonicalExerciseId),
            let current = finite(event.currentValue),
            let eventType = TrainingPerformanceEventType(rawValue: event.eventType)
        else {
            return nil
        }

        var identity = [
            TrainingPerformanceRecordsCalculator.schemaVersion,
            sourceCanonicalTrainingId,
            sourceSessionId,
            canonicalExerciseId,
            event.eventType,
        ]
        switch eventType {
        case .sessionVolumePR:
            identity.append(identityNumber(current))
        case .repsAtLoadPR:
            guard
                let load = finite(event.load),
                let loadUnit = clean(event.loadUnit),
                let reps = finite(event.reps)
            else {
                return nil
            }
            identity.append(contentsOf: [identityNumber(load), loadUnit, identityNumber(reps)])
        }
        if let variant = event.executionVariant {
            let key = normalizedVariantKey(variant)
            if key != "ordinary" { identity.append("variant:\(key)") }
        }
        if let relationship = event.relationshipContext,
           let type = clean(relationship.relationshipType) {
            let partnerIds = relationship.orderedPartners
                .compactMap { clean($0.canonicalExerciseId) }
                .sorted()
            identity.append("relationship:\(type)|partners:\(partnerIds.joined(separator: ","))")
        }

        let digest = SHA256.hash(data: Data(identity.joined(separator: "|").utf8))
        let hash = digest.map { String(format: "%02x", $0) }.joined()
        return "training_performance_event_\(hash.prefix(32))"
    }

    private static func requiredStrings(_ event: TrainingPerformanceEvent) -> [String?] {
        [
            event.id,
            event.sourceReviewId,
            event.sourceEvidencePackageId,
            event.sourceCanonicalTrainingId,
            event.sourceSessionId,
            event.sourceAnalysisId,
            event.workoutDate,
            event.canonicalExerciseId,
            event.canonicalExerciseName,
            event.unit,
            event.createdAt,
        ]
    }

    private static func hasValidTypeSpecificValues(_ event: TrainingPerformanceEvent, current: Double) -> Bool {
        switch TrainingPerformanceEventType(rawValue: event.eventType) {
        case .sessionVolumePR:
            return finite(event.sessionVolume) == current && event.load == nil && event.reps == nil
        case .repsAtLoadPR:
            return finite(event.load) != nil && finite(event.reps) == current && clean(event.loadUnit) != nil && event.sessionVolume == nil
        case .none:
            return false
        }
    }

    private static func normalizedVariantKey(_ variant: TrainingExecutionVariant) -> String {
        let source = clean(variant.key) ?? clean(variant.rawLabel) ?? clean(variant.label) ?? "ordinary"
        return source
            .precomposedStringWithCompatibilityMapping
            .lowercased()
            .replacingOccurrences(of: #"[-_]+"#, with: " ", options: .regularExpression)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: "_")
            .replacingOccurrences(of: #"[^a-z0-9_]+"#, with: "", options: .regularExpression)
    }

    private static func identityNumber(_ value: Double) -> String {
        if value.rounded(.towardZero) == value { return String(format: "%.0f", value) }
        return String(value)
    }

    private static func finite(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    private static func clean(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}

/// Ports `createTrainingLibraryExerciseRecordsReadModel`
/// (`TrainingLibraryExerciseRecordsService.js`) field-for-field: select a
/// canonical exercise, deduplicate by durable event id, reject unsupported
/// schema/category/type or malformed values, preserve variant/relationship
/// context, sort deterministically, cap at five, and return `nil` when no
/// qualifying record remains. PR detection itself stays server-owned.
enum TrainingPerformanceRecordsCalculator {
    static let schemaVersion = "training_performance_event_v1"
    static let category = "training_performance"
    static let recordLimit = 5

    static func recordsReadModel(
        canonicalExerciseId: String,
        events: [TrainingPerformanceEvent]
    ) -> TrainingPerformanceRecordsReadModel? {
        guard let selectedId = clean(canonicalExerciseId) else { return nil }

        var seenEventIds: Set<String> = []
        var records: [TrainingPerformanceRecord] = []
        for event in events {
            guard seenEventIds.insert(event.id).inserted else { continue }
            guard let record = toRecord(event, selectedId: selectedId) else { continue }
            records.append(record)
        }

        records.sort(by: isOrderedBefore)
        guard let first = records.first else { return nil }

        let visible = Array(records.prefix(recordLimit))
        let hiddenCount = records.count - visible.count
        return TrainingPerformanceRecordsReadModel(
            id: "training_library_records_\(selectedId)",
            heading: "Performance Records",
            canonicalExerciseId: selectedId,
            canonicalExerciseName: first.canonicalExerciseName,
            records: visible,
            visibleCount: visible.count,
            totalCount: records.count,
            hiddenCount: hiddenCount,
            countLabel: hiddenCount > 0 ? "Showing \(visible.count) of \(records.count) records" : nil
        )
    }

    /// `toItem`: intentionally validates the same boundary the web read
    /// model validates, including a real calendar date rather than merely
    /// a date-shaped string. Unsupported future event types are ignored.
    private static func toRecord(
        _ event: TrainingPerformanceEvent,
        selectedId: String
    ) -> TrainingPerformanceRecord? {
        guard
            event.schemaVersion == schemaVersion,
            event.category == category,
            let eventType = TrainingPerformanceEventType(rawValue: event.eventType),
            clean(event.id) != nil,
            event.canonicalExerciseId == selectedId,
            let canonicalName = clean(event.canonicalExerciseName),
            isDateKey(event.workoutDate)
        else {
            return nil
        }

        switch eventType {
        case .sessionVolumePR:
            guard
                let volume = positive(event.sessionVolume),
                let unit = clean(event.unit)
            else {
                return nil
            }
            let previous = positive(event.previousBaselineValue)
            let delta = positive(event.improvement)
            let validDelta = previous != nil && delta != nil && volume - previous! == delta!
            let previousText = previous.map { "Previous: \(formatNumber($0)) \(unit)" }
            let improvementText = validDelta ? delta.map { "Improved by \(formatNumber($0)) \(unit)" } : nil

            return TrainingPerformanceRecord(
                id: "training_library_record_\(event.id)",
                canonicalExerciseId: selectedId,
                canonicalExerciseName: canonicalName,
                title: "Session volume record",
                value: "\(formatNumber(volume)) \(unit)",
                previousBaseline: previousText,
                improvement: improvementText,
                detail: [previousText, improvementText].compactMap { $0 }.joined(separator: " · ").nilIfEmpty,
                workoutDate: event.workoutDate,
                executionVariant: event.executionVariant,
                relationshipContext: event.relationshipContext,
                achievedValue: volume,
                achievementType: eventType,
                sourceEventId: event.id
            )

        case .repsAtLoadPR:
            guard
                let reps = positive(event.reps),
                let load = nonNegative(event.load),
                let loadUnit = clean(event.loadUnit)
            else {
                return nil
            }
            let previous = positive(event.previousBaselineValue)
            let previousText = previous.map { "Previous: \(formatNumber($0)) reps at this load" }

            return TrainingPerformanceRecord(
                id: "training_library_record_\(event.id)",
                canonicalExerciseId: selectedId,
                canonicalExerciseName: canonicalName,
                title: "Reps-at-load record",
                value: "\(formatNumber(reps)) reps at \(formatNumber(load)) \(loadUnit)",
                previousBaseline: previousText,
                improvement: nil,
                detail: previousText,
                workoutDate: event.workoutDate,
                executionVariant: event.executionVariant,
                relationshipContext: event.relationshipContext,
                achievedValue: reps,
                achievementType: eventType,
                sourceEventId: event.id
            )
        }
    }

    /// `compareRecords`: workout date descending, then session-volume
    /// before reps-at-load, achieved value descending, event id ascending.
    private static func isOrderedBefore(_ lhs: TrainingPerformanceRecord, _ rhs: TrainingPerformanceRecord) -> Bool {
        if lhs.workoutDate != rhs.workoutDate { return lhs.workoutDate > rhs.workoutDate }
        let lhsTypeOrder = lhs.achievementType == .sessionVolumePR ? 0 : 1
        let rhsTypeOrder = rhs.achievementType == .sessionVolumePR ? 0 : 1
        if lhsTypeOrder != rhsTypeOrder { return lhsTypeOrder < rhsTypeOrder }
        if lhs.achievedValue != rhs.achievedValue { return lhs.achievedValue > rhs.achievedValue }
        return lhs.sourceEventId < rhs.sourceEventId
    }

    private static func positive(_ value: Double?) -> Double? {
        guard let value, value.isFinite, value > 0 else { return nil }
        return value
    }

    private static func nonNegative(_ value: Double?) -> Double? {
        guard let value, value.isFinite, value >= 0 else { return nil }
        return value
    }

    private static func clean(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// Web `isDateKey`: regex plus UTC calendar round-trip, so impossible
    /// dates such as `2026-02-30` are rejected.
    private static func isDateKey(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return false
        }
        let pieces = value.split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        var components = DateComponents()
        components.calendar = calendar
        components.timeZone = calendar.timeZone
        components.year = pieces[0]
        components.month = pieces[1]
        components.day = pieces[2]
        components.hour = 12
        guard let date = calendar.date(from: components) else { return false }
        let roundTrip = calendar.dateComponents([.year, .month, .day], from: date)
        return roundTrip.year == pieces[0] && roundTrip.month == pieces[1] && roundTrip.day == pieces[2]
    }

    private static func formatNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value.rounded(.towardZero) == value ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
