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

    // MARK: - Batch 3 Checkpoint E

    /// The locked generic header keeps the occurrence-date rules (never
    /// `createdAt`) and shows the long form.
    func testGenericHeaderUsesTheOccurrenceDateInLongForm() {
        let model = review(createdAt: "2026-09-13T02:11:00Z", items: [
            EvidenceReviewDetailItem(id: "d", type: "dexa_scan", date: "2026-09-12", included: true),
        ])
        XCTAssertEqual(EvidenceReviewDetailView.genericOccurrenceDate(for: model), "Sep 12, 2026")
        let mixed = review(createdAt: nil, items: [
            EvidenceReviewDetailItem(id: "a", type: "nutrition", date: "2026-09-12", included: true),
            EvidenceReviewDetailItem(id: "b", type: "activity", date: "2026-09-13", included: true),
        ])
        XCTAssertEqual(EvidenceReviewDetailView.genericOccurrenceDate(for: mixed), "2 dates")
        XCTAssertEqual(EvidenceReviewDetailView.longEvidenceDate("Sep 12, 2026"), "Sep 12, 2026")
    }

    /// Every non-Workout-Match review uses the generic Checkpoint E
    /// presentation; only `workoutReconciliation` keeps its specialised
    /// (Batch 2 L13) branch.
    func testOnlyWorkoutReconciliationRoutesAwayFromTheGenericReview() {
        for type in ["nutrition", "activity_day", "dexa_scan", "photo_session", "training", "typed"] {
            let model = review(createdAt: nil, items: [EvidenceReviewDetailItem(id: type, type: type, date: "2026-09-12")])
            XCTAssertEqual(EvidenceReviewPresentationRoute(review: model), .generic, type)
        }
        var workout = review(createdAt: nil, items: [])
        workout.workoutReconciliation = WorkoutReconciliationDetail(
            localDate: "2026-09-12", title: "Workout", summary: "",
            workout: WorkoutReconciliationWorkout(family: "strength", canonicalType: "traditional_strength_training", startedAt: "2026-09-12T17:00:00Z", endedAt: nil),
            candidates: []
        )
        XCTAssertEqual(EvidenceReviewPresentationRoute(review: workout), .workoutMatch)
        XCTAssertEqual(EvidenceReviewPresentationRoute(state: .loaded(workout)), .workoutMatch)
        XCTAssertEqual(EvidenceReviewPresentationRoute(state: .loading), .generic)
        XCTAssertEqual(EvidenceReviewPresentationRoute(state: .loaded(nil)), .generic)
    }

    /// The DEXA correction form keeps the exact `dexa-review.measurements.v1`
    /// field order and units.
    func testCorrectionFieldsKeepTheCanonicalOrderAndUnits() {
        XCTAssertEqual(EvidenceReviewDetailView.correctionFields.map(\.1), ["measuredAt", "totalMass", "bodyFat", "fatMass", "leanMass", "boneMineral", "rmr", "vatMass", "vatVolume"])
        XCTAssertEqual(EvidenceReviewDetailView.correctionFields.last?.0, "Visceral fat volume (in³)")
    }

    func testIntakeFileSizeLabels() {
        XCTAssertEqual(ProductionEvidenceUploadView.byteLabel(SandboxAttachment(id: "a", displayName: "a.png", source: .photos, data: Data(count: 1_400_000))), "1.4 MB")
        XCTAssertEqual(ProductionEvidenceUploadView.byteLabel(SandboxAttachment(id: "b", displayName: "b.png", source: .photos, data: Data(count: 892_000))), "892 KB")
    }

    /// Correction pre-fill keeps the interpreted precision (full replacement
    /// must never round untouched fields).
    func testCorrectionPrefillKeepsExactInterpretedValues() {
        XCTAssertEqual(EvidenceReviewDetailView.editableNumber(0.24), "0.24")
        XCTAssertEqual(EvidenceReviewDetailView.editableNumber(1.209), "1.209")
        XCTAssertEqual(EvidenceReviewDetailView.editableNumber(14.0), "14")
        XCTAssertEqual(EvidenceReviewDetailView.editableNumber(172.9), "172.9")
        XCTAssertEqual(EvidenceReviewDetailView.editableNumber(1774), "1774")
    }

    /// Nutrition Evidence and generic Evidence Review resolve every macro
    /// to the same `.daily` palette token through `NutritionEvidenceMacro`.
    func testGenericReviewNutritionMacrosUseTheNutritionEvidenceColorAuthority() {
        let grid = NutritionMacroGridView.macroItems(NutritionMacroTotals(calories: 2300, proteinG: 198, carbsG: 244, fatG: 73, fiberG: 30))
        let gridMacros = Dictionary(uniqueKeysWithValues: grid.compactMap { item in item.macro.map { (item.label, $0) } })
        XCTAssertEqual(gridMacros, ["Calories": .calories, "Protein": .protein, "Carbohydrates": .carbohydrates, "Fat": .fat])
        XCTAssertNil(grid.last?.macro, "Fiber has no macro color.")

        // The Server's review labels (EvidenceReviewPresentationService) map
        // to the same macros the Nutrition Evidence grid uses.
        let serverLabels = ["Calories": "Calories", "Protein": "Protein", "Carbs": "Carbohydrates", "Fat": "Fat"]
        for (serverLabel, gridLabel) in serverLabels {
            XCTAssertEqual(
                EvidenceReviewDetailView.metricTone(serverLabel, itemType: "nutrition"),
                .nutrition(gridMacros[gridLabel]!),
                "\(serverLabel) must resolve to the Nutrition Evidence macro."
            )
        }

        // Each macro is one palette token: the accepted Nutrition Evidence mapping.
        XCTAssertEqual(NutritionEvidenceMacro.calories.paletteColor, \EvidencePalette.amber)
        XCTAssertEqual(NutritionEvidenceMacro.protein.paletteColor, \EvidencePalette.protein)
        XCTAssertEqual(NutritionEvidenceMacro.carbohydrates.paletteColor, \EvidencePalette.carbs)
        XCTAssertEqual(NutritionEvidenceMacro.fat.paletteColor, \EvidencePalette.fat)
        for key in NutritionMacroKey.allCases {
            XCTAssertEqual(NutritionEvidenceMacro(key).label, key.label, "Reporting macro \(key) keeps its Nutrition identity.")
        }
    }

    func testNonNutritionReviewMetricsKeepTheLockedReviewTones() {
        XCTAssertEqual(EvidenceReviewDetailView.metricTone("Body fat", itemType: "dexa_scan"), .amber)
        XCTAssertEqual(EvidenceReviewDetailView.metricTone("RMR", itemType: "dexa_scan"), .purple)
        XCTAssertEqual(EvidenceReviewDetailView.metricTone("Goal relationship", itemType: "photo_session"), .purple)
        XCTAssertEqual(EvidenceReviewDetailView.metricTone("Active calories", itemType: "activity"), .teal)
        XCTAssertEqual(EvidenceReviewDetailView.metricTone("Source", itemType: "nutrition"), .teal)
    }
}

