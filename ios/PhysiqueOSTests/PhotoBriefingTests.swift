import XCTest
@testable import PhysiqueOS

@MainActor
final class PhotoBriefingTests: XCTestCase {
    private func makeStore() -> BriefingSandboxStore { BriefingSandboxStore() }

    private struct PhotosFixtureFile: Codable { var sets: [PhotoSetFixture] }

    private func loadPhotoSetIds() throws -> Set<String> {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "PhotosFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let fixture = try JSONDecoder().decode(PhotosFixtureFile.self, from: data)
        return Set(fixture.sets.map(\.id))
    }

    // MARK: - Fixture decoding & identity

    func testFixtureDecodesBothPhotoEventBriefings() {
        let store = makeStore()
        let photoEvents = store.briefings.filter { $0.cadence == .event && $0.photo != nil }
        XCTAssertEqual(photoEvents.count, 2)
        XCTAssertTrue(photoEvents.contains { $0.id == "event_briefing_progress_photo_photo-set-fixture-005" })
        XCTAssertTrue(photoEvents.contains { $0.id == "event_briefing_progress_photo_photo-set-fixture-003" })
    }

    func testPhotoEventArtifactIdIsDerivedFromTheSessionId() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005"))
        XCTAssertEqual(event.photo?.photoSessionId, "photo-set-fixture-005")
        XCTAssertEqual(event.id, "event_briefing_progress_photo_\(event.photo?.photoSessionId ?? "")")
    }

    // MARK: - Shared identity: Photo Briefing and Progress Photos Evidence

    func testPhotoBriefingSessionIdsAreRealCanonicalPhotoSets() throws {
        let photoSetIds = try loadPhotoSetIds()
        let store = makeStore()
        for event in store.briefings.filter({ $0.photo != nil }) {
            let sessionId = try XCTUnwrap(event.photo?.photoSessionId)
            XCTAssertTrue(photoSetIds.contains(sessionId), "\(sessionId) must be a real Progress Photos Evidence set id, not a Briefing-only duplicate")
        }
    }

    func testPhotoBriefingViewIdsMatchProgressPhotosEvidenceViewIdsExactly() async throws {
        // Both surfaces must reference the SAME canonical pose-photo
        // identity — verified via the exact composite id format
        // (`"<setId>-<poseId>"`) both `PhotosEvidenceCalculator` and this
        // Briefing fixture use.
        let api = FixturePhotosAPI()
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let evidenceViewIds = Set(landing.history.flatMap { $0.views.map(\.id) })

        let store = makeStore()
        let currentEvent = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005")?.photo)
        for view in currentEvent.activeViews {
            XCTAssertTrue(evidenceViewIds.contains(view.id), "\(view.id) must match a real Progress Photos Evidence view id")
            XCTAssertEqual(view.id, "\(view.setId)-\(view.poseId.rawValue)")
        }
    }

    // MARK: - Goal/Phase attribution: frozen per artifact, differs by scan

    func testCurrentPhotoEventIsAttributedToBuildLeanMassPhase2() throws {
        let store = makeStore()
        let attribution = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005")?.attribution)
        XCTAssertEqual(attribution.goalId, "goal_fixture_build_lean_mass")
        XCTAssertEqual(attribution.phaseId, "phase_fixture_lean_mass_build")
    }

    func testOlderPhotoEventKeepsItsOwnVisibleAbsAttributionForever() throws {
        let store = makeStore()
        let attribution = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003")?.attribution)
        XCTAssertEqual(attribution.goalId, "goal_visible_abs_at_rest")
        XCTAssertNil(attribution.phaseId)
    }

    // MARK: - Multiple poses / missing-pose (new baseline) handling

    func testCurrentPhotoEventHasFourPosesIncludingANewBaseline() throws {
        let store = makeStore()
        let photo = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005")?.photo)
        XCTAssertEqual(photo.activeViews.count, 4)
        let newBaseline = try XCTUnwrap(photo.activeViews.first { $0.poseId == .sideRelaxed })
        XCTAssertTrue(newBaseline.establishesBaseline)
        XCTAssertEqual(newBaseline.comparisonStatus, "no_prior_matching_pose")
    }

    func testOrdinaryComparisonsExcludeTheNewBaselinePose() throws {
        let store = makeStore()
        let photo = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005")?.photo)
        XCTAssertEqual(photo.ordinaryComparisons.count, 3)
        XCTAssertFalse(photo.ordinaryComparisons.contains { $0.poseId == .sideRelaxed })
    }

    // MARK: - Comparison branch mutual exclusivity & journey baseline semantics

    func testCurrentPhotoEventUsesOrdinaryComparisonsNotCompletionExperience() throws {
        let store = makeStore()
        let photo = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005")?.photo)
        XCTAssertNil(photo.completionExperience)
        XCTAssertFalse(photo.ordinaryComparisons.isEmpty)
    }

    func testOlderPhotoEventUsesCompletionExperienceNotOrdinaryComparisons() throws {
        let store = makeStore()
        let photo = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003")?.photo)
        XCTAssertNotNil(photo.completionExperience)
        XCTAssertTrue(photo.ordinaryComparisons.isEmpty)
    }

    func testJourneyComparisonAnchorsToTheGoalsFirstUploadNotTheImmediatePriorSession() throws {
        let store = makeStore()
        let experience = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003")?.photo?.completionExperience)
        let journey = try XCTUnwrap(experience.journeyComparisons.first)
        XCTAssertEqual(journey.priorSetId, "photo-set-fixture-001")
        let recent = try XCTUnwrap(experience.recentComparisons.first)
        XCTAssertEqual(recent.priorSetId, "photo-set-fixture-002")
        // Two genuinely different baselines for the same current session.
        XCTAssertNotEqual(journey.priorSetId, recent.priorSetId)
    }

    func testCompletedDecisionMirrorsTheRealProductsInertNextGoalButton() throws {
        let store = makeStore()
        let decision = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003")?.photo?.completionExperience?.decision)
        XCTAssertEqual(decision.state, .completed)
        XCTAssertEqual(decision.nextGoalActionLabel, "Create Next Goal · Coming next")
    }

    // MARK: - Confidence: server-owned, present but never rendered on Detail

    func testPhotoConfidencePresentationDecodesCorrectly() throws {
        let store = makeStore()
        let confidence = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003")?.confidence)
        XCTAssertEqual(confidence.movementDirection, .increased)
        XCTAssertEqual(confidence.delta, 7)
        XCTAssertEqual(confidence.bandLabel, "High Confidence")
    }

    // MARK: - Revision / republication (shared mechanism)

    func testOlderPhotoEventDisclosesItsRevision() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003"))
        XCTAssertTrue(event.isRevised)
        XCTAssertEqual(event.replacedHistory.count, 1)
    }

    func testCurrentPhotoEventIsNotFlaggedAsRevised() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-005"))
        XCTAssertFalse(event.isRevised)
    }

    // MARK: - History: sensible titles, cadence badge disambiguation

    func testPhotoEventHistoryTitleUsesItsOwnHeroTitle() throws {
        let store = makeStore()
        let event = try XCTUnwrap(store.briefing(id: "event_briefing_progress_photo_photo-set-fixture-003"))
        XCTAssertEqual(event.historyTitle, "Visible abs at rest, confirmed.")
        XCTAssertEqual(event.historySubtitle, "Progress photos · Jul 18")
        XCTAssertEqual(event.displayCadenceLabel, "Photo Event Briefing")
    }

    func testDEXAEventDisplayCadenceLabelStaysDistinctFromPhoto() throws {
        let store = makeStore()
        let dexaEvent = try XCTUnwrap(store.briefing(id: "dexa_event_dexa-fixture-005"))
        XCTAssertEqual(dexaEvent.displayCadenceLabel, "DEXA Event Briefing")
    }

    func testHistoryIncludesBothPhotoEventBriefings() {
        let store = makeStore()
        let ids = Set(store.history.map(\.id))
        XCTAssertTrue(ids.contains("event_briefing_progress_photo_photo-set-fixture-005"))
        XCTAssertTrue(ids.contains("event_briefing_progress_photo_photo-set-fixture-003"))
    }

    // MARK: - Home precedence: DEXA vs Photo, and Photo's own active window

    func testActivePhotoEventBeatsWeeklyAndMidweekWithinItsWindow() {
        let weekly = makeWeekly(id: "w", generatedAt: "2026-09-03T09:00:00.000Z")
        let photo = makePhotoEvent(id: "p", generatedAt: "2026-09-04T09:00:00.000Z", eventDate: "2026-09-04")
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, photo], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "p")
    }

    func testDEXAEventBeatsPhotoEventWhenGeneratedMoreRecently() {
        let photo = makePhotoEvent(id: "p", generatedAt: "2026-09-04T08:00:00.000Z", eventDate: "2026-09-04")
        let dexa = makeDEXAEvent(id: "d", generatedAt: "2026-09-04T09:00:00.000Z")
        let latest = BriefingSandboxStore.latestForHome(from: [photo, dexa], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "d")
    }

    func testPhotoEventBeatsDEXAEventWhenGeneratedMoreRecentlyAndStillActive() {
        let dexa = makeDEXAEvent(id: "d", generatedAt: "2026-09-04T08:00:00.000Z")
        let photo = makePhotoEvent(id: "p", generatedAt: "2026-09-04T09:00:00.000Z", eventDate: "2026-09-04")
        let latest = BriefingSandboxStore.latestForHome(from: [dexa, photo], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "p")
    }

    /// The subtle, verified-against-source precedence rule: the routing
    /// function only ever receives ONE event candidate (the single
    /// most-recently-generated un-consumed one). If that candidate is a
    /// Photo event outside its own active window, Home does NOT fall back
    /// to an older, still-technically-active DEXA event — it falls
    /// through straight to Monthly/Weekly/Midweek.
    func testExpiredPhotoEventDoesNotFallBackToAnOlderActiveDEXAEvent() {
        let dexa = makeDEXAEvent(id: "d", generatedAt: "2026-09-01T08:00:00.000Z")
        let expiredPhoto = makePhotoEvent(id: "p", generatedAt: "2026-09-02T09:00:00.000Z", eventDate: "2026-09-02")
        let weekly = makeWeekly(id: "w", generatedAt: "2026-09-03T09:00:00.000Z")
        // "Now" is several days after the photo event's own date/publish —
        // its active window has closed, even though DEXA (generated
        // earlier) would otherwise still be "active" on its own.
        let latest = BriefingSandboxStore.latestForHome(from: [dexa, expiredPhoto, weekly], now: pacificNoon(2026, 9, 10))
        XCTAssertEqual(latest?.id, "w")
    }

    func testPhotoEventLatePublishGraceWindowStaysActiveOneDayAfterItsOwnDate() {
        // Event date yesterday, but generated (published) today — verified
        // real "late publish" grace window.
        let photo = makePhotoEvent(id: "p", generatedAt: "2026-09-04T10:00:00.000Z", eventDate: "2026-09-03")
        let latest = BriefingSandboxStore.latestForHome(from: [photo], now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "p")
    }

    func testPhotoEventOlderThanTheLatePublishWindowIsInactive() {
        // Event date two days ago, generated same day as the event — the
        // grace window only covers a same-day publish of yesterday's
        // event, not this.
        let photo = makePhotoEvent(id: "p", generatedAt: "2026-09-02T10:00:00.000Z", eventDate: "2026-09-02")
        XCTAssertNil(BriefingSandboxStore.latestForHome(from: [photo], now: pacificNoon(2026, 9, 4)))
    }

    func testHomeLatestFromBundledFixtureStillShowsTheActiveDEXAEventOnRealToday() {
        // Regression: adding Photo Event fixtures must not silently
        // override the DEXA-vs-everything Simulator-verified behavior from
        // the prior task, since the Photo fixture's own generatedAt
        // predates the DEXA event's.
        let store = makeStore()
        let latest = store.latestForHome(now: pacificNoon(2026, 9, 4))
        XCTAssertEqual(latest?.id, "dexa_event_dexa-fixture-005")
    }

    // MARK: - Morning Check-In reconciliation: DEXA/Photo/event excluded (unchanged)

    func testEventCadenceRemainsStructurallyExcludedFromBriefingReconciliation() {
        XCTAssertEqual(BriefingReconciliationCadence.allCases.map(\.rawValue).sorted(), ["midweek", "monthly", "weekly"])
    }

    // MARK: - Timezone presentation

    func testPhotoEventDateFormattingIsUTCAnchored() {
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-08-30"), "Aug 30, 2026")
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-07-18"), "Jul 18, 2026")
    }

    // MARK: - Test helpers

    private func pacificNoon(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func makePhotoEvent(id: String, generatedAt: String, eventDate: String, consumedAt: String? = nil) -> BriefingReadModel {
        let photo = PhotoBriefingContent(
            photoSessionId: "test-session", eventDate: eventDate, completionLabel: "1/1 complete", weightLabel: "No same-day weight",
            poseLabels: ["Front Relaxed"], conditionsSummary: "Test conditions.", activeViews: [],
            heroTitle: "Test hero", heroBody: "Test body", snapshotTitle: "Test session",
            progressTitle: "What Changed", progressBody: "Test progress body", ordinaryComparisons: [],
            interpretationTitle: "Test interpretation", interpretationParagraphs: [], coachInsightBody: "Test coach insight",
            nextMilestoneLabel: nil, completionExperience: nil
        )
        return BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|event|\(id)"), cadence: .event,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: eventDate, endDate: eventDate, briefingDate: eventDate, relativeLabel: "Photo session", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: consumedAt,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil, photo: photo
        )
    }

    private func makeDEXAEvent(id: String, generatedAt: String, consumedAt: String? = nil) -> BriefingReadModel {
        BriefingReadModel(
            id: id, occurrence: BriefingOccurrenceIdentity(value: "test|event|\(id)"), cadence: .event,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(id: "w_\(id)", startDate: "2026-01-01", endDate: "2026-01-01", briefingDate: "2026-01-01", relativeLabel: "DEXA scan", timeZone: "America/Los_Angeles"),
            lifecycleState: .published,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil, revisionProvenance: nil, replacedHistory: [], eventConsumedAt: consumedAt,
            weekly: nil, midweek: nil, monthly: nil, dexa: nil, photo: nil
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
            weekly: nil, midweek: nil, monthly: nil, dexa: nil, photo: nil
        )
    }
}
