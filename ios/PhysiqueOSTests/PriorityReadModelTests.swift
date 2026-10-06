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
    func testPriorityDetailGloballyOmitsRelatedGoalsAndCompletionButKeepsExecutionFields() {
        let sections = [
            PrioritySectionReadModel(title: "What", items: [.init(label: "Protocol", detail: "Retatrutide")]),
            PrioritySectionReadModel(title: "When", items: [.init(label: "Schedule", detail: "Thursday")]),
            PrioritySectionReadModel(title: "Dose", items: [.init(label: "Dose", detail: "4 mg")]),
            PrioritySectionReadModel(title: "Preparation", items: [.init(label: "Site", detail: "Rotate")]),
            PrioritySectionReadModel(title: "Why It Matters", items: [.init(label: "Purpose", detail: "Execution")]),
            PrioritySectionReadModel(title: "Related Goals", items: [.init(label: "Goal", detail: "Build Lean Mass")]),
            PrioritySectionReadModel(title: "Completion", items: [.init(label: "Method", detail: "Manual confirmation")]),
            PrioritySectionReadModel(title: "Appointment completion", items: [.init(label: "Method", detail: "DEXA evidence")]),
            PrioritySectionReadModel(title: "Next Execution Change", items: [.init(label: "Change", detail: "Next week")]),
        ]

        let visible = PriorityDetailPresentation.visibleSections(sections)
        XCTAssertEqual(visible.map(\.title), ["What", "When", "Dose", "Preparation", "Why It Matters", "Next Execution Change"])
    }

    func testPriorityDetailSimplificationDoesNotAlterDoseAwareCompletionContext() {
        let context = PriorityCompletionContext(occurrenceDate: "2026-09-18", dose: "4 mg", protocolId: "retatrutide")
        let sections = [PrioritySectionReadModel(title: "Completion", items: [.init(label: "Dose", detail: "4 mg")])]
        XCTAssertTrue(PriorityDetailPresentation.visibleSections(sections).isEmpty)
        XCTAssertEqual(context, .init(occurrenceDate: "2026-09-18", dose: "4 mg", protocolId: "retatrutide"))
    }

    func testFoamRollingPilotUsesCanonicalIdentityAndTruthfulTerminalStates() {
        var foam = PriorityOccurrence(
            id: "reminder_foam_roll_daily",
            routePriorityId: "reminder_foam_roll_daily",
            executionItemId: "execution_foam_roll",
            date: "2026-10-04",
            title: "Foam Rolling",
            subtitle: "Today · 7:15 PM",
            metadata: nil,
            changeLabel: nil,
            icon: .activity,
            color: .evidence,
            urgency: .available,
            completed: false,
            completable: true,
            actionLabel: nil,
            completionContext: nil,
            continueActionDestination: nil
        )
        XCTAssertTrue(PriorityDetailPresentation.isFoamRolling(foam))
        XCTAssertEqual(PriorityDetailPresentation.foamRollingStateLabel(foam), "Open")

        foam.completed = true
        foam.completable = false
        XCTAssertEqual(PriorityDetailPresentation.foamRollingStateLabel(foam), "Completed")

        foam.completed = false
        foam.skipped = true
        XCTAssertEqual(PriorityDetailPresentation.foamRollingStateLabel(foam), "Skipped")

        foam.skipped = false
        var unrelated = foam
        unrelated.id = "other"
        unrelated.routePriorityId = "other"
        unrelated.executionItemId = "other"
        XCTAssertFalse(
            PriorityDetailPresentation.isFoamRolling(unrelated),
            "Display copy alone must never opt another Priority into the pilot."
        )
    }

    // MARK: Overnight Lane A — locked Priority Detail family

    private func familyFixture(_ variant: String) throws -> PriorityOccurrence {
        try XCTUnwrap(PriorityFamilyReviewFixtures.occurrence(variant, foam: plainFoam()))
    }

    private func plainFoam() -> PriorityOccurrence {
        var foam = PriorityOccurrence(
            id: "reminder_foam_roll_daily", routePriorityId: "reminder_foam_roll_daily",
            executionItemId: "execution_foam_roll", date: "2026-10-04", title: "Foam Rolling",
            subtitle: "Today · 7:15 PM", metadata: nil, changeLabel: nil, icon: .activity, color: .evidence,
            urgency: .available, completed: false, completable: true, expectedVersion: 53,
            actionLabel: "View Support", completionContext: .init(occurrenceDate: "2026-10-04", protocolId: "recovery"),
            continueActionDestination: .operatingPlanRecoverySupport(executionId: "execution_foam_roll"),
            detailSections: [.init(title: "What", items: [.init(label: "Foam Rolling", detail: "Complete the scheduled recovery support.")])]
        )
        foam.skippable = true
        return foam
    }

    func testEveryProductionVariantSelectsItsLockedTemplate() throws {
        typealias T = PriorityDetailPresentation.Template
        let expected: [(String, T)] = [
            ("generic", .manual), ("peptide", .doseAware), ("paused", .paused), ("supplement", .manual),
            ("morning", .morningEvidence), ("morning-completed", .morningEvidence), ("photos", .photoEvidence),
            ("dexa", .dexaEvidence), ("completed", .completed), ("skipped", .skipped), ("setup", .continueAction),
        ]
        for (variant, template) in expected {
            XCTAssertEqual(PriorityDetailPresentation.template(try familyFixture(variant)), template, variant)
        }
        XCTAssertEqual(PriorityDetailPresentation.template(plainFoam()), .manual, "Foam keeps Mark Complete + Mark Skipped")
    }

    func testMarkCompleteIsNeverOfferedForPausedSkippedCompletedOrEvidenceDrivenPriorities() throws {
        for variant in ["paused", "skipped", "completed", "morning", "morning-completed", "photos", "dexa", "setup"] {
            let template = PriorityDetailPresentation.template(try familyFixture(variant))
            let completing: [PriorityDetailPresentation.Template] = [.manual, .doseAware]
            XCTAssertFalse(completing.contains(template), "\(variant) must not render Mark Complete")
        }
    }

    func testOnlyAPeptideWithAPlannedDoseIsDoseAware() throws {
        var supplement = try familyFixture("supplement")
        supplement.completionContext = .init(occurrenceDate: "2026-10-04", dose: "500 mg", protocolId: "fadogia")
        XCTAssertEqual(PriorityDetailPresentation.template(supplement), .manual, "A supplement's quantity is never editable")
        var peptide = try familyFixture("peptide")
        XCTAssertEqual(PriorityDetailPresentation.template(peptide), .doseAware)
        peptide.completionContext?.dose = nil
        XCTAssertEqual(PriorityDetailPresentation.template(peptide), .manual, "No planned dose, no amount editor")
    }

    func testStateWordAndToneAreTruthfulAndNeverColorOnly() throws {
        let cases: [(String, String, PriorityDetailPresentation.StateTone)] = [
            ("generic", "Open", .green), ("paused", "Paused", .amber), ("morning", "Open", .green),
            ("morning-completed", "Completed", .green), ("photos", "Open", .green), ("dexa", "Upcoming", .cyan),
            ("completed", "Completed", .green), ("skipped", "Skipped", .muted), ("setup", "Setup required", .amber),
        ]
        for (variant, word, tone) in cases {
            let occurrence = try familyFixture(variant)
            XCTAssertEqual(PriorityDetailPresentation.stateLabel(occurrence), word, variant)
            XCTAssertEqual(PriorityDetailPresentation.stateTone(occurrence), tone, variant)
        }
    }

    /// The locked Tesamorelin correction: one Preparation section with both
    /// canonical instructions; retired informational cards stay filtered.
    func testRepeatedSectionsConsolidateWithoutDroppingAnyCanonicalField() {
        let sections: [PrioritySectionReadModel] = [
            .init(title: "What", items: [.init(label: "Tesamorelin", detail: nil)]),
            .init(title: "Preparation", items: [.init(label: "Finish eating approximately 2–3 hours before injection", detail: nil)]),
            .init(title: "Preparation", items: [.init(label: "Take fasted before bed", detail: nil)]),
            .init(title: "Related Goals", items: [.init(label: "Lean Mass Build", detail: nil)]),
            .init(title: "Completion", items: [.init(label: "Mark complete", detail: nil)]),
            .init(title: "Why it matters", items: [.init(label: "Supports the plan", detail: nil)]),
            .init(title: "What", items: [.init(label: "Late duplicate", detail: nil)]),
        ]
        let grouped = PriorityDetailPresentation.groupedSections(sections)
        XCTAssertEqual(grouped.map(\.title), ["What", "Preparation", "Why it matters"])
        XCTAssertEqual(grouped[1].items.map(\.label), [
            "Finish eating approximately 2–3 hours before injection", "Take fasted before bed",
        ])
        XCTAssertEqual(grouped[0].items.count, 2, "A non-adjacent repeat keeps its field instead of colliding")
        XCTAssertEqual(Set(grouped.map(\.id)).count, grouped.count, "Section identities stay unique")
    }

    func testSectionKindsDriveTheLockedGlyphTints() {
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("When"), .when)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Dose"), .dose)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Dose / Quantity"), .dose)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Preparation"), .preparation)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Next Execution Change"), .nextChange)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Execution Notes"), .notes)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("Why it matters"), .why)
        XCTAssertEqual(PriorityDetailPresentation.sectionKind("What"), .plain)
    }

    /// The Server's verified evidence-priority hrefs reach existing Native
    /// screens; anything else stays unmapped (no general web router).
    func testEvidencePriorityActionHrefsMapToExistingNativeDestinations() {
        XCTAssertEqual(ProductionPriorityAPI.destination(forActionHref: "/evidence/photos"), .photoUpload)
        XCTAssertEqual(ProductionPriorityAPI.destination(forActionHref: "/evidence/dexa"), .dexaUpload)
        XCTAssertEqual(ProductionPriorityAPI.destination(forActionHref: "/profile/operating-plan/execution/dexa"), .operatingPlanDexaAppointment)
        XCTAssertEqual(ProductionPriorityAPI.destination(forActionHref: "/check-in/morning"), .checkIn(checkInType: "morning"))
        XCTAssertEqual(ProductionPriorityAPI.destination(forActionHref: "/profile/operating-plan/execution/execution_foam_roll"),
                       .operatingPlanRecoverySupport(executionId: "execution_foam_roll"))
        XCTAssertNil(ProductionPriorityAPI.destination(forActionHref: "/evidence/photos/compare"))
        XCTAssertNil(ProductionPriorityAPI.destination(forActionHref: nil))
    }

    func testUnavailableCopySplitsIntoTheLockedTitleAndSupportingLine() {
        let message = "This priority could not be loaded. Pull to refresh and try again."
        XCTAssertEqual(PriorityDetailView.failureTitle(message), "This priority could not be loaded.")
        XCTAssertEqual(PriorityDetailView.failureDetail(message), "Pull to refresh and try again.")
        XCTAssertEqual(PriorityDetailView.failureTitle("Offline"), "Offline")
        XCTAssertNil(PriorityDetailView.failureDetail("Offline"))
    }

    func testTookADifferentAmountParsesThePlannedDoseAndKeepsTheDefaultPathWhenUntouched() {
        XCTAssertEqual(PriorityDoseEntry.components(of: "1.5 mg")?.amount, "1.5")
        XCTAssertEqual(PriorityDoseEntry.components(of: "1.5 mg")?.unit, "mg")
        XCTAssertEqual(PriorityDoseEntry.components(of: " 250 mcg ")?.unit, "mcg")
        XCTAssertNil(PriorityDoseEntry.components(of: "No dose scheduled"), "No numeric amount: the field is not offered")
        XCTAssertNil(PriorityDoseEntry.components(of: "1.5"), "No unit: Native never invents one")

        XCTAssertEqual(PriorityDoseEntry.outcome(text: "1.5", plannedDose: "1.5 mg"), .unchanged)
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "1.50", plannedDose: "1.5 mg"), .unchanged, "Same value, different spelling: still the default path")
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "1.25", plannedDose: "1.5 mg"), .changed("1.25 mg"))
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "2", plannedDose: "1.5 mg"), .changed("2 mg"))
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "", plannedDose: "1.5 mg"), .invalid)
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "1,25", plannedDose: "1.5 mg"), .changed("1.25 mg"), "A comma-decimal keyboard is the same amount")
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "0", plannedDose: "1.5 mg"), .invalid)
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "abc", plannedDose: "1.5 mg"), .invalid)
        XCTAssertEqual(PriorityDoseEntry.outcome(text: "anything", plannedDose: "No dose scheduled"), .unchanged)
        XCTAssertEqual(PriorityDoseEntry.format(0.75), "0.75")
        XCTAssertEqual(PriorityDoseEntry.format(2.5), "2.5")
        XCTAssertEqual(PriorityDoseEntry.format(3), "3")
    }

    @MainActor
    func testPausedPriorityDetailCopyNamesThePausedFromDate() {
        XCTAssertEqual(PriorityDetailView.pausedCopy(pausedFrom: "2026-09-12"), "Paused since Sep 12. Resume from the Operating Plan to continue.")
        XCTAssertEqual(PriorityDetailView.pausedCopy(pausedFrom: nil), "Paused. Resume from the Operating Plan to continue.")
        XCTAssertEqual(PriorityDetailView.amountCaption(outcome: .changed("1.25 mg"), seed: "1.5", unit: "mg"), "1.25 mg will be recorded for this dose. Your dose plan is unchanged.")
        XCTAssertEqual(PriorityDetailView.amountCaption(outcome: .unchanged, seed: "1.5", unit: "mg"), "Planned 1.5 mg. Edit only if you took a different amount.")
    }

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
