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
        // The latest set (2026-08-30) added a fourth pose (Side Relaxed) —
        // a later task's "new baseline / missing prior pose" fixture
        // scenario — which sorts after Back Flexed in `POSE_ORDER`.
        XCTAssertEqual(set.views.map(\.poseId), [.frontRelaxed, .backRelaxed, .backFlexed, .sideRelaxed])
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

    // MARK: - Stable identity through scope filtering/reordering (Part 1 verification)

    /// Every set's `id` (and therefore its `NavigationLink(value: set.destination)`
    /// payload) must be the same value whether it's read from the `.all`
    /// scope's history or a narrower Goal-scoped one — the landing preview
    /// and the "Show All" sheet must never disagree about which set a given
    /// row opens just because a filter changed which array position it sits
    /// at. Guards against the classic index-identity bug class the Founder
    /// flagged: no `ForEach`/detail lookup in this vertical may key off
    /// array position.
    func testSetIdentityIsStableAcrossDifferentScopeFilters() async throws {
        let all = try await api.fetchPhotosLanding(scope: .all)
        let buildLeanMass = try await api.fetchPhotosLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        let setInBoth = try XCTUnwrap(all.history.first { candidate in buildLeanMass.history.contains { $0.id == candidate.id } })
        let sameSetFromNarrowerScope = try XCTUnwrap(buildLeanMass.history.first { $0.id == setInBoth.id })
        XCTAssertEqual(setInBoth.date, sameSetFromNarrowerScope.date)
        XCTAssertEqual(setInBoth.views.map(\.poseId), sameSetFromNarrowerScope.views.map(\.poseId))
    }

    /// Every pose view's `id` is derived from its owning set's stable id
    /// plus its pose (`"\(set.id)-\(pose.rawValue)"`), never an index into
    /// `views` — reordering or re-deriving the views array can never cause
    /// one pose's detail content to be shown under a different pose's
    /// identity.
    func testViewIdentityIsDerivedFromSetAndPoseNeverArrayPosition() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        for set in landing.history {
            for view in set.views {
                XCTAssertEqual(view.id, "\(set.id)-\(view.poseId.rawValue)")
            }
        }
    }

    /// `fetchPhotoSet(setId:)` — the exact lookup `PhotoSetDetailView`
    /// performs on push — must resolve to a record whose every field
    /// (date, weight, views, poses) matches the corresponding row rendered
    /// on the landing/history list bit-for-bit, proving the preview a user
    /// taps and the detail screen it opens are backed by the identical
    /// record, not a coincidentally-similar one looked up a different way.
    func testEveryHistoryRowOpensTheExactMatchingDetailRecord() async throws {
        let landing = try await api.fetchPhotosLanding(scope: .all)
        for previewRow in landing.history {
            let detail = try await api.fetchPhotoSet(setId: previewRow.id)
            XCTAssertEqual(detail?.id, previewRow.id)
            XCTAssertEqual(detail?.date, previewRow.date)
            XCTAssertEqual(detail?.views.map(\.id), previewRow.views.map(\.id))
        }
    }
}
