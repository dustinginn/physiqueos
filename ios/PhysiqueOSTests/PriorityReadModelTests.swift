import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Priority engine: canonical execution-item
/// identity, cadence eligibility (daily/weekly/specific-weekdays/every-x-
/// days/scheduled-date, each ported verbatim from
/// `scheduleAppliesOnDate`/`getPriorityState`), completion/skip/note
/// semantics, Goal/Phase attribution, and the shared identity Home, the
/// Priority detail screen, and Morning Check-In all resolve through.
///
/// Fixed reference dates used throughout (verified, not assumed):
/// 2026-08-16 and 2026-08-30 are both Sundays (14 days apart); 2026-07-19
/// is also a Sunday. 2026-08-29 (the "yesterday" used for Morning Check-In
/// tests below) is a Saturday.
final class PriorityReadModelTests: XCTestCase {
    func testMorningWeighInRoutesToMorningCheckInInsteadOfGenericPriorityDetail() throws {
        let store = try LoggingSandboxStore()
        let occurrence = try XCTUnwrap(
            store.todaysPriorities(now: date(2026, 8, 30)).first { $0.executionItemId == "execution_morning_weigh_in" }
        )
        XCTAssertEqual(occurrence.destination, .checkIn(checkInType: "morning"))
    }
    private let catalog = PriorityCatalogLoader.loadExecutionItems()

    private func item(_ id: String) -> ExecutionItemFixture {
        catalog.first { $0.id == id }!
    }

    // MARK: - Catalog completeness / identity

    func testCatalogDecodesEveryRealAndFixtureExecutionItem() {
        let ids = Set(catalog.map(\.id))
        XCTAssertEqual(ids, [
            "execution_morning_weigh_in", "execution_foam_roll", "execution_retatrutide",
            "execution_tesamorelin", "execution_progress_photos", "execution_dexa",
            "execution_cold_plunge", "execution_vitamin_d",
        ])
    }

    func testNoDuplicateExecutionItemIds() {
        XCTAssertEqual(catalog.count, Set(catalog.map(\.id)).count)
    }

    // MARK: - Cadence eligibility (ported verbatim from `scheduleAppliesOnDate`)

    func testDailyCadenceAppliesEveryDayOnOrAfterStartDate() {
        let foamRoll = item("execution_foam_roll")
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: foamRoll.schedule, cadence: foamRoll.cadence, localDate: "2026-08-30"))
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: foamRoll.schedule, cadence: foamRoll.cadence, localDate: "2026-05-24"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: foamRoll.schedule, cadence: foamRoll.cadence, localDate: "2026-05-23"))
    }

    func testWeeklyCadenceAppliesOnlyOnItsOwnWeekday() {
        let retatrutide = item("execution_retatrutide")
        // 2026-08-27 is a Thursday.
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: retatrutide.schedule, cadence: retatrutide.cadence, localDate: "2026-08-27"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: retatrutide.schedule, cadence: retatrutide.cadence, localDate: "2026-08-30"))
    }

    func testSpecificWeekdaysCadenceAppliesOnlyOnListedDays() {
        let tesamorelin = item("execution_tesamorelin")
        // Sunday through Thursday.
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: tesamorelin.schedule, cadence: tesamorelin.cadence, localDate: "2026-08-30")) // Sunday
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: tesamorelin.schedule, cadence: tesamorelin.cadence, localDate: "2026-08-27")) // Thursday
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: tesamorelin.schedule, cadence: tesamorelin.cadence, localDate: "2026-08-28")) // Friday
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: tesamorelin.schedule, cadence: tesamorelin.cadence, localDate: "2026-08-29")) // Saturday
    }

    func testEveryOtherDayCadenceAppliesOnAnchorParityOnly() {
        let coldPlunge = item("execution_cold_plunge") // anchor 2026-08-16, interval 2
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-16"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-17"))
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-18"))
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-30"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-29"))
        // Before the anchor: never applies.
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: coldPlunge.schedule, cadence: coldPlunge.cadence, localDate: "2026-08-14"))
    }

    func testBiweeklyCadenceAppliesEveryFourteenDays() {
        let vitaminD = item("execution_vitamin_d") // anchor 2026-08-02, interval 14
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: vitaminD.schedule, cadence: vitaminD.cadence, localDate: "2026-08-02"))
        // 2026-08-16 is exactly 14 days after the anchor — also applies.
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: vitaminD.schedule, cadence: vitaminD.cadence, localDate: "2026-08-16"))
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: vitaminD.schedule, cadence: vitaminD.cadence, localDate: "2026-08-30"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: vitaminD.schedule, cadence: vitaminD.cadence, localDate: "2026-08-09"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: vitaminD.schedule, cadence: vitaminD.cadence, localDate: "2026-08-29"))
    }

    func testScheduledDateCadenceAppliesOnlyOnTheExactBookedDate() {
        let dexa = item("execution_dexa") // scheduledDate 2026-10-31 (matches OperatingPlanFixture's coaching-editor dexa appointment)
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: dexa.schedule, cadence: dexa.cadence, localDate: "2026-10-31"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: dexa.schedule, cadence: dexa.cadence, localDate: "2026-10-30"))
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: dexa.schedule, cadence: dexa.cadence, localDate: "2026-08-30"))
    }

    // MARK: - Urgency state (`getPriorityState`, ported verbatim)

    func testUrgencyStatesMatchThePreferredHourWindowsExactly() {
        func at(_ hour: Int) -> Date { pacificDate(2026, 8, 30, hour) }
        // Morning preferred hour = 7.
        XCTAssertEqual(PriorityOccurrenceCalculator.urgency(timeOfDay: "morning", now: at(5)), .upcoming) // 5 < 7-1
        XCTAssertEqual(PriorityOccurrenceCalculator.urgency(timeOfDay: "morning", now: at(6)), .available) // boundary: not < 6
        XCTAssertEqual(PriorityOccurrenceCalculator.urgency(timeOfDay: "morning", now: at(9)), .available) // boundary: not > 9
        XCTAssertEqual(PriorityOccurrenceCalculator.urgency(timeOfDay: "morning", now: at(10)), .overdue) // 10 > 7+2
        XCTAssertEqual(PriorityOccurrenceCalculator.urgency(timeOfDay: nil, now: at(3)), .available)
    }

    // MARK: - Occurrence identity (deterministic, stable, shared)

    func testOccurrenceIdIsDeterministicNotRandom() {
        let idA = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-30")
        let idB = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-30")
        XCTAssertEqual(idA, idB)
        XCTAssertEqual(idA, "execution-priority-execution_foam_roll-2026-08-30")
    }

    func testNoDuplicateOccurrenceIdsInAnySingleDaysProjection() {
        let occurrences = PriorityOccurrenceCalculator.project(executionItems: catalog, completions: [:], localDate: "2026-08-30")
        XCTAssertEqual(occurrences.count, Set(occurrences.map(\.id)).count)
    }

    func testTodaysPrioritiesOnAugust30MatchesExpectedCadenceSet() {
        // Sunday: daily (weigh-in, foam-roll), specific-weekdays (tesamorelin),
        // every-2-days anchor-parity (cold plunge), biweekly (vitamin D).
        // Not: retatrutide (Thursday-only), progress photos (Saturday-only),
        // DEXA (scheduled for 2026-10-31, not today).
        let occurrences = PriorityOccurrenceCalculator.project(executionItems: catalog, completions: [:], localDate: "2026-08-30")
        let ids = Set(occurrences.map(\.executionItemId))
        XCTAssertEqual(ids, [
            "execution_morning_weigh_in", "execution_foam_roll", "execution_tesamorelin",
            "execution_cold_plunge", "execution_vitamin_d",
        ])
    }

    // MARK: - Completion / skip / note semantics

    func testCompletionMarksTheOccurrenceCompletedAndIsIdempotent() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let id = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-30")
        XCTAssertFalse(store.priorityOccurrence(id: id, now: date(2026, 8, 30))?.completed ?? true)
        store.completePriority(occurrenceId: id, context: nil, now: date(2026, 8, 30))
        XCTAssertTrue(store.priorityOccurrence(id: id, now: date(2026, 8, 30))?.completed ?? false)
        // Idempotent: completing again does not error or duplicate.
        store.completePriority(occurrenceId: id, context: nil, now: date(2026, 8, 30))
        XCTAssertEqual(store.priorityCompletions.count, 1)
    }

    /// Evidence-aware completion (dose/protocolId/occurrenceDate all
    /// present) is the exact branch `completePriority`'s real server action
    /// takes for a dosed protocol item — verified this snapshot is
    /// preserved on the completion record itself.
    func testEvidenceAwareCompletionSnapshotsDoseContext() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let tesamorelin = item("execution_tesamorelin")
        let occurrence = PriorityOccurrenceCalculator.occurrence(for: tesamorelin, localDate: "2026-08-30", completions: [:])
        XCTAssertNotNil(occurrence.completionContext)
        store.completePriority(occurrenceId: occurrence.id, context: occurrence.completionContext, now: date(2026, 8, 30))
        XCTAssertEqual(store.priorityCompletions[occurrence.id]?.context?.dose, "2.0mg")
    }

    func testSkippedDispositionDoesNotWriteACompletionRecord() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let id = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-29")
        store.reconcilePriority(occurrenceId: id, occurrenceDate: "2026-08-29", disposition: .skipped, note: "", now: date(2026, 8, 30))
        XCTAssertNil(store.priorityCompletions[id])
        XCTAssertEqual(store.priorityReconciliations[id]?.disposition, .skipped)
    }

    func testNoteDispositionCanCarryTextWithoutCompleting() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let id = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-29")
        store.reconcilePriority(occurrenceId: id, occurrenceDate: "2026-08-29", disposition: .note, note: "Traveling, skipped the roller.", now: date(2026, 8, 30))
        XCTAssertNil(store.priorityCompletions[id])
        XCTAssertEqual(store.priorityReconciliations[id]?.note, "Traveling, skipped the roller.")
    }

    func testCompletedDispositionAlsoWritesACompletionRecord() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let id = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-29")
        store.reconcilePriority(occurrenceId: id, occurrenceDate: "2026-08-29", disposition: .completed, note: "", now: date(2026, 8, 30))
        XCTAssertNotNil(store.priorityCompletions[id])
    }

    // MARK: - Historical preservation

    /// A completion snapshot never changes after the fact, even if the
    /// execution item's own current `contextDetail` later differs — mirrors
    /// the real server's append-only `completionHistory` (dose captured at
    /// write time, never rewritten by a later protocol/dose change).
    func testHistoricalCompletionContextStaysFrozenAfterWrite() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let id = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_tesamorelin", localDate: "2026-08-30")
        let originalContext = PriorityCompletionContext(occurrenceDate: "2026-08-30", dose: "2.0mg", protocolId: "execution_tesamorelin")
        store.completePriority(occurrenceId: id, context: originalContext, now: date(2026, 8, 30))
        // Simulate a later dose change by completing a *different* day's
        // occurrence with a different dose — the earlier record must be
        // untouched.
        let laterId = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_tesamorelin", localDate: "2026-09-01")
        store.completePriority(occurrenceId: laterId, context: .init(occurrenceDate: "2026-09-01", dose: "2.5mg", protocolId: "execution_tesamorelin"), now: date(2026, 9, 1))
        XCTAssertEqual(store.priorityCompletions[id]?.context?.dose, "2.0mg")
        XCTAssertEqual(store.priorityCompletions[laterId]?.context?.dose, "2.5mg")
    }

    // MARK: - Morning Check-In: previous-day-unfinished selection

    func testPreviousDayUnfinishedExcludesAlreadyCompletedOccurrences() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let foamRollYesterday = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_foam_roll", localDate: "2026-08-29")
        store.completePriority(occurrenceId: foamRollYesterday, context: nil, now: date(2026, 8, 29))
        let unfinished = store.previousDayUnfinishedPriorities(now: date(2026, 8, 30))
        XCTAssertFalse(unfinished.contains { $0.id == foamRollYesterday })
    }

    func testPreviousDayUnfinishedExcludesAlreadyReconciledOccurrences() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let photosYesterday = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_progress_photos", localDate: "2026-08-29")
        store.reconcilePriority(occurrenceId: photosYesterday, occurrenceDate: "2026-08-29", disposition: .skipped, note: "", now: date(2026, 8, 30))
        let unfinished = store.previousDayUnfinishedPriorities(now: date(2026, 8, 30))
        XCTAssertFalse(unfinished.contains { $0.id == photosYesterday })
    }

    func testPreviousDayUnfinishedExcludesEvidenceSatisfiedWeighIn() {
        let store = LoggingSandboxStore(
            now: date(2026, 8, 30),
            weighIns: ["2026-08-29": LocalWeightEntry(dateKey: "2026-08-29", value: 178.4, unit: .lb, recordedAt: date(2026, 8, 29), correctionCount: 0)],
            executionItems: catalog
        )
        let weighInYesterday = PriorityOccurrenceCalculator.occurrenceId(executionItemId: "execution_morning_weigh_in", localDate: "2026-08-29")
        let unfinished = store.previousDayUnfinishedPriorities(now: date(2026, 8, 30))
        XCTAssertFalse(unfinished.contains { $0.id == weighInYesterday })
    }

    func testPreviousDayUnfinishedIncludesGenuinelyUnaddressedOccurrences() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let unfinished = store.previousDayUnfinishedPriorities(now: date(2026, 8, 30))
        // Saturday 2026-08-29: weigh-in (no evidence recorded), foam-roll,
        // progress-photos all applied and none were addressed.
        XCTAssertEqual(Set(unfinished.map(\.executionItemId)), [
            "execution_morning_weigh_in", "execution_foam_roll", "execution_progress_photos",
        ])
    }

    // MARK: - Shared identity across Home / Priority Detail / Morning Check-In

    func testHomeAndPriorityDetailResolveTheIdenticalOccurrenceForTheSameId() {
        let store = LoggingSandboxStore(now: date(2026, 8, 30), executionItems: catalog)
        let today = store.todaysPriorities(now: date(2026, 8, 30))
        let sample = try! XCTUnwrap(today.first)
        let detail = store.priorityOccurrence(id: sample.id, now: date(2026, 8, 30))
        XCTAssertEqual(sample, detail)
    }

    // MARK: - Goal/Phase attribution across eras (via Foam Rolling's own long history)

    func testOccurrenceAttributionResolvesTheCorrectEraByItsOwnDate() {
        // Foam Rolling's schedule starts 2026-05-24 (Visible Abs), and it's
        // daily, so it has real occurrences in all three eras.
        let visibleAbsEra = PriorityOccurrenceCalculator.occurrence(for: item("execution_foam_roll"), localDate: "2026-06-05", completions: [:])
        XCTAssertEqual(visibleAbsEra.attributedScope?.goalId, EvidenceCanonicalGoalID.visibleAbs)

        let phase1 = PriorityOccurrenceCalculator.occurrence(for: item("execution_foam_roll"), localDate: "2026-07-25", completions: [:])
        XCTAssertEqual(phase1.attributedScope?.phaseName, "Establish Maintenance")

        let phase2 = PriorityOccurrenceCalculator.occurrence(for: item("execution_foam_roll"), localDate: "2026-08-30", completions: [:])
        XCTAssertEqual(phase2.attributedScope?.phaseName, "Lean Mass Build")
    }

    /// The literal Phase-transition boundary: 2026-08-15 (last Phase 1 day)
    /// vs 2026-08-16 (first Phase 2 day) must resolve to different phases —
    /// a Goal/Phase reference living only on the execution item (never a
    /// per-occurrence override) could not by itself distinguish these; this
    /// proves attribution is genuinely resolved per-occurrence by date.
    func testPhaseTransitionBoundaryDatesResolveToTheCorrectPhase() {
        let lastPhase1Day = PriorityOccurrenceCalculator.occurrence(for: item("execution_foam_roll"), localDate: "2026-08-15", completions: [:])
        XCTAssertEqual(lastPhase1Day.attributedScope?.phaseName, "Establish Maintenance")
        let firstPhase2Day = PriorityOccurrenceCalculator.occurrence(for: item("execution_foam_roll"), localDate: "2026-08-16", completions: [:])
        XCTAssertEqual(firstPhase2Day.attributedScope?.phaseName, "Lean Mass Build")
    }

    /// An Operating Plan change (e.g. a later dose/context update) must
    /// never rewrite the attribution already resolved for a past
    /// occurrence — re-resolving the same past date after a hypothetical
    /// catalog change still returns the same historical attribution,
    /// because attribution is a pure function of the occurrence's own date,
    /// never the execution item's *current* fields.
    func testOperatingPlanChangeDoesNotAlterAlreadyResolvedHistoricalAttribution() {
        var changedItem = item("execution_foam_roll")
        changedItem.contextDetail = "20 minutes" // hypothetical Operating Plan edit
        let stillPhase1 = PriorityOccurrenceCalculator.occurrence(for: changedItem, localDate: "2026-07-25", completions: [:])
        XCTAssertEqual(stillPhase1.attributedScope?.phaseName, "Establish Maintenance")
    }

    // MARK: - Timezone / date-boundary safety

    func testLocalDateKeyAndWeekdayAreStableAcrossDeviceTimeZones() {
        let originalTimeZone = NSTimeZone.default
        defer { NSTimeZone.default = originalTimeZone }

        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        let pacificWeekday = PriorityOccurrenceCalculator.weekday(of: "2026-08-30")

        NSTimeZone.default = TimeZone(identifier: "Pacific/Kiritimati")!
        let farAheadWeekday = PriorityOccurrenceCalculator.weekday(of: "2026-08-30")

        XCTAssertEqual(pacificWeekday, "sunday")
        XCTAssertEqual(pacificWeekday, farAheadWeekday)
    }

    func testPreviousDateKeyCrossesMonthAndYearBoundariesCorrectly() {
        XCTAssertEqual(PriorityOccurrenceCalculator.previousDateKey("2026-09-01"), "2026-08-31")
        XCTAssertEqual(PriorityOccurrenceCalculator.previousDateKey("2026-01-01"), "2025-12-31")
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        pacificDate(year, month, day, 8)
    }

    private func pacificDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = PriorityOccurrenceCalculator.defaultTimeZone
        return calendar.date(from: components)!
    }
}
