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
///
/// The Green Weekly and Yellow Monthly scenarios carry the content of the
/// Founder-locked 2026-10-04 boards (Weekly `weekly-recovery-dark.png`,
/// Monthly `RECOVERY-MONTHLY-FUTURE-FIXTURE.json`), shaped by the sandbox
/// artifact's own window.
enum BriefingRecoveryReviewFixture {
    static let argument = "-physiqueos.recovery-review.scenario"

    enum Scenario: String, CaseIterable {
        /// Green with the foam row (Weekly lock: 4 of 7, three misses).
        case green
        /// Yellow (Monthly lock: editorial title, titled block, 3 excused · 1 missed).
        case yellow
        /// Sleep-only Red (training corroboration stays disabled).
        case red
        /// Not enough data; foam observed only, so the row stays hidden.
        case unavailable
        /// Green without foam schedule authority: no foam row.
        case nofoam
        case malformed
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
        let utc = TimeZone(secondsFromGMT: 0)!
        let startWeekday = start.map { (Calendar(identifier: .gregorian).dateComponents(in: utc, from: $0).weekday ?? 1) - 1 } ?? 0
        let lockedMonthly = cadence == .monthly && scenario == .yellow
        // Weekly lock 405 (6h 45m); Monthly lock 404 (6h 44m).
        let baseline = lockedMonthly ? 404.0 : 405.0
        let nightly: [Double?] = switch scenario {
        case .green, .nofoam, .malformed: [403, 412, 395, 418, 407, 399, 416]
        case .yellow: [399, 348, 337, 344, 359, 352, 397]
        case .red: [324, 301, 287, 296, 310, 293, 276]
        case .unavailable: [401, nil, 388, nil, nil, nil, 410]
        }
        // Monthly lock: Sunday-week averages 411 · 402 · 390 · 372 · 348, three
        // nights unavailable (a partial leading week is one of them).
        let lockedWeeks: [Double] = [411, 402, 390, 372, 348]
        var nights: [(String, Double)] = []
        if let start {
            for offset in 0..<days {
                let value: Double?
                if lockedMonthly {
                    let week = (offset + startWeekday) / 7 - (startWeekday == 0 ? 0 : 1)
                    value = week < 0 || offset == 11 || offset == 19 ? nil : lockedWeeks[min(week, lockedWeeks.count - 1)]
                } else {
                    // Monthly Red softens week by week so the aggregates show a trend.
                    let drift = cadence == .monthly && scenario == .red ? Double(offset / 7) * 9 - 18 : 0
                    value = nightly[offset % nightly.count].map { $0 - drift }
                }
                if let value {
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
                let weekday = Calendar(identifier: .gregorian).dateComponents(in: utc, from: day).weekday ?? 1
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
        // The Server's editorial copy (RecoveryBriefingAssessmentServiceV1)
        // with this synthetic period's own counts (material: >= 30 min below
        // baseline; severe: >= 75 min).
        let materialLow = nights.filter { $0.1 <= baseline - 30 }.count
        let severeLow = nights.filter { $0.1 <= baseline - 75 }.count
        let commentary: BriefingJSONValue
        switch (state, cadence) {
        case ("yellow", .weekly):
            commentary = .object(["visible": .bool(true), "headline": .string("Sleep was persistently below baseline"), "title": .null,
                                  "body": .string("\(countWord(materialLow)) nights were materially low. No downstream training constraint was established.")])
        case ("yellow", .monthly):
            commentary = .object(["visible": .bool(true), "headline": .string("Sleep softened across the second half"), "title": .string("A multi-week shift"),
                                  "body": .string("Two completed weeks were meaningfully below your prior 28-night baseline. No downstream training constraint was established.")])
        case ("red", _):
            commentary = .object(["visible": .bool(true), "headline": .string("Sleep strain was severe and persistent"),
                                  "title": cadence == .monthly ? .string("A severe, persistent shift") : .null,
                                  "body": .string("\(countWord(severeLow)) nights were severely low and the \(cadence == .monthly ? "month" : "period") average remained well below baseline.")])
        default:
            commentary = .object(["visible": .bool(false), "headline": .null, "title": .null, "body": .null])
        }
        let foam: BriefingJSONValue
        switch scenario {
        case .nofoam, .malformed:
            foam = .object(["state": .string("unavailable"), "scheduledOccurrences": .null, "completedOccurrences": .number(0), "missedOccurrences": .null, "excusedOccurrences": .null])
        case .unavailable:
            foam = .object(["state": .string("observed_only"), "scheduledOccurrences": .null, "completedOccurrences": .number(3), "missedOccurrences": .null, "excusedOccurrences": .null])
        default:
            let counts = foamCounts(cadence, scenario: scenario, days: days)
            foam = .object([
                "state": .string(counts.missed > 0 ? "mixed" : "on_track"),
                "scheduledOccurrences": .number(Double(counts.scheduled)), "completedOccurrences": .number(Double(counts.completed)),
                "missedOccurrences": .number(Double(counts.missed)), "excusedOccurrences": .number(Double(counts.excused)),
            ])
        }
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
            "dataLimitations": .array([.string("training_corroboration_disabled_for_publication")]),
        ])
    }

    /// Locked foam rows: Weekly 4 of 7 (three misses); Monthly 18 of 22
    /// (3 excused · 1 missed, schedule effective mid-month).
    private static func foamCounts(_ cadence: BriefingRecoveryCard.Cadence, scenario: Scenario, days: Int) -> (scheduled: Int, completed: Int, missed: Int, excused: Int) {
        switch (cadence, scenario) {
        case (.weekly, .yellow): (7, 6, 1, 0)
        case (.weekly, _): (7, 4, 3, 0)
        case (.monthly, .yellow): (22, 18, 1, 3)
        case (.monthly, _): (days, days - 4, 2, 2)
        }
    }

    private static func countWord(_ value: Int) -> String {
        let words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
        return words.indices.contains(value) ? words[value] : "\(value)"
    }
}
#endif
