import SwiftUI
import XCTest
import UIKit
@testable import PhysiqueOS

/// Regression coverage for the Evidence Hub read-model contract introduced
/// in this slice.
final class EvidenceReadModelTests: XCTestCase {

    // MARK: - Fixture decoding integrity

    func testBundledFixtureDecodesWithoutError() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertFalse(model.title.isEmpty)
        XCTAssertFalse(model.streams.isEmpty)
    }

    /// Mirrors `EVIDENCE_HUB_CANONICAL_ORDER`
    /// (`src/domain/services/EvidenceHubUsageService.js:3-13`) exactly —
    /// `protocols` is archived and must never appear on the real Evidence
    /// Hub, so the fixture (and any future live payload) must not include
    /// it either.
    func testStreamsMatchTheCanonicalOrderAndExcludeArchivedProtocols() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertEqual(
            model.streams.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "health-metrics"]
        )
        XCTAssertFalse(model.streams.map(\.id).contains("protocols"))
    }

    // MARK: - Locked Hub composition (Batch 3 Checkpoint A)

    /// The locked Hub (design `f7d72f19`, H1) keeps every real stream in
    /// Server order, drops the non-functional Health Metrics placeholder,
    /// and places the Timeline doorway last, after Recovery.
    func testLockedHubMovesTimelineAfterRecoveryAndHidesHealthMetrics() {
        let production = ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "timeline", "recovery", "health-metrics"]
            .map(Self.stream)
        let projected = EvidenceHubPresentation.lockedStreams(production)
        XCTAssertEqual(
            projected.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "timeline"]
        )
        XCTAssertEqual(projected.last?.destination, .progressStream(streamId: "timeline"))
        XCTAssertEqual(projected.map(\.destination), projected.map { .progressStream(streamId: $0.id) })
    }

    /// Canonical availability wins: an authority without a Timeline stream
    /// (Sandbox) gets no synthesized Timeline row.
    func testLockedHubNeverSynthesizesATimelineRow() throws {
        let model = try Self.loadBundledFixture()
        let projected = EvidenceHubPresentation.lockedStreams(model.streams)
        XCTAssertEqual(
            projected.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery"]
        )
        XCTAssertEqual(projected, model.streams.filter { $0.id != "health-metrics" })
    }

    func testTimelineEventDatesUseTheLockedLongForm() {
        XCTAssertEqual(TimelineDateFormatting.long("2026-09-10"), "Sep 10, 2026")
        XCTAssertEqual(TimelineDateFormatting.long("2026-08-01T07:30:00.000Z"), "Aug 1, 2026")
        XCTAssertEqual(TimelineDateFormatting.long("not-a-date"), "not-a-date")
    }

    func testLockedEvidenceTypeScaleMapsTheHarnessToIPhone17Pro() {
        XCTAssertEqual(EvidenceLockedStyle.pt(360), 402, accuracy: 0.0001)
        XCTAssertEqual(EvidenceLockedStyle.uiWeight(800).rawValue, UIFont.Weight.heavy.rawValue, accuracy: 0.0001)
        XCTAssertEqual(EvidenceLockedStyle.uiWeight(400).rawValue, UIFont.Weight.regular.rawValue, accuracy: 0.0001)
        XCTAssertGreaterThan(EvidenceLockedStyle.uiWeight(780).rawValue, UIFont.Weight.bold.rawValue)
        XCTAssertLessThan(EvidenceLockedStyle.uiWeight(780).rawValue, UIFont.Weight.heavy.rawValue)
    }

    // MARK: - Batch 3 B/C presentation rules

    /// Locked row types come only from the canonical summary tokens.
    func testTrainingDayKindLabelUsesCanonicalSummaryTokens() {
        XCTAssertEqual(TrainingDayKindLabel(summary: "Chest · Triceps").type, "Strength")
        XCTAssertEqual(TrainingDayKindLabel(summary: "Chest · Triceps · Walking").type, "Strength + Walking")
        XCTAssertEqual(TrainingDayKindLabel(summary: "Cardio").type, "Cardio")
        XCTAssertEqual(TrainingDayKindLabel(summary: "Cardio").tone, .cardio)
        XCTAssertEqual(TrainingDayKindLabel(summary: "Walking").tone, .walking)
        XCTAssertEqual(TrainingDayKindLabel(summary: "Cooldown").tone, .cooldown)
        XCTAssertNil(TrainingDayKindLabel(summary: nil).type)
    }

    /// Apple-only workout detail tokens become labeled cells only when every
    /// token is recognized; otherwise the Server line is shown verbatim.
    func testSessionDetailSummaryTokenizesOnlyRecognizedServerTokens() {
        let run = TrainingSessionDetailSummary(detail: "7:00 AM–7:34 AM · 34 min · 3.4 mi · 410 active cal")
        XCTAssertEqual(run.timeRange, "7:00 AM–7:34 AM")
        XCTAssertEqual(run.metrics, [
            .init(label: "Duration", value: "34 min"),
            .init(label: "Distance", value: "3.4 mi"),
            .init(label: "Active energy", value: "410 cal"),
        ])
        let unknown = TrainingSessionDetailSummary(detail: "34 min · Felt great")
        XCTAssertFalse(unknown.hasMetrics)
        XCTAssertNil(unknown.timeRange)
    }

    /// Chrome's `normal` line box rounds ascent and descent separately.
    func testNormalLineBoxMatchesChromeRounding() {
        XCTAssertEqual(EvidenceTextStyle.normal(10, 400).lineHeight, 12)
        XCTAssertEqual(EvidenceTextStyle.normal(14, 800).lineHeight, 18)
        XCTAssertEqual(EvidenceTextStyle.normal(9, 800).lineHeight, 11)
        XCTAssertEqual(EvidenceTextStyle.normal(12, 790, jakarta: false).lineHeight, 15)
    }

    func testEachLockedFamilyScalesItsHarnessToIPhone17Pro() {
        XCTAssertEqual(EvidenceFamily.training.pt(390), 402, accuracy: 0.0001)
        XCTAssertEqual(EvidenceFamily.daily.pt(379), 402, accuracy: 0.0001)
        XCTAssertEqual(EvidenceFamily.weight.pt(372), 402, accuracy: 0.0001)
        XCTAssertTrue(EvidenceFamily.training.usesJakarta)
        XCTAssertFalse(EvidenceFamily.weight.usesJakarta)
    }

    private static func stream(_ id: String) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: id, title: id, metric: "", trend: "", lastUpdated: nil,
            status: .available, tone: .primary, destination: .progressStream(streamId: id)
        )
    }

    // MARK: - Every stream resolves to the intended destination

    func testEveryStreamDestinationIsAProgressStream() throws {
        let model = try Self.loadBundledFixture()
        for stream in model.streams {
            XCTAssertEqual(stream.destination.serverDestinationId, "progress.stream")
        }
    }

    /// The Training stream's destination must resolve to the real Training
    /// history screen via `AppDestinationRouterView`, not a placeholder —
    /// this is the first complete evidence vertical, so its wire shape
    /// must be exactly the one the router special-cases.
    func testTrainingStreamDestinationMatchesTheRouterSpecialCase() throws {
        let model = try Self.loadBundledFixture()
        let training = try XCTUnwrap(model.streams.first { $0.id == "training" })
        guard case .progressStream(let streamId) = training.destination else {
            return XCTFail("Expected a progressStream destination.")
        }
        XCTAssertEqual(streamId, "training")
    }

    // MARK: - Status is fail-closed and never implies a fake confirmation

    func testStatusDecodesToKnownCasesOnly() throws {
        let model = try Self.loadBundledFixture()
        for stream in model.streams {
            XCTAssertTrue(stream.status == .available || stream.status == .placeholder)
        }
    }

    func testUnknownStatusFailsClosed() {
        let json = Data(#"""
        {"id":"weight","title":"Weight","metric":"","trend":"","lastUpdated":null,"status":"confirmed","tone":"primary","destination":{"id":"progress.stream","parameters":{"streamId":"weight"}}}
        """#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(EvidenceStreamSummary.self, from: json))
    }

    // MARK: - Fixtures

    static func loadBundledFixture() throws -> EvidenceHubReadModel {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "EvidenceFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EvidenceHubReadModel.self, from: data)
    }

    // MARK: - Batch 3 Checkpoint D record family

    func testRecordFamilyIsTheSFPro360HarnessWithItsOwnPalette() {
        XCTAssertEqual(EvidenceFamily.record.harnessWidth, 360)
        XCTAssertFalse(EvidenceFamily.record.usesJakarta)
        XCTAssertEqual(EvidenceFamily.record.pt(360), 402, accuracy: 0.001)
        XCTAssertTrue(EvidenceFamily.training.usesJakarta)
        XCTAssertTrue(EvidenceFamily.daily.usesJakarta)
        XCTAssertFalse(EvidenceFamily.weight.usesJakarta)
    }

    func testRecordDatesUseTheLongFormAndNeverInventALabel() {
        XCTAssertEqual(RecordDate.long("2026-08-30"), "Aug 30, 2026")
        XCTAssertEqual(RecordDate.long(shortLabel: "Aug 16", before: "2026-08-30"), "Aug 16, 2026")
        // A prior capture later in the calendar than the current one is the
        // previous year's.
        XCTAssertEqual(RecordDate.long(shortLabel: "Dec 28", before: "2027-01-04"), "Dec 28, 2026")
        XCTAssertEqual(RecordDate.long(shortLabel: "No prior matching pose", before: "2026-08-30"), "No prior matching pose")
        XCTAssertEqual(RecordDate.long(shortLabel: "Prior image unavailable", before: "2026-08-30"), "Prior image unavailable")
    }

    func testRecordMinContentWidthIsTheLongestWord() {
        let show = RecordText.minContentWidth("Show All", RecordText.action)
        let showOnly = RecordText.minContentWidth("Show", RecordText.action)
        XCTAssertEqual(show, showOnly, accuracy: 0.5)
        XCTAssertGreaterThan(RecordText.minContentWidth("Close", RecordText.action), 0)
    }

    func testDEXASincePriorScanKeepsTheCanonicalColumnOrder() {
        XCTAssertEqual(DEXAHistoryView.sincePriorScanColumnLabels, ["Body Fat", "Fat Mass", "Lean Mass"])
    }
}

/// Evidence root load reliability (Build 87 app-open audit, 2026-10-06).
/// A failed load must be recoverable, never terminal; only the newest load
/// may change state; a cancelled load changes nothing; and a failed refresh
/// keeps this session's last successful hub on screen.
@MainActor
final class EvidenceViewModelLoadReliabilityTests: XCTestCase {
    private func makeViewModel(_ api: EvidenceAPI) -> EvidenceViewModel {
        let defaults = UserDefaults(suiteName: "evidence-load-reliability-\(UUID().uuidString)")!
        return EvidenceViewModel(api: api, usageStore: UserDefaultsEvidenceHubUsageStore(defaults: defaults))
    }

    private func hub(_ title: String) throws -> EvidenceHubReadModel {
        var model = try EvidenceReadModelTests.loadBundledFixture()
        model.title = title
        return model
    }

    func testNetworkFailureThenRetrySucceeds() async throws {
        let api = ScriptedEvidenceAPI([.failure(ProductionNativeError.networkFailure), .success(try hub("Evidence"))])
        let viewModel = makeViewModel(api)

        await viewModel.load()
        XCTAssertEqual(viewModel.state, .failed(EvidenceViewModel.unreachableMessage))
        XCTAssertTrue(viewModel.needsRetry)

        await viewModel.load(trigger: .retry)
        XCTAssertEqual(viewModel.state, .loaded(try hub("Evidence")))
        XCTAssertFalse(viewModel.needsRetry)
        let calls = await api.callCount
        XCTAssertEqual(calls, 2)
    }

    func testFailureMessagesAreClassified() {
        XCTAssertEqual(EvidenceViewModel.message(for: ProductionNativeError.networkFailure), EvidenceViewModel.unreachableMessage)
        XCTAssertEqual(EvidenceViewModel.message(for: ProductionNativeError.temporaryServer(nil)), EvidenceViewModel.unreachableMessage)
        XCTAssertEqual(EvidenceViewModel.message(for: ProductionNativeError.sessionRecoveryUnavailable), EvidenceViewModel.sessionRecoveringMessage)
        XCTAssertEqual(
            EvidenceViewModel.message(for: ProductionNativeError.reconnectRequired),
            ProductionNativeError.reconnectRequired.errorDescription
        )
        XCTAssertEqual(EvidenceViewModel.message(for: ProductionNativeError.invalidResponse), EvidenceViewModel.genericFailureMessage)
        XCTAssertEqual(EvidenceViewModel.message(for: URLError(.badServerResponse)), EvidenceViewModel.genericFailureMessage)
    }

    func testFailedRefreshKeepsLastLoadedHub() async throws {
        let api = ScriptedEvidenceAPI([.success(try hub("First")), .failure(ProductionNativeError.networkFailure), .success(try hub("Second"))])
        let viewModel = makeViewModel(api)

        await viewModel.load()
        await viewModel.load(trigger: .dayChange)
        XCTAssertEqual(viewModel.state, .loaded(try hub("First")), "a transient refresh failure must not blank valid content")
        XCTAssertTrue(viewModel.refreshFailed)
        XCTAssertTrue(viewModel.needsRetry)

        await viewModel.load(trigger: .pullToRefresh)
        XCTAssertEqual(viewModel.state, .loaded(try hub("Second")))
        XCTAssertFalse(viewModel.refreshFailed)
    }

    func testCancelledFirstLoadIsNotTerminal() async throws {
        let api = ScriptedEvidenceAPI([.failure(CancellationError()), .success(try hub("Evidence"))])
        let viewModel = makeViewModel(api)

        await viewModel.load()
        XCTAssertEqual(viewModel.state, .loading)
        XCTAssertFalse(viewModel.needsRetry)

        await viewModel.load()
        XCTAssertEqual(viewModel.state, .loaded(try hub("Evidence")))
    }

    func testTaskCancellationDuringReadDoesNotBecomeFailure() async throws {
        let api = GatedEvidenceAPI()
        let viewModel = makeViewModel(api)
        let task = Task { await viewModel.load() }
        await api.waitForCalls(1)
        task.cancel()
        // `ProductionNativeAPI.perform` reports a cancelled transport as
        // `.networkFailure`; cancellation of the caller must still win.
        await api.complete(0, with: .failure(ProductionNativeError.networkFailure))
        await task.value
        XCTAssertEqual(viewModel.state, .loading)
    }

    func testStaleResponseCannotOverwriteNewerSuccess() async throws {
        let api = GatedEvidenceAPI()
        let viewModel = makeViewModel(api)
        let older = Task { await viewModel.load() }
        await api.waitForCalls(1)
        let newer = Task { await viewModel.load(trigger: .foreground) }
        await api.waitForCalls(2)

        await api.complete(1, with: .success(try hub("Newer")))
        await newer.value
        await api.complete(0, with: .success(try hub("Older")))
        await older.value
        XCTAssertEqual(viewModel.state, .loaded(try hub("Newer")))
    }

    func testStaleFailureCannotOverwriteNewerSuccess() async throws {
        let api = GatedEvidenceAPI()
        let viewModel = makeViewModel(api)
        let older = Task { await viewModel.load() }
        await api.waitForCalls(1)
        let newer = Task { await viewModel.load(trigger: .retry) }
        await api.waitForCalls(2)

        await api.complete(1, with: .success(try hub("Newer")))
        await newer.value
        await api.complete(0, with: .failure(ProductionNativeError.networkFailure))
        await older.value
        XCTAssertEqual(viewModel.state, .loaded(try hub("Newer")))
        XCTAssertFalse(viewModel.refreshFailed)
    }

    func testForegroundRetriesOnlyAfterFailure() async throws {
        let api = ScriptedEvidenceAPI([.success(try hub("Evidence")), .failure(ProductionNativeError.networkFailure), .success(try hub("Recovered"))])
        let viewModel = makeViewModel(api)

        await viewModel.load()
        await viewModel.retryAfterForegroundIfNeeded()
        var calls = await api.callCount
        XCTAssertEqual(calls, 1, "resuming onto a healthy hub must not add a full hub read")

        await viewModel.load(trigger: .dayChange)
        XCTAssertTrue(viewModel.refreshFailed)
        await viewModel.retryAfterForegroundIfNeeded()
        calls = await api.callCount
        XCTAssertEqual(calls, 3)
        XCTAssertEqual(viewModel.state, .loaded(try hub("Recovered")))
        XCTAssertFalse(viewModel.needsRetry)
    }

    func testRetryFromFailureShowsLoadingWhileInFlight() async throws {
        let api = GatedEvidenceAPI()
        let viewModel = makeViewModel(api)
        let first = Task { await viewModel.load() }
        await api.waitForCalls(1)
        await api.complete(0, with: .failure(ProductionNativeError.networkFailure))
        await first.value
        XCTAssertEqual(viewModel.state, .failed(EvidenceViewModel.unreachableMessage))

        let retry = Task { await viewModel.load(trigger: .retry) }
        await api.waitForCalls(2)
        XCTAssertEqual(viewModel.state, .loading)
        await api.complete(1, with: .success(try hub("Evidence")))
        await retry.value
        XCTAssertEqual(viewModel.state, .loaded(try hub("Evidence")))
    }
}

private actor ScriptedEvidenceAPI: EvidenceAPI {
    enum Step { case success(EvidenceHubReadModel), failure(Error) }
    private var steps: [Step]
    private(set) var callCount = 0

    init(_ steps: [Step]) { self.steps = steps }

    func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
        callCount += 1
        guard !steps.isEmpty else { throw URLError(.badServerResponse) }
        switch steps.removeFirst() {
        case .success(let hub): return hub
        case .failure(let error): throw error
        }
    }
}

/// Holds every call until the test completes it, by call index.
private actor GatedEvidenceAPI: EvidenceAPI {
    private var pending: [Int: CheckedContinuation<EvidenceHubReadModel, Error>] = [:]
    private var calls = 0

    func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
        let index = calls
        calls += 1
        return try await withCheckedThrowingContinuation { pending[index] = $0 }
    }

    private var completed = 0

    func waitForCalls(_ count: Int) async {
        while pending.count + completed < count { await Task.yield() }
    }

    func complete(_ index: Int, with result: Result<EvidenceHubReadModel, Error>) {
        pending.removeValue(forKey: index)?.resume(with: result)
        completed += 1
    }
}

/// Build 91 Evidence visual system (Founder-approved Option A): one domain
/// registry, one shared neutral surface hierarchy, domain accents, and
/// semantic data colors kept independent of the category accent.
final class EvidenceVisualSystemTests: XCTestCase {

    // MARK: Registry

    func testHubStreamsMapToTheNineDestinations() {
        let expected: [String: EvidenceDomain] = [
            "training": .training, "nutrition": .nutrition, "weight": .weight, "photos": .photos,
            "dexa": .dexa, "activity": .activity, "energy": .energy, "recovery": .recovery, "timeline": .timeline,
        ]
        for (streamId, domain) in expected {
            XCTAssertEqual(EvidenceDomain(streamId: streamId), domain, streamId)
        }
        XCTAssertEqual(EvidenceDomain.allCases.count, 9)
        XCTAssertNil(EvidenceDomain(streamId: "health-metrics"), "the hidden placeholder has no domain")
        XCTAssertNil(EvidenceDomain(streamId: "protocols"))
    }

    func testEveryDestinationHasItsApprovedRealIcon() {
        let icons: [EvidenceDomain: String] = [
            .training: "dumbbell.fill", .activity: "waveform.path.ecg", .nutrition: "fork.knife",
            .weight: "scalemass.fill", .photos: "camera.fill", .dexa: "person.fill.viewfinder",
            .energy: "bolt.fill", .recovery: "moon.fill", .timeline: "clock.arrow.circlepath",
        ]
        for domain in EvidenceDomain.allCases {
            XCTAssertEqual(domain.systemImage, icons[domain], "\(domain)")
            XCTAssertNotNil(UIImage(systemName: domain.systemImage), "\(domain.systemImage) must be a real SF Symbol")
        }
        XCTAssertNotNil(UIImage(systemName: AppTab.evidence.systemImageName), "Hub mark")
        XCTAssertNotNil(UIImage(systemName: "list.clipboard.fill"), "neutral fallback tile")
    }

    func testOptionAAccentsAreOneStableFamilyPerDomain() {
        let expected: [EvidenceDomain: (String, UInt32, UInt32)] = [
            .training: ("Purple", 0xAA98FF, 0x5C3FD2), .activity: ("Amber", 0xEFB84F, 0x925500),
            .nutrition: ("Green", 0x55E39A, 0x28744A), .energy: ("Orange", 0xFB923C, 0x9A4C10),
            .weight: ("Blue", 0x60A5FA, 0x176D92), .dexa: ("Cyan", 0x3BC6DD, 0x10708A),
            .photos: ("Rose", 0xF472B6, 0xA83B78), .recovery: ("Teal", 0x3BD2CA, 0x0B766F),
            .timeline: ("Neutral", 0xBCC5C8, 0x46535B),
        ]
        for domain in EvidenceDomain.allCases {
            let accent = domain.accent
            let (name, dark, mineral) = expected[domain]!
            XCTAssertEqual(accent.name, name, "\(domain)")
            XCTAssertEqual(accent.dark, dark, "\(domain)")
            XCTAssertEqual(accent.mineral, mineral, "\(domain)")
            XCTAssertEqual(Self.hex(accent.color, dark: true), dark)
            XCTAssertEqual(Self.hex(accent.color, dark: false), mineral)
        }
        let domainFamilies = EvidenceDomain.allCases.filter { $0 != .timeline }.map(\.accent.name)
        XCTAssertEqual(Set(domainFamilies).count, 8, "Option A: eight distinct domain colors")
    }

    func testEnergyOrangeUsesTheSharedOrangeInk() {
        XCTAssertEqual(Self.hex(PhysiqueOSTheme.redesignOrangeInk, dark: true), EvidenceAccent.orange.dark)
        XCTAssertEqual(Self.hex(PhysiqueOSTheme.redesignOrangeInk, dark: false), EvidenceAccent.orange.mineral)
        XCTAssertEqual(Self.hex(PhysiqueOSTheme.mealBreakfast, dark: true), EvidenceAccent.orange.dark, "Dark keeps the approved Option A orange")
    }

    // MARK: Shared surfaces

    func testEveryEvidenceFamilySharesOneNeutralSurfaceHierarchy() {
        for family in [EvidenceFamily.training, .daily, .weight, .record] {
            let c = family.palette
            let slots: [(String, Color)] = [
                ("page", c.page), ("surface", c.surface), ("surface2", c.surface2), ("surface3", c.surface3),
                ("line", c.line), ("ink", c.ink), ("muted", c.muted), ("quiet", c.quiet),
            ]
            for (slot, color) in slots {
                let pair = EvidenceSurfaces.hex[slot]!
                XCTAssertEqual(Self.hex(color, dark: true), pair.dark, "\(family) \(slot) dark")
                XCTAssertEqual(Self.hex(color, dark: false), pair.mineral, "\(family) \(slot) mineral")
            }
        }
        typealias S = EvidenceLockedStyle
        let locked: [(String, Color)] = [
            ("page", S.canvas), ("surface", S.surface), ("surface2", S.surface2), ("line", S.line),
            ("ink", S.ink), ("muted", S.sub), ("quiet", S.muted),
        ]
        for (slot, color) in locked {
            let pair = EvidenceSurfaces.hex[slot]!
            XCTAssertEqual(Self.hex(color, dark: true), pair.dark, "Hub/Timeline \(slot)")
            XCTAssertEqual(Self.hex(color, dark: false), pair.mineral, "Hub/Timeline \(slot)")
        }
    }

    func testTrainingTealSurfaceWashIsGone() {
        let retired: Set<UInt32> = [0x071416, 0x0D2325, 0x102B2C, 0x153737, 0x294344, 0xE3ECE7, 0xD4E5DE,
                                    0x061219, 0x102A34, 0x153641, 0x0B222B, 0xE6F0EC]
        for family in [EvidenceFamily.training, .daily] {
            let c = family.palette
            for color in [c.page, c.surface, c.surface2, c.surface3, c.line] {
                XCTAssertFalse(retired.contains(Self.hex(color, dark: true)), "\(family) dark tinted surface")
                XCTAssertFalse(retired.contains(Self.hex(color, dark: false)), "\(family) mineral tinted surface")
            }
        }
    }

    func testNoLegacyLimeOrOliveEvidenceAccentSurvives() {
        let legacy: Set<UInt32> = [0xB9E467, 0x467221]
        let domains: [EvidenceDomain?] = [nil] + EvidenceDomain.allCases.map { Optional($0) }
        for family in [EvidenceFamily.training, .daily, .weight, .record] {
            for domain in domains {
                let c = EvidenceMetrics(family: family, domain: domain).c
                for color in [c.accent, c.green] {
                    XCTAssertFalse(legacy.contains(Self.hex(color, dark: true)), "\(family) \(String(describing: domain))")
                    XCTAssertFalse(legacy.contains(Self.hex(color, dark: false)), "\(family) \(String(describing: domain))")
                }
            }
        }
        XCTAssertEqual(Self.hex(EvidencePalette.weight.green, dark: true), 0x68D391, "Weight harness lime green → Evidence semantic green")
    }

    func testMetricsApplyThePageDomainAccent() {
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .weight, domain: .energy).c.accent, dark: false), 0x9A4C10)
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .weight, domain: .recovery).c.accent, dark: true), 0x3BD2CA)
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .record, domain: .photos).c.accent, dark: true), 0xF472B6)
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .daily, domain: .activity).c.accent, dark: false), 0x925500)
        XCTAssertEqual(EvidenceMetrics(family: .training).domain, .training, "Training implies its domain")
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .training).c.accent, dark: true), 0xAA98FF)
        XCTAssertNil(EvidenceMetrics(family: .record).domain)
        XCTAssertEqual(Self.hex(EvidenceMetrics(family: .record).c.accent, dark: true), EvidenceAccent.neutral.dark, "no domain renders neutral, never lime")
    }

    // MARK: Semantic data colors

    func testNutritionMacroAndMealColorsArePreserved() {
        let macros: [(NutritionEvidenceMacro, UInt32, UInt32)] = [
            (.calories, 0x7BDBA7, 0x277B51), (.protein, 0xFB7185, 0xB83C57),
            (.carbohydrates, 0xFBBF24, 0x9D6808), (.fat, 0x38BDF8, 0x14769F),
        ]
        for (macro, dark, mineral) in macros {
            XCTAssertEqual(Self.hex(macro.color, dark: true), dark, macro.label)
            XCTAssertEqual(Self.hex(macro.color, dark: false), mineral, macro.label)
        }
        let c = EvidenceMetrics(family: .daily, domain: .nutrition).c
        XCTAssertEqual(Self.hex(c.breakfast, dark: true), 0xF7CF7B)
        XCTAssertEqual(Self.hex(c.lunch, dark: true), 0x7BD7C8)
        XCTAssertEqual(Self.hex(c.dinner, dark: true), 0xB69CF3)
        XCTAssertEqual(Self.hex(c.snacks, dark: true), 0xFB9C8C)
    }

    func testEnergyIntakeAndExpenditureSeriesArePreservedAndDistinctFromTheAccent() {
        let c = EvidenceMetrics(family: .weight, domain: .energy).c
        XCTAssertEqual(Self.hex(c.amber, dark: true), 0xF4B860, "Intake")
        XCTAssertEqual(Self.hex(c.amber, dark: false), 0xAD641C, "Intake")
        XCTAssertEqual(Self.hex(c.blue, dark: true), 0x6BB7FF, "Estimated expenditure")
        XCTAssertEqual(Self.hex(c.blue, dark: false), 0x246FAD, "Estimated expenditure")
        for dark in [true, false] {
            XCTAssertNotEqual(Self.hex(c.accent, dark: dark), Self.hex(c.amber, dark: dark))
            XCTAssertNotEqual(Self.hex(c.accent, dark: dark), Self.hex(c.blue, dark: dark))
        }
    }

    func testWeightTrendAndDEXAMarkerStayDistinct() {
        let c = EvidenceMetrics(family: .weight, domain: .weight).c
        XCTAssertEqual(Self.hex(c.blue, dark: true), 0x6BB7FF, "Weight line")
        XCTAssertEqual(Self.hex(c.purple, dark: true), 0xB68CFF, "DEXA marker")
        XCTAssertEqual(Self.hex(c.purple, dark: false), 0x7350AF, "DEXA marker")
        let dexa = EvidenceMetrics(family: .record, domain: .dexa).c
        XCTAssertEqual(Self.hex(dexa.green, dark: true), 0x68D391, "DEXA core trend")
        XCTAssertEqual(Self.hex(dexa.amber, dark: true), 0xF4B860, "DEXA fat mass")
    }

    func testSleepSeriesAndStagesArePreserved() {
        let stages: [(Color, UInt32, UInt32)] = [
            (SleepPalette.total, 0x5DD5CF, 0x167D78), (SleepPalette.deep, 0x6F86FF, 0x4357C5),
            (SleepPalette.core, 0x55AEF5, 0x2D78AD), (SleepPalette.rem, 0xB184F5, 0x7954B1),
            (SleepPalette.awake, 0xF0A45F, 0xB66B2D),
        ]
        for (color, dark, mineral) in stages {
            XCTAssertEqual(Self.hex(color, dark: true), dark)
            XCTAssertEqual(Self.hex(color, dark: false), mineral)
        }
    }

    // MARK: Timeline

    func testTimelineUsesDomainIdentityOnlyForDomainEvents() {
        let domainEvents: [String: EvidenceDomain] = [
            "Workout": .training, "Daily Activity": .activity, "Weight": .weight, "Progress Photo": .photos, "DEXA": .dexa,
        ]
        for (type, domain) in domainEvents {
            XCTAssertEqual(TimelineIdentity.kind(type: type, tone: .primary), .domain(domain), type)
        }
        for type in ["Daily Briefing", "Daily Check-In", "Analysis", "Protocol", "Evidence Upload"] {
            XCTAssertEqual(TimelineIdentity.kind(type: type, tone: .primary), .neutral, type)
        }
        XCTAssertEqual(TimelineIdentity.kind(type: "Evidence Upload", tone: .danger), .danger, "upload failure stays danger red")
    }

    // MARK: Hub

    func testHubCompositionIsUnchanged() {
        let ids = ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "timeline", "recovery", "health-metrics"]
        let streams = ids.map {
            EvidenceStreamSummary(id: $0, title: $0, metric: "", trend: "", lastUpdated: nil, status: .available, tone: .primary, destination: .progressStream(streamId: $0))
        }
        let presented = EvidenceHubPresentation.lockedStreams(streams)
        XCTAssertEqual(presented.map(\.id), ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "timeline"])
        for stream in presented {
            XCTAssertEqual(stream.destination, .progressStream(streamId: stream.id))
            XCTAssertNotNil(EvidenceDomain(streamId: stream.id), "every presented Hub row has a real icon")
        }
    }

    // MARK: Contrast

    func testAccentTextAndIconContrastOnSharedSurfaces() {
        let pairs = EvidenceSurfaces.hex
        for domain in EvidenceDomain.allCases {
            let accent = domain.accent
            for (fg, dark) in [(accent.dark, true), (accent.mineral, false)] {
                let mode = dark ? "Dark" : "Mineral"
                let page = dark ? pairs["page"]!.dark : pairs["page"]!.mineral
                let card = dark ? pairs["surface"]!.dark : pairs["surface"]!.mineral
                XCTAssertGreaterThanOrEqual(Self.contrast(fg, page), 4.5, "\(domain) text on page (\(mode))")
                XCTAssertGreaterThanOrEqual(Self.contrast(fg, card), 4.5, "\(domain) text on card (\(mode))")
                let tile = Self.over(fg, page, alpha: dark ? 0.14 : 0.12)
                XCTAssertGreaterThanOrEqual(Self.contrast(fg, tile), 3.0, "\(domain) icon on its tile (\(mode))")
            }
        }
        XCTAssertGreaterThanOrEqual(Self.contrast(EvidenceAccent.orange.mineral, pairs["surface2"]!.mineral), 4.5, "Energy orange ink on the inset")
    }

    // MARK: Helpers

    static func hex(_ color: Color, dark: Bool) -> UInt32 {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (UInt32((r * 255).rounded()) << 16) | (UInt32((g * 255).rounded()) << 8) | UInt32((b * 255).rounded())
    }

    static func luminance(_ hex: UInt32) -> Double {
        func channel(_ v: UInt32) -> Double {
            let c = Double(v) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel((hex >> 16) & 0xFF) + 0.7152 * channel((hex >> 8) & 0xFF) + 0.0722 * channel(hex & 0xFF)
    }

    static func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let (la, lb) = (luminance(a), luminance(b))
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    static func over(_ fg: UInt32, _ bg: UInt32, alpha: Double) -> UInt32 {
        func mix(_ shift: UInt32) -> UInt32 {
            let f = Double((fg >> shift) & 0xFF), b = Double((bg >> shift) & 0xFF)
            return UInt32((f * alpha + b * (1 - alpha)).rounded()) << shift
        }
        return mix(16) | mix(8) | mix(0)
    }
}
