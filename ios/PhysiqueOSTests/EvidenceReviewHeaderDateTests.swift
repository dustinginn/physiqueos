import XCTest
@testable import PhysiqueOS

/// Regression for the Evidence Review header showing "Sep 13" for a DEXA scan
/// the same screen listed as Sep 12, 2026.
///
/// The header rendered `review.createdAt` — an ISO-8601 instant — through
/// `TrainingDateFormatting.short`, which keeps the first ten characters and
/// renders them in UTC because it exists to format calendar date KEYS. A
/// review the Founder created at 7:11 PM Pacific on Sep 12 is
/// `2026-09-13T02:11Z`, so the header advertised a scan date one day after the
/// scan. The header now reads the evidence's own occurrence date instead.
@MainActor
final class EvidenceReviewHeaderDateTests: XCTestCase {
    private func review(
        createdAt: String?,
        items: [EvidenceReviewDetailItem]
    ) -> EvidenceReviewDetailReadModel {
        EvidenceReviewDetailReadModel(
            id: "evidence_review_header_date",
            status: "pending",
            createdAt: createdAt,
            version: 1,
            items: items
        )
    }

    private func dexaItem(date: String?, included: Bool = true) -> EvidenceReviewDetailItem {
        EvidenceReviewDetailItem(id: "dexa_1", type: "dexa_scan", date: date, included: included)
    }

    /// The exact Founder boundary: local Sep 12 evening, UTC Sep 13,
    /// occurrence Sep 12.
    func testHeaderShowsTheOccurrenceDateNotTheUTCCreationDate() {
        let model = review(
            createdAt: "2026-09-13T02:11:47.000Z",
            items: [dexaItem(date: "2026-09-12")]
        )

        let label = EvidenceReviewDetailView.occurrenceDateLabel(for: model)

        XCTAssertEqual(label, "Sep 12")
        XCTAssertNotEqual(label, "Sep 13", "the review's UTC creation instant must never be shown as the evidence date")
    }

    /// The server sometimes sends an already-formatted display date. It is
    /// still a calendar date, and must pass through untouched.
    func testPreformattedServerDateIsPreserved() {
        let model = review(
            createdAt: "2026-09-13T02:11:47.000Z",
            items: [dexaItem(date: "Sep 12, 2026")]
        )

        XCTAssertEqual(EvidenceReviewDetailView.occurrenceDateLabel(for: model), "Sep 12, 2026")
    }

    /// Every hour of the Founder's local Sep 12 must render as Sep 12,
    /// including the evening hours that cross into Sep 13 UTC.
    func testEveryLocalHourOfTheOccurrenceDayRendersAsThatDay() {
        for utcHour in 0...23 {
            let createdAt = String(format: "2026-09-1%@T%02d:30:00.000Z", utcHour < 7 ? "3" : "2", utcHour)
            let model = review(createdAt: createdAt, items: [dexaItem(date: "2026-09-12")])
            XCTAssertEqual(
                EvidenceReviewDetailView.occurrenceDateLabel(for: model), "Sep 12",
                "createdAt \(createdAt) must not change the evidence date"
            )
        }
    }

    func testMultipleOccurrenceDatesAreReportedAsACountRatherThanOne() {
        let model = review(createdAt: "2026-09-13T02:11:47.000Z", items: [
            dexaItem(date: "2026-09-12"),
            EvidenceReviewDetailItem(id: "weight_1", type: "morning_weight", date: "2026-09-11"),
        ])

        XCTAssertEqual(EvidenceReviewDetailView.occurrenceDateLabel(for: model), "2 dates")
    }

    func testExcludedItemsDoNotChangeTheHeaderWhileAnyItemIsIncluded() {
        let model = review(createdAt: "2026-09-13T02:11:47.000Z", items: [
            dexaItem(date: "2026-09-12"),
            EvidenceReviewDetailItem(id: "weight_1", type: "morning_weight", date: "2026-09-11", included: false),
        ])

        XCTAssertEqual(EvidenceReviewDetailView.occurrenceDateLabel(for: model), "Sep 12")
    }

    /// With nothing included, the remaining items still describe the review —
    /// better than falling back to the creation instant this fix removed.
    func testAllExcludedFallsBackToTheItemsThemselves() {
        let model = review(
            createdAt: "2026-09-13T02:11:47.000Z",
            items: [dexaItem(date: "2026-09-12", included: false)]
        )

        XCTAssertEqual(EvidenceReviewDetailView.occurrenceDateLabel(for: model), "Sep 12")
    }

    func testNoDatedEvidenceShowsNoDateRatherThanTheCreationInstant() {
        let model = review(createdAt: "2026-09-13T02:11:47.000Z", items: [dexaItem(date: nil)])

        XCTAssertNil(EvidenceReviewDetailView.occurrenceDateLabel(for: model))
    }

    /// The formatter itself is correct for what it is for; the defect was
    /// feeding it an instant. Pin both halves so the distinction stays visible.
    func testShortFormatterIsADateKeyFormatterAndMisreadsInstantsByDesign() {
        XCTAssertEqual(TrainingDateFormatting.short("2026-09-12"), "Sep 12")
        XCTAssertEqual(TrainingDateFormatting.short("2026-09-13T02:11:47.000Z"), "Sep 13")
    }
}
