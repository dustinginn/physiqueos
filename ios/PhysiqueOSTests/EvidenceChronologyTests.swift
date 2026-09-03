import XCTest
@testable import PhysiqueOS

/// Regression coverage for the shared Goal/Phase chronology module
/// (`EvidenceChronology.swift`) every Evidence vertical (Training,
/// Activity, Nutrition, Weight) now filters through. `GoalPhaseChronology`
/// is a line-for-line Swift port of the server candidate
/// `GoalPhaseChronologyReadService.resolveGoalPhaseOwnership`
/// (`claude/server-evidence-chronology`) — these tests exercise the exact
/// boundary dates that resolver's own test file exercises: the day before
/// each Goal/Phase transition, the first day of each new window, and a
/// full ISO timestamp in a timezone far ahead of UTC — proving no evidence
/// record can shift ownership because of timezone conversion.
final class EvidenceChronologyTests: XCTestCase {
    /// Local, hand-built goals — deliberately not `EvidenceChronology.canonicalGoals`
    /// (the bundled fixture) for the resolver-level tests, so these stay
    /// correct regardless of what the shipped fixture's exact dates are;
    /// fixture-integration is covered separately below.
    private func goals() -> [CanonicalGoal] {
        [
            CanonicalGoal(
                id: "goal-build-lean-mass", title: "Build Lean Mass", status: "active",
                startDate: "2026-07-19", targetDate: nil,
                phases: [
                    CanonicalGoalPhase(id: "phase-1", name: "Establish Maintenance", order: 0, status: "completed", startDate: "2026-07-19", completedAt: "2026-08-15"),
                    CanonicalGoalPhase(id: "phase-2", name: "Lean Mass Build", order: 1, status: "active", startDate: "2026-08-16", completedAt: nil),
                ]
            ),
            CanonicalGoal(id: "goal-visible-abs", title: "Visible Abs", status: "completed", startDate: "2026-05-24", targetDate: "2026-07-18", phases: []),
        ]
    }

    // MARK: - Goal/Phase attribution (GoalPhaseChronology.resolveOwnership)

    func testUnphasedGoalResolvesToGoalOnlyAttribution() {
        let result = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-06-10")
        XCTAssertEqual(result?.goalId, "goal-visible-abs")
        XCTAssertNil(result?.phaseId)
        XCTAssertEqual(result?.matchedBy, "goal_only")
    }

    func testPhase1RecordResolvesToEstablishMaintenance() {
        let result = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-01")
        XCTAssertEqual(result?.phaseId, "phase-1")
        XCTAssertEqual(result?.phaseName, "Establish Maintenance")
        XCTAssertEqual(result?.phaseOrder, 0)
        XCTAssertEqual(result?.matchedBy, "phase_interval")
    }

    func testPhase2RecordResolvesToLeanMassBuild() {
        let result = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-30")
        XCTAssertEqual(result?.phaseId, "phase-2")
        XCTAssertEqual(result?.phaseName, "Lean Mass Build")
    }

    // MARK: - Goal transition boundary

    func testDayBeforeGoalTransitionOwnedByPriorGoal() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-18")?.goalId, "goal-visible-abs")
    }

    func testFirstDayOfNewGoalOwnedByNewGoal() {
        let result = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-19")
        XCTAssertEqual(result?.goalId, "goal-build-lean-mass")
        XCTAssertEqual(result?.phaseId, "phase-1")
    }

    // MARK: - Phase transition boundary

    func testDayBeforePhaseTransitionOwnedByPriorPhase() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-15")?.phaseId, "phase-1")
    }

    func testFirstDayOfNewPhaseOwnedByNewPhase() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-16")?.phaseId, "phase-2")
    }

    func testLastDayOfCompletedPhaseOwnedByThatPhaseNotSuccessor() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-15")?.phaseName, "Establish Maintenance")
    }

    func testFirstDayAfterPhaseCompletionOwnedBySuccessorPhase() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-08-16")?.phaseName, "Lean Mass Build")
    }

    /// A Phase 1 record must not become a Phase 2 record after Phase 2
    /// later activates — ownership is derived from the record's own date,
    /// never from which phase happens to be active today (the `goals()`
    /// fixture already reflects Phase 2 as the live active phase).
    func testHistoricalOwnershipIsNotRewrittenWhenTheCurrentPhaseChanges() {
        XCTAssertEqual(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-25")?.phaseId, "phase-1")
    }

    func testDateBeforeAnyKnownGoalReturnsNil() {
        XCTAssertNil(GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-01-01"))
    }

    // MARK: - Timezone safety

    /// A full ISO-8601 timestamp with a positive UTC offset (a timezone
    /// significantly ahead of UTC, e.g. Pacific/Auckland at UTC+13) must
    /// still resolve by its own leading 10 characters — this module never
    /// parses to `Date`/`Calendar`, so a timestamp can never be
    /// reinterpreted into a different local day.
    func testFullTimestampWithFarAheadTimezoneOffsetIsNotReinterpreted() {
        let result = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-19T00:30:00+13:00")
        XCTAssertEqual(result?.goalId, "goal-build-lean-mass")
    }

    /// A date-only value (no time component) in Pacific time — the
    /// founder's own local timezone — must resolve identically to the same
    /// calendar day with a UTC offset.
    func testDateOnlyValueInPacificTimeMatchesUTCEquivalent() {
        let plain = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-18")?.goalId
        let pacific = GoalPhaseChronology.resolveOwnership(goals: goals(), occurrenceDate: "2026-07-18T23:00:00-07:00")?.goalId
        XCTAssertEqual(plain, pacific)
    }

    // MARK: - Scope matching / filtering

    func testGoalScopeMatchesEveryPhaseOfThatGoal() {
        XCTAssertTrue(EvidenceChronology.matches("2026-08-01", scope: .goal(goalId: "goal-build-lean-mass"), goals: goals()))
        XCTAssertTrue(EvidenceChronology.matches("2026-08-30", scope: .goal(goalId: "goal-build-lean-mass"), goals: goals()))
        XCTAssertFalse(EvidenceChronology.matches("2026-06-10", scope: .goal(goalId: "goal-build-lean-mass"), goals: goals()))
    }

    func testPhaseScopeMatchesOnlyThatPhase() {
        XCTAssertTrue(EvidenceChronology.matches("2026-08-01", scope: .phase(goalId: "goal-build-lean-mass", phaseId: "phase-1"), goals: goals()))
        XCTAssertFalse(EvidenceChronology.matches("2026-08-30", scope: .phase(goalId: "goal-build-lean-mass", phaseId: "phase-1"), goals: goals()))
    }

    func testAllScopeMatchesEveryDate() {
        XCTAssertTrue(EvidenceChronology.matches("1999-01-01", scope: .all, goals: goals()))
    }

    func testFilterExcludesRecordsOutsideScopeAndKeepsAllUnfiltered() {
        struct Row { let date: String }
        let rows = [Row(date: "2026-06-01"), Row(date: "2026-08-01"), Row(date: "2026-08-30")]
        let phase1Only = EvidenceChronology.filter(rows, scope: .phase(goalId: "goal-build-lean-mass", phaseId: "phase-1"), goals: goals(), date: \.date)
        XCTAssertEqual(phase1Only.map(\.date), ["2026-08-01"])
        let goalScoped = EvidenceChronology.filter(rows, scope: .goal(goalId: "goal-build-lean-mass"), goals: goals(), date: \.date)
        XCTAssertEqual(goalScoped.map(\.date), ["2026-08-01", "2026-08-30"])
        let unfiltered = EvidenceChronology.filter(rows, scope: .all, goals: goals(), date: \.date)
        XCTAssertEqual(unfiltered.count, 3)
    }

    /// No record leakage / no duplicate records across Goal boundaries —
    /// every record attributes to exactly one Goal, never both.
    func testNoRecordLeaksAcrossAGoalBoundary() {
        struct Row { let date: String }
        let rows = [Row(date: "2026-07-18"), Row(date: "2026-07-19")]
        let visibleAbs = EvidenceChronology.filter(rows, scope: .goal(goalId: "goal-visible-abs"), goals: goals(), date: \.date)
        let buildLeanMass = EvidenceChronology.filter(rows, scope: .goal(goalId: "goal-build-lean-mass"), goals: goals(), date: \.date)
        XCTAssertEqual(visibleAbs.map(\.date), ["2026-07-18"])
        XCTAssertEqual(buildLeanMass.map(\.date), ["2026-07-19"])
    }

    // MARK: - EvidenceScopeSelection pill-id round trip

    func testPillIDRoundTripsForAllThreeSelectionKinds() {
        XCTAssertEqual(EvidenceScopeSelection(pillID: "all"), .all)
        XCTAssertEqual(EvidenceScopeSelection(pillID: "goal:goal-build-lean-mass"), .goal(goalId: "goal-build-lean-mass"))
        XCTAssertEqual(EvidenceScopeSelection(pillID: "phase:goal-build-lean-mass:phase-2"), .phase(goalId: "goal-build-lean-mass", phaseId: "phase-2"))
        XCTAssertEqual(EvidenceScopeSelection.all.pillID, "all")
        XCTAssertEqual(EvidenceScopeSelection.goal(goalId: "x").pillID, "goal:x")
        XCTAssertEqual(EvidenceScopeSelection.phase(goalId: "x", phaseId: "y").pillID, "phase:x:y")
    }

    func testMalformedPillIDFailsToParse() {
        XCTAssertNil(EvidenceScopeSelection(pillID: "nonsense"))
        XCTAssertNil(EvidenceScopeSelection(pillID: "goal:"))
    }

    // MARK: - Scope selector contract (options + contextual phase row)

    func testScopeContextGeneratesOnePillPerGoalPlusAll() {
        let context = EvidenceChronology.scopeContext(selected: .goal(goalId: "goal-build-lean-mass"), allLabel: "All Weight", goals: goals())
        XCTAssertEqual(context.options.map(\.id), ["goal:goal-build-lean-mass", "goal:goal-visible-abs", "all"])
        XCTAssertEqual(context.options.map(\.label), ["Build Lean Mass", "Visible Abs", "All Weight"])
        XCTAssertEqual(context.options.filter(\.selected).map(\.id), ["goal:goal-build-lean-mass"])
    }

    /// The focused Goal (Build Lean Mass) has 2 Phases, so a contextual
    /// Phase row must appear.
    func testScopeContextExposesPhaseRowForAMultiPhaseGoal() {
        let context = EvidenceChronology.scopeContext(selected: .goal(goalId: "goal-build-lean-mass"), allLabel: "All Weight", goals: goals())
        XCTAssertEqual(context.phaseOptions.map(\.id), ["phase:goal-build-lean-mass:phase-1", "phase:goal-build-lean-mass:phase-2"])
        XCTAssertEqual(context.phaseOptions.map(\.label), ["Establish Maintenance", "Lean Mass Build"])
        // Selecting the Goal itself (not a specific Phase) highlights none
        // of its Phase pills — the Goal-level pill above already represents
        // "every Phase of this Goal."
        XCTAssertTrue(context.phaseOptions.allSatisfy { !$0.selected })
    }

    func testScopeContextMarksTheSelectedPhasePillWhenAPhaseIsChosen() {
        let context = EvidenceChronology.scopeContext(selected: .phase(goalId: "goal-build-lean-mass", phaseId: "phase-2"), allLabel: "All Weight", goals: goals())
        XCTAssertEqual(context.phaseOptions.filter(\.selected).map(\.id), ["phase:goal-build-lean-mass:phase-2"])
    }

    /// Visible Abs has 0 Phases — never grows a Phase row, and "All"
    /// selection has no focused Goal at all — same result.
    func testScopeContextHasNoPhaseRowForAnUnphasedGoalOrAllSelection() {
        let visibleAbs = EvidenceChronology.scopeContext(selected: .goal(goalId: "goal-visible-abs"), allLabel: "All Weight", goals: goals())
        XCTAssertTrue(visibleAbs.phaseOptions.isEmpty)
        let all = EvidenceChronology.scopeContext(selected: .all, allLabel: "All Weight", goals: goals())
        XCTAssertTrue(all.phaseOptions.isEmpty)
    }

    func testDateRangeLabelForAllScopeIsCompleteHistory() {
        XCTAssertEqual(EvidenceChronology.dateRangeLabel(selected: .all, goals: goals()), "Complete history")
    }

    func testDateRangeLabelForAPhaseUsesThatPhasesOwnBoundaryDates() {
        let label = EvidenceChronology.dateRangeLabel(selected: .phase(goalId: "goal-build-lean-mass", phaseId: "phase-1"), goals: goals())
        XCTAssertTrue(label.contains("Jul 19"))
        XCTAssertTrue(label.contains("Aug 15"))
    }

    // MARK: - Attribution display projection

    func testAttributionLabelCombinesGoalAndPhaseWhenAPhaseIsKnown() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-08-01", goals: goals())
        XCTAssertEqual(attribution?.label, "Build Lean Mass · Establish Maintenance")
    }

    func testAttributionLabelIsJustGoalTitleForAnUnphasedGoal() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-06-10", goals: goals())
        XCTAssertEqual(attribution?.label, "Visible Abs")
    }

    func testAttributionIsNilForADateOutsideEveryKnownGoal() {
        XCTAssertNil(EvidenceChronology.attribution(forOccurrenceDate: "2026-01-01", goals: goals()))
    }

    // MARK: - Bundled fixture integration (EvidenceChronologyFixture.json)

    func testBundledFixtureDecodesAndContainsBothRealGoals() {
        let goals = EvidenceChronology.canonicalGoals
        XCTAssertEqual(Set(goals.map(\.id)), [EvidenceCanonicalGoalID.buildLeanMass, EvidenceCanonicalGoalID.visibleAbs])
        let buildLeanMass = goals.first { $0.id == EvidenceCanonicalGoalID.buildLeanMass }
        XCTAssertEqual(buildLeanMass?.phases.count, 2)
    }
}
