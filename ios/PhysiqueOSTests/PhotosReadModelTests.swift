import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Progress Photos Evidence vertical,
/// exercised through `FixturePhotosAPI`.
final class PhotosReadModelTests: XCTestCase {
    private let api = FixturePhotosAPI()

    // MARK: - Fixture decoding integrity

    func testLandingDecodesWithoutError() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        XCTAssertEqual(landing.title, "Progress Photos")
        XCTAssertFalse(landing.history.isEmpty)
        XCTAssertFalse(landing.dataSources.isEmpty)
    }

    func testLatestSetMatchesTheMostRecentScopedSet() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        XCTAssertEqual(landing.latestSet?.date, "2026-08-30")
        XCTAssertEqual(landing.latestSet?.weightLabel, "No same-day weight")
    }

    func testWeightLabelFallsBackWhenNoSameDayWeight() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let earlierSet = try XCTUnwrap(landing.history.first { $0.date == "2026-05-24" })
        XCTAssertEqual(earlierSet.weightLabel, "185.5 lb")
    }

    // MARK: - History ordering

    func testHistoryIsNewestFirst() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let dates = landing.history.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    // MARK: - Pose/view grouping and ordering

    func testViewsAreOrderedByCanonicalPoseOrder() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let set = try XCTUnwrap(landing.history.first)
        XCTAssertEqual(set.views.map(\.poseId), [.frontRelaxed, .backRelaxed, .backFlexed])
    }

    // MARK: - Comparison pairing (nearest prior same-pose)

    func testFirstSetInScopeHasNoPriorComparisonForAnyPose() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let firstSet = try XCTUnwrap(landing.history.last) // oldest, since history is newest-first
        XCTAssertTrue(firstSet.views.allSatisfy { $0.comparisonStatus == "no_prior_matching_pose" })
        XCTAssertTrue(firstSet.views.allSatisfy { $0.comparedAgainst == "No prior matching pose" })
        XCTAssertEqual(firstSet.comparisonAvailability, "0/3 poses have prior comparisons")
    }

    func testSubsequentSetComparesAgainstTheNearestPriorSameSet() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let second = try XCTUnwrap(landing.history.first { $0.date == "2026-06-14" })
        XCTAssertTrue(second.views.allSatisfy { $0.comparisonStatus == "comparable" })
        XCTAssertEqual(second.views.first { $0.poseId == .frontRelaxed }?.comparedAgainst, TrainingDateFormatting.short("2026-05-24"))
        XCTAssertEqual(second.comparisonAvailability, "3/3 poses have prior comparisons")
    }

    /// A record from before Visible Abs began must never be used as a
    /// comparison target once a later Goal is selected — comparisons are
    /// computed only among the already-scoped sets, so this is a
    /// structural guarantee, not just a display filter.
    func testComparisonNeverReachesOutsideTheSelectedGoalWindow() async throws {
        // Build Lean Mass window starts 2026-07-19; the first set inside
        // that window (2026-08-16) must show "No prior matching pose" for
        // every view, even though a real prior Visible-Abs-era set with
        // the same poses exists chronologically before it.
        let landing = try await api.fetchPhotosLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        let firstInScope = try XCTUnwrap(landing.history.last)
        XCTAssertEqual(firstInScope.date, "2026-08-16")
        XCTAssertTrue(firstInScope.views.allSatisfy { $0.comparisonStatus == "no_prior_matching_pose" })
    }

    func testPhaseScopeNarrowsHistoryToOnePhase() async throws {
        let phase2 = try await api.fetchPhotosLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(phase2.history.count, 2)
        let phase1 = try await api.fetchPhotosLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertTrue(phase1.history.isEmpty)
    }

    // MARK: - Goal/Phase attribution

    func testEverySetCarriesAttribution() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        XCTAssertTrue(landing.history.allSatisfy { $0.attributedScope != nil })
    }

    func testBoundaryDateAttribution() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let lastVisibleAbs = try XCTUnwrap(landing.history.first { $0.date == "2026-07-18" })
        XCTAssertEqual(lastVisibleAbs.attributedScope?.goalId, EvidenceCanonicalGoalID.visibleAbs)
        let firstPhase2 = try XCTUnwrap(landing.history.first { $0.date == "2026-08-16" })
        XCTAssertEqual(firstPhase2.attributedScope?.phaseName, "Lean Mass Build")
    }

    func testScopeDefaultsToBuildLeanMass() async throws {
        let landing = try await api.fetchPhotosLanding()
        XCTAssertEqual(landing.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
    }

    // MARK: - Detail identity/navigation

    func testFetchPhotoSetReturnsMatchingRecordRegardlessOfLastSelectedScope() async throws {
        let set = try await api.fetchPhotoSet(setId: "photo-set-fixture-001")
        XCTAssertEqual(set?.date, "2026-05-24")
    }

    func testFetchPhotoSetReturnsNilForAnUnknownId() async throws {
        let set = try await api.fetchPhotoSet(setId: "does-not-exist")
        XCTAssertNil(set)
    }

    func testDestinationRoutesThroughPhotoSetDetailCase() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let set = try XCTUnwrap(landing.history.first)
        guard case .photoSetDetail(let setId) = set.destination else {
            return XCTFail("Expected a .photoSetDetail destination.")
        }
        XCTAssertEqual(setId, set.id)
    }

    // MARK: - Empty state

    func testEmptyScopeProducesNilLatestAndEmptyHistory() {
        let landing = PhotosEvidenceCalculator.report(allSets: [], scope: .all, allLabel: "All Photos", dataSources: [])
        XCTAssertNil(landing.latestSet)
        XCTAssertTrue(landing.history.isEmpty)
    }

    // MARK: - Server-owned interpretation is presentation-only, never recomputed

    func testViewRecordCarriesFixturedInterpretationCopyNotAComputedField() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        let view = try XCTUnwrap(landing.history.first?.views.first)
        XCTAssertFalse(view.interpretationSummary.isEmpty)
    }
}
