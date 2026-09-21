import XCTest
@testable import PhysiqueOS

/// Build 47: Photo processing UX. "Read Photo Briefing" is only actionable once the
/// Server reports the briefing published; pending is a useful state, not a 404; the
/// surfaces refresh on a bounded cadence and stop at terminal/exhaustion/leave; the
/// completed briefing has a deep link. Home persistence stays Server-owned.
@MainActor
final class PhotoProcessingUXTests: XCTestCase {
    // MARK: Bounded refresh cadence

    func testStandardScheduleIsBoundedAndNotAggressive() throws {
        let delays = ProcessingRefreshSchedule.standard.delays.map(Self.seconds)
        XCTAssertLessThanOrEqual(delays.count, 20, "hard ceiling on refreshes per run")
        XCTAssertGreaterThanOrEqual(try XCTUnwrap(delays.first), 3, "no sub-3-second polling")
        XCTAssertEqual(delays, delays.sorted(), "the cadence only widens")
        XCTAssertLessThanOrEqual(delays.reduce(0, +), 360, "a run ends within six minutes")
    }

    func testRefreshStopsAtTerminalStateAndDoesNotContinue() async {
        var calls = 0
        let result = await ProcessingRefresh.run(sleep: { _ in }) {
            calls += 1
            return calls == 3 ? .finished : .waiting
        }
        XCTAssertEqual(result, .finished)
        XCTAssertEqual(calls, 3)
    }

    func testRefreshEndsAtExhaustionWithExactlyTheScheduledAttempts() async {
        var calls = 0
        let schedule = ProcessingRefreshSchedule(delays: [.seconds(1), .seconds(2), .seconds(4)])
        let result = await ProcessingRefresh.run(schedule: schedule, sleep: { _ in }) {
            calls += 1
            return .waiting
        }
        XCTAssertEqual(result, .exhausted)
        XCTAssertEqual(calls, 3)
    }

    func testRefreshNeverRunsAfterTheViewLeaves() async {
        var calls = 0
        let result = await ProcessingRefresh.run(sleep: { _ in throw CancellationError() }) {
            calls += 1
            return .waiting
        }
        XCTAssertEqual(result, .cancelled)
        XCTAssertEqual(calls, 0)

        let task = Task { @MainActor in
            await ProcessingRefresh.run(sleep: { _ in }) { calls += 1; return .waiting }
        }
        task.cancel()
        let cancelled = await task.value
        XCTAssertEqual(cancelled, .cancelled)
        XCTAssertEqual(calls, 0, "a cancelled run refreshes nothing")
    }

    // MARK: Photo Briefing availability

    func testPhotoBriefingIsNotActionableJustBecauseAPhotoSessionExists() async {
        let briefings = ScriptedBriefingAPI([.pending])
        let model = PhotosHistoryViewModel(api: FixturePhotosAPI(), briefingAPI: briefings, refreshSchedule: .init(delays: []), sleep: { _ in })
        XCTAssertEqual(model.briefingAvailability, .unknown, "nothing is actionable before the Server answers")
        await model.load()
        XCTAssertNotNil(model.latestSetId, "a PhotoSession exists")
        XCTAssertEqual(model.briefingAvailability, .unknown)
        await model.watchPhotoBriefing(sessionId: model.latestSetId ?? "")
        XCTAssertEqual(model.briefingAvailability, .pending)
        XCTAssertNotEqual(model.briefingAvailability, .published(artifactId: "any"))
    }

    func testPendingRefreshesUntilPublishedThenCarriesTheDeepLinkTarget() async {
        let briefings = ScriptedBriefingAPI([.pending, .pending, .pending, .published(artifactId: "event_briefing_progress_photo_s1")])
        let model = PhotosHistoryViewModel(
            api: FixturePhotosAPI(), briefingAPI: briefings,
            refreshSchedule: .init(delays: Array(repeating: .seconds(1), count: 10)), sleep: { _ in }
        )
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .published(artifactId: "event_briefing_progress_photo_s1"))
        XCTAssertEqual(briefings.calls, 4, "one probe plus three refreshes; nothing after publication")
    }

    func testPublishedOnFirstProbeDoesNotPoll() async {
        let briefings = ScriptedBriefingAPI([.published(artifactId: "a")])
        let model = PhotosHistoryViewModel(api: FixturePhotosAPI(), briefingAPI: briefings, refreshSchedule: .standard, sleep: { _ in XCTFail("no wait expected") })
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .published(artifactId: "a"))
        XCTAssertEqual(briefings.calls, 1)
    }

    func testStillPendingAfterTheBoundedCadenceStopsWithoutAnError() async {
        let briefings = ScriptedBriefingAPI([.pending])
        let schedule = ProcessingRefreshSchedule(delays: [.seconds(1), .seconds(2)])
        let model = PhotosHistoryViewModel(api: FixturePhotosAPI(), briefingAPI: briefings, refreshSchedule: schedule, sleep: { _ in })
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .pending)
        XCTAssertEqual(briefings.calls, 3, "the first probe plus the two scheduled refreshes")
    }

    func testTransientProbeFailureShowsNothingButKeepsWaitingWithinTheBound() async {
        let briefings = ScriptedBriefingAPI([.unknown])
        let schedule = ProcessingRefreshSchedule(delays: [.seconds(1), .seconds(2)])
        let model = PhotosHistoryViewModel(api: FixturePhotosAPI(), briefingAPI: briefings, refreshSchedule: schedule, sleep: { _ in })
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .unknown, "a failed probe never claims pending or published")
        XCTAssertEqual(briefings.calls, 3, "still bounded")
    }

    func testTransientFailureMidPollKeepsPendingAndStillReachesPublished() async {
        let briefings = ScriptedBriefingAPI([.pending, .unknown, .pending, .published(artifactId: "a")])
        let model = PhotosHistoryViewModel(
            api: FixturePhotosAPI(), briefingAPI: briefings,
            refreshSchedule: .init(delays: Array(repeating: .seconds(1), count: 6)), sleep: { _ in }
        )
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .published(artifactId: "a"))
        XCTAssertEqual(briefings.calls, 4)
    }

    func testSandboxWithoutABriefingAPINeverProbes() async {
        let model = PhotosHistoryViewModel(api: FixturePhotosAPI())
        await model.watchPhotoBriefing(sessionId: "s1")
        XCTAssertEqual(model.briefingAvailability, .unknown)
    }

    // MARK: Log Processing refresh and completion

    func testLogProcessingClearsWhenTheServerFinishes() async {
        let api = ScriptedLogAPI([.processing, .processing, .clear])
        let model = LogViewModel(api: api)
        await model.load()
        XCTAssertNotNil(model.processingKey, "Processing shows after the first read")
        let first = await model.refreshWhileProcessing()
        XCTAssertEqual(first, .waiting)
        XCTAssertNotNil(model.processingKey)
        let second = await model.refreshWhileProcessing()
        XCTAssertEqual(second, .finished)
        XCTAssertNil(model.processingKey, "the stale Processing state is cleared")
        XCTAssertEqual(api.refreshes, 2, "refreshes use the uncached read, not the first load")
    }

    func testLogRefreshKeepsTheLastGoodStateOnATransientFailure() async {
        let api = ScriptedLogAPI([.processing, .failure])
        let model = LogViewModel(api: api)
        await model.load()
        let outcome = await model.refreshWhileProcessing()
        XCTAssertEqual(outcome, .waiting)
        guard case .loaded = model.state else { return XCTFail("a failed refresh must not blank the screen") }
    }

    func testLogWithNothingProcessingHasNoRefreshKey() async {
        let model = LogViewModel(api: ScriptedLogAPI([.clear]))
        await model.load()
        XCTAssertNil(model.processingKey)
    }

    // MARK: Source guards (structure that unit tests cannot observe)

    func testPhotoTilesAreNotNestedInsideOuterButtonsWhichSwallowRetry() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let history = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Evidence/PhotosHistoryView.swift"), encoding: .utf8)
        XCTAssertFalse(history.contains("Button { selectedPhotoSet = set } label: {\n                        HStack(alignment: .top, spacing: 14)"))
        let briefing = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Briefings/PhotoBriefingSections.swift"), encoding: .utf8)
        let grid = try XCTUnwrap(briefing.range(of: "private var photoGrid"))
        let gridSource = String(briefing[grid.lowerBound...].prefix(900))
        XCTAssertFalse(gridSource.contains("Button {"), "the briefing photo grid must not wrap tiles in a Button")
        XCTAssertTrue(gridSource.contains(".onTapGesture"))
    }

    func testReadPhotoBriefingIsGatedOnServerAvailabilityInProduction() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Evidence/PhotosHistoryView.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("event_briefing_progress_photo_"), "the convention id must not be constructed client-side")
        XCTAssertTrue(source.contains("case .published(let artifactId)"))
        XCTAssertTrue(source.contains("photos.briefing.pending"))
    }

    // MARK: Helpers

    private static func seconds(_ duration: Duration) -> Double {
        Double(duration.components.seconds)
    }
}

private final class ScriptedBriefingAPI: BriefingAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var script: [PhotoBriefingAvailability]
    private(set) var calls = 0

    /// Plays the script in order; the last entry repeats.
    init(_ script: [PhotoBriefingAvailability]) { self.script = script }

    func photoBriefingAvailability(sessionId: String) async -> PhotoBriefingAvailability { advance() }

    private func advance() -> PhotoBriefingAvailability {
        lock.lock(); defer { lock.unlock() }
        calls += 1
        return script.count > 1 ? script.removeFirst() : script[0]
    }

    func fetchHistory() async throws -> [BriefingHistoryRowReadModel] { [] }
    func fetchBriefing(artifactId: String) async throws -> BriefingReadModel? { nil }
    func fetchDEXAEvent(scanId: String) async throws -> BriefingReadModel? { nil }
    func fetchPhotoEvent(sessionId: String) async throws -> BriefingReadModel? { nil }
}

private final class ScriptedLogAPI: LogAPI, @unchecked Sendable {
    enum Step { case processing, clear, failure }
    private let lock = NSLock()
    private var script: [Step]
    private(set) var refreshes = 0

    init(_ script: [Step]) { self.script = script }

    func fetchLog() async throws -> LogReadModel { try next() }

    func refreshLog() async throws -> LogReadModel {
        countRefresh()
        return try next()
    }

    private func countRefresh() { lock.lock(); refreshes += 1; lock.unlock() }

    private func next() throws -> LogReadModel {
        lock.lock(); defer { lock.unlock() }
        let step = script.count > 1 ? script.removeFirst() : script[0]
        struct Failure: Error {}
        switch step {
        case .failure: throw Failure()
        case .clear: return Self.model(processing: [])
        case .processing: return Self.model(processing: [.init(id: "review-1", localDate: "2026-09-20", domain: "photos", label: "Progress Photos", status: "committing")])
        }
    }

    private static func model(processing: [ProcessingEvidenceReview]) -> LogReadModel {
        .init(localDate: "2026-09-20", loggedToday: [], pendingEvidenceReviews: [], processingEvidenceReviews: processing)
    }
}
