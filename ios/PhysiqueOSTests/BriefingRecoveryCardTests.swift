import SwiftUI
import XCTest
@testable import PhysiqueOS

/// Recovery card (`recovery_card_v1`) — Weekly and Monthly ONLY. Synthetic
/// payloads only; no Founder Sleep.
final class BriefingRecoveryCardTests: XCTestCase {
    private let weeklyWindow = BriefingEvidenceWindowReadModel(id: "weekly:2026-08-23:2026-08-29:America/Los_Angeles", startDate: "2026-08-23", endDate: "2026-08-29", briefingDate: "2026-08-30", relativeLabel: "this completed week", timeZone: "America/Los_Angeles")
    private let monthlyWindow = BriefingEvidenceWindowReadModel(id: "monthly:2026-08-01:2026-08-31:America/Los_Angeles", startDate: "2026-08-01", endDate: "2026-08-31", briefingDate: "2026-09-01", relativeLabel: "August", timeZone: "America/Los_Angeles")
    private let now = ISO8601DateFormatter().date(from: "2026-10-08T12:00:00Z")!

    /// Exactly the Server's `projectRecoveryCardForNativeV1` shape.
    private static let serverWeeklyJSON = #"""
    {"schemaVersion":"recovery_card_v1","presentation":"single_recovery_card_v1","cadence":"weekly",
     "assessmentId":"recovery_briefing_v1|abc","status":{"state":"yellow","label":"Yellow"},
     "period":{"startDate":"2026-08-23","endDate":"2026-08-29","expectedNights":7,"observedNights":7},
     "sleep":{"averageMinutes":362.3,"baselineMinutes":405,"deltaFromBaselineMinutes":-42.7,"baselineNights":16,"baselineLookbackNights":28,
       "trend":{"granularity":"night","points":[{"label":"2026-08-23","totalSleepMinutes":399},{"label":"2026-08-24","totalSleepMinutes":348},{"label":"2026-08-25","totalSleepMinutes":337},{"label":"2026-08-26","totalSleepMinutes":344},{"label":"2026-08-27","totalSleepMinutes":359},{"label":"2026-08-28","totalSleepMinutes":352},{"label":"2026-08-29","totalSleepMinutes":397}]}},
     "commentary":{"visible":true,"headline":"Sleep was persistently below your personal baseline.","body":"5 nights were materially low."},
     "foamRolling":{"state":"unavailable","scheduledOccurrences":null,"completedOccurrences":0},
     "dataLimitations":["foam_schedule_authority_unavailable_for_period","training_context_unavailable"]}
    """#

    private func json(_ text: String) throws -> BriefingJSONValue {
        try JSONDecoder().decode(BriefingJSONValue.self, from: Data(text.utf8))
    }

    private func weeklyPayload(_ scenario: BriefingRecoveryReviewFixture.Scenario = .green) -> BriefingJSONValue {
        BriefingRecoveryReviewFixture.payload(.weekly, window: weeklyWindow, scenario: scenario)
    }

    private func monthlyPayload(_ scenario: BriefingRecoveryReviewFixture.Scenario = .green) -> BriefingJSONValue {
        BriefingRecoveryReviewFixture.payload(.monthly, window: monthlyWindow, scenario: scenario)
    }

    private func decodeWeekly(_ value: BriefingJSONValue?) -> BriefingRecoveryCard? {
        BriefingRecoveryCardDecoder.decode(value, cadence: .weekly, window: weeklyWindow, now: now)
    }

    // MARK: Contract decoding

    func testDecodesTheExactServerWeeklyCardAndNeverReadsDiagnostics() throws {
        let card = try XCTUnwrap(decodeWeekly(try json(Self.serverWeeklyJSON)))
        XCTAssertEqual(card.cadence, .weekly)
        XCTAssertEqual(card.status, .yellow)
        XCTAssertEqual(card.status.label, "Yellow")
        XCTAssertEqual(card.observedNights, 7)
        XCTAssertEqual(card.averageMinutes, 362.3)
        XCTAssertEqual(card.deltaMinutes, -42.7)
        XCTAssertEqual(card.baselineNights, 16)
        XCTAssertEqual(card.points.count, 7)
        XCTAssertEqual(card.commentary?.body, "5 nights were materially low.")
        XCTAssertNil(card.foamRolling, "unavailable foam is hidden")
        let encoded = String(decoding: try JSONEncoder().encode(card), as: UTF8.self)
        XCTAssertFalse(encoded.contains("foam_schedule_authority"), "diagnostic limitation codes are never carried")
        XCTAssertFalse(encoded.contains("training_context_unavailable"))
    }

    func testAllFourStatusesDecodeForWeeklyAndMonthly() throws {
        for scenario in [BriefingRecoveryReviewFixture.Scenario.green, .yellow, .red, .unavailable] {
            let weekly = try XCTUnwrap(decodeWeekly(weeklyPayload(scenario)), "weekly \(scenario)")
            let monthly = try XCTUnwrap(BriefingRecoveryCardDecoder.decode(monthlyPayload(scenario), cadence: .monthly, window: monthlyWindow, now: now), "monthly \(scenario)")
            let expected: BriefingRecoveryCard.Status = switch scenario {
            case .yellow: .yellow
            case .red: .red
            case .unavailable: .unavailable
            default: .green
            }
            XCTAssertEqual(weekly.status, expected)
            XCTAssertEqual(monthly.status, expected)
            XCTAssertEqual(weekly.granularity, .night)
            XCTAssertEqual(monthly.granularity, .week)
        }
        let monthly = try XCTUnwrap(BriefingRecoveryCardDecoder.decode(monthlyPayload(), cadence: .monthly, window: monthlyWindow, now: now))
        XCTAssertEqual(monthly.points.first?.date, "2026-07-26", "the first Sunday anchor may precede a month that starts mid-week")
        XCTAssertEqual(monthly.points.count, 6)
        XCTAssertEqual(monthly.expectedNights, 31)
    }

    func testStatusLabelsAreFixedProductCopy() {
        XCTAssertEqual(BriefingRecoveryCard.Status.allCases.map(\.label), ["Green", "Yellow", "Red", "Not enough data"])
    }

    func testExcludedCadencesNeverDecodeEvenWithAValidPayload() {
        for cadence in [BriefingCadence.midweek, .event, .daily] {
            XCTAssertNil(BriefingRecoveryCardDecoder.decode(weeklyPayload(), cadence: cadence, window: weeklyWindow, now: now), "\(cadence)")
        }
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(weeklyPayload(), cadence: .monthly, window: weeklyWindow, now: now), "a Weekly card is not a Monthly card")
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(monthlyPayload(), cadence: .weekly, window: monthlyWindow, now: now))
    }

    func testMalformedPayloadsFailClosedAsMissing() throws {
        let base = weeklyPayload(.yellow)
        let mutations: [(String, [String], BriefingJSONValue?)] = [
            ("schema", ["schemaVersion"], .string("recovery_card_v0")),
            ("presentation", ["presentation"], .string("two_cards")),
            ("cadence midweek", ["cadence"], .string("midweek")),
            ("missing id", ["assessmentId"], nil),
            ("status unknown", ["status", "state"], .string("orange")),
            ("not Sunday", ["period", "startDate"], .string("2026-08-24")),
            ("six nights", ["period", "endDate"], .string("2026-08-28")),
            ("impossible date", ["period", "endDate"], .string("2026-02-30")),
            ("expected nights", ["period", "expectedNights"], .number(8)),
            ("observed > expected", ["period", "observedNights"], .number(9)),
            ("fractional observed", ["period", "observedNights"], .number(6.5)),
            ("baseline 13 nights", ["sleep", "baselineNights"], .number(13)),
            ("baseline 29 nights", ["sleep", "baselineNights"], .number(29)),
            ("baseline zero", ["sleep", "baselineMinutes"], .number(0)),
            ("baseline negative", ["sleep", "baselineMinutes"], .number(-5)),
            ("baseline > a day", ["sleep", "baselineMinutes"], .number(1_441)),
            ("baseline text", ["sleep", "baselineMinutes"], .string("405")),
            ("average missing", ["sleep", "averageMinutes"], nil),
            ("average zero", ["sleep", "averageMinutes"], .number(0)),
            ("delta absurd", ["sleep", "deltaFromBaselineMinutes"], .number(5_000)),
            ("lookback", ["sleep", "baselineLookbackNights"], .number(21)),
            ("granularity", ["sleep", "trend", "granularity"], .string("week")),
            ("points missing", ["sleep", "trend", "points"], nil),
        ]
        XCTAssertNotNil(decodeWeekly(base))
        for (name, path, replacement) in mutations {
            XCTAssertNil(decodeWeekly(base.setting(path, replacement)), name)
        }
        var points = base["sleep"]?["trend"]?["points"]?.array ?? []
        points.swapAt(0, 1)
        XCTAssertNil(decodeWeekly(base.setting(["sleep", "trend", "points"], .array(points))), "out-of-order trend")
        let outside = base.setting(["sleep", "trend", "points"], .array([.object(["label": .string("2026-08-30"), "totalSleepMinutes": .number(400)])]))
        XCTAssertNil(decodeWeekly(outside), "a point outside the period")
        let infinite = base.setting(["sleep", "trend", "points"], .array([.object(["label": .string("2026-08-23"), "totalSleepMinutes": .number(.infinity)])]))
        XCTAssertNil(decodeWeekly(infinite))
        XCTAssertNil(decodeWeekly(.array([])), "not an object")
        XCTAssertNil(decodeWeekly(.null))
        XCTAssertNil(decodeWeekly(nil))
    }

    func testPeriodMustMatchTheArtifactWindowAndBeClosed() {
        let other = BriefingEvidenceWindowReadModel(id: "w", startDate: "2026-08-16", endDate: "2026-08-22", briefingDate: "2026-08-23", relativeLabel: "", timeZone: "America/Los_Angeles")
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(weeklyPayload(), cadence: .weekly, window: other, now: now))
        let beforeClose = ISO8601DateFormatter().date(from: "2026-08-29T20:00:00Z")!
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(weeklyPayload(), cadence: .weekly, window: weeklyWindow, now: beforeClose), "a period still open on the device clock")
        let afterClose = ISO8601DateFormatter().date(from: "2026-08-30T10:00:00Z")!
        XCTAssertNotNil(BriefingRecoveryCardDecoder.decode(weeklyPayload(), cadence: .weekly, window: weeklyWindow, now: afterClose))
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(monthlyPayload().setting(["period", "endDate"], .string("2026-08-30")), cadence: .monthly, window: nil, now: now), "not a whole month")
    }

    func testGreenStaysQuietAndOversizedCommentaryIsDropped() throws {
        let green = weeklyPayload(.green).setting(["commentary"], .object(["visible": .bool(true), "headline": .string("H"), "body": .string("B")]))
        XCTAssertNil(try XCTUnwrap(decodeWeekly(green)).commentary)
        let long = weeklyPayload(.yellow).setting(["commentary", "body"], .string(String(repeating: "x", count: 401)))
        let card = try XCTUnwrap(decodeWeekly(long))
        XCTAssertNil(card.commentary)
        XCTAssertEqual(BriefingRecoveryCopy.title(card), "Sleep was below your usual range")
    }

    func testFoamRowNeedsAuthoritativeCounts() throws {
        XCTAssertEqual(try XCTUnwrap(decodeWeekly(weeklyPayload(.foam))).foamRolling, .init(completed: 4, scheduled: 7))
        let over = weeklyPayload(.foam).setting(["foamRolling", "completedOccurrences"], .number(8))
        XCTAssertNil(try XCTUnwrap(decodeWeekly(over)).foamRolling)
        let observedOnly = weeklyPayload(.foam).setting(["foamRolling", "state"], .string("observed_only"))
        XCTAssertNil(try XCTUnwrap(decodeWeekly(observedOnly)).foamRolling)
    }

    // MARK: Mapper non-leakage (Weekly and Monthly only)

    private func weeklyRoot(recovery: String?) -> String {
        #"{"schemaVersion":"1","artifact":{"artifactId":"weekly_briefing_2026-08-23_2026-08-29","artifactType":"scheduled","cadence":"weekly","version":3,"evidenceWindow":{"id":"weekly:2026-08-23:2026-08-29:America/Los_Angeles","startDate":"2026-08-23","endDate":"2026-08-29","timeZone":"America/Los_Angeles"},"publicationDate":"2026-08-30T10:00:00.000Z"},"goalPhaseAttribution":{"goalId":"g","phaseId":"p"},"presentation":{"hero":{"headline":"H","body":"B"}}"# + (recovery.map { #","recovery":"# + $0 } ?? "") + "}"
    }

    func testWeeklyDetailCarriesTheCardOnlyWhenPresentAndValid() throws {
        let with = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(weeklyRoot(recovery: Self.serverWeeklyJSON))))
        XCTAssertEqual(with.weekly?.recovery?.status, .yellow)
        let without = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(weeklyRoot(recovery: nil))))
        XCTAssertNil(without.weekly?.recovery)
        var stripped = with
        stripped.weekly?.recovery = nil
        XCTAssertEqual(stripped, without, "the card is the only difference")
        let malformed = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(weeklyRoot(recovery: #"{"schemaVersion":"recovery_card_v1","cadence":"weekly"}"#))))
        XCTAssertNil(malformed.weekly?.recovery, "malformed → missing")
        XCTAssertEqual(malformed, without, "the rest of the Briefing is untouched")
        let nullCard = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(weeklyRoot(recovery: "null"))))
        XCTAssertEqual(nullCard, without)
    }

    func testMidweekNeverCarriesRecoveryEvenWhenInjected() throws {
        let midweek = #"{"schemaVersion":"1","artifact":{"artifactId":"midweek-1","artifactType":"scheduled","cadence":"midweek","version":2,"evidenceWindow":{"id":"midweek-1","startDate":"2026-08-23","endDate":"2026-08-25","timeZone":"America/Los_Angeles"},"publicationDate":"2026-08-26T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"g","phaseId":"p"},"presentation":{"hero":{"verdict":"V","summary":"S"},"coachTake":{"biggestTakeaway":"T","recommendation":"R"},"activeGoal":{"id":"g","name":"Goal"},"activePhase":{"id":"p","name":"Phase"},"prioritiesThroughSunday":[]},"recovery":"# + Self.serverWeeklyJSON + "}"
        let model = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(midweek)))
        XCTAssertNotNil(model.midweek)
        XCTAssertNil(model.weekly)
        XCTAssertNil(model.monthly)
        let encoded = String(decoding: try JSONEncoder().encode(model), as: UTF8.self)
        XCTAssertFalse(encoded.contains("recovery"), "no Recovery field anywhere in a Midweek")
    }

    private func monthlyRoot(topLevel: String?, inArtifact: String? = nil) -> String {
        let stored = inArtifact.map { #","recoveryAssessment":"# + $0 } ?? ""
        return #"{"artifact":{"id":"monthly_briefing_2026-08","cadence":"monthly","generatedAt":"2026-09-01T14:00:00.000Z","evidenceWindow":{"id":"monthly:2026-08-01:2026-08-31:America/Los_Angeles","startDate":"2026-08-01","endDate":"2026-08-31","timeZone":"America/Los_Angeles"},"briefing":{"monthlyPresentation":{"hero":{"title":"T","thesis":"Body","period":"August 1–31 · Delivered September 1"}}"# + stored + #"}},"goals":[]"# + (topLevel.map { #","recovery":"# + $0 } ?? "") + "}"
    }

    func testMonthlyDetailReadsOnlyTheTopLevelCard() throws {
        let payloadText = String(decoding: try JSONEncoder().encode(EncodableJSON(monthlyPayload(.yellow))), as: UTF8.self)
        let with = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(monthlyRoot(topLevel: payloadText))))
        XCTAssertEqual(with.monthly?.recovery?.status, .yellow)
        XCTAssertEqual(with.monthly?.recovery?.granularity, .week)
        let rawOnly = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(monthlyRoot(topLevel: nil, inArtifact: payloadText))))
        XCTAssertNil(rawOnly.monthly?.recovery, "a raw stored envelope is never rendered")
        let weeklyOnMonthly = try XCTUnwrap(try ProductionBriefingMapper.detail(try json(monthlyRoot(topLevel: Self.serverWeeklyJSON))))
        XCTAssertNil(weeklyOnMonthly.monthly?.recovery)
    }

    func testDEXAAndPhotoNeverCarryRecovery() throws {
        let payloadText = Self.serverWeeklyJSON
        for narrative in [#""dexaEventNarrative":{"hero":{"title":"T","body":"B","results":[],"milestones":[]}}"#, #""photoEventNarrative":{"eventDate":"2026-08-30"}"#] {
            let root = #"{"artifact":{"id":"event-1","cadence":"event","artifactType":"event","generatedAt":"2026-08-31T14:00:00.000Z","briefing":{"# + narrative + #","recoveryAssessment":"# + payloadText + #"}},"goals":[],"recovery":"# + payloadText + "}"
            // Either the minimal event envelope maps (and carries no
            // cadence content that could hold a card) or it is rejected.
            if let model = try? ProductionBriefingMapper.detail(try json(root)) {
                XCTAssertNil(model.weekly)
                XCTAssertNil(model.monthly)
                XCTAssertNil(model.midweek)
                XCTAssertFalse(String(decoding: try JSONEncoder().encode(model), as: UTF8.self).contains("recovery"))
            }
        }
        // Structural: only Weekly/Monthly content types own a `recovery` field.
        for briefing in BriefingSandboxStore().briefings where briefing.cadence != .weekly && briefing.cadence != .monthly {
            XCTAssertTrue([.midweek, .dexa, .photo, .none].contains(BriefingCadenceBody.route(for: briefing)))
            XCTAssertFalse(String(decoding: try JSONEncoder().encode(briefing), as: UTF8.self).contains("\"recovery\""))
        }
    }

    // MARK: Copy, accessibility and plotting

    func testCopyIsTruthfulAndNeverAScore() throws {
        let yellow = try XCTUnwrap(decodeWeekly(try json(Self.serverWeeklyJSON)))
        XCTAssertEqual(BriefingRecoveryCopy.title(yellow), "Sleep was persistently below your personal baseline.")
        XCTAssertEqual(BriefingRecoveryCopy.summary(yellow), "6h 02m average · −43m vs baseline · 7 of 7 nights")
        XCTAssertEqual(BriefingRecoveryCopy.caveat(yellow), "Sleep uses the prior 28 reliable nights and excludes this period. Associations do not imply causation.")
        let green = try XCTUnwrap(decodeWeekly(weeklyPayload(.green)))
        XCTAssertEqual(BriefingRecoveryCopy.title(green), "Sleep stayed in your usual range")
        XCTAssertNil(green.commentary)
        let unavailable = try XCTUnwrap(decodeWeekly(weeklyPayload(.unavailable)))
        XCTAssertNil(unavailable.averageMinutes)
        XCTAssertNil(unavailable.deltaMinutes)
        XCTAssertEqual(BriefingRecoveryCopy.summary(unavailable), "3 of 7 nights available")
        XCTAssertTrue(BriefingRecoveryCopy.unavailableDetail(unavailable).contains("5 of 7 nights"))
        let foam = try XCTUnwrap(decodeWeekly(weeklyPayload(.foam)))
        XCTAssertTrue(BriefingRecoveryCopy.caveat(foam).contains("Foam rolling cannot set the Recovery status."))
        XCTAssertEqual(BriefingRecoveryCopy.foamDetail(.init(completed: 4, scheduled: 7)), "3 not completed · status unchanged")
        XCTAssertEqual(BriefingRecoveryCopy.signedMinutes(2.4), "+2m")
        XCTAssertEqual(BriefingRecoveryCopy.signedMinutes(-0.2), "±0m")
        XCTAssertEqual(BriefingRecoveryCopy.duration(407), "6h 47m")
        for card in [yellow, green, unavailable, foam] {
            let all = [BriefingRecoveryCopy.title(card), BriefingRecoveryCopy.summary(card), BriefingRecoveryCopy.caveat(card), BriefingRecoveryCopy.chartSummary(card)].joined(separator: " ").lowercased()
            XCTAssertFalse(all.contains("score"))
            XCTAssertFalse(all.contains("caused"))
            XCTAssertFalse(all.contains("confidence"))
            XCTAssertFalse(all.contains("_"), "no raw codes")
        }
    }

    func testWeeklyTrendKeepsMissingNightsAsGapsAndMonthlyUsesWeeks() throws {
        let unavailable = try XCTUnwrap(decodeWeekly(weeklyPayload(.unavailable)))
        let plot = BriefingRecoveryTrendChart.plot(unavailable)
        XCTAssertEqual(plot.slots, 7)
        XCTAssertEqual(plot.positions, [0, 2, 6], "missing nights are not interpolated")
        XCTAssertEqual(plot.labels, ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"])
        let monthly = try XCTUnwrap(BriefingRecoveryCardDecoder.decode(monthlyPayload(), cadence: .monthly, window: monthlyWindow, now: now))
        XCTAssertEqual(BriefingRecoveryTrendChart.plot(monthly).labels, ["W1", "W2", "W3", "W4", "W5", "W6"])
        XCTAssertLessThan(plot.minimum, unavailable.baselineMinutes)
        XCTAssertGreaterThan(plot.maximum, unavailable.baselineMinutes)
        XCTAssertTrue(BriefingRecoveryCopy.chartSummary(unavailable).hasPrefix("Weekly Sleep trend: Sunday 6 hours 41 minutes, Tuesday"))
    }

    @MainActor
    func testSectionRendersInBothAppearancesForEveryStatus() throws {
        for scenario in [BriefingRecoveryReviewFixture.Scenario.green, .yellow, .red, .unavailable, .foam] {
            for scheme in [ColorScheme.dark, .light] {
                for card in [decodeWeekly(weeklyPayload(scenario)), BriefingRecoveryCardDecoder.decode(monthlyPayload(scenario), cadence: .monthly, window: monthlyWindow, now: now)] {
                    let renderer = ImageRenderer(content: BriefingRecoverySection(card: try XCTUnwrap(card))
                        .frame(width: 402)
                        .fixedSize(horizontal: false, vertical: true)
                        .environment(\.colorScheme, scheme))
                    let image = try XCTUnwrap(renderer.uiImage)
                    XCTAssertGreaterThan(image.size.height, 300, "\(scenario) \(scheme)")
                }
            }
        }
    }

    func testSandboxCarriesNoRecoveryWithoutTheReviewFlag() {
        XCTAssertFalse(ProcessInfo.processInfo.arguments.contains(BriefingRecoveryReviewFixture.argument))
        let store = BriefingSandboxStore()
        XCTAssertTrue(store.briefings.allSatisfy { $0.weekly?.recovery == nil && $0.monthly?.recovery == nil })
    }

    func testOverlayAttachesOnlyToSundayWeeksAndWholeMonths() {
        let store = BriefingSandboxStore()
        let overlaid = BriefingRecoveryReviewFixture.payload(.weekly, window: weeklyWindow, scenario: .malformed)
        XCTAssertNil(decodeWeekly(overlaid), "the malformed review scenario renders nothing")
        // The sandbox's Monday-start week (Oct 26–Nov 1) can never receive a card.
        let monday = store.briefings.first { $0.id == "weekly_briefing_2026-10-26_2026-11-01" }!
        XCTAssertNil(BriefingRecoveryCardDecoder.decode(BriefingRecoveryReviewFixture.payload(.weekly, window: monday.evidenceWindow, scenario: .green), cadence: .weekly, window: monday.evidenceWindow, now: now))
    }
}

private extension BriefingJSONValue {
    /// A copy with the value at `path` replaced (nil removes the key).
    func setting(_ path: [String], _ replacement: BriefingJSONValue?) -> BriefingJSONValue {
        guard let key = path.first, case .object(var object) = self else { return self }
        if path.count == 1 {
            object[key] = replacement
        } else {
            object[key] = (object[key] ?? .object([:])).setting(Array(path.dropFirst()), replacement)
        }
        return .object(object)
    }
}

/// Re-encodes a `BriefingJSONValue` (decode-only in the app).
private struct EncodableJSON: Encodable {
    let value: BriefingJSONValue
    init(_ value: BriefingJSONValue) { self.value = value }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case .object(let object): try container.encode(object.mapValues(EncodableJSON.init))
        case .array(let array): try container.encode(array.map(EncodableJSON.init))
        case .string(let string): try container.encode(string)
        case .number(let number): try container.encode(number)
        case .bool(let bool): try container.encode(bool)
        case .null: try container.encodeNil()
        }
    }
}
