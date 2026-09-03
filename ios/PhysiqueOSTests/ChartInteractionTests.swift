import XCTest
@testable import PhysiqueOS

/// Pure-logic regression coverage for `ChartCategoricalSelection`, the
/// shared nearest-observation resolver behind DEXA's, Nutrition Reporting's,
/// and Energy's tap/drag chart selection (see `ChartInteraction.swift`).
/// `WeightEvidenceCalculator.nearestPoint`'s own continuous-domain distance
/// math is already covered by `WeightReadModelTests`; this file exercises
/// the categorical (exact-match-with-fallback) resolution strategy those
/// verticals use instead. No raw finger coordinates or device sizes are
/// exercised here — only the domain-value resolution step every chart's
/// `chartScrub` handler feeds into.
final class ChartInteractionTests: XCTestCase {
    private struct Point: Equatable {
        var key: String
        var label: String
    }

    private let points = [
        Point(key: "2026-06-20", label: "b"),
        Point(key: "2026-07-18", label: "c"),
        Point(key: "2026-08-30", label: "e"),
    ]

    func testNilKeyResolvesToTheLatestPoint() {
        let result = ChartCategoricalSelection.nearestPoint(matching: nil, in: points, keyPath: \.key)
        XCTAssertEqual(result?.label, "e")
    }

    func testMatchingKeyResolvesToTheExactPoint() {
        let result = ChartCategoricalSelection.nearestPoint(matching: "2026-06-20", in: points, keyPath: \.key)
        XCTAssertEqual(result?.label, "b")
    }

    /// A touch just past the last plotted band (or any key the categorical
    /// axis doesn't recognize) falls back to the latest point rather than
    /// clearing the selection — matching every Reporting chart's
    /// "defaults to latest" convention rather than going blank mid-drag.
    func testUnrecognizedKeyFallsBackToTheLatestPointRatherThanClearingSelection() {
        let result = ChartCategoricalSelection.nearestPoint(matching: "1999-01-01", in: points, keyPath: \.key)
        XCTAssertEqual(result?.label, "e")
    }

    func testEmptySeriesResolvesToNilRegardlessOfKey() {
        XCTAssertNil(ChartCategoricalSelection.nearestPoint(matching: "2026-06-20", in: [Point](), keyPath: \.key))
        XCTAssertNil(ChartCategoricalSelection.nearestPoint(matching: nil, in: [Point](), keyPath: \.key))
    }

    func testSinglePointSeriesAlwaysResolvesToThatPoint() {
        let single = [Point(key: "2026-08-30", label: "only")]
        XCTAssertEqual(ChartCategoricalSelection.nearestPoint(matching: nil, in: single, keyPath: \.key)?.label, "only")
        XCTAssertEqual(ChartCategoricalSelection.nearestPoint(matching: "2026-08-30", in: single, keyPath: \.key)?.label, "only")
        XCTAssertEqual(ChartCategoricalSelection.nearestPoint(matching: "wrong-key", in: single, keyPath: \.key)?.label, "only")
    }

    /// A scope/filter change narrows `points` before selection ever runs —
    /// resolution must operate on whatever series it's handed, never a
    /// stale unfiltered list, and a previously-selected key that fell
    /// outside the new filtered window must fall back to latest rather than
    /// resolving to a point that's no longer in scope.
    func testResolvesWithinAFilteredSeriesNotTheOriginalUnfilteredList() {
        let filtered = points.filter { $0.key >= "2026-07-19" }
        XCTAssertEqual(filtered.map(\.label), ["e"])
        let staleSelection = ChartCategoricalSelection.nearestPoint(matching: "2026-06-20", in: filtered, keyPath: \.key)
        XCTAssertEqual(staleSelection?.label, "e")
    }
}
