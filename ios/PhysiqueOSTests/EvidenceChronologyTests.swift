import XCTest
@testable import PhysiqueOS

/// Regression coverage for the shared Goal/Phase chronology module
/// (`EvidenceChronology.swift`) every Evidence vertical (Training,
/// Activity, Nutrition, Weight) now filters through. These tests exercise
/// the exact boundary dates `EVIDENCE_CONTEXT_WINDOWS` defines on the web
/// (`src/domain/services/EvidenceContextWindows.js`): the day before each
/// goal transition, the first day of each new window, and a full ISO
/// timestamp in a timezone far ahead of UTC — proving no evidence record
/// can shift ownership because of timezone conversion, the task's explicit
/// invariant.
final class EvidenceChronologyTests: XCTestCase {
    // MARK: - Window membership

    func testBuildLeanMassWindowIsOpenEnded() {
        XCTAssertTrue(EvidenceChronology.isDate("2026-07-19", in: .buildLeanMass))
        XCTAssertTrue(EvidenceChronology.isDate("2030-01-01", in: .buildLeanMass))
        XCTAssertFalse(EvidenceChronology.isDate("2026-07-18", in: .buildLeanMass))
    }

    func testVisibleAbsWindowIsBounded() {
        XCTAssertTrue(EvidenceChronology.isDate("2026-05-24", in: .visibleAbs))
        XCTAssertTrue(EvidenceChronology.isDate("2026-07-18", in: .visibleAbs))
        XCTAssertFalse(EvidenceChronology.isDate("2026-05-23", in: .visibleAbs))
        XCTAssertFalse(EvidenceChronology.isDate("2026-07-19", in: .visibleAbs))
    }

    func testAllWindowContainsEveryDate() {
        XCTAssertTrue(EvidenceChronology.isDate("1999-01-01", in: .all))
        XCTAssertTrue(EvidenceChronology.isDate("2099-12-31", in: .all))
    }

    // MARK: - Goal transition boundary (day before / first day)

    func testDayBeforeVisibleAbsBeganIsUnattributed() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-05-23")
        XCTAssertNil(attribution.label)
    }

    func testFirstDayOfVisibleAbsIsAttributedToVisibleAbs() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-05-24")
        XCTAssertEqual(attribution.scopeID, .visibleAbs)
        XCTAssertEqual(attribution.label, "Visible Abs")
    }

    func testLastDayOfVisibleAbsIsStillAttributedToVisibleAbs() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-07-18")
        XCTAssertEqual(attribution.scopeID, .visibleAbs)
    }

    func testFirstDayOfBuildLeanMassIsAttributedToBuildLeanMass() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-07-19")
        XCTAssertEqual(attribution.scopeID, .buildLeanMass)
        XCTAssertEqual(attribution.label, "Build Lean Mass")
    }

    /// A Phase 1 record must not become a Phase 2 record after a
    /// transition — the goal-level equivalent of that invariant: a record
    /// dated the day before a transition must never be pulled into the
    /// new goal's window, and vice versa.
    func testTransitionDatesDoNotBleedAcrossTheBoundary() {
        XCTAssertNotEqual(
            EvidenceChronology.attribution(forOccurrenceDate: "2026-07-18").scopeID,
            EvidenceChronology.attribution(forOccurrenceDate: "2026-07-19").scopeID
        )
    }

    // MARK: - Timezone safety

    /// A full ISO-8601 timestamp with a positive UTC offset (a timezone
    /// significantly ahead of UTC, e.g. Pacific/Auckland at UTC+13) whose
    /// *local* calendar date sits on one side of the Visible Abs → Build
    /// Lean Mass boundary must still resolve by its own leading 10
    /// characters — this module never parses to `Date`/`Calendar`, so a
    /// timestamp can never be reinterpreted into a different local day.
    func testFullTimestampWithFarAheadTimezoneOffsetIsNotReinterpreted() {
        let attribution = EvidenceChronology.attribution(forOccurrenceDate: "2026-07-19T00:30:00+13:00")
        XCTAssertEqual(attribution.scopeID, .buildLeanMass)
    }

    /// A date-only value (no time component at all) in Pacific time — the
    /// founder's own local timezone — must resolve identically to the same
    /// calendar day with a UTC offset, since this module only ever reads
    /// the leading `yyyy-MM-dd` and never localizes.
    func testDateOnlyValueInPacificTimeMatchesUTCEquivalent() {
        XCTAssertEqual(
            EvidenceChronology.attribution(forOccurrenceDate: "2026-07-18").scopeID,
            EvidenceChronology.attribution(forOccurrenceDate: "2026-07-18T23:00:00-07:00").scopeID
        )
    }

    // MARK: - Filtering

    func testFilterExcludesRecordsOutsideScopeAndKeepsAllUnfiltered() {
        struct Row { let date: String }
        let rows = [Row(date: "2026-05-23"), Row(date: "2026-06-01"), Row(date: "2026-08-01")]
        let visibleAbsOnly = EvidenceChronology.filter(rows, scope: .visibleAbs, date: \.date)
        XCTAssertEqual(visibleAbsOnly.map(\.date), ["2026-06-01"])
        let unfiltered = EvidenceChronology.filter(rows, scope: .all, date: \.date)
        XCTAssertEqual(unfiltered.count, 3)
    }

    // MARK: - Scope selector contract

    func testScopeContextMarksExactlyTheSelectedOptionAndUsesPerVerticalAllLabel() {
        let context = EvidenceChronology.scopeContext(selected: .visibleAbs, allLabel: "All Weight")
        XCTAssertEqual(context.options.map(\.id), ["build-lean-mass", "visible-abs", "all"])
        XCTAssertEqual(context.options.map(\.label), ["Build Lean Mass", "Visible Abs", "All Weight"])
        XCTAssertEqual(context.options.filter(\.selected).map(\.id), ["visible-abs"])
    }

    func testDateRangeLabelForAllScopeIsCompleteHistory() {
        XCTAssertEqual(EvidenceChronology.dateRangeLabel(for: .all), "Complete history")
    }
}
