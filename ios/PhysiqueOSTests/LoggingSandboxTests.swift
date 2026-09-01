import XCTest
import UIKit
@testable import PhysiqueOS

@MainActor
final class LoggingSandboxTests: XCTestCase {
    func testManualWeighInHistoricalCorrectionAndMorningCheckIn() throws {
        let occurrence = date(2026, 8, 18), now = date(2026, 8, 30)
        let store = LoggingSandboxStore(now: now)
        XCTAssertEqual(try value(store.saveWeighIn(weightText: "166.8", unit: .lb, date: occurrence, now: now)).dateKey, "2026-08-18")
        XCTAssertEqual(try value(store.saveWeighIn(weightText: "166.2", unit: .lb, date: occurrence, now: now)).correctionCount, 1)
        XCTAssertFailure(store.saveMorningCheckIn(weightText: "166.4", now: now), "Choose an outcome for each unfinished priority.")
        store.morningPriorities.forEach { store.updateMorningPriority(id: $0.id, disposition: .completed) }
        XCTAssertEqual(try value(store.saveMorningCheckIn(weightText: "166.4", now: now)).reconciledPriorityCount, 2)
        XCTAssertTrue(store.reviews.isEmpty)
    }

    func testWeightValidationAndPacificCalendarDate() {
        let today = date(2026, 8, 30)
        XCTAssertNil(ManualWeighInValidation.error(weightText: "150.5", unit: .lb, date: today, maximumDate: today))
        XCTAssertEqual(ManualWeighInValidation.error(weightText: "", unit: .lb, date: today, maximumDate: today), "Enter a valid weight.")
        XCTAssertEqual(LoggingSandboxStore.dateKey(today), "2026-08-30")
    }

    func testAttachmentCountsOrderingIdentityRemovalAndReselection() {
        for count in [1, 2, 3, 6] {
            let store = LoggingSandboxStore(now: date(2026, 8, 30))
            let assets = (0..<count).map { SandboxAttachment(id: "id-\($0)", displayName: "same-name.png", source: .photos, contentType: "image/png", data: Data([UInt8($0)])) }
            store.addAttachments(assets)
            XCTAssertEqual(store.evidenceDraft.attachments.map(\.id), assets.map { $0.id })
            XCTAssertEqual(store.evidenceDraft.attachments.count, count)
            if count > 1 { store.removeAttachment(id: "id-0"); store.addAttachments([assets[0]]); XCTAssertEqual(store.evidenceDraft.attachments.count, count) }
        }
    }

    func testPhotoLoaderRetainsOneThreeAndSixInSourceOrderWithStableIDs() async {
        for count in [1, 3, 6] {
            var activeLoads = 0
            var maximumActiveLoads = 0
            var completionOrder: [Int] = []
            let requests = (0..<count).map { index in
                EvidenceAttachmentLoader.PhotoLoadRequest(
                    stableIdentifier: "library-asset-\(index)",
                    contentTypeIdentifier: "public.jpeg",
                    loadData: {
                        activeLoads += 1
                        maximumActiveLoads = max(maximumActiveLoads, activeLoads)
                        await Task.yield()
                        completionOrder.append(index)
                        activeLoads -= 1
                        return Data(repeating: UInt8(index), count: 1_024)
                    }
                )
            }

            let attachments = await EvidenceAttachmentLoader.photos(requests, startingAt: 0)

            XCTAssertEqual(attachments.count, count)
            XCTAssertEqual(attachments.map(\.id), (0..<count).map { "photo-library-asset-\($0)" })
            XCTAssertEqual(attachments.map(\.displayName), (1...count).map { "Photo \($0)" })
            XCTAssertEqual(attachments.map(\.contentType), Array(repeating: "image/jpeg", count: count))
            XCTAssertEqual(completionOrder, Array(0..<count))
            XCTAssertEqual(maximumActiveLoads, 1, "Photo bytes must load serially to bound peak memory.")
        }
    }

    func testPhotoLoaderRetainsFailuresBesideSuccessfulSelections() async {
        enum ExpectedFailure: Error { case unavailable }
        let requests = [
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "one", contentTypeIdentifier: "public.jpeg", loadData: { Data([1]) }),
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "two", contentTypeIdentifier: "public.heic", loadData: { throw ExpectedFailure.unavailable }),
            EvidenceAttachmentLoader.PhotoLoadRequest(stableIdentifier: "three", contentTypeIdentifier: "public.png", loadData: { nil }),
        ]

        let attachments = await EvidenceAttachmentLoader.photos(requests, startingAt: 4)

        XCTAssertEqual(attachments.count, 3)
        XCTAssertEqual(attachments.map(\.displayName), ["Photo 5", "Photo 6", "Photo 7"])
        XCTAssertEqual(attachments.map(\.id), ["photo-one", "photo-two", "photo-three"])
        XCTAssertEqual(attachments.compactMap(\.data), [Data([1])])
        XCTAssertNil(attachments[0].loadError)
        XCTAssertNotNil(attachments[1].loadError)
        XCTAssertEqual(attachments[2].loadError, "The photo could not be loaded.")
    }

    func testPhotoPreviewDownsamplesWithoutReplacingOriginalBytes() throws {
        let source = UIGraphicsImageRenderer(size: CGSize(width: 2_000, height: 1_000)).image { context in
            UIColor.purple.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 2_000, height: 1_000))
        }
        let data = try XCTUnwrap(source.jpegData(compressionQuality: 0.9))
        let preview = try XCTUnwrap(EvidenceAttachmentLoader.previewImage(data: data, maximumPixelSize: 200))

        XCTAssertLessThanOrEqual(max(preview.cgImage?.width ?? 0, preview.cgImage?.height ?? 0), 200)
        XCTAssertFalse(data.isEmpty, "The original compressed bytes remain available for upload and review.")
    }

    func testFilesLoaderStillRetainsRealFileBytes() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("physiqueos-photo-fix-test.txt")
        let expected = Data("file evidence".utf8)
        try expected.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let attachment = try XCTUnwrap(EvidenceAttachmentLoader.files([url]).first)
        XCTAssertEqual(attachment.source, .files)
        XCTAssertEqual(attachment.data, expected)
        XCTAssertNil(attachment.loadError)
    }

    func testInterpretationPreservesOrderAndSkipsFailedAttachments() async {
        var draft = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        draft.attachments = [
            .init(id: "failed", displayName: "Photo 1", source: .photos, contentType: "image/jpeg", loadError: "Unavailable"),
            .init(id: "text", displayName: "notes.txt", source: .files, contentType: "text/plain", data: Data("Weight 164.7 lb".utf8)),
            .init(id: "invalid-image", displayName: "Photo 2", source: .photos, contentType: "image/jpeg", data: Data([0, 1, 2])),
        ]

        let prepared = await EvidenceLocalInterpretation.prepare(draft)

        XCTAssertEqual(prepared.attachments.map(\.id), ["failed", "text", "invalid-image"])
        XCTAssertNil(prepared.attachments[0].extractedText)
        XCTAssertEqual(prepared.attachments[1].extractedText, "Weight 164.7 lb")
        XCTAssertNil(prepared.attachments[2].extractedText)
    }

    func testDiscardClearsDraftAndNeverContaminatesNextUpload() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        for cycle in 0..<2 {
            store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
            store.evidenceDraft.scenario = .weight
            store.evidenceDraft.details = "Weight \(160 + cycle) lb"
            store.addAttachments((0..<3).map { .init(id: "\(cycle)-\($0)", displayName: "photo.png", source: .photos, contentType: "image/png", data: Data([UInt8($0)])) })
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            XCTAssertEqual(store.review(id: id)?.sourceAssets.count, 3)
            XCTAssertTrue(store.evidenceDraft.attachments.isEmpty)
            store.discardReview(id: id)
            XCTAssertTrue(store.evidenceDraft.attachments.isEmpty)
        }
    }

    func testSaveForLaterPreservesExactReviewAndAssets() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .activity
        store.evidenceDraft.details = "Active calories 612\nExercise minutes 47"
        store.addAttachments([.init(id: "asset", displayName: "rings.png", source: .photos, contentType: "image/png", data: Data([1, 2, 3]))])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let saved = try XCTUnwrap(store.review(id: id))
        XCTAssertEqual(saved.sourceAssets.first?.data, Data([1, 2, 3]))
        XCTAssertEqual(store.review(id: id), saved)
    }

    func testAutomaticUsesActualSignalsAndRemainsHonestWhenUnresolved() async throws {
        let training = LoggingSandboxStore(now: date(2026, 8, 30))
        training.evidenceDraft.details = "Shoulder press machine\n150p 10r x4"
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: training.evidenceDraft), .workout)
        _ = try value(training.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(training)
        XCTAssertEqual(training.review(id: id)?.items.first?.exercises.first?.sets.count, 4)

        let unresolved = LoggingSandboxStore(now: date(2026, 8, 30))
        unresolved.evidenceDraft.details = "Unlabeled document"
        _ = try value(unresolved.submitEvidence(now: date(2026, 8, 30)))
        let unresolvedResult = await unresolved.finishInterpretation(now: date(2026, 8, 30))
        XCTAssertFailure(unresolvedResult, "Choose an evidence type so this upload can be reviewed.")
    }

    func testAutomaticStrengthPackageWithCaloriesRemainsOneWorkoutDomain() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.details = "Bicep curl machine\n100p 10r x4\n\nTricep press machine\n130p 10r x4"
        store.addAttachments([
            .init(id: "strength", displayName: "strength.png", source: .photos, contentType: "image/png", extractedText: "Traditional Strength Training\nDuration 42 min\nActive Calories 188\nAverage Heart Rate 116"),
            .init(id: "walk-one", displayName: "walk-one.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 18 min\nActive Calories 91\nAverage Heart Rate 104"),
            .init(id: "walk-two", displayName: "walk-two.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 27 min\nActive Calories 137\nAverage Heart Rate 109"),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .workout)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.count, 3)
        XCTAssertTrue(items.allSatisfy { $0.category == .training })
        XCTAssertEqual(items[0].exercises.map(\.name), ["Bicep Curl Machine", "Tricep Press Machine"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(Array(items.dropFirst()).map(\.title), ["Outdoor Walk", "Outdoor Walk"])
        XCTAssertFalse(items.contains { $0.category == .nutrition })
    }

    func testRealFounderWorkoutSignalsPreserveRepsFirstStrengthAndTwoWalks() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 31))
        store.evidenceDraft.details = "Bicep curls\n12r 50p x4\n\nSpider curls\n12r 40p x4"
        store.addAttachments([
            .init(
                id: "strength",
                displayName: "IMG_2165.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Traditional Strength Training\nWorkout Time\n1:10:13\nActive Calories\n381CAL\nTotal Calories\n490CAL\nAvg. Heart Rate\n111BPM"
            ),
            .init(
                id: "walk-one",
                displayName: "IMG_2164.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Outdoor Walk\nWorkout Time\n0:15:23\nDistance\n0.96MI\nActive Calories\n106CAL\nTotal Calories\n131CAL\nAvg. Heart Rate\n121BPM"
            ),
            .init(
                id: "walk-two",
                displayName: "IMG_2166.PNG",
                source: .photos,
                contentType: "image/png",
                extractedText: "Outdoor Walk\nWorkout Time\n0:17:32\nDistance\n1.01MI\nActive Calories\n89CAL\nTotal Calories\n117CAL\nAvg. Heart Rate\n97BPM"
            ),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: store.evidenceDraft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .workout)
        _ = try value(store.submitEvidence(now: date(2026, 8, 31)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)

        XCTAssertEqual(items.map(\.title), ["Traditional Strength Training", "Outdoor Walk", "Outdoor Walk"])
        XCTAssertTrue(items.allSatisfy { $0.category == .training })
        XCTAssertEqual(items[0].exercises.map(\.name), ["Bicep Curls", "Spider Curls"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(items[0].exercises[0].sets[0].reps, "12")
        XCTAssertEqual(items[0].exercises[0].sets[0].load, "50")
        XCTAssertEqual(items[0].fields.first(where: { $0.id == "duration" })?.value, "1:10:13")
        XCTAssertEqual(items[0].fields.first(where: { $0.id == "activeCalories" })?.value, "381")
        XCTAssertEqual(items[1].fields.first(where: { $0.id == "distance" })?.value, "0.96")
        XCTAssertEqual(items[2].fields.first(where: { $0.id == "distance" })?.value, "1.01")
        XCTAssertFalse(items.contains { $0.category == .nutrition })
    }

    func testNumericToolbarIsNotRebuiltWhenFocusNeighborsAreUnchanged() {
        let field = NumericEditField(
            text: .constant("12"),
            accessibilityLabel: "Reps",
            fieldID: "set-1-reps",
            focusedFieldID: .constant(nil),
            nextFieldID: "set-1-load"
        )
        let coordinator = field.makeCoordinator()
        let toolbar = UIToolbar()

        coordinator.refreshToolbar(toolbar)
        let initialItems = toolbar.items ?? []
        coordinator.refreshToolbar(toolbar)
        let unchangedItems = toolbar.items ?? []

        XCTAssertEqual(initialItems.count, unchangedItems.count)
        XCTAssertTrue(zip(initialItems, unchangedItems).allSatisfy { $0 === $1 })
    }

    func testCaloriesAloneNeverCreateNutritionInsideWorkoutEvidence() {
        var draft = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        draft.attachments = [
            .init(id: "workout", displayName: "workout.png", source: .photos, contentType: "image/png", extractedText: "Traditional Strength Training\nDuration 35 min\nActive Calories 164"),
        ]

        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: draft), [.training])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: draft), .workout)
    }

    func testNutritionSignalsStillClassifyNutritionAndCrossDomainRemainsMixed() {
        var nutrition = EvidenceIntakeDraft.fresh(now: date(2026, 8, 30))
        nutrition.details = "Daily nutrition summary Calories 1987 Protein 176 Carbohydrates 204 Fat 61"
        XCTAssertEqual(EvidenceSandboxRouter.detectedCategories(for: nutrition), [.nutrition])
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: nutrition), .nutrition)

        nutrition.details += "\nActivity rings Exercise minutes 47 Steps 10234"
        XCTAssertEqual(Set(EvidenceSandboxRouter.detectedCategories(for: nutrition)), Set([.nutrition, .activity]))
        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: nutrition), .mixed)
    }

    func testMyFitnessPalDailyTotalAndMacrosSurviveWhileInterfaceChromeIsExcluded() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.addAttachments([
            .init(
                id: "mfp",
                displayName: "MyFitnessPal.png",
                source: .photos,
                contentType: "image/png",
                extractedText: """
                MyFitnessPal
                Calories Carbohydrates Fat Protein
                Totals 1,234 26 31 189
                Carbohydrates 26 g
                Fat 31 g
                Protein 189 g
                Breakfast
                Greek Yogurt
                Log more
                Lunch
                Chicken Breast
                Add food
                """
            ),
        ])

        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewId)?.items.first)

        XCTAssertEqual(item.fields.first(where: { $0.id == "calories" })?.value, "1234")
        XCTAssertEqual(item.fields.first(where: { $0.id == "protein" })?.value, "189")
        XCTAssertEqual(item.fields.first(where: { $0.id == "carbs" })?.value, "26")
        XCTAssertEqual(item.fields.first(where: { $0.id == "fat" })?.value, "31")
        XCTAssertEqual(item.meals.map(\.name), ["Breakfast", "Lunch"])
        XCTAssertEqual(item.meals.flatMap(\.foods).map(\.name), ["Greek Yogurt", "Chicken Breast"])
        XCTAssertFalse(item.meals.flatMap(\.foods).contains { $0.name.localizedCaseInsensitiveContains("log more") })
    }

    func testEvidenceReviewPresentationKeepsSourceFactsReadOnlyAndStrengthEditingCompact() {
        for category in EvidenceCategory.allCases where category != .progressPhotos {
            XCTAssertTrue(EvidenceReviewPresentationPolicy.sourceValuesAreReadOnly(for: category))
        }
        XCTAssertFalse(EvidenceReviewPresentationPolicy.sourceValuesAreReadOnly(for: .progressPhotos))

        let exercise = EvidenceReviewExercise(
            id: "curls",
            name: "Spider Curls",
            variant: nil,
            relationship: nil,
            sets: (1...4).map {
                .init(id: "set-\($0)", summary: "14 reps @ 50 lb", reps: "14", load: "50", unit: "lb")
            }
        )
        XCTAssertEqual(EvidenceReviewPresentationPolicy.compactSummary(for: exercise), "4 × 14 @ 50 lb")

        let nutrition = EvidenceReviewItem(
            id: "nutrition",
            category: .nutrition,
            title: "Nutrition",
            occurrenceDate: date(2026, 8, 30),
            fields: [
                .init(id: "calories", label: "Calories", value: "1234", unit: "cal", required: false),
                .init(id: "protein", label: "Protein", value: "189", unit: "g", required: false),
                .init(id: "carbs", label: "Carbohydrates", value: "26", unit: "g", required: false),
                .init(id: "fat", label: "Fat", value: "31", unit: "g", required: false),
            ]
        )
        let metrics = EvidenceReviewPresentationPolicy.metrics(for: nutrition)
        XCTAssertEqual(metrics.map(\.tone), [.calories, .protein, .carbohydrates, .fat])
        XCTAssertEqual(metrics.map(\.displayValue), ["1234 cal", "189 g", "26 g", "31 g"])
    }

    func testAutomaticImageOnlyPackageRoutesToUnconfirmedProgressPhotoReview() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.addAttachments([
            .init(id: "photo-one", displayName: "Photo 1", source: .photos, contentType: "image/jpeg", data: Data([1])),
            .init(id: "photo-two", displayName: "Photo 2", source: .photos, contentType: "image/jpeg", data: Data([2])),
        ])

        XCTAssertEqual(EvidenceSandboxRouter.scenario(for: store.evidenceDraft), .progressPhotos)
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let review = try XCTUnwrap(store.review(id: id))

        XCTAssertEqual(review.items.first?.category, .progressPhotos)
        XCTAssertEqual(review.items.first?.photoIdentities.count, 2)
        XCTAssertTrue(try XCTUnwrap(review.items.first?.photoIdentities).allSatisfy { !$0.confirmed && $0.orientation == .unconfirmed })
        XCTAssertTrue(try XCTUnwrap(review.interpretationMessage).contains("may be Progress Photos"))
    }

    func testFounderTrainingShorthandAndSeparateCardioRecords() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .training
        store.evidenceDraft.details = "Shoulder press machine\n150p 10r x4\n\nLateral raises machine\n75p 15r x4"
        store.addAttachments([
            .init(id: "walk", displayName: "walk.png", source: .photos, contentType: "image/png", extractedText: "Outdoor Walk\nDuration 32 min\nActive calories 210\nAverage heart rate 112"),
            .init(id: "cycle", displayName: "cycle.png", source: .photos, contentType: "image/png", extractedText: "Indoor Cycling\nDuration 24 min\nActive calories 280\nAverage heart rate 134"),
        ])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let items = try XCTUnwrap(store.review(id: id)?.items)
        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(items[0].exercises.map(\.name), ["Shoulder Press Machine", "Lateral Raises Machine"])
        XCTAssertEqual(items[0].exercises.map { $0.sets.count }, [4, 4])
        XCTAssertEqual(items[0].exercises[0].sets[0].reps, "10")
        XCTAssertEqual(items[0].exercises[0].sets[0].load, "150")
        XCTAssertEqual(items.dropFirst().map(\.title), ["Outdoor Walk", "Indoor Cycling"])

        store.updateReviewItem(reviewId: id, itemId: items[0].id) { item in
            item.exercises[0].sets[0].reps = "12"
            item.exercises[0].sets[0].load = "155"
            item.exercises[0].sets[0].refreshSummary()
        }
        let corrected = try XCTUnwrap(store.review(id: id)?.items[0].exercises[0].sets[0])
        XCTAssertEqual(corrected.summary, "12 reps @ 155 lb")
        XCTAssertTrue(try XCTUnwrap(store.review(id: id)).canConfirm)
    }

    func testTypeSpecificReviewsUseSubmittedValuesAndNeverCannedValues() async throws {
        let cases: [(EvidenceFixtureScenario, String, String, String)] = [
            (.nutrition, "Calories 1987 Protein 176 Carbohydrates 204 Fat 61", "calories", "1987"),
            (.weight, "Body weight 164.7 lb", "weight", "164.7"),
            (.activity, "Active calories 612 Exercise minutes 47 Steps 10234", "activeCalories", "612"),
            (.recovery, "Sleep 7.4 hr HRV 52 ms", "sleep", "7.4"),
        ]
        for (scenario, details, field, expected) in cases {
            let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = scenario; store.evidenceDraft.details = details
            _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
            let id = try await reviewID(store)
            XCTAssertEqual(store.review(id: id)?.items[0].fields.first(where: { $0.id == field })?.value, expected)
        }
    }

    func testDEXAOnlyUsesExtractedOrCorrectedValues() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = .dexa
        store.addAttachments([.init(id: "pdf", displayName: "BodySpec.pdf", source: .files, contentType: "application/pdf", extractedText: "Total mass 168.3\nBody fat 7.6\nFat mass 12.8\nLean mass 148.3")])
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let fields = try XCTUnwrap(store.review(id: id)?.items[0].fields)
        XCTAssertEqual(fields.first(where: { $0.id == "totalMass" })?.value, "168.3")
        XCTAssertEqual(fields.first(where: { $0.id == "rmr" })?.value, "")
    }

    func testProgressPhotosBeginUnconfirmedAndRequireRealSessionConditions() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.setEvidenceScenario(.progressPhotos)
        store.addAttachments([.init(id: "front", displayName: "front.jpg", source: .photos, contentType: "image/jpeg", data: Data([1]))])
        XCTAssertEqual(store.evidenceDraft.photoIdentities.first?.orientation, .unconfirmed)
        XCTAssertFailure(store.submitEvidence(now: date(2026, 8, 30)), "Confirm every photo identity before continuing.")
        let id = try XCTUnwrap(store.evidenceDraft.photoIdentities.first?.id)
        store.updatePhotoIdentity(id: id) { $0.orientation = .front; $0.contraction = .relaxed; $0.confirmed = true }
        store.evidenceDraft.photoSession.timeOfDay = .morning; store.evidenceDraft.photoSession.fasted = true; store.evidenceDraft.photoSession.originalUnedited = true
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewId = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewId)?.items[0])
        XCTAssertTrue(item.hasRequiredValues)
        XCTAssertFalse(item.fields.contains { ["source", "goalRelationship", "linkedGoal", "tags"].contains($0.id) })
    }

    func testProgressPhotoSessionLabelsAndPoseMutationAreExplicit() async throws {
        XCTAssertEqual(ProgressPhotoSessionDraft.userFacingConditionLabels, ["Time of day", "Fasted", "Post-workout", "Pump"])

        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.setEvidenceScenario(.progressPhotos)
        store.addAttachments([.init(id: "photo", displayName: "photo.jpg", source: .photos, contentType: "image/jpeg", data: Data([1]))])
        let identityID = try XCTUnwrap(store.evidenceDraft.photoIdentities.first?.id)
        store.updatePhotoIdentity(id: identityID) {
            $0.orientation = .front
            $0.contraction = .relaxed
            $0.poseVariant = .standard
            $0.confirmed = true
        }
        store.evidenceDraft.photoSession.timeOfDay = .afternoon
        store.evidenceDraft.photoSession.fasted = false
        store.evidenceDraft.photoSession.postWorkout = true
        store.evidenceDraft.photoSession.pump = true
        store.evidenceDraft.photoSession.originalUnedited = true
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let reviewID = try await reviewID(store)
        let item = try XCTUnwrap(store.review(id: reviewID)?.items.first)

        XCTAssertEqual(item.photoIdentities.first?.poseVariant, .standard)
        XCTAssertEqual(item.fields.first(where: { $0.id == "timeOfDay" })?.value, "Afternoon")
        XCTAssertEqual(item.fields.first(where: { $0.id == "postWorkout" })?.value, "Yes")
        XCTAssertEqual(item.fields.first(where: { $0.id == "pump" })?.value, "Present")
    }

    func testNutritionReplacementSemanticsDistinguishFullDayFromMeal() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Daily nutrition summary Calories 2100 Protein 180 Carbohydrates 220 Fat 60"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let firstID = try await reviewID(store)
        let firstItem = try XCTUnwrap(store.review(id: firstID)?.items.first)
        XCTAssertEqual(firstItem.nutritionScope, .fullDay)
        _ = try value(store.confirmReview(id: firstID))

        store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Daily nutrition summary Calories 2200 Protein 185 Carbohydrates 230 Fat 62"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let secondID = try await reviewID(store)
        let fullDay = try XCTUnwrap(store.review(id: secondID)?.items.first)
        XCTAssertTrue(fullDay.nutritionReplacementRequired)
        XCTAssertEqual(fullDay.nutritionDisposition, .replaceExisting)

        store.discardReview(id: secondID)
        store.evidenceDraft.occurrenceDate = date(2026, 8, 30)
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Lunch meal Calories 620 Protein 42 Carbohydrates 58 Fat 19"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let mealID = try await reviewID(store)
        let meal = try XCTUnwrap(store.review(id: mealID)?.items.first)
        XCTAssertTrue(meal.nutritionReplacementRequired)
        XCTAssertEqual(meal.nutritionScope, .meal)
        XCTAssertNil(meal.nutritionDisposition)
        XCTAssertEqual(NutritionReviewDisposition.addDistinctMeal.label, "Add to this day")
    }

    func testRereadUsesPreservedSubmissionNotFixtureReplacement() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30)); store.evidenceDraft.scenario = .weight; store.evidenceDraft.details = "Weight 163.2 lb"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        let id = try await reviewID(store)
        let reread = try value(await store.reprocessReview(id: id))
        XCTAssertEqual(reread.items[0].fields.first(where: { $0.id == "weight" })?.value, "163.2")
    }

    func testLocalTextInterpretationRecordsSubThreeSecondPipeline() async throws {
        let store = LoggingSandboxStore(now: date(2026, 8, 30))
        store.evidenceDraft.scenario = .nutrition
        store.evidenceDraft.details = "Calories 1987 Protein 176 Carbohydrates 204 Fat 61"
        _ = try value(store.submitEvidence(now: date(2026, 8, 30)))
        _ = try await reviewID(store)
        XCTAssertNotNil(store.pipelineTimings.interpretationSeconds)
        XCTAssertNotNil(store.pipelineTimings.reconciliationSeconds)
        XCTAssertLessThan(try XCTUnwrap(store.pipelineTimings.reviewReadySeconds), 3)
    }

    func testNumericEditingPolicyRemainsFastAndHonest() {
        XCTAssertTrue(NumericEditingContract.shouldSelectAllOnFocus("135")); XCTAssertFalse(NumericEditingContract.shouldSelectAllOnFocus(""))
        XCTAssertNil(NumericEditingContract.parsedValue("")); XCTAssertEqual(NumericEditingContract.parsedValue("145"), 145)
        XCTAssertFalse(NumericEditingContract.finishActionVisible(step: .workout, keyboardVisible: true))
        XCTAssertEqual(KeyboardFocusOrder.previous(before: "load", in: ["reps", "load", "duration"]), "reps")
        XCTAssertEqual(KeyboardFocusOrder.next(after: "load", in: ["reps", "load", "duration"]), "duration")
        XCTAssertNil(KeyboardFocusOrder.previous(before: "reps", in: ["reps", "load"]))
        XCTAssertNil(KeyboardFocusOrder.next(after: "load", in: ["reps", "load"]))
        XCTAssertEqual(EvidenceIntakeView.dexaFocusOrder, ["totalMass", "bodyFat", "fatMass", "leanMass", "boneMineral", "rmr", "vatMass", "vatVolume"])
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Los_Angeles")!; return c.date(from: .init(year: year, month: month, day: day, hour: 12))! }
    private func value<T>(_ result: Result<T, LoggingSandboxError>) throws -> T { switch result { case .success(let value): value; case .failure(let error): throw error } }
    private func reviewID(_ store: LoggingSandboxStore) async throws -> String { let result = await store.finishInterpretation(now: date(2026, 8, 30)); return try XCTUnwrap(try value(result)) }
    private func XCTAssertFailure<T>(_ result: Result<T, LoggingSandboxError>, _ message: String, file: StaticString = #filePath, line: UInt = #line) { switch result { case .success: XCTFail("Expected failure", file: file, line: line); case .failure(let error): XCTAssertEqual(error.message, message, file: file, line: line) } }
}
