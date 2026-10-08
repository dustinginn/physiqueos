#if DEBUG
import Foundation

/// DEBUG-only, review-only Recovery card overlay for the non-shipping
/// Sandbox Briefing store. SYNTHETIC DATA — no Founder Sleep.
///
/// `-physiqueos.recovery-review.scenario <name>` builds a production-shaped
/// `recovery_card_v1` payload for every sandbox Weekly/Monthly artifact (from
/// that artifact's own window) and runs it through the REAL
/// `BriefingRecoveryCardDecoder`, so UI tests and captures exercise the
/// shipping decode + SwiftUI path. Absent from Release builds.
enum BriefingRecoveryReviewFixture {
    static let argument = "-physiqueos.recovery-review.scenario"

    enum Scenario: String, CaseIterable {
        case green, yellow, red, unavailable, foam, malformed
    }

    static var scenario: Scenario? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        return Scenario(rawValue: arguments[index + 1])
    }

    static func apply(to briefings: [BriefingReadModel]) -> [BriefingReadModel] {
        guard let scenario else { return briefings }
        return briefings.map { briefing in
            var copy = briefing
            switch briefing.cadence {
            case .weekly:
                copy.weekly?.recovery = BriefingRecoveryCardDecoder.decode(
                    payload(.weekly, window: briefing.evidenceWindow, scenario: scenario),
                    cadence: .weekly, window: briefing.evidenceWindow)
            case .monthly:
                copy.monthly?.recovery = BriefingRecoveryCardDecoder.decode(
                    payload(.monthly, window: briefing.evidenceWindow, scenario: scenario),
                    cadence: .monthly, window: briefing.evidenceWindow)
            case .daily, .midweek, .event:
                // Excluded cadences: the decoder refuses them, so even a
                // deliberately injected payload never creates a card.
                _ = BriefingRecoveryCardDecoder.decode(
                    payload(.weekly, window: briefing.evidenceWindow, scenario: scenario),
                    cadence: briefing.cadence, window: briefing.evidenceWindow)
            }
            return copy
        }
    }

    /// The production `recovery` response key, as the Server's
    /// `projectRecoveryCardForNativeV1` shapes it.
    static func payload(_ cadence: BriefingRecoveryCard.Cadence, window: BriefingEvidenceWindowReadModel, scenario: Scenario) -> BriefingJSONValue {
        let start = BriefingRecoveryCardDecoder.calendarDate(window.startDate)
        let end = BriefingRecoveryCardDecoder.calendarDate(window.endDate)
        let days = start.flatMap { start in end.map { Int(($0.timeIntervalSince(start) / 86_400).rounded()) + 1 } } ?? 0
        let baseline = 405.0
        let nightly: [Double?] = switch scenario {
        case .green, .foam, .malformed: [403, 412, 395, 418, 407, 399, 416]
        case .yellow: [399, 348, 337, 344, 359, 352, 397]
        case .red: [324, 301, 287, 296, 310, 293, 276]
        case .unavailable: [401, nil, 388, nil, nil, nil, 410]
        }
        var nights: [(String, Double)] = []
        if let start {
            for offset in 0..<days {
                // Monthly softens week by week for Yellow/Red so the weekly
                // aggregates show a trend; Weekly uses the nightly pattern.
                let drift = cadence == .monthly && (scenario == .yellow || scenario == .red) ? Double(offset / 7) * 9 - 18 : 0
                if let value = nightly[offset % nightly.count].map({ $0 - drift }) {
                    nights.append((BriefingRecoveryCardDecoder.key(start.addingTimeInterval(Double(offset) * 86_400)), value))
                }
            }
        }
        let points: [(String, Double)]
        switch cadence {
        case .weekly:
            points = nights
        case .monthly:
            var weeks: [(String, [Double])] = []
            for (date, value) in nights {
                guard let day = BriefingRecoveryCardDecoder.calendarDate(date) else { continue }
                let weekday = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(secondsFromGMT: 0)!, from: day).weekday ?? 1
                let sunday = BriefingRecoveryCardDecoder.key(day.addingTimeInterval(-Double(weekday - 1) * 86_400))
                if weeks.last?.0 == sunday { weeks[weeks.count - 1].1.append(value) } else { weeks.append((sunday, [value])) }
            }
            points = weeks.map { ($0.0, ($0.1.reduce(0, +) / Double($0.1.count) * 10).rounded() / 10) }
        }
        let observed = nights.count
        let average = observed == 0 ? nil : nights.map(\.1).reduce(0, +) / Double(observed)
        let minimum = cadence == .weekly ? 5 : 20
        let state: String
        if scenario == .unavailable || observed < minimum {
            state = "unavailable"
        } else if scenario == .yellow {
            state = "yellow"
        } else if scenario == .red {
            state = "red"
        } else {
            state = "green"
        }
        // The Server's commentary sentences, with this synthetic period's own
        // counts (material: >= 30 min below baseline; severe: >= 75 min).
        let materialLow = nights.filter { $0.1 <= baseline - 30 }.count
        let severeLow = nights.filter { $0.1 <= baseline - 75 }.count
        let commentary: BriefingJSONValue = switch state {
        case "yellow": .object(["visible": .bool(true), "headline": .string("Sleep was persistently below your personal baseline."), "body": .string("\(materialLow) nights were materially low.")])
        case "red": .object(["visible": .bool(true), "headline": .string("Sleep strain was severe and persistent."), "body": .string("\(severeLow) nights were severely low.")])
        default: .object(["visible": .bool(false), "headline": .null, "body": .null])
        }
        let foam: BriefingJSONValue = scenario == .foam
            ? .object(["state": .string("mixed"), "scheduledOccurrences": .number(7), "completedOccurrences": .number(4)])
            : .object(["state": .string("unavailable"), "scheduledOccurrences": .null, "completedOccurrences": .number(0)])
        return .object([
            "schemaVersion": .string(scenario == .malformed ? "recovery_card_v0" : BriefingRecoveryCardDecoder.schemaVersion),
            "presentation": .string(BriefingRecoveryCardDecoder.presentation),
            "cadence": .string(cadence.rawValue),
            "assessmentId": .string("recovery_briefing_v1|synthetic-review-\(scenario.rawValue)"),
            "status": .object(["state": .string(state), "label": .string(state)]),
            "period": .object([
                "startDate": .string(window.startDate), "endDate": .string(window.endDate),
                "expectedNights": .number(Double(days)), "observedNights": .number(Double(observed)),
            ]),
            "sleep": .object([
                "averageMinutes": average.map { .number(($0 * 10).rounded() / 10) } ?? .null,
                "baselineMinutes": .number(baseline),
                "deltaFromBaselineMinutes": average.map { .number((($0 - baseline) * 10).rounded() / 10) } ?? .null,
                "baselineNights": .number(16),
                "baselineLookbackNights": .number(28),
                "trend": .object([
                    "granularity": .string(cadence == .weekly ? "night" : "week"),
                    "points": .array(points.map { .object(["label": .string($0.0), "totalSleepMinutes": .number($0.1)]) }),
                ]),
            ]),
            "commentary": commentary,
            "foamRolling": foam,
            // Diagnostic codes are part of the payload but never rendered.
            "dataLimitations": .array([.string("foam_schedule_authority_unavailable_for_period"), .string("training_context_unavailable")]),
        ])
    }
}
#endif
