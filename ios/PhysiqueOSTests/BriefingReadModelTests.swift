import XCTest
@testable import PhysiqueOS

@MainActor
final class BriefingReadModelTests: XCTestCase {
    func testEveryBriefingKeepsItsCompleteEditorialSectionInventory() {
        XCTAssertEqual(WeeklyBriefingSections.sectionInventory, ["Integrated Lead", "Energy", "Weight", "Photos", "Training", "Body Composition", "Coach's Take"])
        XCTAssertEqual(MidweekBriefingSections.sectionInventory, ["Integrated Lead", "Energy", "Weight", "Training", "Body Composition", "Coach's Take"])
        XCTAssertEqual(Array(DEXABriefingSections.sectionInventory.suffix(4)), ["What This Scan Means", "Coach's Insight", "Phase Review", "Goal Completion Handoff"])
        XCTAssertEqual(PhotoBriefingSections.sectionInventory, ["Hero", "Snapshot", "Progress", "Interpretation", "Coach's Insight", "Completion Decision"])
    }

    func testMonthlyCompositionRemainsADistinctLongFormZineNotAWeeklyReskin() {
        XCTAssertEqual(MonthlyBriefingSections.sectionInventory, ["Integrated Lead", "Goal Milestone", "Training Progress", "Energy Evolution", "New Baseline", "What Changed", "Defining Moments", "Month Ahead"])
        XCTAssertNotEqual(MonthlyBriefingSections.sectionInventory, WeeklyBriefingSections.sectionInventory)
        XCTAssertGreaterThanOrEqual(MonthlyBriefingSections.sectionInventory.count, 8)
    }
    private func makeStore() -> BriefingSandboxStore { BriefingSandboxStore() }

    // MARK: - Fixture decoding

    func testFixtureDecodesEveryBundledBriefing() {
        let store = makeStore()
        // 9 recurring-cadence artifacts (this task) + 2 DEXA Event
        // Briefings + 2 Photo Event Briefings (later tasks) sharing the
        // same fixture provider.
        XCTAssertEqual(store.briefings.count, 13)
        let ids = Set(store.briefings.map(\.id))
        XCTAssertTrue(ids.contains("weekly_briefing_2026-06-28_2026-07-04"))
        XCTAssertTrue(ids.contains("weekly_briefing_2026-07-12_2026-07-18"))
        XCTAssertTrue(ids.contains("weekly_briefing_2026-07-19_2026-07-25"))
        XCTAssertTrue(ids.contains("midweek_briefing_2026-08-02_2026-08-04"))
        XCTAssertTrue(ids.contains("weekly_briefing_2026-08-23_2026-08-29"))
        XCTAssertTrue(ids.contains("midweek_briefing_2026-08-30_2026-09-01"))
        XCTAssertTrue(ids.contains("monthly_briefing_2026-08"))
        XCTAssertTrue(ids.contains("weekly_briefing_2026-10-26_2026-11-01"))
        XCTAssertTrue(ids.contains("monthly_briefing_2026-10"))
        XCTAssertTrue(ids.contains("dexa_event_dexa-fixture-005"))
        XCTAssertTrue(ids.contains("dexa_event_dexa-fixture-003"))
        XCTAssertTrue(ids.contains("event_briefing_progress_photo_photo-set-fixture-005"))
        XCTAssertTrue(ids.contains("event_briefing_progress_photo_photo-set-fixture-003"))
    }

    func testBriefingLookupByStableId() {
        let store = makeStore()
        XCTAssertEqual(store.briefing(id: "monthly_briefing_2026-08")?.cadence, .monthly)
        XCTAssertNil(store.briefing(id: "does_not_exist"))
    }

    // MARK: - Weekly content: complete verified section set

    func testWeeklyContentDecodesEveryRenderedSection() throws {
        let store = makeStore()
        let briefing = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-07-12_2026-07-18"))
        let weekly = try XCTUnwrap(briefing.weekly)
        XCTAssertNotNil(weekly.energy)
        XCTAssertNotNil(weekly.weight)
        XCTAssertNotNil(weekly.photos)
        XCTAssertNotNil(weekly.training)
        XCTAssertNotNil(weekly.bodyComposition)
        XCTAssertEqual(weekly.bodyComposition?.scanDate, "2026-07-18")
        XCTAssertFalse(weekly.coachTake.intoNextWeek.isEmpty)
    }

    func testWeeklyBodyCompositionIsOnlyPresentOnScanWeeks() throws {
        let store = makeStore()
        let ordinaryWeek = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-08-23_2026-08-29"))
        XCTAssertNil(ordinaryWeek.weekly?.bodyComposition)
    }

    func testFounderAcceptanceWeekCarriesExerciseLevelTrainingAndDailyEnergyEvidence() throws {
        let weekly = try XCTUnwrap(makeStore().briefing(id: "weekly_briefing_2026-08-23_2026-08-29")?.weekly)
        XCTAssertEqual(weekly.energy?.dailyBalances?.count, 7)
        XCTAssertEqual(weekly.training?.trainingDayCount, 4)
        XCTAssertGreaterThanOrEqual(weekly.training?.highlights?.count ?? 0, 3)
        XCTAssertTrue(weekly.training?.highlights?.contains(where: { $0.exerciseName == "Lat Pulldown" && $0.delta == "+280 lb" }) == true)
        XCTAssertGreaterThanOrEqual(weekly.training?.priorityGroups?.count ?? 0, 4)
    }

    func testWeeklyHasNoStandaloneGoalOrPhaseCardFields() throws {
        // WeeklyBriefingContent's own field set is the contract here: there
        // is no `goalCard`/`phaseCard` property to decode into — verified
        // real behavior (no standalone Goal/Phase card on the live screen).
        let store = makeStore()
        let weekly = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-07-19_2026-07-25")?.weekly)
        XCTAssertNotNil(weekly.strategyPhaseLabel)
    }

    // MARK: - Midweek content: distinct, smaller surface

    func testMidweekContentIsGenuinelyDistinctFromWeekly() throws {
        let store = makeStore()
        let midweek = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-02_2026-08-04")?.midweek)
        XCTAssertFalse(midweek.heroVerdict.isEmpty)
        XCTAssertLessThanOrEqual(midweek.prioritiesThroughSunday.count, 3)
        XCTAssertNotNil(midweek.energy)
    }

    func testMidweekConfidenceIsAPassthroughNotARecompute() throws {
        // Verified real behavior: Midweek never computes/refreshes
        // Confidence — it carries forward whatever is already current.
        // Native models this as an ordinary persisted field (no special
        // Midweek-only computation path exists in Swift to test against);
        // this asserts the fixture models that continuity explicitly.
        let store = makeStore()
        let midweekConfidence = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-30_2026-09-01")?.confidence)
        XCTAssertEqual(midweekConfidence.movementDirection, .held)
        XCTAssertEqual(midweekConfidence.delta, 0)
    }

    func testFounderAcceptanceMidweekCarriesDailyEnergyWeightAndTrainingInsteadOfNarrativeOnly() throws {
        let midweek = try XCTUnwrap(makeStore().briefing(id: "midweek_briefing_2026-08-30_2026-09-01")?.midweek)
        XCTAssertEqual(midweek.energy?.dailyBalances?.count, 3)
        XCTAssertEqual(midweek.weight?.averageWeightLb, 171.2)
        XCTAssertEqual(midweek.training?.highlights?.first?.canonicalExerciseId, "lat-pulldown")
        XCTAssertEqual(midweek.training?.highlights?.count, 3)
        XCTAssertEqual(midweek.training?.highlights?.map(\.performanceValue), ["3,620 lb volume", "14 reps at 50 lb", "3,480 lb volume"])
        XCTAssertEqual(midweek.training?.priorityGroups?.map(\.areaId), ["back", "shoulders", "chest"])
    }

    func testFounderAcceptanceMidweekTrainingIsBackedByDatedCanonicalSessions() async throws {
        let api = FixtureTrainingAPI()
        let fetchedPull = try await api.fetchTrainingSession(sessionId: "session-fixture-012")
        let fetchedPush = try await api.fetchTrainingSession(sessionId: "session-fixture-013")
        let pull = try XCTUnwrap(fetchedPull)
        let push = try XCTUnwrap(fetchedPush)
        XCTAssertTrue(pull.date.hasPrefix("2026-08-31"))
        XCTAssertTrue(push.date.hasPrefix("2026-09-01"))
        XCTAssertEqual(pull.exercises.map(\.canonicalExerciseId), ["lat_pulldown", "seated_cable_row", "face_pull"])
        XCTAssertEqual(push.exercises.map(\.canonicalExerciseId), ["bench_press", "cable_fly", "overhead_triceps_extension"])
    }

    // MARK: - Monthly content: verified section list, no Strategy section

    func testMonthlyContentDecodesEveryRenderedSection() throws {
        let store = makeStore()
        let monthly = try XCTUnwrap(store.briefing(id: "monthly_briefing_2026-08")?.monthly)
        XCTAssertNil(monthly.goalMilestone)
        XCTAssertFalse(monthly.trainingProgress.stats.isEmpty)
        XCTAssertFalse(monthly.energyEvolution.weeks.isEmpty)
        XCTAssertFalse(monthly.whatChanged.isEmpty)
        XCTAssertFalse(monthly.definingMoments.isEmpty)
        XCTAssertFalse(monthly.monthAhead.isEmpty)
    }

    func testFounderAcceptanceMonthCarriesRichTypedEditorialModules() throws {
        let monthly = try XCTUnwrap(makeStore().briefing(id: "monthly_briefing_2026-08")?.monthly)
        XCTAssertGreaterThanOrEqual(monthly.trainingProgress.highlights?.count ?? 0, 3)
        XCTAssertNotNil(monthly.trainingProgress.whyItMatters)
        XCTAssertTrue(monthly.energyEvolution.weeks.allSatisfy { $0.averageBalanceKcal != nil })
        XCTAssertNotNil(monthly.energyEvolution.insight)
        XCTAssertEqual(monthly.whatChangedSections?.map(\.domain), ["training", "calories", "weight", "photos"])
        XCTAssertEqual(monthly.definingMomentDetails?.count, 4)
        XCTAssertEqual(monthly.monthAheadActions?.map(\.domain), ["training", "calories", "weight", "photos", "dexa"])
        XCTAssertTrue(monthly.trainingProgress.highlights?.allSatisfy { $0.performanceValue != nil } == true)
    }

    func testMonthlyAndRecurringTrainingKeepDistinctPresentationCompositions() {
        XCTAssertEqual(MonthlyBriefingSections.trainingPresentationStyle, "gold-featured-lift")
        XCTAssertEqual(BriefingTrainingResponseCard.presentationStyle, "neutral-outlined-highlights")
    }

    func testMonthlyOpeningRestoresThreeEvidenceFeatureCards() throws {
        let monthly = try XCTUnwrap(makeStore().briefing(id: "monthly_briefing_2026-08")?.monthly)
        XCTAssertEqual(MonthlyBriefingSections.leadFeatureDomains, ["Training", "New Baseline", "Calories"])
        XCTAssertFalse(monthly.trainingProgress.narrative.isEmpty)
        XCTAssertFalse(monthly.newBaseline.referenceDateLabel.isEmpty)
        XCTAssertFalse(monthly.energyEvolution.weeks.isEmpty)
    }

    func testDEXAEvidenceSincePriorScanUsesThreeSymmetricalColumns() {
        XCTAssertEqual(DEXAHistoryView.sincePriorScanColumnLabels, ["Body Fat", "Fat Mass", "Lean Mass"])
    }

    func testDEXAEventUsesSemanticHeroGridAndOneAlignedComparisonTreatment() {
        XCTAssertEqual(DEXABriefingSections.heroMetricPresentationStyle, "semantic-two-by-two")
        XCTAssertEqual(
            DEXABriefingSections.inlineComparisonSectionTitles,
            ["Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes"]
        )
    }

    func testMonthlyNewBaselineReferencesThePriorGoalsClosingDEXANotAnArbitraryDate() throws {
        // Build Lean Mass is not itself a cut — the baseline references the
        // DEXA that closed the prior (Visible Abs at Rest) goal.
        let store = makeStore()
        let baseline = try XCTUnwrap(store.briefing(id: "monthly_briefing_2026-08")?.monthly?.newBaseline)
        XCTAssertEqual(baseline.referenceDateLabel, "July 18, 2026")
        let secondMonth = try XCTUnwrap(store.briefing(id: "monthly_briefing_2026-10")?.monthly?.newBaseline)
        XCTAssertEqual(secondMonth.referenceDateLabel, "July 18, 2026")
    }

    // MARK: - Goal/Phase attribution: frozen at generation, never reinterpreted

    func testHistoricalVisibleAbsBriefingKeepsItsOwnGoalAttributionForever() throws {
        let store = makeStore()
        let attribution = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-06-28_2026-07-04")?.attribution)
        XCTAssertEqual(attribution.goalId, "goal_visible_abs_at_rest")
        XCTAssertNil(attribution.phaseId)
    }

    func testPhase1BriefingKeepsPhase1AttributionAfterPhase2Begins() throws {
        let store = makeStore()
        let phase1 = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-07-19_2026-07-25")?.attribution)
        XCTAssertEqual(phase1.goalId, "goal_fixture_build_lean_mass")
        XCTAssertEqual(phase1.phaseId, "phase_fixture_maintenance")

        let phase2 = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-08-23_2026-08-29")?.attribution)
        XCTAssertEqual(phase2.phaseId, "phase_fixture_lean_mass_build")
    }

    // MARK: - Confidence: server-owned, displayed verbatim

    func testConfidenceMovementLabelsMatchEachMovementDirection() throws {
        let store = makeStore()
        let initial = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-06-28_2026-07-04")?.confidence)
        XCTAssertEqual(initial.movementDirection, .initial)
        XCTAssertEqual(initial.movementLabel, "Initial assessment")

        let increased = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-07-12_2026-07-18")?.confidence)
        XCTAssertEqual(increased.movementDirection, .increased)
        XCTAssertEqual(increased.delta, 8)
        XCTAssertTrue(increased.movementLabel.contains("Up 8"))

        let decreased = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-07-19_2026-07-25")?.confidence)
        XCTAssertEqual(decreased.movementDirection, .decreased)
        XCTAssertEqual(decreased.delta, -13)
        XCTAssertTrue(decreased.movementLabel.contains("Down 13"))

        let held = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-30_2026-09-01")?.confidence)
        XCTAssertEqual(held.movementDirection, .held)
        XCTAssertEqual(held.movementLabel, "— No change from last assessment")
    }

    func testConfidenceBandLabelsFormatKnownAndUnknownBandsCorrectly() throws {
        let store = makeStore()
        let moderate = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-08-23_2026-08-29")?.confidence)
        XCTAssertEqual(moderate.bandLabel, "Moderate Confidence")
        let developing = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-02_2026-08-04")?.confidence)
        XCTAssertEqual(developing.bandLabel, "Developing")
    }

    // MARK: - Revision / republication: same id, prior content preserved

    func testRevisedBriefingDisclosesPriorVersionRatherThanHidingIt() throws {
        let store = makeStore()
        let revised = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-08-23_2026-08-29"))
        XCTAssertTrue(revised.isRevised)
        XCTAssertNotNil(revised.revisionProvenance)
        XCTAssertEqual(revised.replacedHistory.count, 1)
        XCTAssertEqual(revised.replacedHistory.first?.headline, "A quiet week with one still-pending workout.")
    }

    func testNonRevisedBriefingIsNotFlaggedAsRevised() throws {
        let store = makeStore()
        let ordinary = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-02_2026-08-04"))
        XCTAssertFalse(ordinary.isRevised)
        XCTAssertNil(ordinary.revisionProvenance)
        XCTAssertTrue(ordinary.replacedHistory.isEmpty)
    }

    // MARK: - History: real ordering, superseded excluded

    func testHistoryFromBundledFixtureIsOrderedNewestGeneratedAtFirst() {
        let store = makeStore()
        let history = store.history
        XCTAssertEqual(history.first?.id, "monthly_briefing_2026-10")
        XCTAssertEqual(history.last?.id, "weekly_briefing_2026-06-28_2026-07-04")
        for (a, b) in zip(history, history.dropFirst()) {
            XCTAssertGreaterThanOrEqual(a.generatedAt, b.generatedAt)
        }
    }

    func testHistoryExcludesSupersededArtifacts() {
        let superseded = makeBriefing(id: "superseded_one", cadence: .weekly, generatedAt: "2026-08-01T09:00:00.000Z", lifecycleState: .superseded)
        let current = makeBriefing(id: "current_one", cadence: .weekly, generatedAt: "2026-08-01T15:00:00.000Z", lifecycleState: .published)
        let older = makeBriefing(id: "older_one", cadence: .weekly, generatedAt: "2026-07-25T09:00:00.000Z", lifecycleState: .published)

        let history = BriefingSandboxStore.historyOrdering(from: [superseded, current, older])
        XCTAssertEqual(history.map(\.id), ["current_one", "older_one"])
    }

    func testEmptyHistoryWhenNoBriefingsPublished() {
        XCTAssertTrue(BriefingSandboxStore.historyOrdering(from: []).isEmpty)
    }

    // MARK: - Home latest-Briefing projection: Monthly collision precedence

    func testMonthlyCollisionPromotesMonthlyOnItsOwnDeliveryDay() {
        let weekly = makeBriefing(id: "w", cadence: .weekly, generatedAt: "2026-11-01T15:00:00.000Z", briefingDate: "2026-11-01")
        let monthly = makeBriefing(id: "m", cadence: .monthly, generatedAt: "2026-11-01T16:00:00.000Z", briefingDate: "2026-11-01")
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, monthly], now: pacificNoon(2026, 11, 1))
        XCTAssertEqual(latest?.id, "m")
    }

    func testMonthlyCollisionPromotionOnlyAppliesOnTheDeliveryDayItself() {
        let weekly = makeBriefing(id: "w", cadence: .weekly, generatedAt: "2026-11-01T15:00:00.000Z", briefingDate: "2026-11-01")
        let monthly = makeBriefing(id: "m", cadence: .monthly, generatedAt: "2026-11-01T16:00:00.000Z", briefingDate: "2026-11-01")
        // The day after Monthly's delivery day: promotion window has closed.
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, monthly], now: pacificNoon(2026, 11, 2))
        XCTAssertEqual(latest?.id, "w")
    }

    func testLatestForHomeFallsBackToTheMostRecentOfWeeklyOrMidweekWhenNoMonthlyCollision() {
        let weekly = makeBriefing(id: "w", cadence: .weekly, generatedAt: "2026-08-30T15:30:00.000Z")
        let midweek = makeBriefing(id: "mw", cadence: .midweek, generatedAt: "2026-09-02T13:00:00.000Z")
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, midweek], now: pacificNoon(2026, 9, 3))
        XCTAssertEqual(latest?.id, "mw")
    }

    func testLatestForHomeBreaksAWeeklyMidweekTieInFavorOfWeekly() {
        let weekly = makeBriefing(id: "w", cadence: .weekly, generatedAt: "2026-08-30T15:30:00.000Z")
        let midweek = makeBriefing(id: "mw", cadence: .midweek, generatedAt: "2026-08-30T15:30:00.000Z")
        let latest = BriefingSandboxStore.latestForHome(from: [weekly, midweek], now: pacificNoon(2026, 9, 3))
        XCTAssertEqual(latest?.id, "w")
    }

    func testLatestForHomeIgnoresUnpublishedArtifacts() {
        let failed = makeBriefing(id: "failed", cadence: .weekly, generatedAt: "2026-09-01T09:00:00.000Z", lifecycleState: .failed)
        let published = makeBriefing(id: "published", cadence: .weekly, generatedAt: "2026-08-25T09:00:00.000Z", lifecycleState: .published)
        let latest = BriefingSandboxStore.latestForHome(from: [failed, published], now: pacificNoon(2026, 9, 3))
        XCTAssertEqual(latest?.id, "published")
    }

    func testLatestForHomeIsNilWhenNothingIsPublished() {
        XCTAssertNil(BriefingSandboxStore.latestForHome(from: [], now: pacificNoon(2026, 9, 3)))
    }

    func testLatestForHomeFromBundledFixtureOnAnOrdinaryDayIsTheMostRecentMidweek() {
        // A later task added an active DEXA Event Briefing (published Aug
        // 31, consumed Sep 10) that outranks everything while active — see
        // `DEXABriefingTests`. This moment is chosen after that event's own
        // consumption so the Weekly/Midweek precedence this test actually
        // targets is exercised in isolation, exactly as originally intended.
        let store = makeStore()
        let latest = store.latestForHome(now: pacificNoon(2026, 9, 15))
        XCTAssertEqual(latest?.id, "midweek_briefing_2026-08-30_2026-09-01")
    }

    func testLatestForHomeFromBundledFixtureOnTheMonthlyCollisionDayIsTheMonthly() {
        let store = makeStore()
        let latest = store.latestForHome(now: pacificNoon(2026, 11, 1))
        XCTAssertEqual(latest?.id, "monthly_briefing_2026-10")
    }

    // MARK: - Home ↔ History ↔ Detail: one shared identity, no duplicate artifact

    func testHomeBriefingCardSharesExactIdentityWithHistoryAndDetail() async {
        let briefingStore = BriefingSandboxStore()
        let viewModel = HomeViewModel(
            api: FixtureHomeAPI(),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: briefingStore
        )
        let now = pacificNoon(2026, 9, 3)
        await viewModel.load(now: now)
        guard case .loaded(let home) = viewModel.state else { return XCTFail("Home did not load") }

        let expected = briefingStore.latestForHome(now: now)
        XCTAssertEqual(home.briefingCards.first?.id, expected?.id)
        XCTAssertEqual(home.briefingCards.first?.destination, expected.map { AppDestination.briefingDetail(briefingId: $0.id) })
        // The exact same id History lists and Detail looks up — no
        // Home-only duplicate artifact.
        XCTAssertTrue(briefingStore.history.contains { $0.id == expected?.id })
        XCTAssertEqual(briefingStore.briefing(id: expected?.id ?? "")?.id, expected?.id)
    }

    func testHomeHasNoBriefingCardWhenNothingIsPublishedYet() async {
        let viewModel = HomeViewModel(
            api: FixtureHomeAPI(),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore()
        )
        // A date long before the fixture's earliest published artifact.
        await viewModel.load(now: pacificNoon(2020, 1, 1))
        guard case .loaded(let home) = viewModel.state else { return XCTFail("Home did not load") }
        XCTAssertFalse(home.hasBriefingCards)
        XCTAssertTrue(home.briefingCards.isEmpty)
    }

    // MARK: - Morning Check-In reconciliation identity compatibility

    func testReconciliationWorkItemBriefingIdResolvesToTheSameArtifactHistoryLists() throws {
        let store = makeStore()
        let briefing = try XCTUnwrap(store.briefing(id: "weekly_briefing_2026-08-23_2026-08-29"))
        let workItem = BriefingReconciliationWorkItem(
            id: "work_item_1",
            cadence: .weekly,
            evidenceDateKey: "2026-08-29",
            status: .currentAfterRevision,
            briefingId: briefing.id,
            resolvesAsNoOp: true
        )
        let resolved = try XCTUnwrap(workItem.briefingId.flatMap { store.briefing(id: $0) })
        XCTAssertEqual(resolved.id, briefing.id)
        XCTAssertTrue(store.history.contains { $0.id == resolved.id })
    }

    // MARK: - History title/subtitle presentation

    func testHistoryTitleAndSubtitleFormatPerCadence() throws {
        let store = makeStore()
        let monthly = try XCTUnwrap(store.briefing(id: "monthly_briefing_2026-08"))
        XCTAssertEqual(monthly.historyTitle, "Monthly Briefing · August 2026")
        XCTAssertEqual(monthly.historySubtitle, "Delivered Sep 1")

        let midweek = try XCTUnwrap(store.briefing(id: "midweek_briefing_2026-08-02_2026-08-04"))
        XCTAssertEqual(midweek.historySubtitle, "Sun–Tue · Aug 2–Aug 4")
    }

    // MARK: - Timezone presentation: date-only fields never shift calendar day

    func testDateOnlyFormattingIsUTCAnchoredAndDoesNotShiftTheCalendarDay() {
        // Both far-west (Pacific) and far-ahead (UTC+14-style) device
        // timezones must render the identical calendar day for a date-only
        // field, since `BriefingDateFormatting.shortDate` parses and
        // displays in a fixed UTC calendar rather than the device's zone.
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-07-18"), "Jul 18, 2026")
        XCTAssertEqual(BriefingDateFormatting.shortDate("2026-11-01"), "Nov 1, 2026")
    }

    // MARK: - Test helpers

    private func pacificNoon(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func makeBriefing(
        id: String,
        cadence: BriefingCadence,
        generatedAt: String,
        lifecycleState: BriefingArtifactLifecycleState = .published,
        briefingDate: String = "2026-01-01"
    ) -> BriefingReadModel {
        BriefingReadModel(
            id: id,
            occurrence: BriefingOccurrenceIdentity(value: "test|\(id)"),
            cadence: cadence,
            generatedAt: generatedAt,
            evidenceWindow: BriefingEvidenceWindowReadModel(
                id: "window_\(id)",
                startDate: "2025-12-26",
                endDate: "2026-01-01",
                briefingDate: briefingDate,
                relativeLabel: "test window",
                timeZone: "America/Los_Angeles"
            ),
            lifecycleState: lifecycleState,
            attribution: BriefingGoalAttribution(goalId: "goal_test", goalTitle: "Test Goal", phaseId: nil, phaseName: nil),
            confidence: nil,
            revisionProvenance: nil,
            replacedHistory: [],
            weekly: nil,
            midweek: nil,
            monthly: nil
        )
    }
}
