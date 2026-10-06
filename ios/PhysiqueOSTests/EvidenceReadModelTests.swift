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
