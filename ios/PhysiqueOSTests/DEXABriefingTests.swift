import XCTest
@testable import PhysiqueOS

@MainActor
final class DEXABriefingTests: XCTestCase {
    private func makeStore() -> BriefingSandboxStore { BriefingSandboxStore() }

    private struct DEXAFixtureFile: Codable { var scans: [DEXACanonicalScanFixture] }

    private func loadDEXAScanIds() throws -> Set<String> {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "DEXAFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let fixture = try JSONDecoder().decode(DEXAFixtureFile.self, from: data)
        return Set(fixture.scans.map(\.id))
    }

    // MARK: - Fixture decoding & identity

    func testFixtureDecodesBothDEXAEventBriefings() {
        let store = makeStore()
        // A later task added Photo Event Briefings sharing the same
        // `.event` cadence — filter to DEXA's own content specifically.
        let events = store.briefings.filter { $0.cadence == .event && $0.dexa != nil }
        XCTAssertEqual(events.count, 2)
        XCTAssertTrue(events.contains { $0.id == "dexa_event_dexa-fixture-005" })
        XCTAssertTrue(events.contains { $0.id == "dexa_event_dexa-fixture-003" })
    }

    func testDEXAEventArtifactIdIsDerivedFromTheScanId() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005"))
        XCTAssertEqual(event.dexa?.scanId, "dexa-fixture-005")
        XCTAssertEqual(event.id, "dexa_event_\(event.dexa?.scanId ?? "")")
    }

    // MARK: - DEXA Evidence relationship: shared scan identity, no fake duplicate

    func testDEXABriefingScanIdsAreRealCanonicalDEXAEvidenceScans() throws {
        let dexaScanIds = try loadDEXAScanIds()
        let store = makeStore()
        for event in store.briefings.filter({ $0.cadence == .event && $0.dexa != nil }) {
            let scanId = try XCTUnwrap(event.dexa?.scanId)
            XCTAssertTrue(dexaScanIds.contains(scanId), "\(scanId) must be a real DEXA Evidence scan id, not a Briefing-only duplicate")
            if let priorScanId = event.dexa?.priorScanId {
                XCTAssertTrue(dexaScanIds.contains(priorScanId), "\(priorScanId) must also be a real DEXA Evidence scan id")
            }
        }
    }

    // MARK: - Goal/Phase attribution: frozen per artifact, differs by scan

    func testCurrentDEXAEventIsAttributedToBuildLeanMassPhase2() throws {
        let store = makeStore()
        let attribution = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.attribution)
        XCTAssertEqual(attribution.goalId, "goal_fixture_build_lean_mass")
        XCTAssertEqual(attribution.phaseId, "phase_fixture_lean_mass_build")
    }

    func testOlderDEXAEventKeepsItsOwnVisibleAbsAttributionForever() throws {
        let store = makeStore()
        let attribution = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003")?.attribution)
        XCTAssertEqual(attribution.goalId, "goal_visible_abs_at_rest")
        XCTAssertNil(attribution.phaseId)
    }

    // MARK: - Prior-scan comparison fields

    func testCurrentDEXAEventCarriesPriorScanComparisonFields() throws {
        let store = makeStore()
        let dexa = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.dexa)
        XCTAssertEqual(dexa.priorScanId, "dexa-fixture-004")
        XCTAssertEqual(dexa.daysBetweenScans, 14)
        XCTAssertFalse(dexa.isBaselineScan)
    }

    func testSyntheticBaselineDEXAEventHasNilPriorScanId() {
        let dexa = DEXABriefingContent(
            scanId: "dexa-fixture-001", priorScanId: nil, scanDate: "2026-05-24", priorScanDate: nil, daysBetweenScans: 0,
            hero: DEXABriefingHero(title: "First scan on file.", body: "A baseline for everything that follows.", results: [], milestones: []),
            snapshot: DEXABriefingSnapshot(scanDate: "2026-05-24", daysBetweenScans: 0, weightLb: "185.5 lb", bodyFatPercent: "14.8%", fatMassLb: "27.4 lb", leanMassLb: "154.8 lb", restingMetabolicRateKcal: nil),
            progress: DEXAProgressSection(headline: [], regionalFat: [], regionalLean: [], supplemental: [], timeline: DEXACutTimeline(timelineLabel: "Available Body-Composition History", isSimulated: false, baselineDate: "2026-05-24", currentDate: "2026-05-24", elapsedDays: 0, scans: [], metrics: [], summary: "A single scan on file — nothing to compare yet.")),
            interpretation: DEXAInterpretationSection(opening: "A starting point.", fatLoss: "No comparison available yet.", leanMass: "Baseline only.", regional: "Baseline only.", phaseMeaning: nil, stoodOut: nil, supportingEvidence: "One scan on file.", uncertainty: "Nothing to compare against yet."),
            coachInsight: DEXACoachInsightSection(biggestWin: "A real baseline is now on file.", protect: "Nothing to protect yet.", watch: "The next scan.", next: "Keep logging."),
            phaseReview: nil, goalCompletionHandoff: nil
        )
        XCTAssertTrue(dexa.isBaselineScan)
    }

    // MARK: - Body composition / regional metrics

    func testCurrentDEXAEventSnapshotFormatsBodyCompositionFields() throws {
        let store = makeStore()
        let snapshot = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.dexa?.snapshot)
        XCTAssertEqual(snapshot.bodyFatPercent, "9.4%")
        XCTAssertEqual(snapshot.leanMassLb, "159.5 lb")
        XCTAssertEqual(snapshot.fatMassLb, "16.9 lb")
        XCTAssertEqual(snapshot.restingMetabolicRateKcal, "2240")
    }

    func testRegionalFatAndLeanMetricsAreLiveAndNonEmpty() throws {
        let store = makeStore()
        let progress = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.dexa?.progress)
        XCTAssertEqual(progress.regionalFat.count, 5)
        XCTAssertEqual(progress.regionalLean.count, 5)
        XCTAssertEqual(progress.regionalFat.first { $0.region == "Trunk" }?.delta, "+0.5 lb")
        XCTAssertEqual(progress.regionalFat.first { $0.region == "Android" }?.delta, "+0.1 lb")
        XCTAssertEqual(progress.regionalLean.first { $0.region == "Gynoid" }?.delta, "+0.2 lb")
    }

    func testCutTimelineUsesThePhaseBaselineNotTheImmediatePriorScanWhenTheyDiffer() throws {
        // Older event: "Since Last Scan" uses Jun 20 (immediate prior), but
        // the Cut Timeline baseline is May 24 (earliest available scan for
        // this phase-less goal) — genuinely different baselines.
        let store = makeStore()
        let dexa = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003")?.dexa)
        XCTAssertEqual(dexa.priorScanDate, "2026-06-20")
        XCTAssertEqual(dexa.progress.timeline.baselineDate, "2026-05-24")
        XCTAssertNotEqual(dexa.priorScanDate, dexa.progress.timeline.baselineDate)
    }

    // MARK: - Confidence: server-owned, present but never rendered on Detail

    func testDEXAConfidencePresentationIncreaseAndDecrease() throws {
        let store = makeStore()
        let decreased = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.confidence)
        XCTAssertEqual(decreased.movementDirection, .decreased)
        XCTAssertEqual(decreased.delta, -7)

        let increased = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003")?.confidence)
        XCTAssertEqual(increased.movementDirection, .increased)
        XCTAssertEqual(increased.delta, 9)
        XCTAssertEqual(increased.bandLabel, "High Confidence")
    }

    // MARK: - Revision / republication (shared mechanism)

    func testCurrentDEXAEventDisclosesItsRevision() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005"))
        XCTAssertTrue(event.isRevised)
        XCTAssertEqual(event.replacedHistory.count, 1)
    }

    func testOlderDEXAEventIsNotFlaggedAsRevised() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003"))
        XCTAssertFalse(event.isRevised)
    }

    // MARK: - History: DEXA events get sensible native titles, not the raw id

    func testDEXAEventHistoryTitleUsesItsOwnHeroTitleNotTheRawArtifactId() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003"))
        XCTAssertEqual(event.historyTitle, "Body composition confirms Visible Abs at Rest.")
        XCTAssertFalse(event.historyTitle.hasPrefix("dexa_event_"))
        XCTAssertEqual(event.historySubtitle, "DEXA scan · Jul 18")
    }

    func testHistoryIncludesBothDEXAEventBriefings() {
        let store = makeStore()
        let ids = Set(store.history.map(\.id))
        XCTAssertTrue(ids.contains("dexa_event_dexa-fixture-005"))
        XCTAssertTrue(ids.contains("dexa_event_dexa-fixture-003"))
    }

    // MARK: - Home latest-Briefing precedence: Event beats everything

    func testActiveDEXAEventBeatsMonthlyEvenOnMonthlysOwnDeliveryDay() {
        let monthly = makeMonthly(id: "m", generatedAt: "2026-11-01T09:00:00.000Z", briefingDate: "2026-11-01")
        let event = makeEvent(id: "e", generatedAt: "2026-11-01T08:00:00.000Z", consumedAt: nil)
        let latest = BriefingSandboxStore.latestForHome(from: [monthly, event], now: pacificNoon(2026, 11, 1))
        XCTAssertEqual(latest?.id, "e")
    }

    func testActiveDEXAEventBeatsWeeklyAndMidweekRegardlessOfRecency() {
        let weekly = makeWeekly(id: "w", generatedAt: "2026-09-03T09:00:00.000Z")
        let midweek = makeMidweek(id: "mw", generatedAt: "2026-09-02T09:00:00.000Z")
        let event = makeEvent(id: "e", generatedAt: "2026-08-20T09:00:00.000Z", consumedAt: nil)
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, midweek, event], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "e")
    }

    func testConsumedDEXAEventFallsThroughToOrdinaryCadencePrecedence() {
        let weekly = makeWeekly(id: "w", generatedAt: "2026-09-03T09:00:00.000Z")
        let event = makeEvent(id: "e", generatedAt: "2026-08-20T09:00:00.000Z", consumedAt: "2026-08-20T12:00:00.000Z")
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, event], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "w")
    }

    func testHomeLatestFromBundledFixtureOnRealDeviceTodayShowsTheActiveDEXAEvent() {
        // "Today" (this task's real device date) is well after the Aug 31
        // publish of the active, unconsumed DEXA event, and well before
        // the fixture's own far-future Monthly/Weekly collision entries —
        // verified real precedence means the event wins over the Sep 2
        // Midweek Briefing the prior task's Simulator pass showed.
        let store = makeStore()
        let latest = store.latestForHome(now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "dexa_event_dexa-fixture-005")
    }

    func testOlderConsumedDEXAEventNeverWinsHomeEvenHistorically() {
        let store = makeStore()
        // Even at a moment right after the older event's own publish, it
        // is already consumed and must not win.
        let latest = store.latestForHome(now: pacificNoon(2026, 7, 20))
        XCTAssertNotEqual(latest?.id, "dexa_event_dexa-fixture-003")
    }

    // MARK: - Morning Check-In reconciliation: DEXA/event excluded (unchanged)

    func testEventCadenceIsStructurallyExcludedFromBriefingReconciliation() {
        // `BriefingReconciliationCadence` has no `.event` case at all —
        // verified against source (`CADENCE_REVISIONS = new Set(["weekly",
        // "midweek", "monthly"])`, `BriefingReconciliationEnqueueService.js`).
        // This is a compile-time guarantee; pin the exact allowlist so a
        // future edit can't silently add `.event` without this failing.
        XCTAssertEqual(BriefingReconciliationCadence.allCases.map(\.rawValue).sorted(), ["midweek", "monthly", "weekly"])
    }

    // MARK: - Actions/navigation: only existing, real destinations

    func testGoalCompletionHandoffRoutesToTheExistingPhotoUploadDestinationNotANewOne() throws {
        let store = makeStore()
        let handoff = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003")?.dexa?.goalCompletionHandoff)
        XCTAssertEqual(handoff.actionDestination, .photoUpload)
    }

    func testCurrentDEXAEventHasNoGoalCompletionHandoffMidPhase() throws {
        let store = makeStore()
        let dexa = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.dexa)
        XCTAssertNil(dexa.goalCompletionHandoff)
    }

    // MARK: - Phase Review: always read-only, recorded-decision or absent

    func testOlderDEXAEventPhaseReviewIsARecordedReadOnlyDecision() throws {
        let store = makeStore()
        let review = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-003")?.dexa?.phaseReview)
        XCTAssertEqual(review.recordedDecisionLabel, "Began Build Lean Mass")
        XCTAssertEqual(review.options.count, 2)
    }

    func testCurrentDEXAEventHasNoPendingPhaseReview() throws {
        let store = makeStore()
        let dexa = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005")?.dexa)
        XCTAssertNil(dexa.phaseReview)
    }

    // MARK: - Timezone presentation

    func testDEXAScanDateFormattingIsUTCAnchored() {
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-07-18"), "Jul 18, 2026")
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-08-30"), "Aug 30, 2026")
    }

    // MARK: - Test helpers

    private func pacificNoon(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func makeEvent(id: String, generatedAt: String, consumedAt: String?) -> BriefingReadModel {
        BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|event|\(id)"), cadence: .event,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: "2026-01-01", endDate: "2026-01-01", briefingDate: "2026-01-01", relativeLabel: "DEXA scan", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: consumedAt,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil
        )
    }

    private func makeMonthly(id: String, generatedAt: String, briefingDate: String) -> BriefingReadModel {
        BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|scheduled|monthly|\(id)"), cadence: .monthly,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: "2026-01-01", endDate: "2026-01-31", briefingDate: briefingDate, relativeLabel: "test month", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: nil,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil
        )
    }

    private func makeWeekly(id: String, generatedAt: String) -> BriefingReadModel {
        BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|scheduled|weekly|\(id)"), cadence: .weekly,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: "2026-01-01", endDate: "2026-01-07", briefingDate: "2026-01-08", relativeLabel: "test week", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: nil,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil
        )
    }

    private func makeMidweek(id: String, generatedAt: String) -> BriefingReadModel {
        BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|scheduled|midweek|\(id)"), cadence: .midweek,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: "2026-01-01", endDate: "2026-01-03", briefingDate: "2026-01-04", relativeLabel: "test window", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: nil,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil
        )
    }
}
